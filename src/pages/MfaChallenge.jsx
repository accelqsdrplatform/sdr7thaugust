import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../lib/auth';

// Shown when a user already has a verified TOTP factor but this particular
// session hasn't passed the challenge yet (e.g. a fresh login). Required
// before ProtectedRoute in App.jsx will let them into the app shell.
export default function MfaChallenge() {
  const navigate = useNavigate();
  const { mfaVerified, refreshAal } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (mfaVerified) { navigate('/', { replace: true }); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = (data?.totp || []).find(f => f.status === 'verified');
      if (!verified) { navigate('/mfa-setup', { replace: true }); return; }
      setFactorId(verified.id);
    } catch (err) {
      setError(err.message || 'Could not load your authenticator.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!factorId || code.trim().length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;

      // verify() just elevated this session to AAL2, but the local Supabase
      // client can take a moment to finish propagating that before
      // getAuthenticatorAssuranceLevel() reflects it. Poll briefly instead
      // of navigating on stale state, which would just bounce back to this
      // same screen via ProtectedRoute with no visible explanation.
      let confirmed = false;
      for (let i = 0; i < 10; i++) {
        const result = await refreshAal();
        if (result && result.currentLevel === result.nextLevel) { confirmed = true; break; }
        await new Promise(r => setTimeout(r, 300));
      }
      if (!confirmed) {
        setError('Code accepted, but your session is taking a moment to update. Please wait a few seconds and reload the page.');
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid code. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '40px 36px', width: 380, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6 }}>Verify it's you</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
          Enter the 6-digit code from your authenticator app to continue.
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
        ) : (
          <form onSubmit={handleVerify}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#444', display: 'block', marginBottom: 5 }}>6-digit code</label>
              <input
                type="text" inputMode="numeric" value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" autoFocus required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 18, letterSpacing: 4, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit" disabled={verifying || code.length !== 6}
              style={{ width: '100%', padding: '11px', background: (verifying || code.length !== 6) ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: (verifying || code.length !== 6) ? 'not-allowed' : 'pointer' }}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#aaa' }}>
          Not you, or lost your device? <a href="#" onClick={e => { e.preventDefault(); signOut().then(() => navigate('/login', { replace: true })); }} style={{ color: '#2563eb', textDecoration: 'none' }}>Sign out</a>
        </div>
      </div>
    </div>
  );
}
