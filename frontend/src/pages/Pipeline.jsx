import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import ScriptPromptModal from '../components/ScriptPromptModal';
import {
  STAGES as STAGE_ORDER,
  STAGE_LABELS,
  STAGE_SHORT_LABELS,
  OWNERS as OWNER_SECTIONS,
  getOwnerForStage,
  NEXT_STAGE,
} from '../lib/pipeline-stages';

export default function Pipeline() {
  const [pipeline, setPipeline] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [automationResults, setAutomationResults] = useState(null);
  const [scriptPrompts, setScriptPrompts] = useState(null);
  const [viewingPrompts, setViewingPrompts] = useState(null);
  const stageRefs = useRef({});
  const boardShellRef = useRef(null);

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

  useEffect(() => {
    if (!pipeline || loading) return;
    const frame = requestAnimationFrame(() => {
      if (boardShellRef.current) boardShellRef.current.scrollLeft = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [pipeline, loading]);

  async function handleAdvance(leadId, toStage) {
    const lead = pipeline.pipeline[Object.keys(pipeline.pipeline).find(s =>
      pipeline.pipeline[s].some(l => l.id === leadId))]?.find(l => l.id === leadId);
    const fromStage = lead?.stage;

    setAdvancing(prev => ({ ...prev, [leadId]: true }));
    try {
      const result = await api.advanceLead(leadId, toStage);

      if (result.automation?.prompt) {
        setScriptPrompts({
          leadId,
          prompt: result.automation.prompt,
          scripts: result.automation.scripts,
          workflow: result.automation.workflow,
          owner: result.automation.owner,
          description: result.automation.description,
        });
      } else if (result.automation?.scripts?.length > 0) {
        setScriptPrompts({
          leadId,
          scripts: result.automation.scripts,
          workflow: result.automation.workflow,
        });
      }

      setAutomationResults({ leadId, ...result.automation });
      await loadPipeline();
    } catch (err) {
      alert('Failed to advance: ' + err.message);
    } finally {
      setAdvancing(prev => ({ ...prev, [leadId]: false }));
    }
  }

  async function handleViewPrompts(leadId, stage) {
    try {
      const result = await api.getStagePrompt(leadId, stage);
      if (!result?.prompt && (!result?.scripts || result.scripts.length === 0)) return;

      setViewingPrompts({
        leadId,
        prompt: result.prompt || null,
        scripts: result.scripts || [],
        stage,
      });
    } catch (err) {
      console.error('View prompts error:', err);
    }
  }

  async function handlePokemon(leadId, address, sellerName) {
    if (!confirm(`Spawn new lead for ${sellerName || address}? This creates a "We Play Pokémon" portfolio lead.`)) return;
    try {
      const result = await api.spawnPokemon(leadId);
      alert(`Pokémon spawned! New lead: ${result.lead?.address || 'Created'}`);
      await loadPipeline();
    } catch (err) {
      alert('Pokémon spawn failed: ' + err.message);
    }
  }

  async function handleMarkPromptSent(payload) {
    const leadId = viewingPrompts?.leadId || scriptPrompts?.leadId;
    if (!leadId) {
      alert('Open the lead first so sent activity can be recorded.');
      return;
    }

    try {
      await api.markTeleprompterSent({
        lead_id: leadId,
        source: payload?.source || 'crm',
        key: payload?.key || payload?.templateName || 'stage-script',
        body: payload?.body || '',
        recipient: payload?.recipient || 'unknown',
        channel: 'sms',
      });
    } catch (err) {
      alert('Failed to mark sent: ' + err.message);
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

  function scrollToStage(stage) {
    const el = stageRefs.current[stage];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

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
          <h1>Pipeline — 21 Stages</h1>
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

      <div className="pipeline-stage-rail" aria-label="Pipeline stage jump list">
        {STAGE_ORDER.map((stage, index) => {
          const owner = getOwnerForStage(stage);
          return (
            <button
              key={stage}
              type="button"
              className={`pipeline-stage-chip ${index === 0 ? 'is-active' : ''}`}
              onClick={() => scrollToStage(stage)}
              title={STAGE_LABELS[stage]}
              style={{
                borderColor: `${owner.color}33`,
                boxShadow: `inset 0 0 0 1px ${owner.color}12`,
              }}
            >
              <span>{index + 1}</span>
              <span className="pipeline-stage-chip-text">{STAGE_SHORT_LABELS[stage]}</span>
              <span className="pipeline-stage-chip-owner">{owner.name}</span>
            </button>
          );
        })}
      </div>
      <div className="pipeline-stage-note">
        Use the stage rail to jump to any of the 21 columns. The board scrolls horizontally so no stage gets squeezed out.
      </div>

      {pipeline.alerts?.length > 0 && (
        <div className="alerts">
          {pipeline.alerts.map((a, i) => {
            const inner = (
              <>
                {a.severity === 'red' ? '🔴' : '🟡'} <strong>{a.type.replace(/_/g, ' ')}</strong>: {a.lead} — {a.detail}
              </>
            );
            return a.lead_id ? (
              <Link
                key={i}
                to={`/leads/${a.lead_id}`}
                className={`alert alert-${a.severity} alert-clickable`}
                style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}
              >
                {inner}
              </Link>
            ) : (
              <div key={i} className={`alert alert-${a.severity}`}>
                {inner}
              </div>
            );
          })}
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
              {health.alerts.map((a, i) => {
                const inner = (
                  <>
                    {a.severity === 'red' ? '🔴' : '🟡'} <strong>{a.type.replace(/_/g, ' ')}</strong>
                    {a.address && a.address !== 'PIPELINE-WIDE' ? ` — ${a.address}` : ''}: {a.detail}
                  </>
                );
                return a.leadId ? (
                  <Link
                    key={i}
                    to={`/leads/${a.leadId}`}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      background: a.severity === 'red' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      color: a.severity === 'red' ? '#fca5a5' : '#fcd34d',
                      border: `1px solid ${a.severity === 'red' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                      textDecoration: 'none',
                      display: 'block',
                      cursor: 'pointer',
                    }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={i}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      background: a.severity === 'red' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      color: a.severity === 'red' ? '#fca5a5' : '#fcd34d',
                      border: `1px solid ${a.severity === 'red' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                    }}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {automationResults && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          ⚡ <strong>{automationResults.workflow}</strong> fired — {automationResults.actions_executed} actions
          {automationResults.owner && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>by {automationResults.owner}</span>}
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

      {scriptPrompts && (
        <ScriptPromptModal
          prompt={scriptPrompts.prompt}
          scripts={scriptPrompts.scripts}
          onDismiss={() => setScriptPrompts(null)}
          onMarkSent={handleMarkPromptSent}
        />
      )}

      {viewingPrompts && (
        <ScriptPromptModal
          prompt={viewingPrompts.prompt}
          scripts={viewingPrompts.scripts}
          onDismiss={() => setViewingPrompts(null)}
          onMarkSent={handleMarkPromptSent}
        />
      )}

      {/* Owner Section Headers */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {Object.entries(OWNER_SECTIONS).map(([key, owner]) => (
          <div key={key} style={{
            background: owner.bgColor,
            border: `1px solid ${owner.color}33`,
            borderRadius: 'var(--radius-md)',
            padding: '0.25rem 0.6rem',
            fontSize: '0.7rem',
            fontWeight: '600',
            color: owner.color,
          }}>
            {owner.name}: {owner.stages.map(s => STAGE_LABELS[s]).join(' → ')}
          </div>
        ))}
      </div>

      <div className="pipeline-board-shell" ref={boardShellRef}>
        <div className="pipeline-board">
        {STAGE_ORDER.map(stage => {
          const leads = pipeline.pipeline[stage] || [];
          const isDragOver = dragOver === stage;
          const owner = getOwnerForStage(stage);
          return (
            <div
              key={stage}
              ref={el => { if (el) stageRefs.current[stage] = el; }}
              className={`pipeline-column ${isDragOver ? 'drag-over' : ''}`}
              style={{ borderTop: `3px solid ${owner.color}` }}
              onDragOver={e => handleDragOver(e, stage)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, stage)}>
              <div className="column-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <h3>{STAGE_LABELS[stage]}</h3>
                  <span style={{
                    fontSize: '0.6rem',
                    background: owner.bgColor,
                    color: owner.color,
                    padding: '0.1rem 0.35rem',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: '600',
                  }}>{owner.name}</span>
                </div>
                <span className="column-count">{leads.length}</span>
              </div>
              <div className="column-cards">
                {leads.length === 0 ? <div className="empty-column">Drop leads here</div>
                  : leads.map(lead => {
                    const nextStage = NEXT_STAGE[lead.stage];
                    const isAdvancing = advancing[lead.id];
                    const isClosed = lead.stage === 'CLOSING_DATE';
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
                        {lead.stage === 'PSA_SENT' && lead.days_in_stage > 3 && <div className="card-stalled" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>⏰ 72hr overdue — follow up</div>}
                        <div className="card-action-row">
                          <span className="card-action">{lead.next_action}</span>
                          <Link
                            to={`/calculator?leadId=${lead.id}&tab=underwriting`}
                            className="btn-view-prompts"
                            onClick={e => e.stopPropagation()}
                            title="Open underwriting for this lead"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            🧮
                          </Link>
                          <Link
                            to={`/contracts?leadId=${lead.id}&tab=templates`}
                            className="btn-view-prompts"
                            onClick={e => e.stopPropagation()}
                            title="Open contract builder for this lead"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            📄
                          </Link>
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
                          {isClosed && (
                            <button className="btn-pokemon" onClick={e => { e.preventDefault(); e.stopPropagation(); handlePokemon(lead.id, lead.address, lead.seller_name); }}
                              disabled={isAdvancing} title="We Play Pokémon — spawn new lead from seller"
                              style={{ background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.4rem', cursor: 'pointer', fontSize: '0.75rem' }}>
                              🎮
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
      </div>

          {pipeline.reminders_due?.length > 0 && (
        <div className="reminders-section">
          <h3>⏰ Reminders Due</h3>
          {pipeline.reminders_due.map(r => (
            <div key={r.id} className="reminder-item">
              <span className="reminder-type">{r.type}</span>
              <Link to={`/leads/${r.lead_id || r.id}`}>{r.address}</Link>
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
