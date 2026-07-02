import { Session, SessionStorage } from '@shopify/shopify-api';
import { prisma } from '../utils/db';

/**
 * Stores Shopify OAuth sessions in PostgreSQL via Prisma.
 * The @shopify/shopify-api library calls these methods automatically.
 */
export class PrismaSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    try {
      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: {
          shopDomain: session.shop,
          accessToken: session.accessToken ?? '',
          scope: session.scope ?? '',
        },
        update: {
          accessToken: session.accessToken ?? '',
          scope: session.scope ?? '',
          uninstalledAt: null, // re-install clears this
        },
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    // id format: "offline_mystore.myshopify.com"
    const shopDomain = id.replace('offline_', '');
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop || shop.uninstalledAt) return undefined;

    const session = new Session({
      id,
      shop: shop.shopDomain,
      state: '',
      isOnline: false,
    });
    session.accessToken = shop.accessToken;
    session.scope = shop.scope;
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    const shopDomain = id.replace('offline_', '');
    await prisma.shop.updateMany({
      where: { shopDomain },
      data: { uninstalledAt: new Date() },
    });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) await this.deleteSession(id);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const record = await prisma.shop.findUnique({ where: { shopDomain: shop } });
    if (!record) return [];
    const session = await this.loadSession(`offline_${shop}`);
    return session ? [session] : [];
  }
}
