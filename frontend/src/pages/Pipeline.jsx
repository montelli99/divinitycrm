import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import ScriptPromptModal from '../components/ScriptPromptModal';

const STAGE_ORDER = ['NEW_LEAD', 'QUALIFIED', 'LOI_REQUESTED', 'LOI_APPROVED', 'OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT'];
const STAGE_LABELS = {
  NEW_LEAD: 'New Lead', QUALIFIED: 'Qualified', LOI_REQUESTED: 'LOI Requested',
  LOI_APPROVED: 'LOI Approved', OFFER_SENT: 'Offer Sent', NEGOTIATING: 'Negotiating',
  UNDER_CONTRACT: 'Under Contract',
};

const NEXT_STAGE = {
  NEW_LEAD: 'QUALIFIED', QUALIFIED: 'LOI_REQUESTED', LOI_REQUESTED: 'LOI_APPROVED',
  LOI_APPROVED: 'OFFER_SENT', OFFER_SENT: 'NEGOTIATING', NEGOTIATING: 'UNDER_CONTRACT',
  UNDER_CONTRACT: 'CLOSED',
};

export default function Pipeline() {
  const [pipeline, setPipeline] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [automationResults, setAutomationResults] = useState(null);
  const [scriptPrompts, setScriptPrompts] = useState(null);
  const [viewingPrompts, setViewingPrompts] = useState(null); // For "View Prompts" button

  const loadPipeline = useCallback(async () => {
    try {
      const [pipeData, healthData] = await Promise.all([
        api.getPipeline(),
        api.getPipelineHealth().catch(() => null),
      ]);
      setPipeline(pipeData);
      setHealth(healthData);
    }
    catch (err) { console.error('Pipeline load error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  async function handleAdvance(leadId, toStage) {
    const lead = pipeline.pipeline[Object.keys(pipeline.pipeline).find(s =>
      pipeline.pipeline[s].some(l => l.id === leadId))]?.find(l => l.id === leadId);
    const fromStage = lead?.stage;

    setAdvancing(prev => ({ ...prev, [leadId]: true }));
    try {
      const result = await api.advanceLead(leadId, toStage);

      // Show the RICH PROMPT if returned (auto-open, stays until dismissed)
      if (result.automation?.prompt) {
        setScriptPrompts({
          prompt: result.automation.prompt,
          scripts: result.automation.scripts,
          workflow: result.automation.workflow,
          description: result.automation.description,
        });
      } else if (result.automation?.scripts?.length > 0) {
        // Legacy fallback
        setScriptPrompts({
          scripts: result.automation.scripts,
          workflow: result.automation.workflow,
        });
      }

      setAutomationResults({ leadId, ...result.automation });
      await loadPipeline();
      // Don't auto-dismiss — modal stays open until user dismisses
    } catch (err) {
      alert('Failed to advance: ' + err.message);
    } finally {
      setAdvancing(prev => ({ ...prev, [leadId]: false }));
    }
  }

  // "View Prompts" — fetch the stage prompt for a lead
  async function handleViewPrompts(leadId, stage) {
    try {
      const result = await api.getStagePrompt(leadId, stage);
      if (result?.prompt) {
        setViewingPrompts({
          prompt: result.prompt,
          scripts: result.scripts || [],
          leadId,
          stage,
        });
      }
    } catch (err) {
      console.error('View prompts error:', err);
    }
  }

  function handleDragStart(e, lead) {
    setDragging(lead);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, stage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
  }

  function handleDragLeave() { setDragOver(null); }

  async function handleDrop(e, toStage) {
    e.preventDefault();
    setDragOver(null);
    if (!dragging) return;
    const fromStage = dragging.stage;
    if (fromStage === toStage) return;
    const validNext = NEXT_STAGE[fromStage];
    if (toStage !== validNext && toStage !== 'DEAD') return;
    const leadId = dragging.id;
    setDragging(null);
    await handleAdvance(leadId, toStage);
  }

  if (loading) return <div className="loading">Loading pipeline...</div>;
  if (!pipeline) return <div className="error">Failed to load pipeline.</div>;

  const totalActive = Object.values(pipeline.pipeline).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="pipeline-page">
      <div className="page-header">
        <div>
          <h1>Pipeline</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {totalActive} active · {pipeline.stats.closed} closed · {pipeline.stats.conversion_rate}% conversion
          </p>
        </div>
        <div className="pipeline-stats">
          <span>{pipeline.stats.active} active</span>
          <span>{pipeline.stats.closed} closed</span>
          <span>{pipeline.stats.conversion_rate}% conv.</span>
        </div>
      </div>

      {pipeline.alerts?.length > 0 && (
        <div className="alerts">
          {pipeline.alerts.map((a, i) => (
            <div key={i} className={`alert alert-${a.severity}`}>
              {a.severity === 'red' ? '🔴' : '🟡'} <strong>{a.type.replace(/_/g, ' ')}</strong>: {a.lead} — {a.detail}
            </div>
          ))}
        </div>
      )}

      {/* Pipeline Health Monitor */}
      {health && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
              🏥 Pipeline Health Monitor
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              Scanned: {new Date(health.scannedAt).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <HealthBadge label="Total Active" value={health.stats.total} color="var(--text-primary)" />
            <HealthBadge label="Stalled (7d+)" value={health.stats.stalled} color={health.stats.stalled > 0 ? '#f59e0b' : '#4ade80'} />
            <HealthBadge label="48hr Overdue" value={health.stats.overdue48hr} color={health.stats.overdue48hr > 0 ? '#ef4444' : '#4ade80'} />
            <HealthBadge label="Abandoned (30d+)" value={health.stats.abandoned} color={health.stats.abandoned > 0 ? '#ef4444' : '#4ade80'} />
            <HealthBadge label="Closed" value={health.stats.closedCount} color="#4ade80" />
          </div>
          {health.alerts?.length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {health.alerts.map((a, i) => (
                <div key={i} style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  background: a.severity === 'red' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                  color: a.severity === 'red' ? '#fca5a5' : '#fcd34d',
                  border: `1px solid ${a.severity === 'red' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                }}>
                  {a.severity === 'red' ? '🔴' : '🟡'} <strong>{a.type.replace(/_/g, ' ')}</strong>
                  {a.address ? ` — ${a.address}` : ''}: {a.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {automationResults && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          ⚡ <strong>{automationResults.workflow}</strong> fired — {automationResults.actions_executed} actions
          {automationResults.results?.filter(r => r.ok).map((r, i) => (
            <span key={i} style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
              {r.type === 'set_field' && `✓ ${r.field}`}
              {r.type === 'set_reminder' && `✓ ${r.reminder_type}`}
              {r.type === 'run_underwriting' && '✓ underwriting'}
              {r.type === 'log' && `✓ logged`}
            </span>
          ))}
        </div>
      )}

      {/* Script Prompt Modal — auto-opens on advance, stays until dismissed */}
      {scriptPrompts && (
        <ScriptPromptModal
          prompt={scriptPrompts.prompt}
          scripts={scriptPrompts.scripts}
          onDismiss={() => setScriptPrompts(null)}
          onMarkSent={(name) => console.log('Marked sent:', name)}
        />
      )}

      {/* View Prompts Modal — opened via "View Prompts" button */}
      {viewingPrompts && (
        <ScriptPromptModal
          prompt={viewingPrompts.prompt}
          scripts={viewingPrompts.scripts}
          onDismiss={() => setViewingPrompts(null)}
          onMarkSent={(name) => console.log('Marked sent:', name)}
        />
      )}

      <div className="pipeline-board">
        {STAGE_ORDER.map(stage => {
          const leads = pipeline.pipeline[stage] || [];
          const isDragOver = dragOver === stage;
          return (
            <div key={stage} className={`pipeline-column ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={e => handleDragOver(e, stage)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stage)}>
              <div className="column-header">
                <h3>{STAGE_LABELS[stage]}</h3><span className="column-count">{leads.length}</span>
              </div>
              <div className="column-cards">
                {leads.length === 0 ? <div className="empty-column">Drop leads here</div>
                  : leads.map(lead => {
                    const nextStage = NEXT_STAGE[lead.stage];
                    const isAdvancing = advancing[lead.id];
                    return (
                      <div key={lead.id} className={`lead-card ${dragging?.id === lead.id ? 'dragging' : ''}`}
                        draggable onDragStart={e => handleDragStart(e, { id: lead.id, stage: lead.stage })} onDragEnd={() => setDragging(null)}>
                        <Link to={`/leads/${lead.id}`} className="card-address" onClick={e => e.stopPropagation()}>{lead.address}</Link>
                        <div className="card-meta">
                          <span className="card-price">{lead.price ? `$${Number(lead.price).toLocaleString()}` : '—'}</span>
                          <span className="card-days" style={{
                            color: lead.days_in_stage > 7 ? '#f59e0b' : lead.days_in_stage > 2 ? '#fcd34d' : 'var(--text-tertiary)',
                            fontWeight: lead.days_in_stage > 7 ? '600' : '400',
                          }}>{lead.days_in_stage}d</span>
                        </div>
                        {lead.stalled && <div className="card-stalled">⚠ Stalled — {lead.days_in_stage} days</div>}
                        {lead.days_in_stage > 30 && <div className="card-stalled" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>🔴 Abandoned — {lead.days_in_stage} days</div>}
                        {lead.stage === 'OFFER_SENT' && lead.days_in_stage > 2 && <div className="card-stalled" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>⏰ 48hr overdue — call now</div>}
                        <div className="card-action-row">
                          <span className="card-action">{lead.next_action}</span>
                          {/* View Prompts button */}
                          <button
                            className="btn-view-prompts"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); handleViewPrompts(lead.id, lead.stage); }}
                            title="View stage scripts & prompts"
                          >
                            📋
                          </button>
                          {nextStage && (
                            <button className="btn-advance" onClick={e => { e.preventDefault(); e.stopPropagation(); handleAdvance(lead.id, nextStage); }}
                              disabled={isAdvancing} title={`Advance to ${STAGE_LABELS[nextStage]}`}>
                              {isAdvancing ? '...' : '→'}
                            </button>
                          )}
                          <button className="btn-dead" onClick={e => { e.preventDefault(); e.stopPropagation();
                              if (confirm(`Mark ${lead.address} as dead?`)) handleAdvance(lead.id, 'DEAD'); }}
                            disabled={isAdvancing} title="Mark as Dead">✕</button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {pipeline.reminders_due?.length > 0 && (
        <div className="reminders-section">
          <h3>⏰ Reminders Due</h3>
          {pipeline.reminders_due.map(r => (
            <div key={r.id} className="reminder-item">
              <span className="reminder-type">{r.type}</span>
              <Link to={`/leads/${r.id}`}>{r.address}</Link>
              <span className="reminder-date">{new Date(r.due_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthBadge({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '0.4rem 0.7rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
    }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: '700', color }}>{value}</span>
    </div>
  );
}
