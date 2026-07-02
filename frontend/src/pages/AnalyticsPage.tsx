import { useEffect, useState } from 'react';
import { Page, Layout, Card, DataTable, Select, Text, BlockStack, InlineGrid, Box } from '@shopify/polaris';
import { useApi } from '../hooks/useApi';

interface Analytics {
  period: string; impressions: number; clicks: number;
  ctr: string; addToCarts: number; purchases: number; conversionRate: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="headingXl">{value}</Text>
        {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

export default function AnalyticsPage() {
  const api = useApi();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [days, setDays] = useState('30');

  useEffect(() => {
    api.get(`/analytics?days=${days}`).then(setAnalytics).catch(() => {});
  }, [days]);

  return (
    <Page title="Analytics" subtitle="Recommendation performance metrics">
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 3 }} gap="400">
            <StatCard label="Impressions"    value={analytics?.impressions.toLocaleString() ?? '—'} sub={`Last ${days} days`} />
            <StatCard label="Clicks"         value={analytics?.clicks.toLocaleString() ?? '—'}      sub={`CTR: ${analytics?.ctr ?? '—'}%`} />
            <StatCard label="Add to Carts"   value={analytics?.addToCarts.toLocaleString() ?? '—'} />
            <StatCard label="Purchases"      value={analytics?.purchases.toLocaleString() ?? '—'} />
            <StatCard label="Conversion Rate" value={analytics ? `${analytics.conversionRate}%` : '—'} sub="Clicks → Purchases" />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Box>
                <Select
                  label="Time period"
                  options={[
                    { label: 'Last 7 days',  value: '7' },
                    { label: 'Last 30 days', value: '30' },
                    { label: 'Last 90 days', value: '90' },
                  ]}
                  value={days}
                  onChange={setDays}
                />
              </Box>
              <DataTable
                columnContentTypes={['text', 'text']}
                headings={['Metric', 'Value']}
                rows={analytics ? [
                  ['Widget impressions', analytics.impressions.toLocaleString()],
                  ['Product clicks',     analytics.clicks.toLocaleString()],
                  ['Click-through rate', `${analytics.ctr}%`],
                  ['Add to carts',       analytics.addToCarts.toLocaleString()],
                  ['Purchases',          analytics.purchases.toLocaleString()],
                  ['Conversion rate',    `${analytics.conversionRate}%`],
                ] : []}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
