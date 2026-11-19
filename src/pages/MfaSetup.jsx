import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../lib/auth';

// Mandatory first-time MFA enrollment. Every user must set up an
// authenticator app (TOTP) before they can reach the rest of the platform
// — see ProtectedRoute in App.jsx. Uses Supabase Auth's built-in MFA API
// directly (no custom backend needed): enroll() issues a QR code + secret,
// then challenge()/verify() confirms the user actually has it working
// before we consider them enrolled.
export default function MfaSetup() {
  const navigate = useNavigate();
  const { mfaEnrolled, mfaVerified, refreshAal } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [qrSvg, setQrSvg] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  // True when Supabase refuses to enroll a new factor because this account
  // already has a verified one on file and isn't currently AAL2 — i.e. the
  // person lost access to their existing authenticator. Supabase requires
  // you to already be MFA-verified to add another factor, by design, so the
  // only way out is an admin clearing the stuck factor (Team Members ->
  // Reset MFA), not anything this page can self-serve.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (mfaEnrolled && mfaVerified) { navigate('/', { replace: true }); return; }
    enroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enroll() {
    setLoading(true);
    setError('');
    setBlocked(false);
    try {
      // Clean up any half-finished enrollment from a previous attempt (e.g.
      // they refreshed the page before entering a code) so we don't pile up
      // unverified factors against Supabase's 10-factor cap.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.totp || []).filter(f => f.status !== 'verified');
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'totp-' + Date.now(),
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err) {
      const msg = err?.message || '';
      if (/aal2/i.test(msg) || err?.code === 'insufficient_aal') {
        setBlocked(true);
      } else {
        setError(msg || 'Could not start MFA enrollment.');
      }
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
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '40px 36px', width: 420, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {blocked ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6 }}>Can't set up a new authenticator</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.6 }}>
              This account already has a verified authenticator, but your current session can't confirm it
              (usually because you lost access to the device it's on). For security, Supabase requires
              proving the existing authenticator before a new one can be added — so this page can't fix it
              on its own.
            </div>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#9a3412', marginBottom: 20, lineHeight: 1.6 }}>
              Ask an Admin to reset your two-factor authentication from <strong>Team Members → Reset MFA</strong>.
              Once they do, reload this page to set up a new authenticator.
            </div>
            <button onClick={enroll}
              style={{ width: '100%', padding: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
              I've been reset — try again
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6 }}>Set up two-factor authentication</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
              Required for every ACCELQ Outreach account. Scan this QR code with an authenticator app
              (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows you.
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
            ) : (
              <>
                {qrSvg && (
                  <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 14 }}>
                    <img src={qrSvg} alt="Scan this QR code with your authenticator app" style={{ width: 200, height: 200 }} />
                  </div>
                )}
                {secret && (
                  <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginBottom: 20, wordBreak: 'break-all' }}>
                    Can't scan it? Enter this key manually: <strong style={{ color: '#444' }}>{secret}</strong>
                  </div>
                )}

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
                    {verifying ? 'Verifying…' : 'Verify and continue'}
                  </button>
                </form>
              </>
            )}
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#aaa' }}>
          Wrong account? <a href="#" onClick={e => { e.preventDefault(); signOut().then(() => navigate('/login', { replace: true })); }} style={{ color: '#2563eb', textDecoration: 'none' }}>Sign out</a>
        </div>
      </div>
    </div>
  );
}
