import { Router } from 'express';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';

/**
 * Public routes — called by the storefront widget JS (no auth required).
 * These must be fast (< 50ms) as they block page render.
 */
export const publicRouter = Router();

/**
 * GET /public/recommendations
 * Query: shop=mystore.myshopify.com&productId=gid://shopify/Product/123&limit=4
 *
 * Returns ranked product recommendations for a given source product.
 * Called client-side by the Theme App Extension widget.
 */
publicRouter.get('/recommendations', async (req, res) => {
  // Allow cross-origin from the merchant's storefront
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min CDN cache

  const { shop: shopDomain, productId, limit = '4' } = req.query;

  if (!shopDomain || !productId) {
    res.status(400).json({ error: 'Missing shop or productId' });
    return;
  }

  const maxResults = Math.min(parseInt(limit as string) || 4, 10);

  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shopDomain as string },
      include: { widgetConfig: true },
    });

    if (!shopRecord || shopRecord.uninstalledAt || !shopRecord.widgetConfig?.enabled) {
      res.json({ recommendations: [] });
      return;
    }

    // Enforce plan limits
    if (shopRecord.plan === 'FREE') {
      const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const impressions = await prisma.analyticsEvent.count({
        where: { shopId: shopRecord.id, eventType: 'IMPRESSION', createdAt: { gte: thisMonth } },
      });
      if (impressions >= 100) {
        res.json({ recommendations: [] });
        return;
      }
    }

    const product = await prisma.product.findUnique({
      where: {
        shopId_shopifyId: { shopId: shopRecord.id, shopifyId: productId as string },
      },
    });

    if (!product) {
      res.json({ recommendations: [] });
      return;
    }

    const rec = await prisma.recommendation.findUnique({
      where: { shopId_sourceProductId: { shopId: shopRecord.id, sourceProductId: product.id } },
    });

    if (!rec) {
      res.json({ recommendations: [] });
      return;
    }

    const topIds = rec.rankedProducts.slice(0, maxResults);
    const products = await prisma.product.findMany({
      where: { shopId: shopRecord.id, shopifyId: { in: topIds } },
      select: { shopifyId: true, title: true, handle: true, imageUrl: true, price: true },
    });

    const ordered = topIds
      .map((gid) => products.find((p) => p.shopifyId === gid))
      .filter(Boolean);

    // Fire impression event (non-blocking)
    prisma.analyticsEvent.create({
      data: {
        shopId: shopRecord.id,
        eventType: 'IMPRESSION',
        sourceProductId: product.id,
        sessionId: (req.query.sid as string) ?? null,
      },
    }).catch(() => {});

    res.json({
      recommendations: ordered,
      config: {
        title: shopRecord.widgetConfig.title,
        showPrices: shopRecord.widgetConfig.showPrices,
        showAddToCart: shopRecord.widgetConfig.showAddToCart,
        primaryColor: shopRecord.widgetConfig.primaryColor,
      },
    });
  } catch (err) {
    logger.error('Public recommendations error', { err });
    res.json({ recommendations: [] }); // Always return something — never break the storefront
  }
});

/**
 * POST /public/event
 * Body: { shop, eventType, sourceProductId, targetProductId, sessionId }
 * Tracks clicks, add-to-carts, purchases from the widget.
 */
publicRouter.post('/event', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(202).send();

  const { shop: shopDomain, eventType, sourceProductId, targetProductId, sessionId } = req.body;
  if (!shopDomain || !eventType) return;

  try {
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shopRecord) return;

    await prisma.analyticsEvent.create({
      data: {
        shopId: shopRecord.id,
        eventType,
        sourceProductId: sourceProductId ?? null,
        targetProductId: targetProductId ?? null,
        sessionId: sessionId ?? null,
      },
    });
  } catch {
    // Silently ignore — analytics must never break anything
  }
});
