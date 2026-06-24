import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const RED_STATES = ['AL','AK','AR','AZ','FL','GA','ID','IN','IA','KS','KY','LA','MS','MO','MT','NE','NV','NC','ND','OK','SC','SD','TN','TX','UT','WV','WY'];

const CALCULATOR_TABS = [
  { id: 'underwriting', label: 'Underwriting' },
  { id: 'buybox', label: 'Buy Box' },
  { id: 'closing-costs', label: 'Closing Costs' },
  { id: 'midterm', label: 'Mid-Term' },
  { id: 'docs', label: 'Docs' },
  { id: 'history', label: 'History' },
];

export default function Calculator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const leadId = searchParams.get('leadId');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'underwriting');
  const [selectedLeadId, setSelectedLeadId] = useState(searchParams.get('leadId') || '');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadHighlightIndex, setLeadHighlightIndex] = useState(-1);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loadedLeadId, setLoadedLeadId] = useState('');
  const [attachedLeadInfo, setAttachedLeadInfo] = useState(null);
  const [leadResults, setLeadResults] = useState([]);
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [buyBoxLoading, setBuyBoxLoading] = useState(false);
  const [buyBoxResult, setBuyBoxResult] = useState(null);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingResult, setClosingResult] = useState(null);
  const [midTermLoading, setMidTermLoading] = useState(false);
  const [midTermResult, setMidTermResult] = useState(null);
  const [underwritingDocs, setUnderwritingDocs] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const resultsRef = useRef(null);

  const [form, setForm] = useState({
    arv: '', askingPrice: '', monthlyRent: '', repairEstimate: '0',
    desiredProfit: '15000', propertyType: 'turnkey',
    loanAmount: '', interestRate: '', insuranceMonthly: '120',
    existingLoanBalance: '', existingLoanRate: '',
    sqft: '', beds: '', baths: '', condition: 'unknown',
    state: '', population: '', hasHOA: false, hasPool: false, inFloodZone: false,
    motivation: 'medium', equityPercent: '50',
    isRental: false, isOwnedFree: false,
    needsRenovation: false, moveInReady: true,
  });

  const [buyBoxForm, setBuyBoxForm] = useState({
    state: '',
    population: '',
    hasHOA: false,
    hasPool: false,
    inFloodZone: false,
  });

  const [closingForm, setClosingForm] = useState({
    contractType: 'subto',
    purchasePrice: '',
    state: '',
  });

  const [midTermForm, setMidTermForm] = useState({
    address: '',
    longTermRent: '',
    purchasePrice: '',
    city: '',
    threshold: '',
  });

  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'underwriting');
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('leadId')) {
      setSelectedLeadId(searchParams.get('leadId'));
    }
  }, [searchParams]);

  useEffect(() => {
    const query = leadSearch.trim();
    if (!query) {
      setLeadResults([]);
      setLeadHighlightIndex(-1);
      return undefined;
    }

    let active = true;
    setLeadSearchLoading(true);
    const timer = setTimeout(() => {
      api.getLeads({ search: query, limit: 8 })
        .then(data => {
          if (active) {
            const results = data.leads || [];
            setLeadResults(results);
            setLeadHighlightIndex(results.length > 0 ? 0 : -1);
          }
        })
        .catch(() => {
          if (active) {
            setLeadResults([]);
            setLeadHighlightIndex(-1);
          }
        })
        .finally(() => {
          if (active) setLeadSearchLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [leadSearch]);

  function attachLead(option) {
    setLeadSearch(option.address || '');
    setAttachedLeadInfo(option);
    setLeadResults([]);
    setLeadHighlightIndex(-1);
    updateLeadAttachment(option.id);
  }

  useEffect(() => {
    const attachedLeadId = selectedLeadId || leadId || '';
    if (!attachedLeadId || attachedLeadId === loadedLeadId) return;

    setLoading(true);
    api.getLeadForCalc(attachedLeadId)
      .then(data => {
        const l = data.lead;
        setLeadSearch(l.address || '');
        setForm(f => ({
          ...f,
          arv: l.arv || '',
          askingPrice: l.price || '',
          monthlyRent: l.monthlyRent || '',
          repairEstimate: l.repairsEstimate || '0',
          sqft: l.sqft || '',
          beds: l.beds || '',
          baths: l.baths || '',
          condition: l.condition || 'unknown',
          state: l.state || '',
          population: l.population || '',
          hasHOA: l.hasHOA || false,
          hasPool: l.hasPool || false,
          inFloodZone: l.inFloodZone || false,
          existingLoanBalance: l.existingLoanBalance || '',
          existingLoanRate: l.existingLoanRate || '',
          propertyType: l.condition === 'reno' ? 'reno' : 'turnkey',
          moveInReady: l.condition !== 'reno',
          needsRenovation: l.condition === 'reno',
        }));
        setAttachedLeadInfo({
          id: attachedLeadId,
          address: l.address,
          city: l.city,
          state: l.state,
          price: l.price,
          stage: l.stage,
          seller_name: l.seller_name,
          agent_name: l.agent_name,
        });
        setLoadedLeadId(attachedLeadId);
      })
      .catch(err => setError('Failed to load lead: ' + err.message))
      .finally(() => setLoading(false));
  }, [selectedLeadId, leadId, loadedLeadId]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await api.getUnderwritingHistory(selectedLeadId || leadId || undefined);
      setHistory(data.history || []);
    } catch (err) {
      setError(err.message || 'Failed to load underwriting history');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, selectedLeadId, leadId]);

  useEffect(() => {
    if (result) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function updateBuyBox(field, value) {
    setBuyBoxForm(f => ({ ...f, [field]: value }));
  }

  function updateClosing(field, value) {
    setClosingForm(f => ({ ...f, [field]: value }));
  }

  function updateMidTerm(field, value) {
    setMidTermForm(f => ({ ...f, [field]: value }));
  }

  function updateLeadAttachment(nextLeadId) {
    setSelectedLeadId(nextLeadId);
    if (!nextLeadId) setAttachedLeadInfo(null);
    const next = new URLSearchParams(searchParams);
    if (nextLeadId) next.set('leadId', nextLeadId);
    else next.delete('leadId');
    setSearchParams(next);
  }

  function setTab(tab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  }

  async function runAnalysis(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setError('');
    setLoading(true);
    try {
      const attachedLeadId = selectedLeadId || leadId || undefined;
      const data = await api.analyzeDeal({
        ...form,
        arv: Number(form.arv) || undefined,
        askingPrice: Number(form.askingPrice) || undefined,
        monthlyRent: Number(form.monthlyRent) || undefined,
        repairEstimate: Number(form.repairEstimate) || 0,
        desiredProfit: Number(form.desiredProfit) || 20000,
        loanAmount: form.loanAmount ? Number(form.loanAmount) : undefined,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        insuranceMonthly: Number(form.insuranceMonthly) || 120,
        existingLoanBalance: form.existingLoanBalance ? Number(form.existingLoanBalance) : undefined,
        existingLoanRate: form.existingLoanRate ? Number(form.existingLoanRate) : undefined,
        sqft: form.sqft ? Number(form.sqft) : undefined,
        beds: form.beds ? Number(form.beds) : undefined,
        baths: form.baths ? Number(form.baths) : undefined,
        population: form.population ? Number(form.population) : undefined,
        equityPercent: form.equityPercent ? Number(form.equityPercent) : undefined,
        leadId: attachedLeadId,
      });
      setResult(data);
      await loadHistory();
      // Auto-scroll to results after a beat so DOM has rendered
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setError(err.message || 'Calculation failed — check your inputs and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function runBuyBox(e) {
    e.preventDefault();
    setError('');
    setBuyBoxLoading(true);
    try {
      const data = await api.checkBuyBox({
        state: buyBoxForm.state,
        population: buyBoxForm.population ? Number(buyBoxForm.population) : 0,
        hasHOA: buyBoxForm.hasHOA,
        hasPool: buyBoxForm.hasPool,
        inFloodZone: buyBoxForm.inFloodZone,
      });
      setBuyBoxResult(data.buyBox);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuyBoxLoading(false);
    }
  }

  async function runClosingCosts(e) {
    e.preventDefault();
    setError('');
    setClosingLoading(true);
    try {
      const data = await api.calculateClosingCosts({
        contractType: closingForm.contractType,
        purchasePrice: Number(closingForm.purchasePrice),
        state: closingForm.state || undefined,
        leadId: leadId || undefined,
      });
      setClosingResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setClosingLoading(false);
    }
  }

  async function runMidTerm(e) {
    e.preventDefault();
    setError('');
    setMidTermLoading(true);
    try {
      const data = await api.analyzeMidTerm({
        address: midTermForm.address || 'Property',
        longTermRent: Number(midTermForm.longTermRent),
        purchasePrice: Number(midTermForm.purchasePrice),
        city: midTermForm.city || undefined,
        threshold: midTermForm.threshold ? Number(midTermForm.threshold) : undefined,
      });
      setMidTermResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setMidTermLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'docs' || underwritingDocs) return;
    let cancelled = false;
    setDocsLoading(true);
    api.getUnderwritingDocs()
      .then(data => { if (!cancelled) setUnderwritingDocs(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setDocsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, underwritingDocs]);

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    padding: '0.5rem 0.7rem',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.25rem',
  };

  const attachedLeadId = selectedLeadId || leadId || '';
  const attachedLead = attachedLeadInfo || leadResults.find(item => item.id === attachedLeadId);

  const formatMoney = value => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—');
  const calcMeta = result?.calculation?.metadata || {};
  const decisionMatrix = result?.calculation?.decisionMatrix || null;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
          <span style={{ background: 'linear-gradient(135deg, var(--brand-primary), #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Deal Calculator
          </span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          8 deal structures: Cash, F50, F10, Stack w/ Principal, Interest-Only, $0 Down, SubTo, Novation
        </p>
        {attachedLeadId ? (
          <p style={{ color: 'var(--brand-primary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            📋 Attached to {attachedLead?.address || attachedLeadId}
          </p>
        ) : (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Standalone history mode until you attach a lead</p>
        )}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Search contact or lead to attach</label>
            <input
              value={leadSearch}
              onChange={e => {
                const nextValue = e.target.value;
                setLeadSearch(nextValue);
                if (!nextValue.trim()) {
                  updateLeadAttachment('');
                }
              }}
              onKeyDown={e => {
                if (leadResults.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setLeadHighlightIndex(index => Math.min(index + 1, leadResults.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setLeadHighlightIndex(index => Math.max(index - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const selected = leadResults[Math.max(leadHighlightIndex, 0)];
                  if (selected) attachLead(selected);
                } else if (e.key === 'Escape') {
                  setLeadResults([]);
                  setLeadHighlightIndex(-1);
                }
              }}
              placeholder="Search by address, seller, or stage"
              style={inputStyle}
            />
          </div>

          {leadSearchLoading && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Searching leads...</div>
          )}

          {leadSearch.trim() && leadResults.length > 0 && (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}>
              {leadResults.map(option => (
                  <button
                  key={option.id}
                  type="button"
                  onClick={() => attachLead(option)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 0.85rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: leadResults[leadHighlightIndex]?.id === option.id || option.id === attachedLeadId ? 'rgba(91,108,240,0.12)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong>{option.address}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{option.stage?.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {option.seller_name || option.agent_name || 'Lead'}{(option.seller_name || option.agent_name) && (option.city || option.state) ? ' · ' : ''}{option.city || ''}{option.city && option.state ? ', ' : ''}{option.state || ''} {option.price ? `· $${Number(option.price).toLocaleString()}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}

          {leadSearch.trim() && !leadSearchLoading && leadResults.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>No leads matched that search.</div>
          )}

          {attachedLeadId && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Attached to {attachedLead?.address || attachedLeadId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setLeadSearch('');
                  updateLeadAttachment('');
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  padding: '0.3rem 0.65rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                }}
              >
                Detach
              </button>
              <Link to={`/leads/${attachedLeadId}`} style={{ color: 'var(--brand-primary)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '600' }}>
                Open lead →
              </Link>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          {CALCULATOR_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                border: '1px solid ' + (activeTab === tab.id ? 'var(--brand-primary)' : 'var(--border-subtle)'),
                borderRadius: '999px',
                padding: '0.45rem 0.85rem',
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

      {activeTab === 'history' ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Underwriting History</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '0.25rem' }}>
              Saved runs appear here whether or not a lead is attached.
            </p>
            {historyLoading ? (
              <div className="loading">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="empty-state" style={{ marginTop: '0.75rem' }}>No underwriting history yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.75rem' }}>
                {history.map(item => (
                  <div key={item.id} style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <strong>{item.address || 'Standalone underwriting'}</strong>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.35rem' }}>
                      {item.details?.recommended || 'Recommendation saved'} · DSCR {item.details?.dscr || '—'} · Cash flow ${item.details?.cashFlow ?? '—'}
                    </div>
                    {item.leadId && (
                      <div style={{ marginTop: '0.45rem' }}>
                        <Link to={`/leads/${item.leadId}`} style={{ color: 'var(--brand-primary)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '600' }}>
                          Open attached lead →
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      <form onSubmit={runAnalysis}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Property Data */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📊 Property Data</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>ARV ($)</label>
                <input type="number" style={inputStyle} value={form.arv} onChange={e => update('arv', e.target.value)} placeholder="After Repair Value" required />
              </div>
              <div>
                <label style={labelStyle}>Asking Price ($)</label>
                <input type="number" style={inputStyle} value={form.askingPrice} onChange={e => update('askingPrice', e.target.value)} placeholder="Seller's price" required />
              </div>
              <div>
                <label style={labelStyle}>Monthly Rent ($)</label>
                <input type="number" style={inputStyle} value={form.monthlyRent} onChange={e => update('monthlyRent', e.target.value)} placeholder="Current/projected rent" required />
              </div>
              <div>
                <label style={labelStyle}>Repair Estimate ($)</label>
                <input type="number" style={inputStyle} value={form.repairEstimate} onChange={e => update('repairEstimate', e.target.value)} placeholder="0 for turnkey" />
              </div>
              <div>
                <label style={labelStyle}>Sqft</label>
                <input type="number" style={inputStyle} value={form.sqft} onChange={e => update('sqft', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Beds / Baths</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input type="number" style={{...inputStyle, flex: 1}} value={form.beds} onChange={e => update('beds', e.target.value)} placeholder="Beds" />
                  <input type="number" style={{...inputStyle, flex: 1}} value={form.baths} onChange={e => update('baths', e.target.value)} placeholder="Baths" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Condition</label>
                <select style={inputStyle} value={form.condition} onChange={e => update('condition', e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="turnkey">Turnkey</option>
                  <option value="reno">Needs Renovation</option>
                  <option value="livable">Livable</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Property Type</label>
                <select style={inputStyle} value={form.propertyType} onChange={e => update('propertyType', e.target.value)}>
                  <option value="turnkey">Turnkey / Move-in Ready</option>
                  <option value="reno">Renovation / Flip</option>
                </select>
              </div>
            </div>
          </div>

          {/* Financing Data */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>🏦 Financing</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>Existing Loan Balance ($)</label>
                <input type="number" style={inputStyle} value={form.existingLoanBalance} onChange={e => update('existingLoanBalance', e.target.value)} placeholder="For SubTo calc" />
              </div>
              <div>
                <label style={labelStyle}>Existing Rate (%)</label>
                <input type="number" step="0.001" style={inputStyle} value={form.existingLoanRate} onChange={e => update('existingLoanRate', e.target.value)} placeholder="e.g. 0.035 for 3.5%" />
              </div>
              <div>
                <label style={labelStyle}>Loan Amount ($)</label>
                <input type="number" style={inputStyle} value={form.loanAmount} onChange={e => update('loanAmount', e.target.value)} placeholder="For interest-only calc" />
              </div>
              <div>
                <label style={labelStyle}>Interest Rate (%)</label>
                <input type="number" step="0.001" style={inputStyle} value={form.interestRate} onChange={e => update('interestRate', e.target.value)} placeholder="e.g. 0.07 for 7%" />
              </div>
              <div>
                <label style={labelStyle}>Insurance ($/mo)</label>
                <input type="number" style={inputStyle} value={form.insuranceMonthly} onChange={e => update('insuranceMonthly', e.target.value)} placeholder="Default: $120" />
              </div>
              <div>
                <label style={labelStyle}>Desired Profit ($)</label>
                <input type="number" style={inputStyle} value={form.desiredProfit} onChange={e => update('desiredProfit', e.target.value)} placeholder="Default: $15,000" />
              </div>
              <div>
                <label style={labelStyle}>Equity %</label>
                <input type="number" style={inputStyle} value={form.equityPercent} onChange={e => update('equityPercent', e.target.value)} placeholder="For strategy rec" />
              </div>
              <div>
                <label style={labelStyle}>Motivation</label>
                <select style={inputStyle} value={form.motivation} onChange={e => update('motivation', e.target.value)}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>

          {/* Buy Box */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>🎯 Buy Box Checker</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>State</label>
                <select style={inputStyle} value={form.state} onChange={e => update('state', e.target.value)}>
                  <option value="">Select state</option>
                  {RED_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  <option disabled>── Non-Red States ──</option>
                  {['CA','CO','CT','DE','HI','IL','MA','MD','ME','MI','MN','NH','NJ','NM','NY','OH','OR','PA','RI','VA','VT','WA','WI','DC'].map(s => (
                    <option key={s} value={s}>{s} ⚠️</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Population</label>
                <input type="number" style={inputStyle} value={form.population} onChange={e => update('population', e.target.value)} placeholder="≥ 10,000" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="hoa" checked={form.hasHOA} onChange={e => update('hasHOA', e.target.checked)} />
                <label htmlFor="hoa" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Has HOA</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="pool" checked={form.hasPool} onChange={e => update('hasPool', e.target.checked)} />
                <label htmlFor="pool" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Has Pool</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="flood" checked={form.inFloodZone} onChange={e => update('inFloodZone', e.target.checked)} />
                <label htmlFor="flood" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Flood Zone</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="rental" checked={form.isRental} onChange={e => update('isRental', e.target.checked)} />
                <label htmlFor="rental" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Is Rental</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="ownedFree" checked={form.isOwnedFree} onChange={e => update('isOwnedFree', e.target.checked)} />
                <label htmlFor="ownedFree" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Owned Free & Clear</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="needsReno" checked={form.needsRenovation} onChange={e => update('needsRenovation', e.target.checked)} />
                <label htmlFor="needsReno" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Needs Renovation</label>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%',
          background: 'linear-gradient(135deg, var(--brand-primary), #6d7af7)',
          color: 'white',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem',
          fontSize: '0.95rem',
          fontWeight: '600',
          fontFamily: 'inherit',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          boxShadow: '0 2px 8px rgba(91,108,240,0.3)',
          marginBottom: '1.5rem',
        }}>
          {loading ? 'Running Analysis...' : '🔍 Run Underwriting Analysis'}
        </button>
      </form>

      {/* Results */}
      {result && (
        <div ref={resultsRef}>
          {/* Buy Box Results */}
          <div style={{...cardStyle, marginBottom: '1rem'}}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
              🎯 Buy Box {result.buyBox.allPass ? '✅ PASSES' : '❌ FAILS'}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {Object.entries(result.buyBox.checks).map(([key, check]) => (
                <span key={key} style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem',
                  fontWeight: '500',
                  background: check.pass ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: check.pass ? '#4ade80' : '#fca5a5',
                  border: `1px solid ${check.pass ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {check.pass ? '✅' : '❌'} {check.label}
                </span>
              ))}
            </div>
            {!result.buyBox.allPass && (
              <p style={{ color: '#fca5a5', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                Fails: {result.buyBox.failures.join(', ')}
              </p>
            )}
          </div>

          {/* Quick Checks */}
          <div style={{...cardStyle, marginBottom: '1rem'}}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📈 Quick Checks</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <MetricBox label="1% Rule" value={calcMeta.percRule || '—'} pass={calcMeta.percPass} detail={`Rent must be ≥1% of asking ($${formatMoney(calcMeta.onePercentThreshold)}/mo)`} />
              <MetricBox label="DSCR" value={(calcMeta.dscr || '—') + 'x'} pass={calcMeta.dscrPass} detail="Need ≥1.25x for DSCR loan" />
              <MetricBox label="PITI" value={'$' + formatMoney(calcMeta.monthlyPITI) + '/mo'} pass={Number(calcMeta.monthlyPITI) > 0} detail="Principal, interest, tax, and insurance" />
              <MetricBox label="Cap Rate" value={calcMeta.capRate || '—'} pass={Number(calcMeta.capRate) >= 5} detail="≥5% is good" />
              <MetricBox label="Monthly NOI" value={'$' + formatMoney(calcMeta.monthlyNOI)} pass={Number(calcMeta.monthlyNOI) > 0} />
              <MetricBox label="Cash Flow" value={'$' + formatMoney(calcMeta.cashFlow) + '/mo'} pass={calcMeta.cashFlowPass} detail="Need ≥$200/mo" />
              <MetricBox label="Max Mortgage" value={'$' + formatMoney(calcMeta.maxMortgage)} pass={Number(calcMeta.maxMortgage) > 0} detail="DSCR-based capacity" />
            </div>
          </div>

          {/* Strategy Recommendation */}
          <div style={{...cardStyle, marginBottom: '1rem', borderLeft: '3px solid var(--brand-primary)'}}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              💡 Recommended Strategy: <span style={{ color: 'var(--brand-primary)' }}>{result.strategy.name}</span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              {result.strategy.condition}
              {result.strategy.fallback && ' (fallback — no specific rule matched)'}
            </p>
            {decisionMatrix && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem', borderRadius: '999px', background: decisionMatrix.onePercent ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: decisionMatrix.onePercent ? '#4ade80' : '#fca5a5' }}>1% {decisionMatrix.onePercent ? 'pass' : 'fail'}</span>
                <span style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem', borderRadius: '999px', background: decisionMatrix.dscr ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: decisionMatrix.dscr ? '#4ade80' : '#fca5a5' }}>DSCR {decisionMatrix.dscr ? 'pass' : 'fail'}</span>
                <span style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem', borderRadius: '999px', background: decisionMatrix.cashFlow ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: decisionMatrix.cashFlow ? '#4ade80' : '#fca5a5' }}>Cash flow {decisionMatrix.cashFlow ? 'pass' : 'fail'}</span>
                <span style={{ fontSize: '0.75rem', padding: '0.28rem 0.6rem', borderRadius: '999px', background: decisionMatrix.sellerProtection?.subtoRequiresAddendum ? 'rgba(245,158,11,0.14)' : 'rgba(59,130,246,0.12)', color: decisionMatrix.sellerProtection?.subtoRequiresAddendum ? '#fbbf24' : '#93c5fd' }}>
                  {decisionMatrix.sellerProtection?.subtoRequiresAddendum ? 'SubTo protection on' : 'No SubTo addendum needed'}
                </span>
              </div>
            )}
          </div>

          {/* Offer Structures */}
          <div style={{...cardStyle}}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>💰 Offer Structures</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
              {result.calculation.structures.map((s, i) => (
                <div key={i} style={{
                  background: s.recommend ? 'rgba(91,108,240,0.08)' : 'var(--bg-tertiary)',
                  border: `1px solid ${s.recommend ? 'rgba(91,108,240,0.3)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                      {s.recommend && '⭐ '}{s.label}
                    </h4>
                    <span style={{
                      fontSize: '0.9rem', fontWeight: '700',
                      color: s.recommend ? 'var(--brand-primary)' : 'var(--text-primary)',
                    }}>
                      ${s.offer.toLocaleString()}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{s.strategy}</p>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.8rem', margin: '0 0 0.5rem', lineHeight: '1.4' }}>{s.breakdown}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#4ade80' }}>✅ {s.pros}</span>
                    <span style={{ color: '#fca5a5' }}>⚠️ {s.cons}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mid-Term Pivot */}
          {result.calculation.midTermPivot?.pivot && (
            <div style={{...cardStyle, marginTop: '1rem', borderLeft: '3px solid #f59e0b'}}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: '#f59e0b' }}>
                🔄 Mid-Term Pivot Recommended
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                {result.calculation.midTermPivot.reason}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: '#fca5a5' }}>Long-Term: ${result.calculation.midTermPivot.longTerm.rent}/mo vs ${result.calculation.midTermPivot.longTerm.threshold?.toLocaleString()}/mo needed</span>
                </div>
                <div>
                  <span style={{ color: '#4ade80' }}>Mid-Term Est: ${result.calculation.midTermPivot.midTerm.estimatedMonthlyRent?.toLocaleString()}/mo ({result.calculation.midTermPivot.midTerm.onePercentRule})</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

function MetricBox({ label, value, pass, detail }) {
  return (
    <div style={{
      background: pass ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${pass ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '0.75rem',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: '700', color: pass ? '#4ade80' : '#fca5a5' }}>
        {pass ? '✅ ' : '❌ '}{value}
      </div>
      {detail && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{detail}</div>}
    </div>
  );
}
