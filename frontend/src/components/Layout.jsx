import { Outlet, Link, useLocation } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/pipeline', label: 'Pipeline', icon: '🔄' },
  { path: '/contracts', label: 'Contracts', icon: '📝' },
];

export default function Layout() {
  const { user } = useUser();
  const location = useLocation();

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Divinity CRM</h2>
          <div className="user-info">
            <UserButton afterSignOutUrl="/sign-in" />
            <div>
              <div className="user-name">{user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Student'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                {user?.primaryEmailAddress?.emailAddress}
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
          fontSize: '0.7rem',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
        }}>
          AI REI Divinity CRM v1.0
        </div>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

