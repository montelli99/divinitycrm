import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

function getToken() {
  return localStorage.getItem('divinity_token');
}

async function apiGet(path) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

const STAGE_LABELS = {
  LEAD_ENTERED: 'Lead Entered',
  CONTACT_MADE: 'Contact Made',
  OFFER_READY: 'Offer Ready',
  OFFER_SENT: 'Offer Sent',
  OFFER_RECEIVED: 'Offer Received',
  GAIN_FEEDBACK: 'Gain Feedback',
  NO_ANSWER: 'No Answer',
  SELLER_DECLINED: 'Seller Declined',
  ACTIVE_NEGOTIATION: 'Active Negotiation',
  TERMS_AGREED: 'Terms Agreed',
  AWAITING_TITLE: 'Awaiting Title',
  CONTRACT_OUT: 'Contract Out',
  UNDER_CONTRACT: 'Under Contract',
  INSPECTION_PERIOD: 'Inspection Period',
  INSPECTION_COMPLETE: 'Inspection Complete',
  APPRAISAL_ORDERED: 'Appraisal Ordered',
  APPRAISAL_DONE: 'Appraisal Done',
  JV_SENT: 'JV Sent',
  JV_SIGNED: 'JV Signed',
  WIRE_SETUP: 'Wire Setup',
  CLOSING_DATE: 'Closing Date',
};

const ALL_STAGES = Object.keys(STAGE_LABELS);

const RECIPIENT_BADGE = {
  agent_or_seller: { label: 'Agent / Seller', color: '#6366f1' },
  seller: { label: 'Seller', color: '#10b981' },
  agent: { label: 'Agent', color: '#f59e0b' },
};

