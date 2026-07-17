import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const STAGE_COLORS = {
  LEAD_ENTERED: 'bg-amber-100 text-amber-800 border-amber-200',
  CONTACT_MADE: 'bg-blue-100 text-blue-800 border-blue-200',
  OFFER_READY: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  OFFER_SENT: 'bg-purple-100 text-purple-800 border-purple-200',
  OFFER_RECEIVED: 'bg-violet-100 text-violet-800 border-violet-200',
  GAIN_FEEDBACK: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  NO_ANSWER: 'bg-orange-100 text-orange-800 border-orange-200',
  SELLER_DECLINED: 'bg-red-100 text-red-800 border-red-200',
  ACTIVE_NEGOTIATION: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  TERMS_AGREED: 'bg-green-100 text-green-800 border-green-200',
  AWAITING_TITLE: 'bg-teal-100 text-teal-800 border-teal-200',
  CONTRACT_OUT: 'bg-sky-100 text-sky-800 border-sky-200',
  UNDER_CONTRACT: 'bg-lime-100 text-lime-800 border-lime-200',
  INSPECTION_PERIOD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  INSPECTION_COMPLETE: 'bg-green-100 text-green-800 border-green-200',
  APPRAISAL_ORDERED: 'bg-pink-100 text-pink-800 border-pink-200',
  APPRAISAL_DONE: 'bg-rose-100 text-rose-800 border-rose-200',
  JV_SENT: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  JV_SIGNED: 'bg-green-100 text-green-800 border-green-200',
  WIRE_SETUP: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CLOSING_DATE: 'bg-green-100 text-green-800 border-green-200',
};

const STAGE_LABELS = {
  LEAD_ENTERED: 'New Leads',
  CONTACT_MADE: 'Contacted',
  OFFER_READY: 'Offer Ready',
  OFFER_SENT: 'Offer Sent',
  OFFER_RECEIVED: 'Offer Received',
  GAIN_FEEDBACK: 'Gain Feedback',
  NO_ANSWER: 'No Answer',
  SELLER_DECLINED: 'Declined',
  ACTIVE_NEGOTIATION: 'Negotiating',
  TERMS_AGREED: 'Terms Agreed',
  AWAITING_TITLE: 'Awaiting Title',
  CONTRACT_OUT: 'Contract Out',
  UNDER_CONTRACT: 'Under Contract',
  INSPECTION_PERIOD: 'Inspection',
  INSPECTION_COMPLETE: 'Inspection Done',
  APPRAISAL_ORDERED: 'Appraisal Ordered',
  APPRAISAL_DONE: 'Appraisal Done',
  JV_SENT: 'JV Sent',
  JV_SIGNED: 'JV Signed',
  WIRE_SETUP: 'Wire Setup',
  CLOSING_DATE: 'Closing',
};

export default function EmilyKPIs() {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    
    Promise.all([
      api.getStats().catch(() => null),
      api.getEmilyQueue(50).catch(() => null)
    ])
      .then(([statsRes, queueRes]) => {
        if (cancelled) return;
        setStats(statsRes);
        setQueue(queueRes);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="animate-pulse grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-xl bg-slate-100 h-24" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm md:p-5">
        <p className="text-sm text-red-700">Failed to load KPIs: {error}</p>
      </section>
    );
  }

  const totalLeads = stats?.total ?? queue?.total ?? 0;
  const activeLeads = stats?.active ?? 0;
  const conversionRate = stats?.conversion_rate ?? 0;
  
  // Group queue leads by stage
  const stageCounts = {};
  if (queue?.leads) {
    queue.leads.forEach(lead => {
      stageCounts[lead.stage] = (stageCounts[lead.stage] || 0) + 1;
    });
  }

  // Get top stages with leads
  const activeStages = Object.entries(stageCounts)
    .filter(([_, count]) => count > 0)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Main KPI Row */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
          Pipeline Overview
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Leads */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">Total Leads</div>
              <div className="rounded-full bg-slate-100 p-1.5">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{totalLeads}</div>
            <div className="mt-1 text-xs text-slate-500">{activeLeads} active</div>
          </div>

          {/* Emily Queue */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">Emily Queue</div>
              <div className="rounded-full bg-indigo-100 p-1.5">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-900">{queue?.total ?? 0}</div>
            <div className="mt-1 text-xs text-indigo-600">Prioritized for today</div>
          </div>

          {/* Conversion Rate */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">Conversion Rate</div>
              <div className="rounded-full bg-emerald-100 p-1.5">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-900">{conversionRate}%</div>
            <div className="mt-1 text-xs text-emerald-600">Leads to closed</div>
          </div>

          {/* Closed Deals */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-green-50 to-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">Closed Deals</div>
              <div className="rounded-full bg-green-100 p-1.5">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-green-900">{stats?.closed ?? 0}</div>
            <div className="mt-1 text-xs text-green-600">Total closed</div>
          </div>
        </div>
      </section>

      {/* Stage Breakdown */}
      {activeStages.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
            Active Stages ({queue?.total ?? 0} leads)
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeStages.map(([stage, count]) => (
              <div 
                key={stage} 
                className={`rounded-xl border p-4 ${STAGE_COLORS[stage] || 'bg-slate-100 text-slate-800 border-slate-200'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{STAGE_LABELS[stage] || stage}</div>
                  <div className="text-lg font-bold">{count}</div>
                </div>
                <div className="mt-2 w-full bg-white/50 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-current opacity-60"
                    style={{ width: `${Math.min((count / (queue?.total || 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
