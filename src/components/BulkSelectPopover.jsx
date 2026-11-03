import { useState } from 'react';

// Bulk count picker: "Select number of people" (with an optional per-company
// cap), "Select this page", or "Select all N". This component is
// presentation-only — it collects the rep's choice and hands it to onApply;
// the host page is responsible for resolving the actual ids (it knows how to
// query/filter its own data) and applying the result to its selection state.
//
// choice shapes passed to onApply:
//   { mode: 'count', count: number, maxPerCompany: number|null }
//   { mode: 'page' }
//   { mode: 'all' }
export default function BulkSelectPopover({ pageCount, totalCount, allowCount = true, onApply, onCancel }) {
  const [mode, setMode] = useState(allowCount ? 'count' : (pageCount != null ? 'page' : 'all'));
  const [count, setCount] = useState(Math.min(25, totalCount || 25) || 1);
  const [capOn, setCapOn] = useState(false);
  const [cap, setCap] = useState(1);

  function apply() {
    if (mode === 'count') {
      onApply({ mode: 'count', count: Math.max(1, count || 1), maxPerCompany: capOn ? Math.max(1, cap || 1) : null });
    } else if (mode === 'page') {
      onApply({ mode: 'page' });
    } else {
      onApply({ mode: 'all' });
    }
  }

  const radioRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', cursor: 'pointer' };
  const stepper = { width: 64, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #d1d5db', background: '#f9fafb', color: '#111', fontSize: 13, outline: 'none' };
  const label = { fontSize: 13, flex: 1, color: '#374151', fontWeight: 500 };
  const count_ = { fontSize: 12, color: '#9ca3af', flexShrink: 0, fontWeight: 600 };

  return (
    <div onClick={e => e.stopPropagation()}
      style={{ width: 280, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: '14px 16px', boxShadow: '0 8px 28px rgba(0,0,0,0.12)', color: '#111' }}>
      {allowCount && (
        <>
          <label style={radioRow}>
            <input type="radio" checked={mode === 'count'} onChange={() => setMode('count')}
              style={{ accentColor: '#2563eb', width: 15, height: 15, cursor: 'pointer' }} />
            <span style={label}>Select number of people</span>
          </label>
          {mode === 'count' && (
            <div style={{ paddingLeft: 25, marginBottom: 4 }}>
              <input type="number" min="1" max={totalCount || undefined} value={count}
                onChange={e => setCount(Number(e.target.value))} style={stepper} />
            </div>
          )}
          <label style={{ ...radioRow, paddingLeft: 25 }}>
            <input type="checkbox" checked={capOn} onChange={e => setCapOn(e.target.checked)}
              style={{ accentColor: '#2563eb', width: 15, height: 15, cursor: 'pointer' }} />
            <span style={label}>Max people per company</span>
            {capOn && <input type="number" min="1" value={cap}
              onChange={e => setCap(Number(e.target.value))} style={{ ...stepper, width: 52 }} />}
          </label>
          <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />
        </>
      )}
      {pageCount != null && (
        <label style={radioRow}>
          <input type="radio" checked={mode === 'page'} onChange={() => setMode('page')}
            style={{ accentColor: '#2563eb', width: 15, height: 15, cursor: 'pointer' }} />
          <span style={label}>Select this page</span>
          <span style={count_}>{pageCount}</span>
        </label>
      )}
      <label style={radioRow}>
        <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')}
          style={{ accentColor: '#2563eb', width: 15, height: 15, cursor: 'pointer' }} />
        <span style={label}>Select all</span>
        <span style={count_}>{totalCount}</span>
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel}
          style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #d1d5db', background: '#fff',
            color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={apply}
          style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#2563eb',
            color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 1px 4px rgba(37,99,235,0.3)' }}>
          Apply
        </button>
      </div>
    </div>
  );
}
