import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';

// Lazy-load every page — only downloaded when first visited
const Login        = lazy(() => import('./pages/Login'));
const Signup        = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword  = lazy(() => import('./pages/ResetPassword'));
const PendingApproval = lazy(() => import('./pages/PendingApproval'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Contacts     = lazy(() => import('./pages/Contacts'));
const FollowUps    = lazy(() => import('./pages/FollowUps'));
const Activity     = lazy(() => import('./pages/Activity'));
const Teams        = lazy(() => import('./pages/Teams'));
const Analytics    = lazy(() => import('./pages/Analytics'));
const Leaderboard  = lazy(() => import('./pages/Leaderboard'));
const Settings     = lazy(() => import('./pages/Settings'));
const UsersAdmin   = lazy(() => import('./pages/UsersAdmin'));
const Sequences    = lazy(() => import('./pages/Sequences'));
const Reports      = lazy(() => import('./pages/Reports'));
const ContactDetail= lazy(() => import('./pages/ContactDetail'));
const Accounts     = lazy(() => import('./pages/Accounts'));
const AccountDetail= lazy(() => import('./pages/AccountDetail'));
const Lists        = lazy(() => import('./pages/Lists'));
const Responses    = lazy(() => import('./pages/Responses'));
const ProspectDiscovery = lazy(() => import('./pages/ProspectDiscovery'));
const Scorecard     = lazy(() => import('./pages/Scorecard'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#aaa', fontSize: 14 }}>
    Loading…
  </div>
);

function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', fontSize: 14 }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // A signed-up-but-not-yet-approved user has an org_hierarchy row with
  // approved: false — block them from the app until an admin approves.
  if (profile && profile.approved === false) return <Navigate to="/pending-approval" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="contacts/:id" element={<ContactDetail />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="accounts/:id" element={<AccountDetail />} />
              <Route path="followups" element={<FollowUps />} />
              <Route path="activity" element={<Activity />} />
              <Route path="teams" element={<Teams />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<UsersAdmin />} />
              <Route path="sequences" element={<Sequences />} />
              <Route path="reports" element={<Reports />} />
              <Route path="lists" element={<Lists />} />
              <Route path="responses" element={<Responses />} />
              <Route path="prospect-discovery" element={<ProspectDiscovery />} />
              <Route path="scorecard/:userId" element={<Scorecard />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
