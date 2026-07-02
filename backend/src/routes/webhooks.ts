import { Router, Request, Response } from 'express';
import { shopify } from '../services/shopify';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { syncProducts } from '../services/syncService';

export const webhookRouter = Router();

// Helper: verify HMAC signature and parse body
async function verifyAndParse(req: Request, res: Response): Promise<{ shop: string; body: any } | null> {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;
  const rawBody = req.body as Buffer;

  const valid = await shopify.webhooks.validate({
    rawBody,
    rawRequest: req,
    rawResponse: res,
  });

  if (!valid) {
    res.status(401).send('Unauthorized');
    return null;
  }

  return { shop, body: JSON.parse(rawBody.toString()) };
}

/**
 * ORDERS_CREATE — add new order to our dataset for re-training
 */
webhookRouter.post('/orders/create', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;

  const { shop, body: order } = result;
  res.status(200).send('OK');

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;

    // Upsert the order and its line items
    const orderRecord = await prisma.order.upsert({
      where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: String(order.id) } },
      create: {
        shopId: shopRecord.id,
        shopifyId: String(order.id),
        createdAt: new Date(order.created_at),
      },
      update: {},
    });

    for (const item of order.line_items ?? []) {
      const product = await prisma.product.findUnique({
        where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: `gid://shopify/Product/${item.product_id}` } },
      });
      if (!product) continue;

      await prisma.orderItem.upsert({
        where: { orderId_productId: { orderId: orderRecord.id, productId: product.id } },
        create: { orderId: orderRecord.id, productId: product.id },
        update: {},
      });
    }

    logger.info(`Webhook: order ${order.id} synced for ${shop}`);
  } catch (err) {
    logger.error('Webhook orders/create failed', { shop, err });
  }
});

/**
 * PRODUCTS_UPDATE — keep product catalog fresh
 */
webhookRouter.post('/products/update', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;

  const { shop, body: product } = result;
  res.status(200).send('OK');

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;

    await prisma.product.upsert({
      where: {
        shopId_shopifyId: {
          shopId: shopRecord.id,
          shopifyId: `gid://shopify/Product/${product.id}`,
        },
      },
      create: {
        shopId: shopRecord.id,
        shopifyId: `gid://shopify/Product/${product.id}`,
        title: product.title,
        handle: product.handle,
        imageUrl: product.image?.src ?? null,
        price: parseFloat(product.variants?.[0]?.price ?? '0'),
      },
      update: {
        title: product.title,
        handle: product.handle,
        imageUrl: product.image?.src ?? null,
        price: parseFloat(product.variants?.[0]?.price ?? '0'),
      },
    });
  } catch (err) {
    logger.error('Webhook products/update failed', { shop, err });
  }
});

/**
 * PRODUCTS_DELETE — remove from our catalog
 */
webhookRouter.post('/products/delete', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;

  const { shop, body } = result;
  res.status(200).send('OK');

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;

    await prisma.product.deleteMany({
      where: {
        shopId: shopRecord.id,
        shopifyId: `gid://shopify/Product/${body.id}`,
      },
    });
  } catch (err) {
    logger.error('Webhook products/delete failed', { shop, err });
  }
});

/**
 * APP_UNINSTALLED — mark shop as uninstalled, stop billing
 */
webhookRouter.post('/app/uninstalled', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;

  const { shop } = result;
  res.status(200).send('OK');

  await prisma.shop.updateMany({
    where: { shopDomain: shop },
    data: { uninstalledAt: new Date(), billingId: null },
  });

  logger.info(`App uninstalled: ${shop}`);
});
