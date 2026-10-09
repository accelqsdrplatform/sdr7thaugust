import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };
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
    <div style={{ width: collapsed ? 64 : 200, transition: 'width 0.15s', background: '#fafaf8', borderRight: '0.5px solid #e8e8e4', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '0.5px solid #e8e8e4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, background: '#e8f0fe', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', lineHeight: 1.2, whiteSpace: 'nowrap' }}>ACCELQ</div>
                <div style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}>Outreach Platform</div>
              </div>
            )}
          </div>
          <button onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar (pinned open)' : 'Collapse sidebar'}
            style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid #e0e0e0', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            {collapsed ? '»' : '«'}
          </button>
        </div>
      </div>

      {/* Role badge */}
      {collapsed ? (
        <div style={{ padding: '10px 0', borderBottom: '0.5px solid #e8e8e4', display: 'flex', justifyContent: 'center' }} title={displayName + ' — ' + meta.label}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: meta.color + '20', color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      ) : (
        <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #e8e8e4' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Signed in as</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{displayName}</div>
          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: meta.color + '20', color: meta.color }}>
            {meta.label}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {!collapsed && <div style={{ fontSize: 10, color: '#bbb', padding: '6px 8px 4px', letterSpacing: '0.5px' }}>MENU</div>}
        {nav.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined}
            style={({ isActive }) => ({ ...linkStyle(isActive), justifyContent: collapsed ? 'center' : 'flex-start' })}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '12px 8px', borderTop: '0.5px solid #e8e8e4' }}>
        <button
          onClick={signOut} title={collapsed ? 'Sign out' : undefined}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer' }}
        >
          <span>↩</span> {!collapsed && 'Sign out'}
        </button>
      </div>
    </div>
  );
}
