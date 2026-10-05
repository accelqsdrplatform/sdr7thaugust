import { signOut } from '../lib/auth';

export default function PendingApproval() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '40px 36px', width: 380, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#111', marginBottom: 8 }}>Pending approval</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
          Your account has been created but hasn't been approved by an admin yet. Check back soon, or reach out to your admin to speed things up.
        </div>
        <button
          onClick={() => signOut()}
          style={{ padding: '10px 20px', background: '#f5f5f3', border: '0.5px solid #e8e8e4', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#555', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
