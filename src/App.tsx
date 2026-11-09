import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { CurrencyProvider } from './lib/CurrencyContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import GoalsPage from './pages/GoalsPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import MyCustodyPage from './pages/MyCustodyPage';
import MyWalletPage from './pages/MyWalletPage';
import SettingsPage from './pages/SettingsPage';
import CarsPage from './pages/CarsPage';
import ModelGroupsPage from './pages/ModelGroupsPage';
import HrOpeningsPage from './pages/hr/HrOpeningsPage';
import HrOpeningPage from './pages/hr/HrOpeningPage';
import OpeningBuilderPage from './pages/hr/OpeningBuilderPage';
import HrInterviewsPage from './pages/hr/HrInterviewsPage';
import KGMPage from './pages/KGMPage';
import HGSPage from './pages/HGSPage';
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
import CustomersPage from './pages/customers/CustomersPage';
import CustomerProfilePage from './pages/customers/CustomerProfilePage';
import GoogleReviewsPage from './pages/GoogleReviewsPage';
import OperationsPage from './pages/OperationsPage';
import KabisManagementPage from './pages/KabisManagementPage';
import CarIssuesPage from './pages/CarIssuesPage';
import InboxPage from './pages/InboxPage';
import MailPage from './pages/MailPage';
import SourcesPage from './pages/SourcesPage';
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
import NotificationsPage from './pages/notifications/NotificationsPage';
import ReminderRulesPage from './pages/notifications/ReminderRulesPage';
import TasksPage from './pages/tasks/TasksPage';
import MediaLayout from './pages/media/MediaLayout';
import MediaIdeasPage from './pages/media/MediaIdeasPage';
import MediaCalendarPage from './pages/media/MediaCalendarPage';
import MediaInfluencersPage from './pages/media/MediaInfluencersPage';
import MediaListsPage from './pages/media/MediaListsPage';

const SupplierRedirect: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={`/dashboard/accounting?tab=suppliers&supplier=${id}`} replace />;
};

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
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="my-custody" element={<MyCustodyPage />} />
          <Route path="my-wallet" element={<MyWalletPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="cars" element={<CarsPage />} />
          <Route path="cars/tracking" element={<CarTrackingPage />} />
          <Route path="model-groups" element={<ModelGroupsPage />} />
          <Route path="kgm" element={<KGMPage />} />
          <Route path="hgs" element={<HGSPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="bookings/active" element={<ActiveBookingsPage />} />
          <Route path="pending-invoices" element={<PendingInvoicesPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="investors" element={<InvestorsPage />} />
          <Route path="payroll" element={<Navigate to="/dashboard/accounting?tab=wallets" replace />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="accounting/report" element={<InvestorReportPage />} />
          <Route path="accounting/customer-sheet/:carId" element={<CarCustomerSheetPage />} />
          <Route path="suppliers" element={<Navigate to="/dashboard/accounting?tab=suppliers" replace />} />
          <Route path="suppliers/:id" element={<SupplierRedirect />} />
          <Route path="cash-accounts" element={<Navigate to="/dashboard/accounting?tab=vault" replace />} />
          <Route path="customer-wallets" element={<Navigate to="/dashboard/accounting?tab=customers" replace />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerProfilePage />} />
          <Route path="google-reviews" element={<GoogleReviewsPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="kabis" element={<KabisManagementPage />} />
          <Route path="car-issues" element={<CarIssuesPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="mail" element={<MailPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="sourcing" element={<SourcingPage />} />
          <Route path="hr" element={<HrOpeningsPage />} />
          <Route path="hr/interviews" element={<HrInterviewsPage />} />
          <Route path="hr/openings/new" element={<OpeningBuilderPage />} />
          <Route path="hr/openings/:id" element={<HrOpeningPage />} />
          <Route path="hr/openings/:id/edit" element={<OpeningBuilderPage />} />
          <Route path="online-users" element={<OnlineUsersPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="staff-permissions" element={<StaffPermissionsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="reminder-rules" element={<ReminderRulesPage />} />
          <Route path="tasks" element={<TasksPage />} />

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

          {/* ── Media ─────────────────────────────────────── */}
          <Route path="media" element={<MediaLayout />}>
            <Route index element={<Navigate to="ideas" replace />} />
            <Route path="ideas"       element={<MediaIdeasPage />} />
            <Route path="calendar"    element={<MediaCalendarPage />} />
            <Route path="influencers" element={<MediaInfluencersPage />} />
            <Route path="lists"       element={<MediaListsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
};

export default App;
