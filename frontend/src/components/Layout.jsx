import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/api';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/pipeline', label: 'Pipeline', icon: '📋' },
  { path: '/calculator', label: 'Calculator', icon: '🧮' },
  { path: '/contracts', label: 'Contracts', icon: '📝' },
  { path: '/training', label: 'Training', icon: '📚' },
  { path: '/profile', label: 'Profile', icon: '⚙️' },
];

const ADMIN_NAV_ITEMS = [
  { path: '/admin', label: 'Admin Dashboard', icon: '📊' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const userStr = localStorage.getItem('divinity_user');
  const user = userStr ? JSON.parse(userStr) : null;

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Divinity CRM</h2>
          <div className="user-info">
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-primary), #818cf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: '700', fontSize: '0.8rem',
            }}>
              {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div className="user-name">{user?.firstName || user?.email?.split('@')[0] || 'User'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                {user?.email}
              </div>
            </div>
          </div>
        </div>

        <ul className="nav-links">
          {NAV_ITEMS.map(item => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={location.pathname === item.path ? 'active' : ''}
              >
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div style={{
          marginTop: 'auto',
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            Divinity CRM v1.0
          </div>
        </div>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
