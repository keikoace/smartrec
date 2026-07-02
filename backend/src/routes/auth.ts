import { Router } from 'express';
import { shopify } from '../services/shopify';
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