export default function Teleprompter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const leadId = searchParams.get('lead_id');
  const initialStage = searchParams.get('stage');

  const [currentStage, setCurrentStage] = useState(initialStage || (leadId ? null : 'LEAD_ENTERED'));
  const [shortcuts, setShortcuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // expanded shortcut
  const [copied, setCopied] = useState(null);
  const [sentLog, setSentLog] = useState({});

  // Default stage if lead_id present
  useEffect(() => {
    if (leadId && !currentStage) {
      setCurrentStage('LEAD_ENTERED');
    }
  }, [leadId, currentStage]);

  // Load shortcuts for current stage
  useEffect(() => {
    if (!currentStage) return;
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set('stage', currentStage);
    if (leadId) qs.set('lead_id', leadId);
    apiGet(`/teleprompter/shortcuts?${qs.toString()}`)
      .then(d => {
        setShortcuts(d.shortcuts || []);
        setError(null);
      })
      .catch(e => setError('Failed to load shortcuts: ' + e.message))
      .finally(() => setLoading(false));
  }, [currentStage, leadId]);

  // Copy to clipboard
  async function handleCopy(shortcut) {
    const text = shortcut.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(shortcut.key);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      // Fallback: select text in modal
      setSelected(shortcut);
    }
  }

  // Mark as sent
  async function handleMarkSent(shortcut) {
    if (!leadId) {
      alert('Open this teleprompter from a specific lead to mark messages as sent.');
      return;
    }
    try {
      await apiPost('/teleprompter/mark-sent', {
        lead_id: leadId,
        source: shortcut.source,
        key: shortcut.key,
        body: shortcut.body,
        recipient: shortcut.recipient || 'unknown',
        channel: 'sms',
      });
      setSentLog(prev => ({ ...prev, [shortcut.key]: new Date().toLocaleTimeString() }));
    } catch (e) {
      alert('Failed to mark as sent: ' + e.message);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      <style>{`
        .tp-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .tp-stage-select {
          background: #1f2937;
          color: #fff;
          border: 1px solid #374151;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.9rem;
          font-family: inherit;
          min-width: 200px;
        }
        .tp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1rem;
        }
        .tp-card {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.1s;
          display: flex;
          flex-direction: column;
        }
        .tp-card:hover {
          border-color: #fbbf24;
          transform: translateY(-2px);
        }
        .tp-card-name {
          font-weight: 700;
          font-size: 1rem;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .tp-card-desc {
          color: #9ca3af;
          font-size: 0.8rem;
          margin-bottom: 0.75rem;
          line-height: 1.4;
        }
        .tp-card-body {
          color: #d1d5db;
          font-size: 0.85rem;
          line-height: 1.5;
          flex: 1;
          margin-bottom: 0.75rem;
          white-space: pre-wrap;
          max-height: 120px;
          overflow: hidden;
          position: relative;
        }
        .tp-card-body::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 30px;
          background: linear-gradient(transparent, #1f2937);
        }
        .tp-card-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: auto;
        }
        .tp-btn {
          background: #fbbf24;
          color: #000;
          border: none;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85rem;
          font-family: inherit;
          flex: 1;
        }
        .tp-btn:hover { background: #f59e0b; }
        .tp-btn.tp-btn-secondary {
          background: #374151;
          color: #fff;
        }
        .tp-btn.tp-btn-secondary:hover { background: #4b5563; }
        .tp-btn.tp-btn-success {
          background: #10b981;
          color: #000;
        }
        .tp-badge {
          display: inline-block;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tp-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1rem;
        }
        .tp-modal {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }
        .tp-modal h2 {
          margin-bottom: 0.5rem;
          color: #fff;
        }
        .tp-modal-body {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 1rem;
          color: #fff;
          white-space: pre-wrap;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.95rem;
          line-height: 1.5;
          margin: 1rem 0;
          user-select: all;
        }
        .tp-empty {
          text-align: center;
          padding: 3rem;
          color: #9ca3af;
        }
        .tp-error {
          background: #7f1d1d;
          color: #fecaca;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
        }
        .tp-sent-toast {
          position: fixed;
          bottom: 1rem;
          right: 1rem;
          background: #10b981;
          color: #000;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-weight: 600;
          z-index: 200;
          animation: tp-fade 0.2s;
        }
        @keyframes tp-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div className="tp-header">
        <h1 style={{ margin: 0, color: '#fff' }}>🎙️ Teleprompter</h1>
        <select
          className="tp-stage-select"
          value={currentStage || ''}
          onChange={e => setCurrentStage(e.target.value)}
        >
          {ALL_STAGES.map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        {leadId && (
          <button
            onClick={() => navigate(`/leads/${leadId}`)}
            className="tp-btn tp-btn-secondary"
            style={{ flex: 'none' }}
          >
            ← Back to Lead
          </button>
        )}
      </div>

      {error && <div className="tp-error">❌ {error}</div>}

      {loading ? (
        <div className="tp-empty">Loading shortcuts...</div>
      ) : shortcuts.length === 0 ? (
        <div className="tp-empty">
          <p>No shortcuts configured for <strong>{STAGE_LABELS[currentStage]}</strong>.</p>
          {leadId && <p style={{ fontSize: '0.85rem' }}>Try selecting a different stage, or this stage may not have any text shortcuts to send.</p>}
        </div>
      ) : (
        <div className="tp-grid">
          {shortcuts.map(s => {
            const recipientInfo = RECIPIENT_BADGE[s.recipientType] || RECIPIENT_BADGE.seller;
            const isSent = sentLog[s.key];
            return (
              <div key={`${s.source}-${s.key}`} className="tp-card" onClick={() => setSelected(s)}>
                <div className="tp-card-name">
                  {s.name}
                  <span className="tp-badge" style={{ background: recipientInfo.color, color: '#000' }}>
                    {recipientInfo.label}
                  </span>
                  {s.source === 'ghl' && (
                    <span className="tp-badge" style={{ background: '#3b82f6', color: '#fff' }}>
                      Seller Update
                    </span>
                  )}
                </div>
                {s.description && <div className="tp-card-desc">{s.description}</div>}
                <div className="tp-card-body">{s.body}</div>
                <div className="tp-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="tp-btn" onClick={() => handleCopy(s)}>
                    {copied === s.key ? '✓ Copied' : '📋 Copy'}
                  </button>
                  {leadId && (
                    <button className="tp-btn tp-btn-success" onClick={() => handleMarkSent(s)}>
                      {isSent ? `✓ Sent ${isSent}` : '✓ Mark Sent'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="tp-modal-bg" onClick={() => setSelected(null)}>
          <div className="tp-modal" onClick={e => e.stopPropagation()}>
            <h2>{selected.name}</h2>
            {selected.description && <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{selected.description}</p>}
            <div style={{ marginTop: '0.5rem' }}>
              <span className="tp-badge" style={{ background: RECIPIENT_BADGE[selected.recipientType]?.color || '#6b7280', color: '#000' }}>
                {RECIPIENT_BADGE[selected.recipientType]?.label || selected.recipientType}
              </span>
              {selected.recipient && <span style={{ marginLeft: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>To: {selected.recipient}</span>}
            </div>
            <div className="tp-modal-body">{selected.body}</div>
            {selected.unfilled && selected.unfilled.length > 0 && (
              <div style={{ background: '#7f1d1d', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#fecaca' }}>⚠ Unfilled placeholders:</strong>
                <div style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {selected.unfilled.join(', ')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="tp-btn" onClick={() => handleCopy(selected)}>
                {copied === selected.key ? '✓ Copied!' : '📋 Copy to Clipboard'}
              </button>
              {leadId && (
                <button className="tp-btn tp-btn-success" onClick={() => handleMarkSent(selected)}>
                  ✓ Mark as Sent
                </button>
              )}
              <button className="tp-btn tp-btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {copied && (
        <div className="tp-sent-toast">
          📋 Copied {copied} to clipboard
        </div>
      )}
    </div>
  );
}
