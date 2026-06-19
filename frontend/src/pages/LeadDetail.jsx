import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import ScriptPromptModal from '../components/ScriptPromptModal';
import { STAGES, STAGE_LABELS, getOwnerForStage } from '../lib/pipeline-stages';

const CONTRACT_TYPES = ['subto', 'cash', 'seller_finance', 'stack50', 'stack10', 'jv', 'commercial', 'portfolio'];

const TAB_NAMES = {
  details: 'Details',
  scripts: 'Scripts',
  history: 'History',
  notes: 'Notes',
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [history, setHistory] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractType, setContractType] = useState('subto');
  const [contractResult, setContractResult] = useState(null);
  const [scriptResult, setScriptResult] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getLead(id);
        setLead(data.lead);
        setHistory(data.history);
        setReminders(data.reminders);
        setEditData(data.lead);
        // Load user profile for scheduling link
        const profile = await api.getMe().catch(() => null);
        setUserProfile(profile?.user || profile);
      } catch (err) {
        console.error('Lead load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleStageChange(newStage) {
    try {
      const result = await api.updateLead(id, { stage: newStage });
      setLead(result.lead);
      // Refresh history
      const data = await api.getLead(id);
      setHistory(data.history);
    } catch (err) {
      alert('Failed to update stage: ' + err.message);
    }
  }

  async function handleSave() {
    try {
      const result = await api.updateLead(id, editData);
      setLead(result.lead);
      setEditing(false);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function handleGenerateContract() {
    setGeneratingContract(true);
    try {
      const result = await api.generateContract({ lead_id: id, contract_type: contractType });
      setContractResult(result);
      // Refresh lead (stage updated to UNDER_CONTRACT)
      const data = await api.getLead(id);
      setLead(data.lead);
      setHistory(data.history);
    } catch (err) {
      alert('Contract generation failed: ' + err.message);
    } finally {
      setGeneratingContract(false);
    }
  }

  async function handleFillScript(scriptId) {
    try {
      const result = await api.fillScript({ script_id: scriptId, lead_id: id });
      setScriptResult(result);
    } catch (err) {
      alert('Script fill failed: ' + err.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await api.deleteLead(id);
      navigate('/');
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  if (loading) return <div className="loading">Loading lead...</div>;
  if (!lead) return <div className="error">Lead not found.</div>;

  return (
    <div className="lead-detail">
      <div className="page-header">
        <h1>{lead.address}</h1>
        <div className="header-actions">
          <button
            onClick={() => navigate(`/teleprompter?lead_id=${id}&stage=${lead.stage}`)}
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#000',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
            title="Open script for this lead's current stage"
          >
            🎙️ Open in Teleprompter
          </button>
          <select 
            value={lead.stage} 
            onChange={e => handleStageChange(e.target.value)}
            className="stage-select"
          >
            {STAGES.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {editing ? (
        <div className="edit-form">
          <h3>Edit Lead</h3>
          <div className="form-grid">
            <label>Address <input value={editData.address || ''} onChange={e => setEditData({...editData, address: e.target.value})} /></label>
            <label>City <input value={editData.city || ''} onChange={e => setEditData({...editData, city: e.target.value})} /></label>
            <label>State <input value={editData.state || ''} onChange={e => setEditData({...editData, state: e.target.value})} /></label>
            <label>Price <input type="number" value={editData.price || ''} onChange={e => setEditData({...editData, price: e.target.value})} /></label>
            <label>Beds <input type="number" value={editData.beds || ''} onChange={e => setEditData({...editData, beds: e.target.value})} /></label>
            <label>Baths <input type="number" value={editData.baths || ''} onChange={e => setEditData({...editData, baths: e.target.value})} /></label>
            <label>Sqft <input type="number" value={editData.sqft || ''} onChange={e => setEditData({...editData, sqft: e.target.value})} /></label>
            <label>Agent Name <input value={editData.agent_name || ''} onChange={e => setEditData({...editData, agent_name: e.target.value})} /></label>
            <label>Agent Phone <input value={editData.agent_phone || ''} onChange={e => setEditData({...editData, agent_phone: e.target.value})} /></label>
            <label>Agent Email <input value={editData.agent_email || ''} onChange={e => setEditData({...editData, agent_email: e.target.value})} /></label>
            <label>Monthly Rent <input type="number" value={editData.monthly_rent || ''} onChange={e => setEditData({...editData, monthly_rent: e.target.value})} /></label>
            <label>ARV <input type="number" value={editData.arv || ''} onChange={e => setEditData({...editData, arv: e.target.value})} /></label>
            <label>Notes <textarea value={editData.notes || ''} onChange={e => setEditData({...editData, notes: e.target.value})} /></label>
          </div>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      ) : (
        <>
          <div className="lead-sections">
            <div className="lead-section">
              <h3>Property</h3>
              <dl>
                <dt>Address</dt><dd>{lead.address}</dd>
                <dt>City/State</dt><dd>{lead.city}, {lead.state} {lead.zip}</dd>
                <dt>Price</dt><dd>{lead.price ? `$${Number(lead.price).toLocaleString()}` : '—'}</dd>
                <dt>Beds/Baths</dt><dd>{lead.beds || '—'} / {lead.baths || '—'}</dd>
                <dt>Sqft</dt><dd>{lead.sqft ? `${lead.sqft.toLocaleString()} sqft` : '—'}</dd>
                <dt>Year Built</dt><dd>{lead.year_built || '—'}</dd>
                <dt>Condition</dt><dd>{lead.condition || '—'}</dd>
              </dl>
            </div>

            <div className="lead-section">
              <h3>Contacts</h3>
              <dl>
                <dt>Agent</dt><dd>{lead.agent_name || '—'}</dd>
                <dt>Agent Phone</dt><dd>{lead.agent_phone || '—'}</dd>
                <dt>Agent Email</dt><dd>{lead.agent_email || '—'}</dd>
                <dt>Seller</dt><dd>{lead.seller_name || '—'}</dd>
                <dt>Seller Phone</dt><dd>{lead.seller_phone || '—'}</dd>
                <dt>Seller Email</dt><dd>{lead.seller_email || '—'}</dd>
              </dl>
            </div>

            <div className="lead-section">
              <h3>Underwriting</h3>
              <dl>
                <dt>ARV</dt><dd>{lead.arv ? `$${Number(lead.arv).toLocaleString()}` : '—'}</dd>
                <dt>Monthly Rent</dt><dd>{lead.monthly_rent ? `$${Number(lead.monthly_rent).toLocaleString()}` : '—'}</dd>
                <dt>1% Rule</dt><dd>{lead.one_percent_rule === true ? '✅ Pass' : lead.one_percent_rule === false ? '❌ Fail' : '—'}</dd>
                <dt>Repairs Est</dt><dd>{lead.repairs_estimate ? `$${Number(lead.repairs_estimate).toLocaleString()}` : '—'}</dd>
                <dt>Existing Loan</dt><dd>{lead.existing_loan_balance > 0 ? `$${Number(lead.existing_loan_balance).toLocaleString()}` : '—'}</dd>
                <dt>Recommended Strategy</dt><dd>{lead.recommended_strategy || '—'}</dd>
              </dl>
            </div>

            {lead.stage === 'UNDER_CONTRACT' && (
              <div className="lead-section">
                <h3>Contract</h3>
                <dl>
                  <dt>Type</dt><dd>{lead.contract || '—'}</dd>
                  <dt>PSA Signed</dt><dd>{lead.psa_signed_date || '—'}</dd>
                  <dt>COE Date</dt><dd>{lead.coe_date || '—'}</dd>
                  <dt>Inspection Ends</dt><dd>{lead.inspection_end_date || '—'}</dd>
                  <dt>EMD</dt><dd>${Number(lead.emd_amount || 0).toLocaleString()}</dd>
                  <dt>Title Company</dt><dd>{lead.title_company || '—'}</dd>
                </dl>
              </div>
            )}
          </div>

          <div className="lead-actions">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <Link to={`/calculator?leadId=${id}`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                🧮 Run Underwriting
              </Link>
              <button className="btn btn-sm" onClick={() => handleFillScript('int')}>Get INT Script</button>
              <button className="btn btn-sm" onClick={() => handleFillScript('ccc')}>Get CCC Script</button>
              <button className="btn btn-sm" onClick={() => handleFillScript('gcj')}>Get GCJ Script</button>
              <button className="btn btn-sm" onClick={() => handleFillScript('contract_out')}>Get Contract SMS</button>
              {lead.scheduling_link && (
                <a href={lead.scheduling_link} target="_blank" rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--brand-primary)', color: 'white', border: 'none' }}>
                  📅 Schedule Call
                </a>
              )}
              {!lead.scheduling_link && userProfile?.scheduling_link && (
                <a href={userProfile.scheduling_link} target="_blank" rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--brand-primary)', color: 'white', border: 'none' }}>
                  📅 Schedule Call
                </a>
              )}
            </div>

            {scriptResult && (
              <div className="script-output">
                <h4>{scriptResult.script_name}</h4>
                <pre>{scriptResult.filled_template}</pre>
                <button className="btn btn-sm" onClick={() => setScriptResult(null)}>Close</button>
              </div>
            )}
          </div>

          <div className="contract-generation">
            <h3>Generate Contract</h3>
            <div className="contract-form">
              <select value={contractType} onChange={e => setContractType(e.target.value)}>
                {CONTRACT_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
              <button 
                className="btn btn-primary" 
                onClick={handleGenerateContract}
                disabled={generatingContract}
              >
                {generatingContract ? 'Generating...' : 'Generate Contract'}
              </button>
            </div>

            {contractResult && (
              <div className="contract-output">
                <h4>Contract Generated: {contractResult.package.template}</h4>
                <div className="contract-details">
                  <p><strong>Type:</strong> {contractResult.package.contractType}</p>
                  <p><strong>Addenda:</strong> {contractResult.package.addenda.join(', ') || 'None'}</p>
                  <p><strong>Clauses:</strong> {contractResult.package.clauses.length} applied</p>
                  <p><strong>COE Date:</strong> {contractResult.package.timeline.coeDate}</p>
                  <p><strong>EMD:</strong> ${Number(contractResult.package.financials.emdAmount).toLocaleString()}</p>
                </div>
                <details>
                  <summary>Full Contract Text</summary>
                  <pre>{contractResult.formatted}</pre>
                </details>
              </div>
            )}
          </div>

          <div className="lead-history">
            <h3>Stage History</h3>
            {history.length === 0 ? (
              <p>No stage changes yet.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Date</th><th>From</th><th>To</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at).toLocaleDateString()}</td>
                      <td>{h.from_stage?.replace('_', ' ') || '—'}</td>
                      <td>{h.to_stage.replace('_', ' ')}</td>
                      <td>{h.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {lead.notes && (
            <div className="lead-notes">
              <h3>Notes</h3>
              <p>{lead.notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

