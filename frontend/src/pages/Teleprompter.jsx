import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ScriptPromptModal from '../components/ScriptPromptModal';
import { api } from '../lib/api';
import { BUCKET_LABELS, NEXT_STAGE, OWNERS, STAGE_LABELS } from '../lib/pipeline-stages';

const STAGE_ORDER = Object.keys(STAGE_LABELS);

function resolveLeadId(routeLeadId, searchLeadId) {
  return routeLeadId || searchLeadId || '';
}

function formatOwner(stage) {
  const owner = Object.values(OWNERS).find((entry) => entry.stages.includes(stage));
  return owner?.name || 'Unknown';
}

function buildStageDescription(stage) {
  const label = STAGE_LABELS[stage] || stage || 'Unknown stage';
  const short = label.includes('. ') ? label.slice(label.indexOf('. ') + 2) : label;
  return short;
}

export default function Teleprompter() {
  const { leadId: routeLeadId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryLeadId = searchParams.get('lead_id');
  const queryStage = searchParams.get('stage');
  const leadId = resolveLeadId(routeLeadId, queryLeadId);

  const [lead, setLead] = useState(null);
  const [currentStage, setCurrentStage] = useState(queryStage || '');
  const [stagePrompt, setStagePrompt] = useState(null);
  const [loadingLead, setLoadingLead] = useState(Boolean(leadId));
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [promptError, setPromptError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadLead() {
      if (!leadId) {
        setLead(null);
        setLoadingLead(false);
        return;
      }

      setLoadingLead(true);
      setLeadError('');
      try {
        const result = await api.getLead(leadId);
        if (!active) return;
        setLead(result.lead || null);
        if (!queryStage && result.lead?.stage) {
          setCurrentStage(result.lead.stage);
        const next = new URLSearchParams();
        next.set('stage', result.lead.stage);
        if (!routeLeadId) {
          next.set('lead_id', leadId);
        }
        setSearchParams(next, { replace: true });
        }
      } catch (err) {
        if (!active) return;
        setLead(null);
        setLeadError(err.message || 'Failed to load lead');
      } finally {
        if (active) setLoadingLead(false);
      }
    }

    loadLead();
    return () => {
      active = false;
    };
  }, [leadId, queryStage, routeLeadId, setSearchParams]);

  useEffect(() => {
    let active = true;

    async function loadPrompt() {
      if (!leadId || !currentStage) {
        setStagePrompt(null);
        setPromptError('');
        setLoadingPrompt(false);
        return;
      }

      setLoadingPrompt(true);
      setPromptError('');
      try {
        const result = await api.getStagePrompt(leadId, currentStage);
        if (!active) return;
        setStagePrompt(result);
      } catch (err) {
        if (!active) return;
        setStagePrompt(null);
        setPromptError(err.message || 'Failed to load stage prompt');
      } finally {
        if (active) setLoadingPrompt(false);
      }
    }

    loadPrompt();
    return () => {
      active = false;
    };
  }, [leadId, currentStage]);

  const ownerName = useMemo(() => formatOwner(currentStage || lead?.stage), [currentStage, lead?.stage]);
  const stageLabel = useMemo(() => STAGE_LABELS[currentStage] || 'Select a stage', [currentStage]);
  const stageShortLabel = useMemo(() => buildStageDescription(currentStage), [currentStage]);
  const nextStage = useMemo(() => NEXT_STAGE[currentStage] || null, [currentStage]);
  const nextStageLabel = useMemo(() => (nextStage ? STAGE_LABELS[nextStage] || nextStage : null), [nextStage]);
  const bucketLabel = useMemo(() => {
    const bucket = lead?.stage ? BUCKET_LABELS[lead.stage] : null;
    return bucket || null;
  }, [lead?.stage]);

  async function handleMarkSent(payload) {
    if (!lead?.id) {
      return;
    }

    const key = payload?.key || payload?.templateName || payload;
    const body = payload?.filled || payload?.body || payload?.filledMessage || payload?.filledScript || '';
    const recipient = payload?.recipient || payload?.recipientName || payload?.to || 'unknown';

    await api.markTeleprompterSent({
      lead_id: lead.id,
      source: payload?.source || 'crm',
      key,
      body,
      recipient,
      channel: 'sms',
    });
  }

  function handleStageChange(nextStageValue) {
    setCurrentStage(nextStageValue);
    const next = new URLSearchParams();
    if (!routeLeadId && leadId) {
      next.set('lead_id', leadId);
    }
    next.set('stage', nextStageValue);
    setSearchParams(next, { replace: true });
  }

  const hasPrompt = Boolean(stagePrompt?.prompt?.steps?.length);
  const hasScripts = Boolean(stagePrompt?.scripts?.length);
  const isLeadReady = Boolean(leadId && lead);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0%, #090b12 55%, #05070d 100%)',
      color: '#fff',
      padding: '1.25rem',
    }}>
      <style>{`
        .tp-shell {
          max-width: 1320px;
          margin: 0 auto;
        }
        .tp-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .tp-title-block h1 {
          margin: 0;
          font-size: clamp(1.6rem, 2.8vw, 2.6rem);
          letter-spacing: -0.03em;
        }
        .tp-subtitle {
          color: #9ca3af;
          margin-top: 0.5rem;
          max-width: 72ch;
          line-height: 1.55;
        }
        .tp-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.9rem;
        }
        .tp-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(15,23,42,0.72);
          color: #e5e7eb;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .tp-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .tp-select {
          min-width: 240px;
          background: rgba(15,23,42,0.92);
          color: #fff;
          border: 1px solid rgba(148,163,184,0.28);
          border-radius: 12px;
          padding: 0.75rem 0.95rem;
          font-size: 0.92rem;
          font-family: inherit;
        }
        .tp-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.72rem 1rem;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(15,23,42,0.85);
          color: #fff;
          text-decoration: none;
          font-weight: 600;
        }
        .tp-button.primary {
          background: linear-gradient(135deg, #f59e0b, #fbbf24);
          color: #111827;
          border-color: transparent;
          box-shadow: 0 12px 30px rgba(245,158,11,0.25);
        }
        .tp-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
          gap: 1rem;
          align-items: start;
        }
        .tp-card {
          background: rgba(17,24,39,0.9);
          border: 1px solid rgba(148,163,184,0.16);
          border-radius: 20px;
          box-shadow: 0 18px 45px rgba(0,0,0,0.35);
        }
        .tp-card-body {
          padding: 1rem;
        }
        .tp-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }
        .tp-stat {
          border: 1px solid rgba(148,163,184,0.14);
          background: rgba(15,23,42,0.72);
          border-radius: 14px;
          padding: 0.85rem;
        }
        .tp-stat-label {
          color: #94a3b8;
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 0.35rem;
        }
        .tp-stat-value {
          font-size: 0.96rem;
          font-weight: 700;
          color: #fff;
        }
        .tp-helper {
          color: #94a3b8;
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .tp-error {
          background: rgba(127,29,29,0.35);
          border: 1px solid rgba(248,113,113,0.24);
          color: #fecaca;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          margin: 0.75rem 0 1rem;
        }
        .tp-empty {
          padding: 2rem;
          text-align: center;
          color: #9ca3af;
        }
        .tp-stage-note {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .tp-stage-note strong {
          color: #fff;
        }
      `}</style>

      <div className="tp-shell">
        <div className="tp-hero">
          <div className="tp-title-block">
            <h1>Teleprompter</h1>
            <div className="tp-subtitle">
              Stage-aware prompts, text shortcuts, and call scripts for the current lead.
              Open this from a lead to keep the prompt synced with the exact pipeline stage.
            </div>
            <div className="tp-pill-row">
            <span className="tp-pill">Stage: {stageLabel}</span>
              <span className="tp-pill">Focus: {stageShortLabel}</span>
              <span className="tp-pill">Owner: {ownerName}</span>
              {bucketLabel && <span className="tp-pill">Bucket: {bucketLabel}</span>}
              {nextStageLabel && <span className="tp-pill">Next: {nextStageLabel}</span>}
            </div>
          </div>

          <div className="tp-controls">
            <select
              className="tp-select"
              value={currentStage || ''}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={!leadId}
              aria-label="Pipeline stage"
            >
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
            {lead?.id && (
              <Link to={`/leads/${lead.id}`} className="tp-button">
                Back to Lead
              </Link>
            )}
            <Link to="/pipeline" className="tp-button primary">
              Open Pipeline
            </Link>
          </div>
        </div>

        {leadError && <div className="tp-error">{leadError}</div>}
        {promptError && <div className="tp-error">{promptError}</div>}

        <div className="tp-grid">
          <div className="tp-card">
            <div className="tp-card-body">
              <div className="tp-stage-note">
                <div>
                  <strong>{lead?.address || 'Open a lead to load stage prompts'}</strong>
                  <div className="tp-helper">
                    {lead?.seller_name || lead?.agent_name || 'Lead details will appear here.'}
                    {lead?.stage ? ` • ${STAGE_LABELS[lead.stage] || lead.stage}` : ''}
                  </div>
                </div>
                {lead?.id && (
                  <Link to={`/leads/${lead.id}`} className="tp-button">
                    Lead Detail
                  </Link>
                )}
              </div>

              {loadingLead ? (
                <div className="tp-empty">Loading lead...</div>
              ) : !isLeadReady ? (
                <div className="tp-empty">
                  <p style={{ marginTop: 0 }}>Open Teleprompter from a lead record to load stage-aware prompts.</p>
                  <p style={{ marginBottom: 0 }}>Use the lead detail page or pipeline view to open the current lead.</p>
                </div>
              ) : loadingPrompt ? (
                <div className="tp-empty">Loading stage prompt...</div>
              ) : hasPrompt || hasScripts ? (
                <ScriptPromptModal
                  inline
                  prompt={stagePrompt?.prompt}
                  scripts={stagePrompt?.scripts || []}
                  onMarkSent={handleMarkSent}
                />
              ) : (
                <div className="tp-empty">
                  No prompt is configured for <strong>{STAGE_LABELS[currentStage] || currentStage}</strong> yet.
                </div>
              )}
            </div>
          </div>

          <div className="tp-card">
            <div className="tp-card-body">
              <div style={{ marginBottom: '0.9rem' }}>
                <div className="tp-stat-label">Current Lead</div>
                <div className="tp-stat-value">{lead?.address || 'None selected'}</div>
              </div>

              <div className="tp-summary">
                <div className="tp-stat">
                  <div className="tp-stat-label">Current Stage</div>
                  <div className="tp-stat-value">{stageLabel}</div>
                </div>
                <div className="tp-stat">
                  <div className="tp-stat-label">Owner</div>
                  <div className="tp-stat-value">{ownerName}</div>
                </div>
                <div className="tp-stat">
                  <div className="tp-stat-label">Next Stage</div>
                  <div className="tp-stat-value">{nextStageLabel || 'Complete'}</div>
                </div>
                <div className="tp-stat">
                  <div className="tp-stat-label">Lead ID</div>
                  <div className="tp-stat-value" style={{ wordBreak: 'break-word' }}>{lead?.id || '—'}</div>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div className="tp-stat-label">How it works</div>
                <div className="tp-helper">
                  The teleprompter stays synced to the lead record. When the stage changes, this page reloads
                  the stage prompt and all filled shortcuts for that step.
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div className="tp-stat-label">Availability</div>
                <div className="tp-helper">
                  {lead?.id
                    ? 'Visible from Lead Detail and the main app navigation.'
                    : 'Open from a specific lead to see stage-aware prompts.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
