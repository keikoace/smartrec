import { Routes, Route, Navigate } from 'react-router-dom';
import { Frame, Navigation } from '@shopify/polaris';
import { HomeMinor, SettingsMinor, AnalyticsMinor, BillingStatementDollarMinor } from '@shopify/polaris-icons';
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
          { label: 'Dashboard',  icon: HomeMinor,                    url: '/',          onClick: () => navigate('/') },
          { label: 'Analytics',  icon: AnalyticsMinor,               url: '/analytics', onClick: () => navigate('/analytics') },
          { label: 'Settings',   icon: SettingsMinor,                url: '/settings',  onClick: () => navigate('/settings') },
          { label: 'Billing',    icon: BillingStatementDollarMinor,  url: '/billing',   onClick: () => navigate('/billing') },
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
