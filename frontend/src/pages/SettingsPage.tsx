import { useEffect, useState } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField, Checkbox,
  Button, Toast, Frame, BlockStack, Text, ColorPicker, hsbToHex, hexToRgb,
} from '@shopify/polaris';
import { useApi } from '../hooks/useApi';

interface Config {
  title: string;
  maxProducts: number;
  showPrices: boolean;
  showAddToCart: boolean;
  primaryColor: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const api = useApi();
  const [config, setConfig] = useState<Config>({
    title: 'You might also like',
    maxProducts: 4,
    showPrices: true,
    showAddToCart: true,
    primaryColor: '#000000',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get('/config').then(setConfig).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/config', config);
      setToast('Settings saved!');
    } catch {
      setToast('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Frame>
      {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      <Page
        title="Widget Settings"
        subtitle="Customize how recommendations appear in your store"
        primaryAction={<Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">General</Text>
                <FormLayout>
                  <Checkbox
                    label="Enable recommendations widget"
                    checked={config.enabled}
                    onChange={(v) => setConfig(c => ({ ...c, enabled: v }))}
                  />
                  <TextField
                    label="Widget heading"
                    value={config.title}
                    onChange={(v) => setConfig(c => ({ ...c, title: v }))}
                    helpText="Shown above the recommendations grid on product pages."
                    autoComplete="off"
                  />
                  <TextField
                    label="Number of products to show"
                    type="number"
                    value={String(config.maxProducts)}
                    onChange={(v) => setConfig(c => ({ ...c, maxProducts: parseInt(v) || 4 }))}
                    min="2"
                    max="8"
                    autoComplete="off"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Display options</Text>
                <FormLayout>
                  <Checkbox
                    label="Show prices"
                    checked={config.showPrices}
                    onChange={(v) => setConfig(c => ({ ...c, showPrices: v }))}
                  />
                  <Checkbox
                    label="Show Add to Cart button"
                    checked={config.showAddToCart}
                    onChange={(v) => setConfig(c => ({ ...c, showAddToCart: v }))}
                  />
                  <TextField
                    label="Button color (hex)"
                    value={config.primaryColor}
                    onChange={(v) => setConfig(c => ({ ...c, primaryColor: v }))}
                    helpText="e.g. #1a1a1a — matches your store's primary color"
                    autoComplete="off"
                    prefix={
                      <span style={{
                        display: 'inline-block', width: 16, height: 16,
                        borderRadius: '50%', background: config.primaryColor,
                        verticalAlign: 'middle',
                      }} />
                    }
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">How to add the widget to your store</Text>
                <Text as="p">
                  Go to <strong>Online Store → Themes → Customize</strong>, open any product page template,
                  click <strong>Add section</strong>, and select <strong>SmartRec Recommendations</strong>.
                  Drag it to your preferred position (typically below the product description).
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
