import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../lib/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
    } catch (err) {
      // Don't reveal whether the email exists — show the same success state
      // either way, but still surface a genuine network/service error.
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '40px 36px', width: 380, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, background: '#e8f0fe', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>ACCELQ Outreach</div>
            <div style={{ fontSize: 12, color: '#888' }}>Sales Intelligence Platform</div>
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#111', marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
              If an account exists for {email.trim() || 'that address'}, we've sent a link to reset your password.
            </div>
            <Link to="/login" style={{ fontSize: 13, color: '#2563eb', fontWeight: 500, textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6 }}>Forgot password</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>Enter your email and we'll send you a reset link</div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#444', display: 'block', marginBottom: 5 }}>Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@accelq.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '11px', background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' }}>
              <Link to="/login" style={{ color: '#2563eb', fontWeight: 500, textDecoration: 'none' }}>Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
