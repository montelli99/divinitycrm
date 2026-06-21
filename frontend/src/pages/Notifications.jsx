import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const TYPE_ICONS = {
  loi_request: '📋',
  loi_ready: '📨',
  gain_feedback: '📞',
  counter_received: '⚔️',
  contract_draft: '📝',
  tc_handoff: '🤝',
  under_contract: '🔒',
  default: '🔔',
};

const TYPE_LABELS = {
  loi_request: 'LOI Request',
  loi_ready: 'LOI Ready',
  gain_feedback: 'Gain Feedback',
  counter_received: 'Counter Received',
  contract_draft: 'Contract Draft',
  tc_handoff: 'TC Handoff',
  under_contract: 'Under Contract',
};

const QUICK_LINKS = [
  { to: '/', label: 'Open Dashboard' },
  { to: '/pipeline', label: 'Open Pipeline' },
  { to: '/admin', label: 'Team Dashboard' },
  { to: '/students', label: 'Student Funnel' },
  { to: '/profile', label: 'Profile' },
];

export default function Notifications() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getNotifications(filter);
      setData(result);
    } catch (err) {
      console.error('Notifications load error:', err);
      setActionError(err.message || 'Failed to load communications inbox');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleMarkRead(id) {
    try {
      setActionError('');
      await api.markNotificationRead(id);
      load();
    } catch (err) {
      setActionError(err.message || 'Failed to mark notification read');
    }
  }

  async function handleMarkAllRead() {
    try {
      setActionError('');
      await api.markAllNotificationsRead();
      load();
    } catch (err) {
      setActionError(err.message || 'Failed to mark all read');
    }
  }

  async function handleArchive(id) {
    try {
      setActionError('');
      await api.archiveNotification(id);
      load();
    } catch (err) {
      setActionError(err.message || 'Failed to archive notification');
    }
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  }

  const stats = [
    { label: 'Unread', value: data.unreadCount, tone: '#f43f5e' },
    { label: 'Total', value: data.notifications.length, tone: '#6d7ef7' },
    { label: 'Needs Action', value: data.notifications.filter(n => !n.read_at).length, tone: '#f59e0b' },
    { label: 'Fresh Today', value: data.notifications.filter(n => Date.now() - new Date(n.created_at).getTime() < 86400000).length, tone: '#22c55e' },
  ];

  return (
    <div className="communications-page">
      <div style={{
        background: 'linear-gradient(135deg, rgba(91,108,240,0.18), rgba(15,23,42,0.96))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a5b4fc', fontWeight: '700' }}>Communications Center</div>
            <h1 style={{ marginTop: '0.35rem', fontSize: '1.85rem', marginBottom: '0.2rem' }}>Inbox</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Team alerts, handoffs, and follow-up reminders in one premium queue.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {data.unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✓ Mark all read
              </button>
            )}
            <Link to="/pipeline" style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 1rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              textDecoration: 'none',
            }}>Open pipeline</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: `1px solid color-mix(in srgb, ${stat.tone} 25%, var(--border-subtle))`,
              borderRadius: 'var(--radius-lg)',
              padding: '0.85rem 1rem',
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700' }}>{stat.label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: stat.tone, marginTop: '0.15rem' }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {actionError && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'Inbox', count: data.notifications.length },
          { key: 'unread', label: 'Unread', count: data.unreadCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: filter === tab.key ? 'var(--brand-primary)' : 'var(--bg-secondary)',
              color: filter === tab.key ? 'white' : 'var(--text-secondary)',
              border: '1px solid ' + (filter === tab.key ? 'var(--brand-primary)' : 'var(--border-subtle)'),
              borderRadius: '999px',
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {tab.label}
            <span style={{
              background: filter === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary)',
              color: filter === tab.key ? 'white' : 'var(--text-secondary)',
              borderRadius: '999px',
              padding: '0.05rem 0.45rem',
              fontSize: '0.7rem',
              fontWeight: '700',
              minWidth: '1.3rem',
              textAlign: 'center',
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 0.9fr)', gap: '1rem', alignItems: 'start' }}>
        <section>
          {loading ? (
            <div className="loading">Loading notifications...</div>
          ) : data.notifications.length === 0 ? (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xl)',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No notifications</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {filter === 'unread' ? 'You\'re all caught up.' : 'Pipeline activity will appear here.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.notifications.map(n => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    style={{
                      background: isUnread ? 'linear-gradient(135deg, rgba(91,108,240,0.08), rgba(17,20,31,0.95))' : 'var(--bg-secondary)',
                      border: '1px solid ' + (isUnread ? 'rgba(91,108,240,0.28)' : 'var(--border-subtle)'),
                      borderRadius: 'var(--radius-xl)',
                      padding: '0.95rem 1rem',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      transition: 'all 0.15s',
                      cursor: n.action_url ? 'pointer' : 'default',
                      boxShadow: isUnread ? '0 10px 30px rgba(0,0,0,0.18)' : 'none',
                    }}
                    onClick={() => {
                      if (isUnread) handleMarkRead(n.id);
                      if (n.action_url) setTimeout(() => { window.location.href = n.action_url; }, 100);
                    }}
                  >
                    <div style={{
                      width: '2.3rem',
                      height: '2.3rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(91,108,240,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      lineHeight: 1,
                      flex: '0 0 auto',
                      color: 'var(--brand-primary)',
                    }}>
                      {TYPE_ICONS[n.type] || TYPE_ICONS.default}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase' }}>
                          {TYPE_LABELS[n.type] || n.type}
                        </span>
                        {isUnread && (
                          <span style={{ width: '6px', height: '6px', background: 'var(--brand-primary)', borderRadius: '50%', display: 'inline-block' }} />
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.92rem',
                        fontWeight: isUnread ? '700' : '500',
                        color: 'var(--text-primary)',
                        marginBottom: '0.25rem',
                      }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {n.body}
                      </div>
                      {n.action_label && (
                        <div style={{ marginTop: '0.55rem' }}>
                          <span style={{ color: 'var(--brand-primary)', fontSize: '0.78rem', fontWeight: '600' }}>
                            {n.action_label} →
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                      {!isUnread && (
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          title="Mark as read"
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.7rem',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          ✓ Read
                        </button>
                      )}
                      <button
                        onClick={() => handleArchive(n.id)}
                        title="Archive"
                        style={{
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--text-tertiary)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: '700' }}>Quick Actions</div>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {QUICK_LINKS.map(action => (
                <Link
                  key={action.to}
                  to={action.to}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.65rem 0.85rem',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                  }}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(91,108,240,0.08))', border: '1px solid rgba(91,108,240,0.18)', borderRadius: 'var(--radius-xl)', padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bfdbfe', fontWeight: '700' }}>Communication Flow</div>
            <div style={{ marginTop: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
              This inbox collects stage-triggered alerts, handoffs, and follow-up reminders. Use the quick actions to jump back into production work.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
