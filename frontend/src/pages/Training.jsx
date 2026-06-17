import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Training() {
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTrainingModules()
      .then(data => {
        setModules(data.modules);
        // Auto-select first module
        if (data.modules.length > 0) {
          loadModule(data.modules[0].id);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadModule(id) {
    setLoading(true);
    try {
      const data = await api.getTrainingModule(id);
      setSelectedModule(data.module);
      setExpandedSections({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(idx) {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.25rem',
  };

  if (loading && !selectedModule) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading training modules...
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
          <span style={{ background: 'linear-gradient(135deg, var(--brand-primary), #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AI REI Training
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Master Playbook — Complete course curriculum from lead to close
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

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* Module Sidebar */}
        <div style={{
          width: '280px',
          flexShrink: 0,
          ...cardStyle,
          position: 'sticky',
          top: '1rem',
        }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modules
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {modules.map(m => (
              <button
                key={m.id}
                onClick={() => loadModule(m.id)}
                style={{
                  background: selectedModule?.id === m.id ? 'rgba(91,108,240,0.12)' : 'transparent',
                  border: selectedModule?.id === m.id ? '1px solid rgba(91,108,240,0.3)' : '1px solid transparent',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.75rem',
                  color: selectedModule?.id === m.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: selectedModule?.id === m.id ? '600' : '400',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '1rem' }}>{m.icon}</span>
                <span style={{ flex: 1 }}>{m.title}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{m.sectionCount}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Module Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading module...
            </div>
          )}

          {selectedModule && !loading && (
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {selectedModule.icon} {selectedModule.title}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {selectedModule.sections.length} sections
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedModule.sections.map((section, idx) => {
                  const isExpanded = expandedSections[idx];
                  return (
                    <div key={idx} style={{
                      ...cardStyle,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
                      <div
                        onClick={() => toggleSection(idx)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <h3 style={{
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          margin: 0,
                          color: isExpanded ? 'var(--brand-primary)' : 'var(--text-primary)',
                        }}>
                          {section.title}
                        </h3>
                        <span style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-tertiary)',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}>
                          ▶
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{
                          marginTop: '0.75rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {section.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
