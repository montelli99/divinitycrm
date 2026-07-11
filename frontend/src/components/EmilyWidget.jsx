import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function EmilyWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getEmilyQueue(10)
      .then(res => { if (!cancelled) { setData(res); setError(''); } })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800">Emily Queue</h3>
      <p className="text-sm text-slate-500 mt-2">Loading today's priorities...</p>
    </div>
  );

  if (error) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-red-800">Emily Queue</h3>
      <p className="text-sm text-red-700 mt-2">{error}</p>
    </div>
  );

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Emily's Daily Queue</h3>
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
          {data?.total ?? 0} leads
        </span>
      </div>

      {data?.summary && (
        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 rounded p-3">
          {data.summary}
        </div>
      )}

      {data?.top && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top next actions</h4>
          <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800 bg-indigo-50 rounded p-3">
            {data.top}
          </div>
        </div>
      )}
    </div>
  );
}
