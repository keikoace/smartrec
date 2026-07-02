import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { syncProducts } from '../services/syncService';

export const webhookRouter = Router();

// ─── HMAC verification ────────────────────────────────────────────────────────
// Shopify signs every webhook with X-Shopify-Hmac-SHA256 (base64 HMAC-SHA256
// of the raw request body using the app's client secret as the key).
function verifyShopifyHmac(rawBody: string, hmacHeader: string): boolean {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET!;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    // timingSafeEqual prevents timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

// Helper: verify HMAC signature and parse body
async function verifyAndParse(req: Request, res: Response): Promise<{ shop: string; body: any } | null> {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const shop = req.headers['x-shopify-shop-domain'] as string;
  const rawBody: string = (req.body as Buffer).toString();

  if (!verifyShopifyHmac(rawBody, hmac)) {
    res.status(401).send('Unauthorized');
    return null;
  }

  return { shop, body: JSON.parse(rawBody) };
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

// ─── Compliance webhook dispatcher ───────────────────────────────────────────
webhookRouter.post('/compliance', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;

  const topic = (req.headers['x-shopify-topic'] as string ?? '').toLowerCase();
  res.status(200).send('OK');

  const { shop, body } = result;
  logger.info(`GDPR compliance webhook: ${topic}`, { shop });

  if (topic === 'customers/data_request') {
    // We store no customer PII — nothing to return.
  } else if (topic === 'customers/redact') {
    logger.info('GDPR customers/redact: no PII stored', { shop });
  } else if (topic === 'shop/redact') {
    try {
      const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
      if (shopRecord) {
        await prisma.analyticsEvent.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.recommendation.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.orderItem.deleteMany({ where: { order: { shopId: shopRecord.id } } });
        await prisma.order.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.product.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.widgetConfig.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.shop.delete({ where: { id: shopRecord.id } });
        logger.info(`GDPR shop/redact complete: all data deleted for ${shop}`);
      }
    } catch (err) {
      logger.error('GDPR shop/redact error', { shop, err });
    }
  }
});

/**
 * CUSTOMERS_DATA_REQUEST
 */
webhookRouter.post('/customers/data_request', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;
  res.status(200).send('OK');
  logger.info('GDPR: customers/data_request received', { shop: result.shop });
});

/**
 * CUSTOMERS_REDACT
 */
webhookRouter.post('/customers/redact', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;
  res.status(200).send('OK');

  const { shop, body } = result;
  logger.info('GDPR: customers/redact received', { shop });

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;
    const orderIds: string[] = (body.orders_to_redact ?? []).map((o: any) => String(o.id));
    if (orderIds.length > 0) {
      logger.info('GDPR customers/redact: no PII to delete', { shop, orderIds });
    }
  } catch (err) {
    logger.error('GDPR customers/redact error', { shop, err });
  }
});

/**
 * SHOP_REDACT
 */
webhookRouter.post('/shop/redact', async (req, res) => {
  const result = await verifyAndParse(req, res);
  if (!result) return;
  res.status(200).send('OK');

  const { shop } = result;
  logger.info('GDPR: shop/redact received', { shop });

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!shopRecord) return;

    await prisma.analyticsEvent.deleteMany({ where: { shopId: shopRecord.id } });
    await prisma.recommendation.deleteMany({ where: { shopId: shopRecord.id } });
    await prisma.orderItem.deleteMany({ where: { order: { shopId: shopRecord.id } } });
    await prisma.order.deleteMany({ where: { shopId: shopRecord.id } });
    await prisma.product.deleteMany({ where: { shopId: shopRecord.id } });
    await prisma.widgetConfig.deleteMany({ where: { shopId: shopRecord.id } });
    await prisma.shop.delete({ where: { id: shopRecord.id } });

    logger.info(`GDPR shop/redact complete: all data deleted for ${shop}`);
  } catch (err) {
    logger.error('GDPR shop/redact error', { shop, err });
  }
});
