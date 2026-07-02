import { Router } from 'express';
import { requireShop } from '../middleware/requireShop';
import { prisma } from '../utils/db';
import { createBillingPlan, getBillingStatus } from '../services/billingService';
import { runRecommendationJob } from '../jobs/recommendationJob';
import { logger } from '../utils/logger';

export const apiRouter = Router();

// All API routes require a valid shop session
apiRouter.use(requireShop);

// ─── Widget Config ─────────────────────────────────────────────────────────────

apiRouter.get('/config', async (req, res) => {
  const shop = (req as any).shopRecord;

  let config = await prisma.widgetConfig.findUnique({ where: { shopId: shop.id } });

  if (!config) {
    config = await prisma.widgetConfig.create({
      data: { shopId: shop.id },
    });
  }

  res.json(config);
});

apiRouter.patch('/config', async (req, res) => {
  const shop = (req as any).shopRecord;
  const { title, maxProducts, showPrices, showAddToCart, primaryColor, enabled } = req.body;

  const config = await prisma.widgetConfig.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, title, maxProducts, showPrices, showAddToCart, primaryColor, enabled },
    update: { title, maxProducts, showPrices, showAddToCart, primaryColor, enabled },
  });

  res.json(config);
});

// ─── Analytics ─────────────────────────────────────────────────────────────────

apiRouter.get('/analytics', async (req, res) => {
  const shop = (req as any).shopRecord;
  const { days = '30' } = req.query;
  const since = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);

  const [impressions, clicks, addToCarts, purchases] = await Promise.all([
    prisma.analyticsEvent.count({ where: { shopId: shop.id, eventType: 'IMPRESSION', createdAt: { gte: since } } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, eventType: 'CLICK', createdAt: { gte: since } } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, eventType: 'ADD_TO_CART', createdAt: { gte: since } } }),
    prisma.analyticsEvent.count({ where: { shopId: shop.id, eventType: 'PURCHASE', createdAt: { gte: since } } }),
  ]);

  res.json({
    period: `${days}d`,
    impressions,
    clicks,
    ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0',
    addToCarts,
    purchases,
    conversionRate: clicks > 0 ? ((purchases / clicks) * 100).toFixed(1) : '0',
  });
});

// ─── Top recommended products (for admin preview) ─────────────────────────────

apiRouter.get('/recommendations/preview', async (req, res) => {
  const shop = (req as any).shopRecord;
  const { productId } = req.query;

  const product = await prisma.product.findFirst({
    where: {
      shopId: shop.id,
      ...(productId ? { shopifyId: productId as string } : {}),
    },
  });

  if (!product) {
    res.json({ recommendations: [] });
    return;
  }

  const rec = await prisma.recommendation.findUnique({
    where: { shopId_sourceProductId: { shopId: shop.id, sourceProductId: product.id } },
  });

  if (!rec) {
    res.json({ source: product, recommendations: [], message: 'No recommendations yet — run a sync first.' });
    return;
  }

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, shopifyId: { in: rec.rankedProducts.slice(0, 8) } },
  });

  // Preserve ranking order
  const ordered = rec.rankedProducts.slice(0, 8)
    .map((gid) => products.find((p) => p.shopifyId === gid))
    .filter(Boolean);

  res.json({ source: product, recommendations: ordered });
});

// ─── Billing ──────────────────────────────────────────────────────────────────

apiRouter.get('/billing', async (req, res) => {
  const shop = (req as any).shopRecord;
  res.json(await getBillingStatus(shop));
});

apiRouter.post('/billing/subscribe', async (req, res) => {
  const shop = (req as any).shopRecord;
  const { plan } = req.body; // 'STARTER' | 'GROWTH'

  const confirmationUrl = await createBillingPlan(shop, plan, req);
  res.json({ confirmationUrl });
});

// ─── Manual re-sync trigger (for admin) ──────────────────────────────────────

apiRouter.post('/sync', async (req, res) => {
  const shop = (req as any).shopRecord;
  res.json({ message: 'Sync started' });

  runRecommendationJob(shop.shopDomain).catch((err) =>
    logger.error('Manual sync failed', { shop: shop.shopDomain, err })
  );
});
