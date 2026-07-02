import { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, DataTable, Banner,
  Button, Spinner, Badge, BlockStack, InlineStack, Box,
} from '@shopify/polaris';
import { useApi } from '../hooks/useApi';

interface Analytics {
  period: string;
  impressions: number;
  clicks: number;
  ctr: string;
  addToCarts: number;
  purchases: number;
  conversionRate: string;
}

interface RecommendationPreview {
  source?: { title: string; handle: string };
  recommendations: Array<{ title: string; handle: string; price: number; imageUrl?: string }>;
  message?: string;
}

export default function DashboardPage() {
  const api = useApi();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [preview, setPreview] = useState<RecommendationPreview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics?days=30'),
      api.get('/recommendations/preview'),
    ]).then(([a, p]) => {
      setAnalytics(a);
      setPreview(p);
    }).finally(() => setLoading(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await api.post('/sync').catch(() => {});
    setSyncing(false);
  };

  if (loading) return (
    <Page title="SmartRec">
      <Layout><Layout.Section><Card><Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box></Card></Layout.Section></Layout>
    </Page>
  );

  const analyticsRows = analytics ? [
    ['Impressions',    analytics.impressions.toLocaleString()],
    ['Clicks',         analytics.clicks.toLocaleString()],
    ['Click Rate',     `${analytics.ctr}%`],
    ['Add to Carts',   analytics.addToCarts.toLocaleString()],
    ['Purchases',      analytics.purchases.toLocaleString()],
    ['Conversion Rate',`${analytics.conversionRate}%`],
  ] : [];

  return (
    <Page
      title="SmartRec Dashboard"
      subtitle="AI-powered product recommendations"
      primaryAction={
        <Button variant="primary" onClick={handleSync} loading={syncing}>
          {syncing ? 'Computing…' : 'Refresh Recommendations'}
        </Button>
      }
    >
      <Layout>
        {preview?.message && (
          <Layout.Section>
            <Banner title="Getting started" tone="info">
              <p>{preview.message}</p>
              <p>Click "Refresh Recommendations" to compute your first recommendations from order history.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── 30-day Analytics ──────────────────────────────────────────────── */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Last 30 days</Text>
              {analytics && (
                <DataTable
                  columnContentTypes={['text', 'text']}
                  headings={['Metric', 'Value']}
                  rows={analyticsRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Recommendation Preview ─────────────────────────────────────────── */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Sample recommendations
                {preview?.source && (
                  <Text as="span" tone="subdued"> — for "{preview.source.title}"</Text>
                )}
              </Text>
              {preview?.recommendations.length ? (
                <BlockStack gap="200">
                  {preview.recommendations.slice(0, 4).map((p, i) => (
                    <InlineStack key={i} gap="300" blockAlign="center">
                      {p.imageUrl && (
                        <img src={p.imageUrl} alt={p.title}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                      )}
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd">{p.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">€{p.price.toFixed(2)}</Text>
                      </BlockStack>
                      <Badge tone="success">Recommended</Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued">No recommendations yet.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
