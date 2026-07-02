import { shopify } from './shopify';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';

/**
 * Called once after OAuth completes.
 * Pulls all products + last 6 months of orders into our DB.
 */
export async function syncShopData(shopDomain: string, accessToken: string): Promise<void> {
  logger.info(`Starting initial sync for ${shopDomain}`);

  const shopRecord = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shopRecord) throw new Error(`Shop not found: ${shopDomain}`);

  const client = new shopify.clients.Rest({ session: { shop: shopDomain, accessToken } as any });

  // ── Sync Products ──────────────────────────────────────────────────────────
  let productPage: any = null;
  let synced = 0;
  do {
    const params: Record<string, any> = { limit: 250, fields: 'id,title,handle,image,variants' };
    if (productPage?.nextPageParameters) Object.assign(params, productPage.nextPageParameters);

    productPage = await client.get({ path: 'products', query: params });

    for (const p of productPage.body.products ?? []) {
      await prisma.product.upsert({
        where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: `gid://shopify/Product/${p.id}` } },
        create: {
          shopId: shopRecord.id,
          shopifyId: `gid://shopify/Product/${p.id}`,
          title: p.title,
          handle: p.handle,
          imageUrl: p.image?.src ?? null,
          price: parseFloat(p.variants?.[0]?.price ?? '0'),
        },
        update: {
          title: p.title,
          handle: p.handle,
          imageUrl: p.image?.src ?? null,
          price: parseFloat(p.variants?.[0]?.price ?? '0'),
        },
      });
      synced++;
    }
  } while (productPage?.pageInfo?.hasNextPage);

  logger.info(`Synced ${synced} products for ${shopDomain}`);

  // ── Sync Orders (last 180 days) ────────────────────────────────────────────
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  let orderPage: any = null;
  let ordersSynced = 0;

  do {
    const params: Record<string, any> = {
      limit: 250,
      created_at_min: since,
      status: 'any',
      fields: 'id,created_at,line_items',
    };
    if (orderPage?.nextPageParameters) Object.assign(params, orderPage.nextPageParameters);

    orderPage = await client.get({ path: 'orders', query: params });

    for (const order of orderPage.body.orders ?? []) {
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
          where: {
            shopId_shopifyId: {
              shopId: shopRecord.id,
              shopifyId: `gid://shopify/Product/${item.product_id}`,
            },
          },
        });
        if (!product) continue;

        await prisma.orderItem.upsert({
          where: { orderId_productId: { orderId: orderRecord.id, productId: product.id } },
          create: { orderId: orderRecord.id, productId: product.id },
          update: {},
        });
      }
      ordersSynced++;
    }
  } while (orderPage?.pageInfo?.hasNextPage);

  logger.info(`Synced ${ordersSynced} orders for ${shopDomain}`);
}

export async function syncProducts(shopDomain: string): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  await syncShopData(shopDomain, shop.accessToken);
}
