import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { signOut } from '../../lib/auth';

// Nav sets re-keyed onto the current org_hierarchy roles (owner/sub-admin/admin).
// A sub-admin's set depends on their computed tier: 'team' (manages other
// sub-admins, like the old "manager") vs 'direct' (manages owners directly,
// like the old "poc"). Routes here must match the actual paths registered in
// App.jsx — there is no /discover or /hqs route (that's /prospect-discovery,
// and HQ Management was removed from the platform entirely).
const navByRole = {
  owner: [
    { to: '/', icon: '⊞', label: 'Dashboard', end: true },
    { to: '/prospect-discovery', icon: '🔍', label: 'Account Discovery' },
    { to: '/contacts', icon: '👥', label: 'My contacts' },
    { to: '/accounts', icon: '🏢', label: 'Accounts' },
    { to: '/followups', icon: '🕐', label: 'Follow-ups' },
    { to: '/responses', icon: '💬', label: 'Responses' },
    { to: '/lists', icon: '📋', label: 'Lists' },
    { to: '/apollo-import', icon: '🚀', label: 'Apollo Import' },
    { to: '/sequences', icon: '🔁', label: 'Sequences' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ],
  'sub-admin-direct': [
    { to: '/', icon: '⊞', label: 'Dashboard', end: true },
    { to: '/prospect-discovery', icon: '🔍', label: 'Account Discovery' },
    { to: '/teams', icon: '👥', label: 'My team' },
    { to: '/users', icon: '🧑‍💼', label: 'Team Members' },
    { to: '/contacts', icon: '📋', label: 'Contacts' },
    { to: '/accounts', icon: '🏢', label: 'Accounts' },
    { to: '/followups', icon: '🕐', label: 'Follow-ups' },
    { to: '/responses', icon: '💬', label: 'Responses' },
    { to: '/lists', icon: '📋', label: 'Lists' },
    { to: '/apollo-import', icon: '🚀', label: 'Apollo Import' },
    { to: '/activity', icon: '📡', label: 'Activity feed' },
    { to: '/reports', icon: '📈', label: 'Reports' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ],
  'sub-admin-team': [
    { to: '/', icon: '⊞', label: 'Dashboard', end: true },
    { to: '/prospect-discovery', icon: '🔍', label: 'Account Discovery' },
    { to: '/contacts', icon: '👥', label: 'My Contacts' },
    { to: '/accounts', icon: '🏢', label: 'Accounts' },
    { to: '/apollo-import', icon: '🚀', label: 'Apollo Import' },
    { to: '/followups', icon: '🕐', label: 'Follow-ups' },
    { to: '/users', icon: '🧑‍💼', label: 'Team Members' },
    { to: '/analytics', icon: '📈', label: 'Analytics' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ],
  admin: [
    { to: '/', icon: '⊞', label: 'Dashboard', end: true },
    { to: '/prospect-discovery', icon: '🔍', label: 'Account Discovery' },
    { to: '/contacts', icon: '👥', label: 'My Contacts' },
    { to: '/accounts', icon: '🏢', label: 'Accounts' },
    { to: '/apollo-import', icon: '🚀', label: 'Apollo Import' },
    { to: '/followups', icon: '🕐', label: 'Follow-ups' },
    { to: '/users', icon: '🧑‍💼', label: 'Team Members' },
    { to: '/reports', icon: '📄', label: 'Reports' },
    { to: '/analytics', icon: '📈', label: 'Analytics' },
    { to: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
    { to: '/settings', icon: '⚙️', label: 'Settings' },
  ],
};

const roleMeta = {
  owner:      { color: '#059669', label: 'Owner' },
  'sub-admin':{ color: '#d97706', label: 'Sub-admin' },
  admin:      { color: '#7c3aed', label: 'Admin' },
};

function navKeyFor(profile) {
  const role = profile?.role || 'owner';
  if (role === 'sub-admin') {
    return profile?.subAdminTier === 'team' ? 'sub-admin-team' : 'sub-admin-direct';
  }
  if (role === 'admin') return 'admin';
  return 'owner';
}

export default function Sidebar() {
  const { profile, user } = useAuth();
  const displayName = profile?.full_name || user?.email?.split('@')[0] || '—';
  const role = profile?.role || 'owner';
  const nav = navByRole[navKeyFor(profile)] || navByRole.owner;
  const meta = roleMeta[role] || roleMeta.owner;

  const linkStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    borderRadius: 8, textDecoration: 'none', fontSize: 13,
    color: isActive ? '#111' : '#555',
    background: isActive ? '#f0f0ee' : 'transparent',
    fontWeight: isActive ? 500 : 400,
    transition: 'background 0.1s',
  });

  return (
    <div style={{ width: 200, background: '#fafaf8', borderRight: '0.5px solid #e8e8e4', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '0.5px solid #e8e8e4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, background: '#e8f0fe', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', lineHeight: 1.2 }}>ACCELQ</div>
            <div style={{ fontSize: 10, color: '#999' }}>Outreach Platform</div>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #e8e8e4' }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Signed in as</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{displayName}</div>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: meta.color + '20', color: meta.color }}>
          {meta.label}
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: '#bbb', padding: '6px 8px 4px', letterSpacing: '0.5px' }}>MENU</div>
        {nav.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => linkStyle(isActive)}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '12px 8px', borderTop: '0.5px solid #e8e8e4' }}>
        <button
          onClick={signOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer' }}
        >
          <span>↩</span> Sign out
        </button>
      </div>
    </div>
  );
}
