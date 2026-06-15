import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STAGE_ORDER = ['NEW_LEAD', 'QUALIFIED', 'LOI_REQUESTED', 'LOI_APPROVED', 'OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT'];
const STAGE_LABELS = {
  NEW_LEAD: 'New Lead',
  QUALIFIED: 'Qualified',
  LOI_REQUESTED: 'LOI Requested',
  LOI_APPROVED: 'LOI Approved',
  OFFER_SENT: 'Offer Sent',
  NEGOTIATING: 'Negotiating',
  UNDER_CONTRACT: 'Under Contract',
};

const NEXT_STAGE = {
  NEW_LEAD: 'QUALIFIED',
  QUALIFIED: 'LOI_REQUESTED',
  LOI_REQUESTED: 'LOI_APPROVED',
  LOI_APPROVED: 'OFFER_SENT',
  OFFER_SENT: 'NEGOTIATING',
  NEGOTIATING: 'UNDER_CONTRACT',
  UNDER_CONTRACT: 'CLOSED',
};

export default function Pipeline() {
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [automationResults, setAutomationResults] = useState(null);

  const loadPipeline = useCallback(async () => {
    try {
      const data = await api.getPipeline();
      setPipeline(data);
    } catch (err) {
      console.error('Pipeline load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  async function handleAdvance(leadId, toStage) {
    setAdvancing(prev => ({ ...prev, [leadId]: true }));
    try {
      const result = await api.advanceLead(leadId, toStage);
      setAutomationResults({ leadId, ...result.automation });
      await loadPipeline();
      // Clear automation result after 5 seconds
      setTimeout(() => setAutomationResults(null), 5000);
    } catch (err) {
      alert('Failed to advance: ' + err.message);
    } finally {
      setAdvancing(prev => ({ ...prev, [leadId]: false }));
    }
  }

  function handleDragStart(e, lead) {
    setDragging(lead);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
  }

  function handleDragOver(e, stage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stage);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(e, toStage) {
    e.preventDefault();
    setDragOver(null);
    if (!dragging) return;

    const leadId = dragging.id;
    const fromStage = dragging.stage;
    
    if (fromStage === toStage) return;
    
    // Validate transition
    const validNext = NEXT_STAGE[fromStage];
    if (toStage !== validNext && toStage !== 'DEAD') {
      // Allow drag to DEAD from any stage
      if (toStage === 'DEAD') {
        // handled below
      } else {
        return; // invalid transition — silently ignore
      }
    }

    setDragging(null);
    await handleAdvance(leadId, toStage);
  }

  if (loading) return <div className="loading">Loading pipeline...</div>;
  if (!pipeline) return <div className="error">Failed to load pipeline.</div>;

  const totalActive = Object.values(pipeline.pipeline).reduce((sum, arr) => sum + arr.length, 0);

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

      {automationResults && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          ⚡ <strong>{automationResults.workflow}</strong> fired — {automationResults.actions_executed} actions executed
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

      <div className="pipeline-board">
        {STAGE_ORDER.map(stage => {
          const leads = pipeline.pipeline[stage] || [];
          const isDragOver = dragOver === stage;
          return (
            <div 
              key={stage} 
              className={`pipeline-column ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={e => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, stage)}
            >
              <div className="column-header">
                <h3>{STAGE_LABELS[stage]}</h3>
                <span className="column-count">{leads.length}</span>
              </div>
              <div className="column-cards">
                {leads.length === 0 ? (
                  <div className="empty-column">Drop leads here</div>
                ) : (
                  leads.map(lead => {
                    const nextStage = NEXT_STAGE[lead.stage];
                    const isAdvancing = advancing[lead.id];
                    return (
                      <div
                        key={lead.id}
                        className={`lead-card ${dragging?.id === lead.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={e => handleDragStart(e, { id: lead.id, stage: lead.stage })}
                        onDragEnd={() => setDragging(null)}
                      >
                        <Link to={`/leads/${lead.id}`} className="card-address" onClick={e => e.stopPropagation()}>
                          {lead.address}
                        </Link>
                        <div className="card-meta">
                          <span className="card-price">
                            {lead.price ? `$${Number(lead.price).toLocaleString()}` : '—'}
                          </span>
                          <span className="card-days">{lead.days_in_stage}d</span>
                        </div>
                        {lead.stalled && (
                          <div className="card-stalled">⚠ Stalled — {lead.days_in_stage} days</div>
                        )}
                        <div className="card-action-row">
                          <span className="card-action">{lead.next_action}</span>
                          {nextStage && (
                            <button
                              className="btn-advance"
                              onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleAdvance(lead.id, nextStage);
                              }}
                              disabled={isAdvancing}
                              title={`Advance to ${STAGE_LABELS[nextStage]}`}
                            >
                              {isAdvancing ? '...' : '→'}
                            </button>
                          )}
                          <button
                            className="btn-dead"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (confirm(`Mark ${lead.address} as dead?`)) {
                                handleAdvance(lead.id, 'DEAD');
                              }
                            }}
                            disabled={isAdvancing}
                            title="Mark as Dead"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
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
              <Link to={`/leads/${r.lead_id}`}>{r.address}</Link>
              <span className="reminder-date">{new Date(r.due_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
