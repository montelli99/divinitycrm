import { Link } from 'react-router-dom';
import EmilyWidget from '../components/EmilyWidget';

const highlights = [
  {
    title: 'Queue pressure',
    body: 'Track the highest-priority leads Emily should touch next, filtered by your active campaign.',
  },
  {
    title: 'Provider readiness',
    body: 'Keep an eye on voice, TTS, transcription, and SMS provider status before an issue reaches the floor.',
  },
  {
    title: 'Live handoff',
    body: 'Jump from the queue into the lead record, then hand it off to a human owner or move it forward.',
  },
];

export default function Emily() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">Emily</h1>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Live</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Queue + provider health</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Campaign attachment, queue pressure, provider readiness, and live handoff visibility for the Emily workflow.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick links</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to="/pipeline" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Open pipeline
              </Link>
              <Link to="/admin" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Team dashboard
              </Link>
              <Link to="/notifications" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Inbox
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{item.title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-500">{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      <EmilyWidget />
    </div>
  );
}
