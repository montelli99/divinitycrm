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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLead, setNewLead] = useState({ address: '', city: '', state: '', price: '', source: 'other', beds: '', baths: '', sqft: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, todayData, leadsData] = await Promise.all([
          api.getStats(),
          api.getToday(),
          api.getLeads({ limit: 10 }),
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
      const [leadsData, statsData] = await Promise.all([api.getLeads({ limit: 10 }), api.getStats()]);
      setLeads(leadsData.leads);
      setStats(statsData);
    } catch (err) {
      alert('Failed to create lead: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="loading">Loading dashboard...</div>;

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

      {today && today.follow_ups_due?.length > 0 && (
        <div className="alert-section">
          <h3>⏰ Due Today</h3>
          {today.follow_ups_due.map(r => (
            <div key={r.id} className="alert-item">
              <span className="reminder-type">{r.type}</span>
              <Link to={`/leads/${r.lead_id}`}>{r.address}</Link>
              <span className="reminder-date">{new Date(r.due_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {today && today.overdue_48hr?.length > 0 && (
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

