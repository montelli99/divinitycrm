import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { clearToken } from '../lib/api';
import { canViewTeam } from '../lib/access';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/pipeline', label: 'Pipeline', icon: PipelineIcon },
  { path: '/calculator', label: 'Calculator', icon: CalculatorIcon },
  { path: '/contracts', label: 'Contracts', icon: ContractsIcon },
  { path: '/training', label: 'Training', icon: TrainingIcon },
  { path: '/notifications', label: 'Notifications', icon: BellIcon },
  { path: '/profile', label: 'Profile', icon: ProfileIcon },
];

function IconShell({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="nav-icon-svg">
      {children}
    </svg>
  );
}

function DashboardIcon() {
  return (
    <IconShell>
      <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" fill="currentColor" />
    </IconShell>
  );
}

function PipelineIcon() {
  return (
    <IconShell>
      <path d="M5 5h4v14H5zM10 9h4v10h-4zM15 7h4v12h-4z" fill="currentColor" />
    </IconShell>
  );
}

function CalculatorIcon() {
  return (
    <IconShell>
      <rect x="5" y="4" width="14" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="7" y="6.25" width="10" height="2.5" rx="1" fill="currentColor" />
      <path d="M8 11h2M12 11h2M16 11h0M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2M16 17h0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconShell>
  );
}

function ContractsIcon() {
  return (
    <IconShell>
      <path d="M7 4h7l4 4v12H7z" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M14 4v4h4" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 11h6M9 14h5M9 17h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconShell>
  );
}

function TrainingIcon() {
  return (
    <IconShell>
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z" fill="currentColor" />
      <path d="M6 11v3.25c0 1.66 2.7 3.01 6 3.01s6-1.35 6-3.01V11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </IconShell>
  );
}

function BellIcon() {
  return (
    <IconShell>
      <path d="M12 4a5 5 0 0 0-5 5v2.4c0 .9-.26 1.79-.75 2.56L5 15.5h14l-1.25-1.54A4.67 4.67 0 0 1 17 11.4V9a5 5 0 0 0-5-5Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconShell>
  );
}

function ProfileIcon() {
  return (
    <IconShell>
      <circle cx="12" cy="8.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6.5 19c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconShell>
  );
}

function TeamDashboardIcon() {
  return (
    <IconShell>
      <path d="M4.5 16.5c1.2-2.4 3.1-3.5 5.1-3.5 1.4 0 2.8.5 3.8 1.5 1.3-1.2 3-1.9 4.8-1.9 1.8 0 3.4.7 4.3 1.8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8.2" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="15.8" cy="8.4" r="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </IconShell>
  );
}

function StudentFunnelIcon() {
  return (
    <IconShell>
      <path d="M6 6h12M8 12h8M10 18h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      <circle cx="18" cy="6" r="1.4" fill="currentColor" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" />
      <circle cx="16" cy="12" r="1.4" fill="currentColor" />
      <circle cx="10" cy="18" r="1.4" fill="currentColor" />
      <circle cx="14" cy="18" r="1.4" fill="currentColor" />
    </IconShell>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  let user = null;
  try {
    const userStr = localStorage.getItem('divinity_user');
    user = userStr ? JSON.parse(userStr) : null;
  } catch {
    user = null;
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem('divinity_sidebar_collapsed');
      if (stored === '1') {
        setSidebarCollapsed(true);
      } else if (stored === '0') {
        setSidebarCollapsed(false);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('divinity_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  const showTeamNav = canViewTeam(user);
  const TEAM_NAV_ITEMS = showTeamNav ? [
    { path: '/admin', label: 'Team Dashboard', icon: TeamDashboardIcon },
    { path: '/students', label: 'Student Funnel', icon: StudentFunnelIcon },
  ] : [];

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <h2>Divinity CRM</h2>
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>
          <div className="user-info">
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-primary), #818cf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: '700', fontSize: '0.8rem',
            }}>
              {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="user-meta">
              <div className="user-name">{user?.firstName || user?.email?.split('@')[0] || 'User'}</div>
              <div className="user-email">
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
                title={item.label}
                aria-label={item.label}
              >
                <item.icon />
                <span className="nav-text">{item.label}</span>
              </Link>
            </li>
          ))}
          {TEAM_NAV_ITEMS.map(item => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={location.pathname === item.path ? 'active' : ''}
                title={item.label}
                aria-label={item.label}
              >
                <item.icon />
                <span className="nav-text">{item.label}</span>
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
            title="Sign out"
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
          <div className="sidebar-footer-text" style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
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
