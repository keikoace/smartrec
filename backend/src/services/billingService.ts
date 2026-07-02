import { shopify } from './shopify';
import { prisma } from '../utils/db';
import { Request } from 'express';

const PLANS = {
  STARTER: {
    name: 'SmartRec Starter',
    price: 19.0,
    trialDays: 14,
    currencyCode: 'USD',
  },
  GROWTH: {
    name: 'SmartRec Growth',
    price: 49.0,
    trialDays: 14,
    currencyCode: 'USD',
  },
};

/**
 * Creates a Shopify recurring charge and returns the confirmation URL.
 * Merchant must visit the URL to approve.
 */
export async function createBillingPlan(
  shopRecord: any,
  plan: 'STARTER' | 'GROWTH',
  req: Request
): Promise<string> {
  const planConfig = PLANS[plan];
  if (!planConfig) throw new Error(`Unknown plan: ${plan}`);

  const session = await shopify.config.sessionStorage!.loadSession(`offline_${shopRecord.shopDomain}`);
  if (!session) throw new Error('No session found');

  const client = new shopify.clients.Graphql({ session });

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, trialDays: $trialDays) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }
  `;

  const returnUrl = `${process.env.APP_URL}/auth/billing/callback?shop=${shopRecord.shopDomain}&plan=${plan}`;

  const response: any = await client.query({
    data: {
      query: mutation,
      variables: {
        name: planConfig.name,
        returnUrl,
        trialDays: planConfig.trialDays,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: planConfig.price, currencyCode: planConfig.currencyCode },
              interval: 'EVERY_30_DAYS',
            },
          },
        }],
      },
    },
  });

  const result = response.body.data.appSubscriptionCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors[0].message);
  }

  // Store billing ID
  await prisma.shop.update({
    where: { id: shopRecord.id },
    data: { billingId: result.appSubscription.id },
  });

  return result.confirmationUrl;
}

export async function getBillingStatus(shopRecord: any) {
  return {
    plan: shopRecord.plan,
    billingId: shopRecord.billingId,
    features: {
      FREE:    { impressionsPerMonth: 100,   price: 0 },
      STARTER: { impressionsPerMonth: 5000,  price: 19 },
      GROWTH:  { impressionsPerMonth: null,  price: 49 }, // null = unlimited
    }[shopRecord.plan as string],
  };
}
