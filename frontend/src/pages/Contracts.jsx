import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const CONTRACT_TABS = [
  { id: 'generated', label: 'Generated' },
  { id: 'templates', label: 'Templates' },
  { id: 'clauses', label: 'Clauses' },
  { id: 'rabbitsign', label: 'RabbitSign' },
];

const CONTRACT_TYPE_LABELS = {
  subto: 'Subject To',
  cash: 'Cash',
  seller_finance: 'Seller Finance',
  stack50: 'Stack 50%',
  stack10: 'Stack 10%',
  jv: 'JV',
  commercial: 'Commercial',
  portfolio: 'Portfolio',
};

export default function Contracts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [contracts, setContracts] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [lead, setLead] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('PSA_CREATIVE_SUBTO');
  const [selectedContract, setSelectedContract] = useState(null);
  const [generatedPackage, setGeneratedPackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeTab = searchParams.get('tab') || 'generated';
  const leadId = searchParams.get('leadId');
  const templateParam = searchParams.get('template');

  useEffect(() => {
    async function load() {
      try {
        const [contractsData, clausesData, templatesData, leadData] = await Promise.all([
          api.getContracts(),
          api.getClauses(),
          api.getContractTemplates().catch(() => ({ templates: [] })),
          leadId ? api.getLead(leadId).catch(() => null) : Promise.resolve(null),
        ]);
        setContracts(contractsData.contracts || []);
        setClauses(clausesData.clauses || []);
        setTemplates(templatesData.templates || []);
        setLead(leadData?.lead || null);
        if (templateParam && templatesData.templates?.some(template => template.id === templateParam)) {
          setSelectedTemplateId(templateParam);
        } else if (templatesData.templates?.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templatesData.templates[0].id);
        }
      } catch (err) {
        console.error('Contracts load error:', err);
        setError(err.message || 'Failed to load contracts');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [leadId, templateParam]);

  const clausesByCategory = useMemo(() => {
    const grouped = {};
    clauses.forEach(clause => {
      if (!grouped[clause.category]) grouped[clause.category] = [];
      grouped[clause.category].push(clause);
    });
    return grouped;
  }, [clauses]);

  async function handleGenerateFromTemplate(templateId = selectedTemplateId) {
    if (!leadId) {
      setError('Open a lead first to generate a contract from a template.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const result = await api.generateContractFromTemplate({ lead_id: leadId, template_id: templateId });
      setGeneratedPackage(result);
      const refreshed = await api.getContracts();
      setContracts(refreshed.contracts || []);
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'generated');
      next.set('template', templateId);
      setSearchParams(next);
    } catch (err) {
      setError(err.message || 'Failed to generate contract');
    } finally {
      setSubmitting(false);
    }
  }

  function setTab(tab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  }

  if (loading) return <div className="loading">Loading contracts...</div>;

  return (
    <div className="contracts-page">
      <div className="page-header">
        <div>
          <h1>Contracts & Clauses</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Generate the contract, review the clause library, and push the deal into RabbitSign.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/training?tab=underwriting" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Open underwriting notes</Link>
          <Link to="/pipeline" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Open pipeline</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {CONTRACT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            style={{
              background: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--bg-secondary)',
              color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
              border: '1px solid ' + (activeTab === tab.id ? 'var(--brand-primary)' : 'var(--border-subtle)'),
              borderRadius: '999px',
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}>{error}</div>
      )}

      {activeTab === 'generated' && (
        <div className="contracts-section">
          <h2>Generated Contracts</h2>
          {generatedPackage && (
            <div style={{
              background: 'rgba(91,108,240,0.08)',
              border: '1px solid rgba(91,108,240,0.25)',
              borderRadius: 'var(--radius-lg)',
              padding: '1rem',
              marginBottom: '1rem',
            }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Most recent generation</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {generatedPackage.template?.name || generatedPackage.template?.id || 'Contract'} generated for {lead?.address || 'the selected lead'}.
              </div>
            </div>
          )}
          {contracts.length === 0 ? (
            <p className="empty-state">
              No contracts generated yet. Open a lead and use the Templates tab to generate one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(contract => (
                  <tr key={contract.id}>
                    <td><Link to={`/leads/${contract.lead_id}`}>{contract.address}</Link></td>
                    <td>{CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type}</td>
                    <td>{contract.template_name}</td>
                    <td>{contract.rabbitsign_status || 'draft'}</td>
                    <td>{new Date(contract.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: '1rem', alignItems: 'start' }}>
          <div className="contracts-section">
            <h2>Template Library</h2>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  style={{
                    textAlign: 'left',
                    background: selectedTemplateId === template.id ? 'rgba(91,108,240,0.12)' : 'var(--bg-secondary)',
                    border: '1px solid ' + (selectedTemplateId === template.id ? 'rgba(91,108,240,0.3)' : 'var(--border-subtle)'),
                    borderRadius: 'var(--radius-lg)',
                    padding: '1rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <strong>{template.name}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{template.type}</span>
                  </div>
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{template.description}</p>
                </button>
              ))}
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: '700' }}>Selected Template</div>
              <div style={{ marginTop: '0.6rem', fontSize: '0.95rem', fontWeight: '700' }}>
                {templates.find(t => t.id === selectedTemplateId)?.name || 'Choose a template'}
              </div>
              <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                {templates.find(t => t.id === selectedTemplateId)?.description || 'Select a contract template to inspect its defaults and clauses.'}
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                <div><strong style={{ color: 'var(--text-primary)' }}>Lead:</strong> {lead?.address || 'Open a lead to enable generation'}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Type:</strong> {templates.find(t => t.id === selectedTemplateId)?.type || 'n/a'}</div>
              </div>
              <button
                onClick={() => handleGenerateFromTemplate(selectedTemplateId)}
                disabled={!leadId || submitting}
                style={{
                  marginTop: '0.9rem',
                  width: '100%',
                  background: 'linear-gradient(135deg, var(--brand-primary), #6d7af7)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  cursor: (!leadId || submitting) ? 'not-allowed' : 'pointer',
                  opacity: (!leadId || submitting) ? 0.6 : 1,
                }}
              >
                {submitting ? 'Generating...' : 'Generate for selected lead'}
              </button>
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(91,108,240,0.08))', border: '1px solid rgba(91,108,240,0.18)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bfdbfe', fontWeight: '700' }}>Flow</div>
              <div style={{ marginTop: '0.55rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                Open a lead, choose a template, generate the contract, then move the lead into under contract and RabbitSign.
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'clauses' && (
        <div className="clauses-section">
          <h2>Clause Library ({clauses.length} total)</h2>
          {Object.entries(clausesByCategory).map(([category, items]) => (
            <div key={category} className="clause-category">
              <h3>{category.replace('_', ' ').toUpperCase()}</h3>
              {items.map(clause => (
                <div key={clause.id} className="clause-card">
                  <div className="clause-header">
                    <strong>{clause.title}</strong>
                    {clause.requires_initial && <span className="clause-badge">INITIAL REQUIRED</span>}
                    {clause.conditional_on && <span className="clause-badge">IF: {clause.conditional_on}</span>}
                  </div>
                  <p className="clause-text">{clause.text}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'rabbitsign' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.7fr)', gap: '1rem', alignItems: 'start' }}>
          <div className="contracts-section">
            <h2>RabbitSign Flow</h2>
            <p className="empty-state" style={{ textAlign: 'left' }}>
              The backend already creates RabbitSign envelopes when a contract is generated from a lead. This tab is the handoff point: select a lead, generate the template, then send the document for signature.
            </p>
            {leadId ? (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Link to={`/leads/${leadId}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Open lead</Link>
                <Link to={`/calculator?leadId=${leadId}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Run underwriting</Link>
              </div>
            ) : null}
          </div>

          <aside style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: '700' }}>What happens next</div>
            <ol style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.6 }}>
              <li>Generate the contract package from the selected lead.</li>
              <li>Lead stage moves into under contract.</li>
              <li>RabbitSign envelope or folder gets created from the contract payload.</li>
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
