import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CurrencyProvider } from './lib/CurrencyContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import CarsPage from './pages/CarsPage';
import ModelGroupsPage from './pages/ModelGroupsPage';
import KGMPage from './pages/KGMPage';
import BookingsPage from './pages/BookingsPage';
import CalendarPage from './pages/CalendarPage';
import FinesPage from './pages/FinesPage';
import UsersPage from './pages/UsersPage';
import InvestorsPage from './pages/InvestorsPage';
import PricingPage from './pages/PricingPage';
import AccountingPage, { InvestorReportPage, CarCustomerSheetPage } from './pages/AccountingPage';
import CarTrackingPage from './pages/CarTrackingPage';
import ActiveBookingsPage from './pages/ActiveBookingsPage';
import PendingInvoicesPage from './pages/PendingInvoicesPage';
import CustomersPage from './pages/CustomersPage';
import GoogleReviewsPage from './pages/GoogleReviewsPage';
import OperationsPage from './pages/OperationsPage';
import CarIssuesPage from './pages/CarIssuesPage';
import InboxPage from './pages/InboxPage';
import StaffPermissionsPage from './pages/StaffPermissionsPage';
import SourcingPage from './pages/SourcingPage';
import ProtectedRoute from './components/ProtectedRoute';
import MarketingLayout from './pages/marketing/MarketingLayout';
import MarketingOverviewPage from './pages/marketing/MarketingOverviewPage';
import MarketingChatPage from './pages/marketing/MarketingChatPage';
import MarketingApprovalsPage from './pages/marketing/MarketingApprovalsPage';
import MarketingConstitutionsPage from './pages/marketing/MarketingConstitutionsPage';
import MarketingCalendarPage from './pages/marketing/MarketingCalendarPage';
import MarketingSocialPostsPage from './pages/marketing/MarketingSocialPostsPage';
import MarketingBlogPostsPage from './pages/marketing/MarketingBlogPostsPage';
import MarketingDesignsPage from './pages/marketing/MarketingDesignsPage';
import MarketingCampaignsPage from './pages/marketing/MarketingCampaignsPage';
import MarketingCompetitorsPage from './pages/marketing/MarketingCompetitorsPage';
import MarketingPerformancePage from './pages/marketing/MarketingPerformancePage';
import MarketingDecisionsPage from './pages/marketing/MarketingDecisionsPage';
import MarketingSettingsPage from './pages/marketing/MarketingSettingsPage';
import MarketingPlaceholderPage from './pages/marketing/MarketingPlaceholderPage';
import OnlineUsersPage from './pages/OnlineUsersPage';
import TeamPage from './pages/TeamPage';

const App: React.FC = () => {
  return (
    <CurrencyProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="cars" replace />} />
          <Route path="cars" element={<CarsPage />} />
          <Route path="cars/tracking" element={<CarTrackingPage />} />
          <Route path="model-groups" element={<ModelGroupsPage />} />
          <Route path="kgm" element={<KGMPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="bookings/active" element={<ActiveBookingsPage />} />
          <Route path="pending-invoices" element={<PendingInvoicesPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="investors" element={<InvestorsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="accounting/report" element={<InvestorReportPage />} />
          <Route path="accounting/customer-sheet/:carId" element={<CarCustomerSheetPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="google-reviews" element={<GoogleReviewsPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="car-issues" element={<CarIssuesPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="sourcing" element={<SourcingPage />} />
          <Route path="online-users" element={<OnlineUsersPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="staff-permissions" element={<StaffPermissionsPage />} />

          {/* ── Marketing ─────────────────────────────────── */}
          <Route path="marketing" element={<MarketingLayout />}>
            <Route index element={<MarketingOverviewPage />} />
            <Route path="chat"          element={<MarketingChatPage />} />
            <Route path="bots"          element={<MarketingConstitutionsPage />} />
            <Route path="approvals"     element={<MarketingApprovalsPage />} />
            <Route path="calendar"      element={<MarketingCalendarPage />} />
            <Route path="social-posts"  element={<MarketingSocialPostsPage />} />
            <Route path="blog-posts"    element={<MarketingBlogPostsPage />} />
            <Route path="designs"       element={<MarketingDesignsPage />} />
            <Route path="campaigns"     element={<MarketingCampaignsPage />} />
            <Route path="competitors"   element={<MarketingCompetitorsPage />} />
            <Route path="performance"   element={<MarketingPerformancePage />} />
            <Route path="decisions"     element={<MarketingDecisionsPage />} />
            <Route path="settings"      element={<MarketingSettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
};

export default App;
