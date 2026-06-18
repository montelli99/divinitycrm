import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const TYPE_ICONS = {
  loi_request: '📋',
  loi_ready: '📨',
  offer_received: '✉️',
  counter_received: '⚔️',
  contract_draft: '📝',
  tc_handoff: '🤝',
  under_contract: '🔒',
  default: '🔔',
};

const TYPE_LABELS = {
  loi_request: 'LOI Request',
  loi_ready: 'LOI Ready',
  offer_received: 'Offer Received',
  counter_received: 'Counter Received',
  contract_draft: 'Contract Draft',
  tc_handoff: 'TC Handoff',
  under_contract: 'Under Contract',
};

export default function Notifications() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await api.getNotifications(filter);
      setData(result);
    } catch (err) {
      console.error('Notifications load error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [load]);

  async function handleMarkRead(id) {
    await api.markNotificationRead(id);
    load();
  }

  async function handleMarkAllRead() {
    await api.markAllNotificationsRead();
    load();
  }

  async function handleArchive(id) {
    await api.archiveNotification(id);
    load();
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="notifications-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>🔔 Notifications</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {data.unreadCount > 0 ? `${data.unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {data.unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              background: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 1rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✓ Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        {[
          { key: 'all', label: 'All', count: data.notifications.length },
          { key: 'unread', label: 'Unread', count: data.unreadCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: filter === tab.key ? 'var(--brand-primary)' : 'transparent',
              color: filter === tab.key ? 'white' : 'var(--text-secondary)',
              border: '1px solid ' + (filter === tab.key ? 'var(--brand-primary)' : 'var(--border-subtle)'),
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: filter === tab.key ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)',
                borderRadius: '10px',
                padding: '0.05rem 0.4rem',
                fontSize: '0.7rem',
                fontWeight: '700',
                minWidth: '18px',
                textAlign: 'center',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading ? (
        <div className="loading">Loading notifications...</div>
      ) : data.notifications.length === 0 ? (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>No notifications</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            {filter === 'unread' ? 'You\'re all caught up.' : 'Pipeline activity will appear here.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.notifications.map(n => {
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                style={{
                  background: isUnread ? 'rgba(91,108,240,0.06)' : 'var(--bg-secondary)',
                  border: '1px solid ' + (isUnread ? 'rgba(91,108,240,0.25)' : 'var(--border-subtle)'),
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  transition: 'all 0.15s',
                  cursor: n.action_url ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (isUnread) handleMarkRead(n.id);
                  if (n.action_url) {
                    setTimeout(() => window.location.href = n.action_url, 100);
                  }
                }}
              >
                {/* Icon */}
                <div style={{
                  fontSize: '1.5rem',
                  minWidth: '32px',
                  textAlign: 'center',
                  lineHeight: 1,
                }}>
                  {TYPE_ICONS[n.type] || TYPE_ICONS.default}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase' }}>
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    {isUnread && (
                      <span style={{
                        width: '6px',
                        height: '6px',
                        background: 'var(--brand-primary)',
                        borderRadius: '50%',
                        display: 'inline-block',
                      }} />
                    )}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                      {formatTime(n.created_at)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.88rem',
                    fontWeight: isUnread ? '600' : '500',
                    color: 'var(--text-primary)',
                    marginBottom: '0.25rem',
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                  }}>
                    {n.body}
                  </div>
                  {n.action_label && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{
                        color: 'var(--brand-primary)',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                      }}>
                        {n.action_label} →
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                  {!isUnread && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      title="Mark as read"
                      style={{
                        background: 'transparent',
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
                      background: 'transparent',
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
    </div>
  );
}