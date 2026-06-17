import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [contractsData, clausesData] = await Promise.all([
          api.getContracts(),
          api.getClauses(),
        ]);
        setContracts(contractsData.contracts);
        setClauses(clausesData.clauses);
      } catch (err) {
        console.error('Contracts load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading">Loading contracts...</div>;

  const clausesByCategory = {};
  clauses.forEach(c => {
    if (!clausesByCategory[c.category]) clausesByCategory[c.category] = [];
    clausesByCategory[c.category].push(c);
  });

  return (
    <div className="contracts-page">
      <div className="page-header">
        <h1>Contracts & Clauses</h1>
      </div>

      <div className="contracts-section">
        <h2>Generated Contracts</h2>
        {contracts.length === 0 ? (
          <p className="empty-state">No contracts generated yet. Go to a lead and click "Generate Contract".</p>
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
              {contracts.map(c => (
                <tr key={c.id}>
                  <td><Link to={`/leads/${c.lead_id}`}>{c.address}</Link></td>
                  <td>{c.contract_type}</td>
                  <td>{c.template_name}</td>
                  <td>{c.rabbitsign_status || 'draft'}</td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="clauses-section">
        <h2>Clause Library ({clauses.length} total)</h2>
        {Object.entries(clausesByCategory).map(([category, items]) => (
          <div key={category} className="clause-category">
            <h3>{category.replace('_', ' ').toUpperCase()}</h3>
            {items.map(c => (
              <div key={c.id} className="clause-card">
                <div className="clause-header">
                  <strong>{c.title}</strong>
                  {c.requires_initial && <span className="clause-badge">INITIAL REQUIRED</span>}
                  {c.conditional_on && <span className="clause-badge">IF: {c.conditional_on}</span>}
                </div>
                <p className="clause-text">{c.text}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

