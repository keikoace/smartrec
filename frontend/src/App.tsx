import { Routes, Route, Navigate } from 'react-router-dom';
import { Frame, Navigation } from '@shopify/polaris';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import BillingPage from './pages/BillingPage';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          { label: 'Dashboard',  url: '/',          onClick: () => navigate('/') },
          { label: 'Analytics',  url: '/analytics', onClick: () => navigate('/analytics') },
          { label: 'Settings',   url: '/settings',  onClick: () => navigate('/settings') },
          { label: 'Billing',    url: '/billing',   onClick: () => navigate('/billing') },
        ]}
      />
    </Navigation>
  );

  return (
    <Frame navigation={navigationMarkup}>
      <Routes>
        <Route path="/"          element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings"  element={<SettingsPage />} />
        <Route path="/billing"   element={<BillingPage />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </Frame>
  );
}
