import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STAGE_LABELS = {
  NEW_LEAD: 'New Lead',
  QUALIFIED: 'Qualified',
  LOI_REQUESTED: 'LOI Requested',
  LOI_APPROVED: 'LOI Approved',
  OFFER_SENT: 'Offer Sent',
  NEGOTIATING: 'Negotiating',
  UNDER_CONTRACT: 'Under Contract',
  CLOSED: 'Closed',
  DEAD: 'Dead',
  ARCHIVED: 'Archived',
};

// AM Tasks by stage (from daily-sop.js)
const AM_TASK_DEFS = {
  'UNDER_CONTRACT': { label: 'Contract Out', action: 'Review details, authorize signatures', icon: '✍️' },
  'NEGOTIATING': { label: 'Active Negotiation', action: 'Overcome objections. Record calls for educational purposes', icon: '🎙️' },
  'LOI_APPROVED': { label: 'Terms Agreed', action: 'Touch base on contract alignment. Verify stack or draft manual agreement', icon: '📋' },
  'LOI_REQUESTED': { label: 'Awaiting Seller Info', action: 'Confirm seller info, name on title, access method, ensure financials in place', icon: '📄' },
};

// PM Tasks by stage (PPC follow-ups)
const PM_TASK_DEFS = {
  'OFFER_SENT': { label: 'Offer Made', action: 'Figure out motivation if they are a serious and qualified lead', icon: '🔍' },
  'LOI_APPROVED': { label: 'Offer Ready to Pitch', action: 'Underwrite and navigate exit strategies for disposition, then send text to client for a call to pitch', icon: '📊' },
  'QUALIFIED': { label: 'Awaiting Photos', action: 'CRITICAL: Stay on phone while they take photos. Email photos to yourself, create Google Drive folder', icon: '📸' },
  'NEW_LEAD': { label: 'Contacted', action: 'Send text to qualify timing preference — morning or evening?', icon: '📱' },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLead, setNewLead] = useState({ address: '', city: '', state: '', price: '', source: 'other', beds: '', baths: '', sqft: '' });
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const [statsData, todayData, leadsData] = await Promise.all([
          api.getStats(),
          api.getToday(),
          api.getLeads({ limit: 50 }),
        ]);
        setStats(statsData);
        setToday(todayData);
        setLeads(leadsData.leads);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCreateLead(e) {
    e.preventDefault();
    if (!newLead.address.trim()) return;
    setCreating(true);
    try {
      await api.createLead({
        address: newLead.address,
        city: newLead.city || null,
        state: newLead.state || null,
        price: newLead.price ? Number(newLead.price) : null,
        source: newLead.source,
        beds: newLead.beds ? Number(newLead.beds) : null,
        baths: newLead.baths ? Number(newLead.baths) : null,
        sqft: newLead.sqft ? Number(newLead.sqft) : null,
      });
      setShowNewLead(false);
      setNewLead({ address: '', city: '', state: '', price: '', source: 'other', beds: '', baths: '', sqft: '' });
      const [leadsData, statsData] = await Promise.all([api.getLeads({ limit: 50 }), api.getStats()]);
      setLeads(leadsData.leads);
      setStats(statsData);
    } catch (err) {
      alert('Failed to create lead: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  // Build AM/PM task lists from leads
  function buildTaskLists() {
    const amTasks = [];
    const pmTasks = [];

    leads.forEach(lead => {
      const amDef = AM_TASK_DEFS[lead.stage];
      if (amDef) {
        amTasks.push({
          leadId: lead.id,
          address: lead.address,
          stage: lead.stage,
          label: amDef.label,
          action: amDef.action,
          icon: amDef.icon,
          price: lead.price,
          daysInStage: lead.last_stage_change_at
            ? Math.floor((Date.now() - new Date(lead.last_stage_change_at).getTime()) / 86400000)
            : null,
        });
      }

      const pmDef = PM_TASK_DEFS[lead.stage];
      if (pmDef) {
        pmTasks.push({
          leadId: lead.id,
          address: lead.address,
          stage: lead.stage,
          label: pmDef.label,
          action: pmDef.action,
          icon: pmDef.icon,
          price: lead.price,
          daysInStage: lead.last_stage_change_at
            ? Math.floor((Date.now() - new Date(lead.last_stage_change_at).getTime()) / 86400000)
            : null,
        });
      }
    });

    return { amTasks, pmTasks };
  }

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const { amTasks, pmTasks } = buildTaskLists();
  const overdue48hr = today?.overdue_48hr || [];
  const followUpsDue = today?.follow_ups_due || [];

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {stats ? `${stats.active} active leads · ${stats.closed} closed · ${stats.conversion_rate}% conversion` : ''}
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowNewLead(!showNewLead)}>
          + New Lead
        </button>
      </div>

      {showNewLead && (
        <form className="new-lead-form" onSubmit={handleCreateLead}>
          <h3>Add New Property Lead</h3>
          <div className="form-grid">
            <label>
              Property Address *
              <input
                type="text"
                placeholder="123 Main St"
                value={newLead.address}
                onChange={e => setNewLead({ ...newLead, address: e.target.value })}
                required
                autoFocus
              />
            </label>
            <label>
              City
              <input
                type="text"
                placeholder="Springfield"
                value={newLead.city}
                onChange={e => setNewLead({ ...newLead, city: e.target.value })}
              />
            </label>
            <label>
              State
              <input
                type="text"
                placeholder="IL"
                maxLength={2}
                value={newLead.state}
                onChange={e => setNewLead({ ...newLead, state: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Price ($)
              <input
                type="number"
                placeholder="185000"
                value={newLead.price}
                onChange={e => setNewLead({ ...newLead, price: e.target.value })}
              />
            </label>
            <label>
              Beds
              <input
                type="number"
                placeholder="3"
                value={newLead.beds}
                onChange={e => setNewLead({ ...newLead, beds: e.target.value })}
              />
            </label>
            <label>
              Baths
              <input
                type="number"
                placeholder="2"
                step="0.5"
                value={newLead.baths}
                onChange={e => setNewLead({ ...newLead, baths: e.target.value })}
              />
            </label>
            <label>
              Sqft
              <input
                type="number"
                placeholder="1500"
                value={newLead.sqft}
                onChange={e => setNewLead({ ...newLead, sqft: e.target.value })}
              />
            </label>
            <label>
              Source
              <select value={newLead.source} onChange={e => setNewLead({ ...newLead, source: e.target.value })}>
                <option value="kayla_sheet">Kayla Sheet</option>
                <option value="ppc">PPC</option>
                <option value="facebook">Facebook</option>
                <option value="website">Website</option>
                <option value="list_pull">List Pull</option>
                <option value="referral">Referral</option>
                <option value="zillow">Zillow</option>
                <option value="redfin">Redfin</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Lead'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewLead(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Leads</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.active}</span>
            <span className="stat-label">Active</span>
            {stats.added_today > 0 && (
              <span className="stat-trend up">+{stats.added_today} today</span>
            )}
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.closed}</span>
            <span className="stat-label">Closed Deals</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.dead}</span>
            <span className="stat-label">Dead Leads</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{stats.conversion_rate}%</span>
            <span className="stat-label">Conversion Rate</span>
          </div>
          {stats.avg_days_to_close && (
            <div className="stat-card">
              <span className="stat-number">{Math.round(stats.avg_days_to_close)}</span>
              <span className="stat-label">Avg Days to Close</span>
            </div>
          )}
        </div>
      )}

      {/* Today's Tasks Section */}
      <div className="today-tasks-section">
        <div className="tasks-header">
          <h2>📋 Today's Tasks</h2>
          <div className="tasks-tabs">
            <button
              className={`tasks-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({amTasks.length + pmTasks.length + overdue48hr.length + followUpsDue.length})
            </button>
            <button
              className={`tasks-tab ${activeTab === 'am' ? 'active' : ''}`}
              onClick={() => setActiveTab('am')}
            >
              🌅 AM ({amTasks.length})
            </button>
            <button
              className={`tasks-tab ${activeTab === 'pm' ? 'active' : ''}`}
              onClick={() => setActiveTab('pm')}
            >
              🌆 PM ({pmTasks.length})
            </button>
            <button
              className={`tasks-tab ${activeTab === 'urgent' ? 'active' : ''}`}
              onClick={() => setActiveTab('urgent')}
            >
              🔴 Urgent ({overdue48hr.length + followUpsDue.length})
            </button>
          </div>
        </div>

        <div className="tasks-grid">
          {/* AM Tasks Column */}
          {(activeTab === 'all' || activeTab === 'am') && amTasks.length > 0 && (
            <div className="task-column">
              <h3 className="task-column-header">🌅 AM Tasks — Review & Execute</h3>
              {amTasks.map(task => (
                <Link to={`/leads/${task.leadId}`} key={task.leadId} className="task-card">
                  <div className="task-card-icon">{task.icon}</div>
                  <div className="task-card-body">
                    <div className="task-card-title">
                      <strong>{task.address}</strong>
                      <span className={`stage-badge stage-${task.stage.toLowerCase()}`}>
                        {STAGE_LABELS[task.stage]}
                      </span>
                    </div>
                    <div className="task-card-action">{task.action}</div>
                    <div className="task-card-meta">
                      {task.price && <span>💰 ${Number(task.price).toLocaleString()}</span>}
                      {task.daysInStage != null && (
                        <span style={{ color: task.daysInStage > 7 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                          📅 {task.daysInStage}d in stage
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* PM Tasks Column */}
          {(activeTab === 'all' || activeTab === 'pm') && pmTasks.length > 0 && (
            <div className="task-column">
              <h3 className="task-column-header">🌆 PM Tasks — PPC Follow-ups</h3>
              {pmTasks.map(task => (
                <Link to={`/leads/${task.leadId}`} key={`pm-${task.leadId}`} className="task-card">
                  <div className="task-card-icon">{task.icon}</div>
                  <div className="task-card-body">
                    <div className="task-card-title">
                      <strong>{task.address}</strong>
                      <span className={`stage-badge stage-${task.stage.toLowerCase()}`}>
                        {STAGE_LABELS[task.stage]}
                      </span>
                    </div>
                    <div className="task-card-action">{task.action}</div>
                    <div className="task-card-meta">
                      {task.price && <span>💰 ${Number(task.price).toLocaleString()}</span>}
                      {task.daysInStage != null && (
                        <span style={{ color: task.daysInStage > 7 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                          📅 {task.daysInStage}d in stage
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Urgent Column */}
          {(activeTab === 'all' || activeTab === 'urgent') && (overdue48hr.length > 0 || followUpsDue.length > 0) && (
            <div className="task-column urgent-column">
              <h3 className="task-column-header urgent-header">🔴 Urgent — Action Required</h3>

              {overdue48hr.length > 0 && (
                <div className="urgent-subsection">
                  <h4>⏰ 48hr Follow-up Overdue</h4>
                  {overdue48hr.map(lead => (
                    <Link to={`/leads/${lead.id}`} key={`ov-${lead.id}`} className="task-card urgent-card">
                      <div className="task-card-icon">🔴</div>
                      <div className="task-card-body">
                        <div className="task-card-title">
                          <strong>{lead.address}</strong>
                        </div>
                        <div className="task-card-action">
                          48hr follow-up overdue — call now! Run realignment script.
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {followUpsDue.length > 0 && (
                <div className="urgent-subsection">
                  <h4>📅 Follow-ups Due Today</h4>
                  {followUpsDue.map(fu => (
                    <Link to={`/leads/${fu.lead_id}`} key={`fu-${fu.id}`} className="task-card followup-card">
                      <div className="task-card-icon">📅</div>
                      <div className="task-card-body">
                        <div className="task-card-title">
                          <strong>{fu.address}</strong>
                          <span className="reminder-type-badge">{fu.type?.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="task-card-action">
                          Due: {new Date(fu.due_date).toLocaleDateString()}
                          {fu.notes && ` — ${fu.notes}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {amTasks.length === 0 && pmTasks.length === 0 && overdue48hr.length === 0 && followUpsDue.length === 0 && (
          <div className="empty-tasks">
            <p>🎉 No tasks due today! All caught up.</p>
          </div>
        )}
      </div>

      {/* Legacy alerts section (keep for backward compat) */}
      {today && today.overdue_48hr?.length > 0 && false && (
        <div className="alerts">
          {today.overdue_48hr.map(l => (
            <div key={l.id} className="alert alert-red">
              🔴 48hr follow-up overdue: <Link to={`/leads/${l.id}`}>{l.address}</Link>
            </div>
          ))}
        </div>
      )}

      <div className="recent-leads">
        <h3>Recent Leads</h3>
        {leads.length === 0 ? (
          <div className="empty-state">No leads yet. Click "+ New Lead" to add your first property.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>City/State</th>
                <th>Stage</th>
                <th>Price</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}>
                  <td>
                    <Link to={`/leads/${lead.id}`} style={{ fontWeight: 600 }}>
                      {lead.address}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-tertiary)' }}>
                    {[lead.city, lead.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    <span className={`stage-badge stage-${lead.stage.toLowerCase()}`}>
                      {STAGE_LABELS[lead.stage] || lead.stage}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {lead.price ? `$${Number(lead.price).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                    {lead.source?.replace('_', ' ') || '—'}
                  </td>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                    {new Date(lead.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
