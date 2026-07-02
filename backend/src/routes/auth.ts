import { Router } from 'express';
import { shopify } from '../services/shopify';
import { prisma } from '../utils/db';
import { syncShopData } from '../services/syncService';
import { logger } from '../utils/logger';

export const authRouter = Router();

/**
 * Step 1: Shopify redirects merchant here to begin OAuth.
 * URL: /auth?shop=mystore.myshopify.com
 */
authRouter.get('/', async (req, res) => {
  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(req.query.shop as string, true)!,
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

/**
 * Step 2: Shopify redirects here after merchant approves.
 * Exchanges code for access token, stores session, triggers initial sync.
 */
authRouter.get('/callback', async (req, res) => {
  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const session = callbackResponse.session;
    logger.info(`OAuth complete for shop: ${session.shop}`);

    // Kick off background sync — products + historical orders
    syncShopData(session.shop, session.accessToken ?? '').catch((err) =>
      logger.error('Initial sync failed', { shop: session.shop, err })
    );

    // Redirect into the Shopify admin embedded app
    const host = req.query.host as string;
    return res.redirect(
      `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?host=${host}`
    );
  } catch (err) {
    logger.error('OAuth callback error', { err });
    return res.status(500).send('Authentication failed. Please try again.');
  }
});

/**
 * Step 3 (billing): Shopify redirects here after merchant approves or declines a subscription.
 * URL: /auth/billing/callback?shop=...&plan=STARTER|GROWTH&charge_id=...
 */
authRouter.get('/billing/callback', async (req, res) => {
  const { shop, plan, charge_id } = req.query as { shop?: string; plan?: string; charge_id?: string };

  if (!shop || !plan || !charge_id) {
    return res.status(400).send('Missing required billing callback parameters.');
  }

  const validPlans = ['STARTER', 'GROWTH'] as const;
  if (!validPlans.includes(plan as any)) {
    return res.status(400).send('Invalid plan.');
  }

  try {
    await prisma.shop.updateMany({
      where: { shopDomain: shop },
      data: { plan: plan as 'STARTER' | 'GROWTH' },
    });
    logger.info(`Billing activated: shop=${shop} plan=${plan} charge_id=${charge_id}`);
  } catch (err) {
    logger.error('Billing callback DB update failed', { shop, plan, err });
  }

  // Redirect back into the embedded app
  return res.redirect(
    `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`
  );
});
