import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';
import App from './App';

// Read Shopify app bridge config from URL params (injected by Shopify)
const searchParams = new URLSearchParams(window.location.search);
const config = {
  apiKey: import.meta.env.VITE_SHOPIFY_API_KEY as string,
  host: searchParams.get('host') ?? '',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBridgeProvider config={config}>
      <AppProvider i18n={enTranslations}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProvider>
    </AppBridgeProvider>
  </React.StrictMode>
);
