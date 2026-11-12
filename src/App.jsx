import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, Component } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import { Toaster } from 'sonner';

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
const Templates    = lazy(() => import('./pages/Templates'));
const Reports      = lazy(() => import('./pages/Reports'));
const ContactDetail= lazy(() => import('./pages/ContactDetail'));
const Accounts     = lazy(() => import('./pages/Accounts'));
const AccountDetail= lazy(() => import('./pages/AccountDetail'));
const Lists        = lazy(() => import('./pages/Lists'));
const ApolloImport  = lazy(() => import('./pages/ApolloImport'));
const Responses    = lazy(() => import('./pages/Responses'));
const ProspectDiscovery = lazy(() => import('./pages/ProspectDiscovery'));
const Scorecard     = lazy(() => import('./pages/Scorecard'));
const ScorecardPicker = lazy(() => import('./pages/ScorecardPicker'));
const Mailboxes     = lazy(() => import('./pages/Mailboxes'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#aaa', fontSize: 14 }}>
    Loading…
  </div>
);

// Belt-and-braces alongside the vite:preloadError handler in main.jsx --
// catches any error thrown while rendering a lazy-loaded page (not just a
// failed chunk fetch) so navigation never goes silently blank. Offers a
// manual reload rather than looping, since this also catches real render
// errors that a reload wouldn't fix.
class RouteErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error('Route render error:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#888', fontSize: 14, gap: 12 }}>
          <div>Something went wrong loading this page.</div>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <>
      <Toaster richColors position="top-right" />
      <AuthProvider>
      <BrowserRouter>
        <RouteErrorBoundary>
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
              <Route path="templates" element={<Templates />} />
              <Route path="reports" element={<Reports />} />
              <Route path="lists" element={<Lists />} />
              <Route path="apollo-import" element={<ApolloImport />} />
              <Route path="responses" element={<Responses />} />
              <Route path="prospect-discovery" element={<ProspectDiscovery />} />
              <Route path="scorecard" element={<ScorecardPicker />} />
              <Route path="scorecard/:userId" element={<Scorecard />} />
              <Route path="mailboxes" element={<Mailboxes />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </RouteErrorBoundary>
      </BrowserRouter>
      </AuthProvider>
    </>
  );
}
