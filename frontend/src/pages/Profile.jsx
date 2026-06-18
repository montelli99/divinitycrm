import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [schedulingLink, setSchedulingLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
    // Check for Google callback redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      setMessage('✅ Google account connected successfully!');
      window.history.replaceState({}, '', '/profile');
    } else if (params.get('google') === 'error') {
      setMessage('❌ Google connection failed: ' + (params.get('message') || 'Unknown error'));
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  async function loadProfile() {
    try {
      const [userData, googleData] = await Promise.all([
        api.getMe(),
        api.getGoogleStatus().catch(() => ({ connected: false })),
      ]);
      setUser(userData.user || userData);
      setGoogleStatus(googleData);
      setSchedulingLink(userData.user?.scheduling_link || userData.scheduling_link || '');
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGoogle() {
    setConnecting(true);
    setMessage('');
    try {
      const { url } = await api.getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      setMessage('❌ Failed to start Google connection: ' + err.message);
      setConnecting(false);
    }
  }

  async function handleDisconnectGoogle() {
    if (!confirm('Disconnect your Google account? You will lose Gmail and Calendar access.')) return;
    setDisconnecting(true);
    try {
      await api.disconnectGoogle();
      setGoogleStatus({ connected: false });
      setMessage('Google account disconnected.');
    } catch (err) {
      setMessage('❌ ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveScheduling() {
    setSaving(true);
    setMessage('');
    try {
      await api.updateMe({ scheduling_link: schedulingLink });
      setMessage('✅ Scheduling link saved.');
    } catch (err) {
      setMessage('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading profile...</div>;

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1>Profile & Integrations</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
          Connect your accounts to unlock full CRM functionality
        </p>
      </div>

      {message && (
        <div style={{
          background: message.startsWith('✅') ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          border: `1px solid ${message.startsWith('✅') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          color: message.startsWith('✅') ? '#4ade80' : '#fca5a5',
          fontSize: '0.85rem',
        }}>
          {message}
        </div>
      )}

      {/* Google Integration Card */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔗</span>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>Google Account</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              Connect Gmail for sending emails and Calendar for scheduling with Google Meet
            </p>
          </div>
        </div>

        {googleStatus?.connected ? (
          <div>
            <div style={{
              background: 'var(--success-subtle)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <span style={{ fontSize: '1.25rem' }}>✅</span>
              <div>
                <div style={{ fontWeight: '600', color: '#4ade80', fontSize: '0.9rem' }}>
                  Connected as {googleStatus.email}
                </div>
                {googleStatus.name && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {googleStatus.name}
                  </div>
                )}
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                  Gmail send · Calendar events · Google Meet
                </div>
              </div>
            </div>
            <button
              onClick={handleDisconnectGoogle}
              disabled={disconnecting}
              style={{
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                cursor: disconnecting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect Google'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectGoogle}
            disabled={connecting}
            style={{
              background: 'white',
              border: '1px solid #dadce0',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 1.25rem',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: connecting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#3c4043',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {connecting ? 'Connecting...' : 'Connect Google Account'}
          </button>
        )}

        <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
          We request access to send emails as you and create calendar events with Google Meet.
          Your credentials are never stored — only secure OAuth tokens.
        </div>
      </div>

      {/* Scheduling Link Card */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>📅</span>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>Scheduling Link</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              Your Calendly or Google Calendar appointment link — shown to sellers for booking calls
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <input
            type="url"
            value={schedulingLink}
            onChange={e => setSchedulingLink(e.target.value)}
            placeholder="https://calendly.com/yourname/30min or Google appointment schedule link"
            style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSaveScheduling}
            disabled={saving}
            style={{
              background: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 1.25rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Account Info Card */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Account Info</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-tertiary)', minWidth: '80px' }}>Email:</span>
            <span style={{ color: 'var(--text-primary)' }}>{user?.email || '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-tertiary)', minWidth: '80px' }}>Name:</span>
            <span style={{ color: 'var(--text-primary)' }}>{user?.first_name ? `${user.first_name} ${user.last_name || ''}` : '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-tertiary)', minWidth: '80px' }}>Role:</span>
            <span style={{ color: 'var(--text-primary)' }}>{user?.role || 'Student'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
