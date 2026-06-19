import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const TRAINING_TABS = [
  { id: 'modules', label: 'Course Modules', icon: '📚' },
  { id: 'underwriting', label: 'Underwriting (Seth)', icon: '📊' },
  { id: 'handoff', label: 'When to Hand Off to Kayla', icon: '🤝' },
  { id: 'stages', label: 'My Stages', icon: '📋' },
];

export default function Training() {
  const [activeTab, setActiveTab] = useState('modules');
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [underwriting, setUnderwriting] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [stages, setStages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.getTrainingModules().catch(() => ({ modules: [] })),
      api.getUnderwritingDocs().catch(() => null),
      api.getHandoffDocs().catch(() => null),
      api.getStageDocs().catch(() => null),
    ]).then(([modData, uwData, hoData, stData]) => {
      setModules(modData.modules || []);
      setUnderwriting(uwData);
      setHandoff(hoData);
      setStages(stData);
      if (modData.modules && modData.modules.length > 0) loadModule(modData.modules[0].id);
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadModule(id) {
    try {
      const data = await api.getTrainingModule(id);
      setSelectedModule(data.module);
      setExpandedSections({});
    } catch (err) { setError(err.message); }
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

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading training...
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
          Master Playbook — Underwriting, handoff protocol, and Montelli-only stages
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        {TRAINING_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? 'var(--brand-primary)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
              border: '1px solid ' + (activeTab === tab.id ? 'var(--brand-primary)' : 'var(--border-subtle)'),
              borderRadius: 'var(--radius-md)',
              padding: '0.45rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
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

      {/* === COURSE MODULES TAB === */}
      {activeTab === 'modules' && (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div style={{ width: '280px', flexShrink: 0, ...cardStyle, position: 'sticky', top: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Modules
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {modules.map(m => (
                <button key={m.id} onClick={() => loadModule(m.id)}
                  style={{
                    background: selectedModule?.id === m.id ? 'rgba(91,108,240,0.12)' : 'transparent',
                    border: selectedModule?.id === m.id ? '1px solid rgba(91,108,240,0.3)' : '1px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.6rem 0.75rem',
                    color: selectedModule?.id === m.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: selectedModule?.id === m.id ? '600' : '400',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                  <span style={{ fontSize: '1rem' }}>{m.icon}</span>
                  <span style={{ flex: 1 }}>{m.title}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{m.sectionCount}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedModule && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>
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
                      <div key={idx} style={{ ...cardStyle, cursor: 'pointer' }}>
                        <div onClick={() => toggleSection(idx)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{
                            fontSize: '0.9rem', fontWeight: '600', margin: 0,
                            color: isExpanded ? 'var(--brand-primary)' : 'var(--text-primary)',
                          }}>
                            {section.title}
                          </h3>
                          <span style={{
                            fontSize: '0.8rem', color: 'var(--text-tertiary)',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                          }}>▶</span>
                        </div>
                        {isExpanded && (
                          <div style={{
                            marginTop: '0.75rem', paddingTop: '0.75rem',
                            borderTop: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)', fontSize: '0.85rem',
                            lineHeight: '1.7', whiteSpace: 'pre-wrap',
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
      )}

      {/* === UNDERWRITING TAB === */}
      {activeTab === 'underwriting' && underwriting && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📊 {underwriting.title}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem', margin: '0.4rem 0 0 0' }}>
              <strong>Source:</strong> {underwriting.source}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
              {underwriting.purpose}
            </p>
          </div>

          {underwriting.sections.map((section, idx) => (
            <div key={idx} style={{ ...cardStyle, marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: 'var(--brand-primary)' }}>
                {section.title}
              </h3>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '0 0 0.75rem 0' }}>
                {section.subtitle}
              </p>

              {section.points && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {section.points.map((p, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.6rem 0.85rem',
                      fontSize: '0.82rem',
                    }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>— {p.check}</span>
                    </div>
                  ))}
                </div>
              )}

              {section.rules && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {section.rules.map((r, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.6rem 0.85rem',
                      fontSize: '0.82rem',
                    }}>
                      <strong style={{ color: 'var(--brand-primary)' }}>{r.type}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>— {r.structure}</span>
                    </div>
                  ))}
                </div>
              )}

              {section.process && (
                <ol style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.7' }}>
                  {section.process.map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              )}

              {section.steps && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {section.steps.map((s, i) => (
                    <div key={i} style={{ fontSize: '0.82rem', display: 'flex', gap: '0.5rem' }}>
                      <span style={{
                        background: 'var(--brand-primary)', color: 'white',
                        borderRadius: '50%', width: '20px', height: '20px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: '700', flexShrink: 0, marginTop: '0.1rem',
                      }}>{s.step}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{s.action}</span>
                    </div>
                  ))}
                </div>
              )}

              {section.signals && (
                <div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.7' }}>
                    {section.signals.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                  <p style={{
                    marginTop: '0.75rem', fontSize: '0.82rem',
                    background: 'var(--success-subtle)', border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: 'var(--radius-md)', padding: '0.6rem 0.85rem', color: '#4ade80',
                  }}>
                    <strong>Student action:</strong> {section.studentAction}
                  </p>
                </div>
              )}

              {section.structure && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '0.85rem', fontSize: '0.82rem', lineHeight: '1.7' }}>
                  {Object.entries(section.structure).map(([k, v]) => (
                    <div key={k} style={{ marginBottom: '0.25rem' }}>
                      <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').trim()}:</strong>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {section.rules && section.title.includes('Walk') && (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#fca5a5', fontSize: '0.82rem', lineHeight: '1.7' }}>
                  {section.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* === HANDOFF TAB === */}
      {activeTab === 'handoff' && handoff && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '1rem', borderLeft: '4px solid #ef4444' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>🤝 {handoff.title}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
              <strong>Source:</strong> {handoff.source}
            </p>
            <div style={{
              marginTop: '0.75rem', background: 'var(--danger-subtle)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)',
              padding: '0.85rem', fontSize: '0.85rem', color: '#fca5a5',
            }}>
              <strong>🔑 KEY PRINCIPLE:</strong> {handoff.keyPrinciple}
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.75rem 0' }}>
              📋 Per-Stage Ownership
            </h3>
            {handoff.stages.map((s, i) => (
              <div key={i} style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: '0.7rem 0.85rem',
                marginBottom: '0.5rem',
                fontSize: '0.82rem',
                borderLeft: '3px solid ' + (s.owner.includes('Kayla') ? '#a78bfa' : s.owner.includes('TC') ? '#f59e0b' : s.owner.includes('Montelli') ? '#5b6cf0' : 'var(--text-tertiary)'),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{
                    background: 'var(--brand-primary)', color: 'white',
                    padding: '0.1rem 0.5rem', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.7rem', fontWeight: '700',
                  }}>{s.stage}</span>
                  <span style={{ color: 'var(--brand-primary)', fontSize: '0.78rem', fontWeight: '600' }}>
                    Owner: {s.owner}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.action}</div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.75rem 0' }}>
              📞 Seller Monitoring Script (Every 3-5 Days Post-Terms)
            </h3>
            {Object.entries(handoff.sellerMonitoringScript).map(([k, v]) => (
              <div key={k} style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 0.85rem',
                marginBottom: '0.4rem',
                fontSize: '0.82rem',
              }}>
                <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {k.replace(/([A-Z])/g, ' $1').trim()}:
                </strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === MY STAGES TAB === */}
      {activeTab === 'stages' && stages && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '1rem', borderLeft: '4px solid #4ade80' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📋 {stages.title}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
              <strong>Source:</strong> {stages.source}
            </p>
            <div style={{
              marginTop: '0.75rem', background: 'var(--success-subtle)',
              border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--radius-md)',
              padding: '0.85rem', fontSize: '0.82rem', color: '#4ade80',
            }}>
              💡 {stages.note}
            </div>
          </div>

          <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.75rem 0' }}>
              👥 Who Moves What
            </h3>
            {stages.whoMovesWhat.map((w, i) => (
              <div key={i} style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 0.85rem',
                marginBottom: '0.4rem',
                fontSize: '0.82rem',
              }}>
                <strong style={{ color: 'var(--brand-primary)' }}>{w.who}:</strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>{w.stages}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', margin: '0 0 0.75rem 0' }}>
            🎯 My Stages (Montelli-only)
          </h3>
          {stages.montelliStages.map((s, i) => (
            <div key={i} style={{ ...cardStyle, marginBottom: '0.5rem', borderLeft: '3px solid #5b6cf0' }}>
              <div style={{
                display: 'inline-block', background: 'var(--brand-primary)', color: 'white',
                padding: '0.15rem 0.6rem', borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.5rem',
              }}>{s.stage}</div>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: 1.65, margin: 0 }}>
                {s.action}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
