import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import LeadDetail from './pages/LeadDetail';
import Pipeline from './pages/Pipeline';
import Contracts from './pages/Contracts';
import Calculator from './pages/Calculator';
import Training from './pages/Training';
import StudentRoster from './pages/StudentRoster';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Teleprompter from './pages/Teleprompter';
import BulkImport from './pages/BulkImport';
import Layout from './components/Layout';
import { api, getToken, setToken, clearToken } from './lib/api';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      localStorage.setItem('divinity_user', JSON.stringify(result.user));
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #111827, #0a0c14)',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,108,240,0.08)',
      }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #5b6cf0, #818cf8, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            boxShadow: '0 8px 24px rgba(91,108,240,0.35)',
          }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white' }}>D</span>
          </div>
          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: '800',
            marginBottom: '0.15rem',
            background: 'linear-gradient(135deg, #f0f2f8, #a8aec6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>Divinity CRM</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
            Student Pipeline Platform
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-subtle)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}>{error}</div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.85rem',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.85rem',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--brand-primary), #6d7af7)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.7rem',
              fontSize: '0.9rem',
              fontWeight: '600',
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(91,108,240,0.3)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/bulk-import" element={<BulkImport />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/training" element={<Training />} />
        <Route path="/students" element={<StudentRoster />} />
        <Route path="/teleprompter/:leadId?" element={<Teleprompter />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
