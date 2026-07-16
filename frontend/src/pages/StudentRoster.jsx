import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { canManageTeam, canViewTeam } from '../lib/access';

const TIER_COLORS = {
  Student_NCNDA: '#6366f1',
  Student_NDA: '#8b5cf6',
  Biweekly: '#06b6d4',
  Closer_NDA: '#f59e0b',
};

const STATUS_COLORS = {
  active: '#22c55e',
  paused: '#f59e0b',
  graduated: '#6366f1',
  cancelled: '#ef4444',
};

export default function StudentRoster() {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('divinity_user') || 'null');
    } catch {
      return null;
    }
  })();
  const teamVisible = canViewTeam(currentUser);
  const teamManageVisible = canManageTeam(currentUser);

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [vacationModal, setVacationModal] = useState(null);
  const [reassignModal, setReassignModal] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  useEffect(() => {
    loadRoster();
  }, []);

  async function loadRoster() {
    setLoading(true);
    try {
      const data = await api.getStudents();
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentDetail(id) {
    setDetailLoading(true);
    try {
      const data = await api.getStudentStats(id);
      setSelectedStudent(data);
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSetVacation(userId, data) {
    try {
      await api.setVacation(userId, data);
      setActionMsg({ type: 'success', text: 'Vacation mode set. Leads reassigned to substitute.' });
      setVacationModal(null);
      loadRoster();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    }
  }

  async function handleEndVacation(userId) {
    try {
      await api.endVacation(userId);
      setActionMsg({ type: 'success', text: 'Vacation mode ended. Leads returned.' });
      loadRoster();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    }
  }

  async function handleReassign(fromUserId, toUserId, reason) {
    try {
      await api.bulkReassign({ fromUserId, toUserId, reason });
      setActionMsg({ type: 'success', text: 'Bulk reassignment complete.' });
      setReassignModal(null);
      loadRoster();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading student roster...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fca5a5' }}>
        Error: {error}
        <button onClick={loadRoster} style={{ marginLeft: '1rem', color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>Student Funnel</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {students.length} team members · Track bottlenecks, assignments, and coverage
          </p>
          {teamVisible && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
              Team access enabled for owner, Kayla, and lead managers.
            </div>
          )}
        </div>
        <button
          onClick={loadRoster}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 1rem',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
          background: actionMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${actionMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: actionMsg.type === 'success' ? '#4ade80' : '#fca5a5',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Students', value: students.length, color: '#6366f1' },
          { label: 'Active', value: students.filter(s => s.student_status === 'active').length, color: '#22c55e' },
          { label: 'On Vacation', value: students.filter(s => s.vacation_mode).length, color: '#f59e0b' },
          { label: 'Total Closed', value: students.reduce((sum, s) => sum + (parseInt(s.deals_closed) || 0), 0), color: '#06b6d4' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{card.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Student table */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Total Leads</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}>Offers</th>
                <th style={thStyle}>Closed</th>
                <th style={thStyle}>Conv. %</th>
                <th style={thStyle}>Vacation</th>
                <th style={thStyle}>Last Activity</th>
            {teamManageVisible && <th style={thStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: '600' }}>{s.first_name} {s.last_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.email}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      background: `${TIER_COLORS[s.payment_tier] || '#666'}20`,
                      color: TIER_COLORS[s.payment_tier] || '#999',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      {s.payment_tier || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: STATUS_COLORS[s.student_status] || '#666',
                        display: 'inline-block',
                      }} />
                      {s.student_status || 'active'}
                    </span>
                  </td>
                  <td style={tdStyle}>{s.total_leads || 0}</td>
                  <td style={tdStyle}>{s.active_leads || 0}</td>
                  <td style={tdStyle}>{s.offers_sent || 0}</td>
                  <td style={tdStyle}>
                    <span style={{ color: '#22c55e', fontWeight: '600' }}>{s.deals_closed || 0}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: (s.conversion_rate || 0) >= 30 ? '#22c55e' : (s.conversion_rate || 0) >= 15 ? '#f59e0b' : 'var(--text-secondary)',
                      fontWeight: '600',
                    }}>
                      {s.conversion_rate || 0}%
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {s.vacation_mode ? (
                      <span style={{
                        background: 'rgba(245,158,11,0.15)',
                        color: '#f59e0b',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                      }}>
                        🌴 Until {s.coverage_end ? new Date(s.coverage_end).toLocaleDateString() : '—'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {s.last_activity ? new Date(s.last_activity).toLocaleDateString() : '—'}
                  </td>
                  {teamManageVisible && (
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => loadStudentDetail(s.id)}
                          style={actionBtnStyle}
                          title="View details"
                        >📋</button>
                        {s.vacation_mode ? (
                          <button
                            onClick={() => handleEndVacation(s.id)}
                            style={{ ...actionBtnStyle, color: '#22c55e' }}
                            title="End vacation"
                          >🔙</button>
                        ) : (
                          <button
                            onClick={() => setVacationModal(s)}
                            style={{ ...actionBtnStyle, color: '#f59e0b' }}
                            title="Set vacation"
                          >🌴</button>
                        )}
                        <button
                          onClick={() => setReassignModal(s)}
                          style={{ ...actionBtnStyle, color: '#6366f1' }}
                          title="Reassign leads"
                        >🔄</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={teamManageVisible ? 11 : 10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                    No students found. Students appear here when team members are assigned the "student", "closer", or "lead_manager" role.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Detail Panel */}
      {selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '480px',
          maxWidth: '90vw',
          height: '100vh',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 100,
          overflowY: 'auto',
          padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>
              {selectedStudent.student?.first_name} {selectedStudent.student?.last_name}
            </h2>
            <button onClick={() => setSelectedStudent(null)} style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '1.25rem',
            }}>×</button>
          </div>

          {detailLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</div>
          ) : (
            <>
              {/* Student info */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Profile</div>
                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  fontSize: '0.85rem',
                }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Email:</span> {selectedStudent.student?.email}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Role:</span> {selectedStudent.student?.role}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Tier:</span> {selectedStudent.student?.payment_tier || '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Status:</span> {selectedStudent.student?.student_status || 'active'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Start:</span> {selectedStudent.student?.start_date ? new Date(selectedStudent.student.start_date).toLocaleDateString() : '—'}</div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Markets:</span> {(selectedStudent.student?.assigned_markets || []).join(', ') || '—'}</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pipeline Stats</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.5rem',
                }}>
                  {[
                    { label: 'Total', value: selectedStudent.stats?.total_leads || 0 },
                    { label: 'Active', value: selectedStudent.stats?.active || 0 },
                    { label: 'Closed', value: selectedStudent.stats?.closed || 0 },
                    { label: 'Dead', value: selectedStudent.stats?.dead || 0 },
                    { label: 'Conv. Rate', value: `${selectedStudent.stats?.conversion_rate || 0}%` },
                    { label: 'Avg Days', value: selectedStudent.stats?.avg_days_to_close ? Math.round(selectedStudent.stats.avg_days_to_close) + 'd' : '—' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{stat.label}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage breakdown */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Stage Breakdown</div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
                  {(selectedStudent.stageStats || []).map(s => (
                    <div key={s.stage} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.3rem 0',
                      fontSize: '0.8rem',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <span>{s.stage?.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: '600' }}>{s.count}</span>
                    </div>
                  ))}
                  {(!selectedStudent.stageStats || selectedStudent.stageStats.length === 0) && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                      No leads yet
                    </div>
                  )}
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Recent Activity</div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {(selectedStudent.recentActivity || []).map(a => (
                    <div key={a.id} style={{
                      padding: '0.3rem 0',
                      fontSize: '0.78rem',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <span style={{ color: 'var(--brand-primary)' }}>{a.action?.replace(/_/g, ' ')}</span>
                      {a.address && <span style={{ color: 'var(--text-secondary)' }}> — {a.address}</span>}
                      <span style={{ color: 'var(--text-secondary)', float: 'right', fontSize: '0.7rem' }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {(!selectedStudent.recentActivity || selectedStudent.recentActivity.length === 0) && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                      No activity yet
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Vacation Modal */}
      {vacationModal && (
        <VacationModal
          student={vacationModal}
          students={students}
          onClose={() => setVacationModal(null)}
          onSubmit={(data) => handleSetVacation(vacationModal.id, data)}
        />
      )}

      {/* Reassign Modal */}
      {reassignModal && (
        <ReassignModal
          student={reassignModal}
          students={students}
          onClose={() => setReassignModal(null)}
          onSubmit={(toUserId, reason) => handleReassign(reassignModal.id, toUserId, reason)}
        />
      )}
    </div>
  );
}

function VacationModal({ student, students, onClose, onSubmit }) {
  const [substituteId, setSubstituteId] = useState('');
  const [coverageStart, setCoverageStart] = useState(new Date().toISOString().split('T')[0]);
  const [coverageEnd, setCoverageEnd] = useState('');
  const [reason, setReason] = useState('');

  const otherStudents = students.filter(s => s.id !== student.id && s.student_status === 'active' && !s.vacation_mode);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ substituteId: substituteId || null, coverageStart, coverageEnd, reason: reason || null });
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>🌴 Set Vacation Mode</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {student.first_name} {student.last_name} — Active leads will be reassigned to the substitute during coverage.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Substitute (optional)</label>
            <select value={substituteId} onChange={e => setSubstituteId(e.target.value)} style={inputStyle}>
              <option value="">— No substitute (leads stay) —</option>
              {otherStudents.map(s => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.email})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Coverage Start</label>
              <input type="date" value={coverageStart} onChange={e => setCoverageStart(e.target.value)} required style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Coverage End</label>
              <input type="date" value={coverageEnd} onChange={e => setCoverageEnd(e.target.value)} required style={inputStyle} />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reason (optional)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Vacation, sick leave, etc." style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" style={submitBtnStyle}>Set Vacation</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReassignModal({ student, students, onClose, onSubmit }) {
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');

  const otherStudents = students.filter(s => s.id !== student.id);

  function handleSubmit(e) {
    e.preventDefault();
    if (!toUserId) return;
    onSubmit(toUserId, reason || null);
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>🔄 Reassign Leads</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Move all active leads from {student.first_name} {student.last_name} to another student.
          Closed, dead, and archived leads are not moved.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reassign to</label>
            <select value={toUserId} onChange={e => setToUserId(e.target.value)} required style={inputStyle}>
              <option value="">— Select student —</option>
              {otherStudents.map(s => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.email}) — {s.active_leads || 0} active</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reason</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Graduation, removal, etc." style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" style={submitBtnStyle}>Reassign All</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Shared styles
const thStyle = {
  textAlign: 'left',
  padding: '0.65rem 0.75rem',
  fontWeight: '600',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.6rem 0.75rem',
  verticalAlign: 'middle',
};

const actionBtnStyle = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const modalStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',
  padding: '1.5rem',
  width: '420px',
  maxWidth: '90vw',
  boxShadow: 'var(--shadow-xl)',
};

const fieldStyle = { marginBottom: '0.75rem' };

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: '500',
  color: 'var(--text-secondary)',
  marginBottom: '0.3rem',
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '0.5rem 0.65rem',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const cancelBtnStyle = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '0.5rem 1rem',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const submitBtnStyle = {
  background: 'linear-gradient(135deg, var(--brand-primary), #6d7af7)',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: '600',
};
