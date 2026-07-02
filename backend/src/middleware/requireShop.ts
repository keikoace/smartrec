import { Request, Response, NextFunction } from 'express';
import { shopify } from '../services/shopify';
import { prisma } from '../utils/db';

/**
 * Middleware for embedded app API routes.
 * Verifies the Shopify session token from Authorization header.
 * Attaches `req.shopDomain` and `req.shopRecord` for downstream use.
 */
export async function requireShop(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = await shopify.session.getCurrentId({
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    const session = await shopify.config.sessionStorage!.loadSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Session expired. Please reinstall.' });
      return;
    }

    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });

    if (!shopRecord || shopRecord.uninstalledAt) {
      res.status(401).json({ error: 'Shop not found or uninstalled.' });
      return;
    }

    (req as any).shopDomain = session.shop;
    (req as any).shopRecord = shopRecord;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed.' });
  }
}
