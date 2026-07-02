import { shopifyApi, ApiVersion, LogSeverity } from '@shopify/shopify-api';
import { PrismaSessionStorage } from './sessionStorage';

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ['read_products', 'read_orders', 'read_customers', 'write_script_tags'],
  hostName: process.env.APP_URL!.replace(/^https?:\/\//, ''),
  hostScheme: 'https',
  apiVersion: ApiVersion.April25,
  isEmbeddedApp: true,
  sessionStorage: new PrismaSessionStorage(),
  logger: {
    level: process.env.NODE_ENV === 'production' ? LogSeverity.Error : LogSeverity.Debug,
  },
});

// Re-export for convenience
export const shopifyApp = shopify;
