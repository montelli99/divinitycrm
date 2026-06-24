import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { canAssignLeads } from '../lib/access';

// All fields that can be imported via bulk CSV (label shown in mapper dropdown)
const BULK_IMPORT_FIELDS = [
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'price', label: 'Price' },
  { key: 'source', label: 'Source' },
  { key: 'beds', label: 'Beds' },
  { key: 'baths', label: 'Baths' },
  { key: 'sqft', label: 'Sq Ft' },
  { key: 'year_built', label: 'Year Built' },
  { key: 'condition', label: 'Condition' },
  { key: 'agent_name', label: 'Agent Name' },
  { key: 'agent_phone', label: 'Agent Phone' },
  { key: 'agent_email', label: 'Agent Email' },
  { key: 'seller_name', label: 'Seller Name' },
  { key: 'seller_phone', label: 'Seller Phone' },
  { key: 'seller_email', label: 'Seller Email' },
  { key: 'notes', label: 'Notes' },
  { key: 'arv', label: 'ARV' },
  { key: 'monthly_rent', label: 'Monthly Rent' },
  { key: 'repairs_estimate', label: 'Repairs' },
  { key: 'existing_loan_balance', label: 'Existing Loan' },
  { key: 'existing_loan_rate', label: 'Existing Rate' },
  { key: 'assigned_user_id', label: 'Assigned User' },
];

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function getCsvHeaders(csvText) {
  const firstLine = csvText.split(/\r?\n/).find(line => line.trim());
  return firstLine ? splitCsvLine(firstLine).filter(Boolean) : [];
}

function normalizeMappingHeaders(headers) {
  return headers.map(header => ({ key: header, label: header }));
}

export default function BulkImport() {
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState([]);
  const [fieldMap, setFieldMap] = useState({});
  const [assignedUserId, setAssignedUserId] = useState('');
  const [source, setSource] = useState('other');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [teamData, setTeamData] = useState(null);

  const assignVisible = canAssignLeads(currentUser);

  useEffect(() => {
    api.getMe()
      .then(user => setCurrentUser(user))
      .catch(() => setCurrentUser(null));
    api.getTeamDashboard()
      .then(data => setTeamData(data))
      .catch(() => setTeamData(null));
  }, []);

  function handleCsvChange(value) {
    setCsv(value);
    setMessage('');
    const detected = getCsvHeaders(value);
    setHeaders(detected);
    setFieldMap(prev => {
      const next = { ...prev };
      for (const field of BULK_IMPORT_FIELDS) {
        if (field.key === 'assigned_user_id') continue;
        if (detected.includes(field.key)) {
          next[field.key] = field.key;
        } else if (!next[field.key]) {
          const matched = detected.find(header => header.toLowerCase() === field.key.toLowerCase());
          if (matched) next[field.key] = matched;
        }
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!csv.trim()) return;
    setImporting(true);
    setMessage('');
    try {
      const result = await api.importLeads({
        csvText: csv,
        fieldMap,
        defaultAssignedUserId: assignedUserId || undefined,
        source,
      });
      setMessage(`Imported ${result.created} leads${result.failed > 0 ? `, ${result.failed} failed` : ''}.`);
      setCsv('');
      setHeaders([]);
      setFieldMap({});
      setAssignedUserId('');
    } catch (err) {
      setMessage(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>Bulk Import Leads</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Paste CSV with a header row, map columns to CRM fields, and assign imported leads to a student or closer.
      </p>

      {!assignVisible && (
        <div style={{ padding: '1rem', background: 'rgba(250, 204, 21, 0.1)', border: '1px solid rgba(250, 204, 21, 0.3)', borderRadius: '6px', marginBottom: '1rem', color: '#fcd34d' }}>
          Only team leads and admins can bulk import. Sign in as an admin or closer to use this tool.
        </div>
      )}

      <form className="new-lead-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>
            CSV Data
            <textarea
              rows={10}
              value={csv}
              onChange={e => handleCsvChange(e.target.value)}
              placeholder={'address,city,state,price\n123 Main St,Austin,TX,250000\n456 Oak Ave,Houston,TX,180000'}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </label>

          <label>
            Default Source
            <select value={source} onChange={e => setSource(e.target.value)}>
              <option value="other">Other</option>
              <option value="kayla_sheet">Kayla Sheet</option>
              <option value="ppc">PPC</option>
              <option value="facebook">Facebook</option>
              <option value="website">Website</option>
              <option value="list_pull">List Pull</option>
              <option value="referral">Referral</option>
              <option value="zillow">Zillow</option>
              <option value="redfin">Redfin</option>
            </select>
          </label>

          {assignVisible && (
            <label>
              Assign Imported Leads To
              <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)}>
                <option value="">Keep with me</option>
                {teamData?.students?.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.first_name || student.email?.split('@')[0]} · {student.role}
                  </option>
                ))}
              </select>
            </label>
          )}

          {BULK_IMPORT_FIELDS.filter(field => field.key !== 'assigned_user_id').map(field => (
            <label key={field.key}>
              {field.label}
              <select
                value={fieldMap[field.key] || ''}
                onChange={e => setFieldMap(prev => ({ ...prev, [field.key]: e.target.value }))}
                disabled={headers.length === 0}
              >
                <option value="">Ignore</option>
                {normalizeMappingHeaders(headers).map(header => (
                  <option key={header.key} value={header.key}>{header.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {headers.length > 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
            Detected columns: {headers.join(', ')}
          </p>
        )}

        {message && (
          <p style={{
            color: message.startsWith('Imported') ? '#4ade80' : '#fca5a5',
            fontSize: '0.85rem',
            marginTop: '0.75rem'
          }}>
            {message}
          </p>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={importing || !csv.trim() || !assignVisible}
          >
            {importing ? 'Importing...' : 'Import Leads'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setCsv(''); setHeaders([]); setFieldMap({}); setMessage(''); }}
            disabled={importing}
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}