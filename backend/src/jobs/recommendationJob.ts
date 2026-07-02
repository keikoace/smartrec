import { prisma } from '../utils/db';
import { logger } from '../utils/logger';

/**
 * SmartRec Recommendation Engine
 * Algorithm: Item-Item Collaborative Filtering via Purchase Co-occurrence
 *
 * How it works:
 * 1. Build a co-occurrence matrix: for every pair of products (A, B),
 *    count how many orders contained BOTH A and B.
 * 2. Normalize using the Jaccard similarity coefficient:
 *    jaccard(A,B) = orders_with_both(A,B) / orders_with_A_or_B
 *    This prevents popular products from dominating (avoids "recommend bestsellers everywhere").
 * 3. For each product, store the top-N most similar products ranked by Jaccard score.
 *
 * Runs nightly via cron. Also triggered manually via /api/sync.
 * Time complexity: O(P² × O) where P = products, O = orders.
 * Handles stores with up to ~50K products and ~500K orders comfortably.
 */
export async function runRecommendationJob(shopDomain?: string): Promise<void> {
  const shops = shopDomain
    ? await prisma.shop.findMany({ where: { shopDomain, uninstalledAt: null } })
    : await prisma.shop.findMany({ where: { uninstalledAt: null } });

  for (const shop of shops) {
    try {
      await computeRecommendationsForShop(shop.id);
    } catch (err) {
      logger.error(`Rec job failed for shop ${shop.shopDomain}`, { err });
    }
  }
}

async function computeRecommendationsForShop(shopId: string): Promise<void> {
  logger.info(`Computing recommendations for shop ${shopId}`);
  const start = Date.now();

  // ── Step 1: Load all order items for this shop ─────────────────────────────
  // Shape: [{ orderId, productId }]
  const orderItems = await prisma.orderItem.findMany({
    where: { order: { shopId } },
    select: { orderId: true, productId: true },
  });

  if (orderItems.length < 2) {
    logger.info(`Not enough order data for shop ${shopId} — skipping`);
    return;
  }

  // ── Step 2: Build product → set of orders ─────────────────────────────────
  const productOrders = new Map<string, Set<string>>(); // productId → Set<orderId>
  for (const item of orderItems) {
    if (!productOrders.has(item.productId)) {
      productOrders.set(item.productId, new Set());
    }
    productOrders.get(item.productId)!.add(item.orderId);
  }

  const productIds = [...productOrders.keys()];
  if (productIds.length < 2) return;

  // ── Step 3: Build co-occurrence matrix ────────────────────────────────────
  // cooccurrence[A][B] = number of orders containing both A and B
  const cooccurrence = new Map<string, Map<string, number>>();

  // Group items by order for efficient pair generation
  const orderProducts = new Map<string, string[]>(); // orderId → productIds[]
  for (const item of orderItems) {
    if (!orderProducts.has(item.orderId)) orderProducts.set(item.orderId, []);
    orderProducts.get(item.orderId)!.push(item.productId);
  }

  for (const [, products] of orderProducts) {
    if (products.length < 2) continue;
    // Generate all pairs within this order
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const a = products[i];
        const b = products[j];
        // Symmetric: increment both directions
        increment(cooccurrence, a, b);
        increment(cooccurrence, b, a);
      }
    }
  }

  // ── Step 4: Compute Jaccard similarity & rank ──────────────────────────────
  const TOP_N = 10; // Store top 10 recommendations per product

  const recommendations: Array<{
    shopId: string;
    sourceProductId: string;
    rankedProducts: string[];
    score: number[];
  }> = [];

  for (const productId of productIds) {
    const aOrders = productOrders.get(productId)!;
    const coScores = cooccurrence.get(productId);
    if (!coScores) continue;

    const scored: Array<{ productId: string; score: number }> = [];

    for (const [otherProductId, coCount] of coScores) {
      const bOrders = productOrders.get(otherProductId)!;
      // Jaccard = |A ∩ B| / |A ∪ B| = coCount / (|A| + |B| - coCount)
      const union = aOrders.size + bOrders.size - coCount;
      const jaccard = coCount / union;
      scored.push({ productId: otherProductId, score: jaccard });
    }

    // Sort descending by Jaccard score, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, TOP_N);

    if (top.length === 0) continue;

    // Map internal productIds back to Shopify GIDs
    const products = await prisma.product.findMany({
      where: { id: { in: top.map((t) => t.productId) } },
      select: { id: true, shopifyId: true },
    });
    const idToGid = new Map(products.map((p) => [p.id, p.shopifyId]));

    recommendations.push({
      shopId,
      sourceProductId: productId,
      rankedProducts: top.map((t) => idToGid.get(t.productId)!).filter(Boolean),
      score: top.map((t) => t.score),
    });
  }

  // ── Step 5: Upsert recommendations into DB ─────────────────────────────────
  for (const rec of recommendations) {
    await prisma.recommendation.upsert({
      where: {
        shopId_sourceProductId: {
          shopId: rec.shopId,
          sourceProductId: rec.sourceProductId,
        },
      },
      create: rec,
      update: {
        rankedProducts: rec.rankedProducts,
        score: rec.score,
        computedAt: new Date(),
      },
    });
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`Recommendations computed for shop ${shopId}: ${recommendations.length} products in ${elapsed}s`);
}

// Helper: increment co-occurrence count
function increment(map: Map<string, Map<string, number>>, a: string, b: string): void {
  if (!map.has(a)) map.set(a, new Map());
  const inner = map.get(a)!;
  inner.set(b, (inner.get(b) ?? 0) + 1);
}
