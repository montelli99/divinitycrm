import { Link } from 'react-router-dom';
import EmilyWidget from '../components/EmilyWidget';
import EmilyKPIs from '../components/EmilyKPIs';

export default function Emily() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">Emily</h1>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Live</span>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">Daily Queue Engine</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Operations assistant that surfaces prioritized leads, next actions, and pipeline pressure so nothing falls through the cracks.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick links</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to="/pipeline" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Open pipeline
              </Link>
              <Link to="/admin" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Team dashboard
              </Link>
              <Link to="/notifications" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Inbox
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <EmilyKPIs />

      {/* Queue Widget */}
      <EmilyWidget />
    </div>
  );
}
