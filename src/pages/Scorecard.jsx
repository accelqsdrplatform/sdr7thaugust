import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = { owner: 'Owner', 'sub-admin': 'Sub-admin', admin: 'Admin' };
const DAY_OPTIONS = [7, 14, 30, 90];

async function callFn(body) {
  const { data, error } = await supabase.functions.invoke('owner-scorecard', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function Card({ title, subtitle, children, style }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '18px 20px', ...style }}>
      {title && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 12.5, color: '#aaa', fontStyle: 'italic', padding: '8px 0' }}>{children}</div>;
}

function Delta({ current, previous }) {
  if (!previous) {
    return current > 0
      ? <span style={{ color: '#059669', fontSize: 11.5, fontWeight: 600 }}>new</span>
      : null;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span style={{ color: '#999', fontSize: 11.5 }}>flat</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? '#059669' : '#dc2626', fontSize: 11.5, fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{value}</div>
        {delta}
      </div>
    </div>
  );
}

function FunnelBar({ stages, reached, orgMedian }) {
  const max = reached[0] || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stages.map((stage, i) => {
        const count = reached[i];
        const pct = Math.round((count / max) * 100);
        const conv = i > 0 ? Math.round((reached[i] / (reached[i - 1] || 1)) * 1000) / 10 : null;
        const orgConv = i > 0 ? orgMedian[i - 1] : null;
        return (
          <div key={stage}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: '#555', fontWeight: 500 }}>{stage}</span>
              <span style={{ color: '#111', fontWeight: 600 }}>
                {count}
                {conv !== null && (
                  <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>
                    {conv}% conv{orgConv !== null ? ` · org median ${orgConv}%` : ''}
                    {orgConv !== null && (
                      <span style={{ color: conv >= orgConv ? '#059669' : '#dc2626', fontWeight: 600, marginLeft: 4 }}>
                        {conv >= orgConv ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </div>
            <div style={{ height: 8, background: '#f0f0ed', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#2563eb', borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Scorecard() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { profile, viewingAs } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);
  const [customRange, setCustomRange] = useState(null); // { from, to } | null -- takes priority over `days` when set
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const viewAsParam = viewingAs?.id ? { view_as: viewingAs.id } : {};

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const rangeParams = customRange ? { from: customRange.from, to: customRange.to } : { days };
    callFn({ target_id: userId, ...rangeParams, ...viewAsParam })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [userId, days, customRange, viewingAs?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontSize: 14 }}>Loading scorecard…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 12 }}>{error}</div>
        <button onClick={() => navigate(-1)} style={{ padding: '7px 16px', background: '#f5f5f3', border: '0.5px solid #e8e8e4', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Go back</button>
      </div>
    );
  }
  if (!data) return null;

  const { target, at_a_glance, funnel, quality, messaging, inventory, roster } = data;
  const hasBook = inventory.total_contacts > 0;
  const hasMessaging = messaging && messaging.length > 0;
  // Best-performing combo worth calling out: needs a couple of sends to mean
  // anything (same threshold the backend uses to even include a combo), and
  // "best" means beating the org average for that exact combo, not just a
  // high raw rate off a tiny sample.
  const bestCombo = hasMessaging
    ? messaging
        .filter(m => m.my_total >= 2 && m.org_reply_rate !== null && m.my_reply_rate > m.org_reply_rate)
        .sort((a, b) => (b.my_reply_rate - b.org_reply_rate) - (a.my_reply_rate - a.org_reply_rate))[0]
    : null;
  const hasRoster = roster && roster.length > 0;
  const hasResponseData = quality.replied > 0 || quality.bounced > 0;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 980 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)}
            style={{ width: 32, height: 32, borderRadius: 8, border: '0.5px solid #e8e8e4', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#555' }}>
            ←
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>{target.full_name || 'Scorecard'}</h1>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: '#f5f5f3', color: '#555' }}>
                {ROLE_LABELS[target.role] || target.role}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>
              {target.region ? `${target.region} · ` : ''}
              {target.reports_to_name ? `Reports to ${target.reports_to_name}` : 'No manager set'}
              {target.created_at ? ` · Joined ${new Date(target.created_at).toLocaleDateString()}` : ''}
              {target.role !== 'owner' ? ` · ${target.owner_ids_included} owner${target.owner_ids_included === 1 ? '' : 's'} rolled up` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f5f5f3', borderRadius: 8, padding: 3 }}>
          {DAY_OPTIONS.map(d => (
            <button key={d} onClick={() => { setCustomRange(null); setShowCustomPicker(false); setDays(d); }}
              style={{ padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: !customRange && days === d ? '#fff' : 'transparent', color: !customRange && days === d ? '#111' : '#888',
                boxShadow: !customRange && days === d ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              {d}d
            </button>
          ))}
          <button onClick={() => setShowCustomPicker(s => !s)}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: customRange ? '#fff' : 'transparent', color: customRange ? '#111' : '#888',
              boxShadow: customRange ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
            Custom
          </button>
        </div>
      </div>

      {showCustomPicker && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Custom range:</span>
          <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #e8e8e4' }} />
          <span style={{ fontSize: 12, color: '#888' }}>to</span>
          <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid #e8e8e4' }} />
          <button onClick={() => { if (customFrom && customTo) { setCustomRange({ from: customFrom, to: customTo }); setShowCustomPicker(false); } }}
            disabled={!customFrom || !customTo}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
              cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
              background: customFrom && customTo ? '#2563eb' : '#e5e7eb', color: customFrom && customTo ? '#fff' : '#9ca3af' }}>
            Apply
          </button>
          {customRange && (
            <button onClick={() => { setCustomRange(null); setShowCustomPicker(false); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '0.5px solid #e8e8e4', fontSize: 12, background: '#fff', color: '#888', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* At a glance */}
      <Card title="At a glance" subtitle={customRange ? (customRange.from + ' to ' + customRange.to + ', vs. an equal-length period before it') : ('Last ' + days + ' days vs. the ' + days + ' days before that')} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <Stat label="Activity logged" value={at_a_glance.activity_count_current}
            delta={<Delta current={at_a_glance.activity_count_current} previous={at_a_glance.activity_count_previous} />} />
          <Stat label="Days active" value={`${at_a_glance.days_active_current_period}/${days}`} />
          <Stat label="Replies received" value={at_a_glance.replies.current}
            delta={<Delta current={at_a_glance.replies.current} previous={at_a_glance.replies.previous} />} />
          <Stat label="Demo Scheduled (all-time)" value={at_a_glance.prospects_all_time} />
          <Stat label="Won (all-time)" value={at_a_glance.won_all_time} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Last activity</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: at_a_glance.last_activity_at ? '#111' : '#aaa' }}>
              {at_a_glance.last_activity_at ? new Date(at_a_glance.last_activity_at).toLocaleString() : 'No activity yet'}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Funnel */}
        <Card title="Pipeline funnel" subtitle="Current book, vs. org median conversion at each step">
          {hasBook ? (
            <FunnelBar stages={funnel.stages} reached={funnel.reached} orgMedian={funnel.org_median_conversion} />
          ) : <Empty>No contacts in this book yet.</Empty>}
          {Object.keys(funnel.exits).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #f0f0ed', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Object.entries(funnel.exits).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12, color: '#888' }}>
                  <span style={{ fontWeight: 600, color: '#555' }}>{v}</span> {k}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quality */}
        <Card title="Response quality" subtitle="Across the whole book, all-time">
          {hasResponseData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555' }}>Reply rate</span>
                <span style={{ fontWeight: 700, color: '#111' }}>{quality.reply_rate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555' }}>Prospect rate (Demo Scheduled)</span>
                <span style={{ fontWeight: 700, color: '#111' }}>{quality.prospect_rate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555' }}>Bounce rate</span>
                <span style={{ fontWeight: 700, color: quality.bounce_rate > 10 ? '#dc2626' : '#111' }}>{quality.bounce_rate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555' }}>Emails sent</span>
                <span style={{ fontWeight: 700, color: '#111' }}>{quality.emails_sent}</span>
              </div>
            </div>
          ) : (
            <Empty>No reply or bounce data recorded yet — this fills in once response_state / response_type get populated.</Empty>
          )}
        </Card>
      </div>

      {/* Messaging effectiveness */}
      <Card title="Messaging effectiveness" subtitle="Reply rate by persona × pitch, vs. org average for the same combo" style={{ marginBottom: 16 }}>
        {bestCombo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14, background: '#ecfdf5', border: '0.5px solid #a7f3d0', borderRadius: 8 }}>
            <span style={{ fontSize: 18 }}>⭐</span>
            <div style={{ fontSize: 12.5, color: '#065f46' }}>
              Your best combo is <strong>{bestCombo.persona} × {bestCombo.pitch_type}</strong> at <strong>{bestCombo.my_reply_rate}%</strong> reply rate (org average for this combo: {bestCombo.org_reply_rate}%). Worth leaning into when picking which contacts to prioritize.
            </div>
          </div>
        )}
        {hasMessaging ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#999', fontSize: 11 }}>
                <th style={{ paddingBottom: 8, fontWeight: 500 }}>Persona</th>
                <th style={{ paddingBottom: 8, fontWeight: 500 }}>Pitch</th>
                <th style={{ paddingBottom: 8, fontWeight: 500, textAlign: 'right' }}>Sent</th>
                <th style={{ paddingBottom: 8, fontWeight: 500, textAlign: 'right' }}>Reply rate</th>
                <th style={{ paddingBottom: 8, fontWeight: 500, textAlign: 'right' }}>Org avg</th>
              </tr>
            </thead>
            <tbody>
              {messaging.map((m, i) => (
                <tr key={i} style={{ borderTop: '0.5px solid #f0f0ed' }}>
                  <td style={{ padding: '8px 0', color: '#333' }}>{m.persona}</td>
                  <td style={{ padding: '8px 0', color: '#333' }}>{m.pitch_type}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#888' }}>{m.my_total}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600,
                    color: m.org_reply_rate !== null && m.my_reply_rate >= m.org_reply_rate ? '#059669' : m.org_reply_rate !== null ? '#dc2626' : '#111' }}>
                    {m.my_reply_rate}%
                  </td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#999' }}>{m.org_reply_rate !== null ? `${m.org_reply_rate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Not enough persona/pitch data yet to compare messaging effectiveness — needs at least 2 contacts per combination.</Empty>
        )}
      </Card>

      {/* Book inventory */}
      <Card title="Book inventory" subtitle={`${inventory.total_accounts} accounts · ${inventory.total_contacts} contacts`} style={{ marginBottom: 16 }}>
        {hasBook ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#888', marginBottom: 8 }}>Contacts by stage</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(inventory.stage_counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#555' }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#111' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#888', marginBottom: 8 }}>Accounts by furthest stage reached</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(inventory.accounts_by_stage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#555' }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#111' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <Empty>No accounts or contacts assigned yet.</Empty>}
        {Object.keys(inventory.industry_counts).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #f0f0ed' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#888', marginBottom: 8 }}>Accounts by industry</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(inventory.industry_counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <span key={k} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#f5f5f3', color: '#555' }}>
                  {k} <strong style={{ color: '#111' }}>{v}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Team roster (sub-admins only) */}
      {target.role !== 'owner' && (
        <Card title="Team roster" subtitle="Direct reports, ranked by reply rate">
          {hasRoster ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {roster.map(r => (
                <div key={r.id}
                  onClick={() => navigate(`/scorecard/${r.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9f9f7'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{r.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{ROLE_LABELS[r.role] || r.role} · {r.active_contacts} active contacts</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{r.reply_rate}%</div>
                </div>
              ))}
            </div>
          ) : <Empty>No direct reports found.</Empty>}
        </Card>
      )}
    </div>
  );
}
