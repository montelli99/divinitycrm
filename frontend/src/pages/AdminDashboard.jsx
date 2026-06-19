import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STAGE_LABELS = {
  LEAD_ENTERED: 'Lead Entered', CONTACT_MADE: 'Contact Made', OFFER_READY: 'Offer Ready',
  OFFER_SENT: 'Offer Sent', GAIN_FEEDBACK: 'Offer Received', GAIN_FEEDBACK: 'Gain Feedback',
  SELLER_DECLINED: 'No Answer', SELLER_DECLINED: 'Seller Declined', ACTIVE_NEGOTIATION: 'Active Negotiation',
  TERMS_AGREED: 'Terms Agreed',
  PSA_SENT: 'Awaiting Title', PSA_SENT: 'Contract Out',
  UNDER_CONTRACT: 'Under Contract', INSPECTION_COMPLETE: 'Inspection Period', INSPECTION_COMPLETE: 'Inspection Complete',
  APPRAISAL_DONE: 'Appraisal Ordered', APPRAISAL_DONE: 'Appraisal Done',
  PSA_SENT: 'JV Sent', PSA_SENT: 'JV Signed',
  WIRE_SETUP: 'Wire Setup', CLOSING_DATE: 'Closing Date',
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const result = await api.getAdminDashboard();
        setData(result);
      } catch (err) {
        setError(err.message || 'Failed to load admin dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading">Loading admin dashboard...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="error">No data available.</div>;

  const { overall, students, stageDistribution, stalled, overdue48hr, recentActivity, sourceBreakdown } = data;

  return (
    <div className="admin-dashboard">
      <div className="page-header">
        <div>
          <h1>📊 Admin Dashboard</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            All students · All leads · Full visibility
          </p>
        </div>
      </div>

      {/* === OVERALL KPIs === */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-number">{overall.total_leads}</span>
          <span className="stat-label">Total Leads</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{overall.active}</span>
          <span className="stat-label">Active</span>
          {overall.added_today > 0 && (
            <span className="stat-trend up">+{overall.added_today} today</span>
          )}
        </div>
        <div className="stat-card">
          <span className="stat-number">{overall.closed}</span>
          <span className="stat-label">Closed Deals</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{overall.dead}</span>
          <span className="stat-label">Dead Leads</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{overall.conversion_rate}%</span>
          <span className="stat-label">Conversion Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">${Number(overall.pipeline_value || 0).toLocaleString()}</span>
          <span className="stat-label">Pipeline Value</span>
        </div>
        <div className="stat-card">
          <span className="stat-number" style={{ color: '#4ade80' }}>${Number(overall.estimated_profit || 0).toLocaleString()}</span>
          <span className="stat-label">Est. Profit</span>
        </div>
        {overall.avg_days_to_close && (
          <div className="stat-card">
            <span className="stat-number">{Math.round(overall.avg_days_to_close)}</span>
            <span className="stat-label">Avg Days to Close</span>
          </div>
        )}
      </div>

      {/* === STAGE DISTRIBUTION === */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
          📋 Pipeline Stage Distribution
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {stageDistribution.map(s => (
            <div key={s.stage} style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.3rem 0.6rem',
              fontSize: '0.72rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{STAGE_LABELS[s.stage] || s.stage}</span>
              <span style={{ fontWeight: '700', color: 'var(--brand-primary)' }}>{s.count}</span>
            </div>
          ))}
          {stageDistribution.length === 0 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>No active leads</span>
          )}
        </div>
      </div>

      {/* === PER-STUDENT TABLE === */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        marginBottom: '1rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
          👥 Student Pipeline ({students.length} students)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Total</th>
                <th>Active</th>
                <th>Offers</th>
                <th>Negotiating</th>
                <th>Contracts</th>
                <th>Closed</th>
                <th>Lost</th>
                <th>Conv.</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/students/${s.id}`} style={{ fontWeight: '600' }}>
                      {s.first_name || s.email?.split('@')[0]}
                    </Link>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{s.email}</div>
                  </td>
                  <td style={{ fontWeight: '600' }}>{s.total_leads}</td>
                  <td>{s.active_leads}</td>
                  <td style={{ color: s.offers_sent > 0 ? '#f59e0b' : 'var(--text-tertiary)' }}>{s.offers_sent}</td>
                  <td style={{ color: s.active_negotiations > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>{s.active_negotiations}</td>
                  <td style={{ color: s.under_contract > 0 ? '#8b5cf6' : 'var(--text-tertiary)' }}>{s.under_contract}</td>
                  <td style={{ color: '#4ade80', fontWeight: '600' }}>{s.deals_closed}</td>
                  <td style={{ color: '#fca5a5' }}>{s.deals_lost}</td>
                  <td>
                    <span style={{
                      color: s.conversion_rate >= 50 ? '#4ade80' : s.conversion_rate >= 25 ? '#f59e0b' : 'var(--text-tertiary)',
                      fontWeight: '600',
                    }}>{s.conversion_rate}%</span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {s.last_activity ? new Date(s.last_activity).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === ALERTS: Stalled + Overdue === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Stalled Leads */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem',
        }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: '600', margin: '0 0 0.5rem 0', color: '#f59e0b' }}>
            ⚠️ Stalled Leads ({stalled.length})
          </h3>
          {stalled.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>No stalled leads — pipeline is moving.</p>
          ) : (
            stalled.map(l => (
              <Link to={`/leads/${l.id}`} key={l.id} style={{
                display: 'block', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)',
                fontSize: '0.78rem', color: 'var(--text-primary)', textDecoration: 'none',
              }}>
                <strong>{l.address}</strong>
                <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>
                  {STAGE_LABELS[l.stage] || l.stage} · {l.days_stalled}d · {l.first_name || l.student_email}
                </span>
                {l.price > 0 && <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>${Number(l.price).toLocaleString()}</span>}
              </Link>
            ))
          )}
        </div>

        {/* Overdue 48hr */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem',
        }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: '600', margin: '0 0 0.5rem 0', color: '#ef4444' }}>
            🔴 48hr Follow-up Overdue ({overdue48hr.length})
          </h3>
          {overdue48hr.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>All follow-ups on track.</p>
          ) : (
            overdue48hr.map(l => (
              <Link to={`/leads/${l.id}`} key={l.id} style={{
                display: 'block', padding: '0.35rem 0', borderBottom: '1px solid var(--border-subtle)',
                fontSize: '0.78rem', color: '#fca5a5', textDecoration: 'none',
              }}>
                <strong>{l.address}</strong>
                <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>
                  {l.first_name || l.student_email} · Due: {new Date(l.follow_up_48hr_due).toLocaleDateString()}
                </span>
                {l.price > 0 && <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>${Number(l.price).toLocaleString()}</span>}
              </Link>
            ))
          )}
        </div>
      </div>

      {/* === SOURCE BREAKDOWN === */}
      {sourceBreakdown.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
            📈 Lead Sources
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {sourceBreakdown.map(s => (
              <div key={s.source} style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                display: 'flex', gap: '0.5rem', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                  {s.source?.replace(/_/g, ' ') || 'other'}
                </span>
                <span style={{ fontWeight: '700', color: 'var(--brand-primary)' }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === RECENT ACTIVITY === */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
      }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
          🕐 Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>No recent activity.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {recentActivity.slice(0, 15).map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0', borderBottom: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
              }}>
                <span style={{ color: 'var(--text-tertiary)', minWidth: '70px', fontSize: '0.7rem' }}>
                  {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.1rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                }}>{a.action?.replace(/_/g, ' ')}</span>
                {a.address && (
                  <Link to={`/leads/${a.lead_id}`} style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                    {a.address}
                  </Link>
                )}
                <span style={{ color: 'var(--text-tertiary)', marginLeft: 'auto', fontSize: '0.7rem' }}>
                  {a.first_name || a.student_email?.split('@')[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
