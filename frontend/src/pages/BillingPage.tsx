import { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Button, Badge, BlockStack, InlineStack, Divider, List, Box,
} from '@shopify/polaris';
import { useApi } from '../hooks/useApi';

interface BillingStatus {
  plan: 'FREE' | 'STARTER' | 'GROWTH';
  features: { impressionsPerMonth: number | null; price: number };
}

const PLANS = [
  {
    key: 'FREE',
    name: 'Free',
    price: '$0',
    features: ['100 impressions / month', 'Basic recommendations', 'Community support'],
    cta: null,
  },
  {
    key: 'STARTER',
    name: 'Starter',
    price: '$19 / mo',
    features: ['5,000 impressions / month', 'AI recommendations', '14-day free trial', 'Email support'],
    cta: 'Upgrade to Starter',
    tone: 'primary',
  },
  {
    key: 'GROWTH',
    name: 'Growth',
    price: '$49 / mo',
    features: ['Unlimited impressions', 'Priority support', 'Advanced analytics', '14-day free trial'],
    cta: 'Upgrade to Growth',
    tone: 'primary',
  },
] as const;

export default function BillingPage() {
  const api = useApi();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    api.get('/billing').then(setBilling).catch(() => {});
  }, []);

  const handleUpgrade = async (plan: 'STARTER' | 'GROWTH') => {
    setLoading(plan);
    try {
      const { confirmationUrl } = await api.post('/billing/subscribe', { plan });
      // Redirect to Shopify billing confirmation
      window.top!.location.href = confirmationUrl;
    } catch {
      setLoading(null);
    }
  };

  return (
    <Page title="Billing" subtitle="Manage your SmartRec subscription">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Current plan</Text>
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" variant="headingLg">{billing?.plan ?? '—'}</Text>
                <Badge tone={billing?.plan === 'FREE' ? 'info' : 'success'}>Active</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {billing?.features.impressionsPerMonth
                  ? `${billing.features.impressionsPerMonth.toLocaleString()} impressions / month`
                  : billing?.plan === 'GROWTH' ? 'Unlimited impressions' : ''}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Layout>
            {PLANS.map((plan) => (
              <Layout.Section key={plan.key} variant="oneThird">
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h3">{plan.name}</Text>
                        {billing?.plan === plan.key && <Badge tone="success">Current</Badge>}
                      </InlineStack>
                      <Text as="p" variant="headingXl">{plan.price}</Text>
                    </BlockStack>
                    <Divider />
                    <List>
                      {plan.features.map((f) => <List.Item key={f}>{f}</List.Item>)}
                    </List>
                    {plan.cta && billing?.plan !== plan.key && (
                      <Box paddingBlockStart="200">
                        <Button
                          variant="primary"
                          fullWidth
                          onClick={() => handleUpgrade(plan.key as 'STARTER' | 'GROWTH')}
                          loading={loading === plan.key}
                        >
                          {plan.cta}
                        </Button>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
