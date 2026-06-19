import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getToken } from '../lib/api';

async function apiGet(path) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

const DEFAULT_FONT_SIZE = 3;
const DEFAULT_WPM = 200;
const WPM_TO_PX_PER_SEC = (wpm, fontSizeRem) => {
  return (wpm / 60) * 5 * (fontSizeRem * 0.6 * 16) * 1.4 / 5;
};

function highlightPlaceholders(text) {
  if (!text) return null;
  const parts = text.split(/(\{[\w_]+\})/g);
  return parts.map((p, i) => {
    if (p.match(/^\{[\w_]+\}$/)) {
      return <span key={i} className="placeholder">{p}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default function Teleprompter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const leadId = searchParams.get('lead_id');
  const initialStage = searchParams.get('stage');

  const [stages, setStages] = useState([]);
  const [labels, setLabels] = useState({});
  const [owners, setOwners] = useState({});
  const [buckets, setBuckets] = useState({});
  const [currentStage, setCurrentStage] = useState(initialStage || (leadId ? null : 'CONTACT_MADE'));
  const [script, setScript] = useState(null);
  const [variables, setVariables] = useState({});
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [showVarForm, setShowVarForm] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [scrollPos, setScrollPos] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const scrollerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(0);

  // Load stages
  useEffect(() => {
    apiGet('/teleprompter/stages')
      .then(d => {
        setStages(d.stages);
        setLabels(d.labels);
        setOwners(d.owners);
        setBuckets(d.buckets);
      })
      .catch(e => setError('Failed to load stages: ' + e.message));
  }, []);

  // If lead_id is provided and no initial stage, default to CONTACT_MADE
  useEffect(() => {
    if (leadId && !currentStage) {
      setCurrentStage('CONTACT_MADE');
    }
  }, [leadId, currentStage]);

  // Load script
  useEffect(() => {
    if (!currentStage) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (leadId) qs.set('lead_id', leadId);
    Object.entries(variables).forEach(([k, v]) => {
      if (k !== 'lead_id' && v) qs.set(k, v);
    });
    apiGet(`/teleprompter/${currentStage}?${qs.toString()}`)
      .then(d => {
        setScript(d.script);
        // Auto-populate variables from script's declared list
        const initialVars = { ...variables };
        let changed = false;
        (d.script.variables || []).forEach(v => {
          if (initialVars[v] === undefined) {
            initialVars[v] = '';
            changed = true;
          }
        });
        if (changed) setVariables(initialVars);
        setScrollPos(0);
        setError(null);
      })
      .catch(e => setError('Failed to load script: ' + e.message))
      .finally(() => setLoading(false));
  }, [currentStage, leadId]);

  // Re-render script with current variables
  const renderedScript = useMemo(() => {
    if (!script) return null;
    const substitute = (text) => {
      if (!text) return text;
      return text.replace(/\{(\w+)\}/g, (match, key) => variables[key] || match);
    };
    return {
      ...script,
      opener: substitute(script.opener),
      close: substitute(script.close),
      goal: substitute(script.goal),
      discovery: (script.discovery || []).map(substitute),
      objection: Object.fromEntries(
        Object.entries(script.objection || {}).map(([k, v]) => [substitute(k), substitute(v)])
      )
    };
  }, [script, variables]);

  // Auto-scroll loop
  useEffect(() => {
    if (!scrolling) {
      cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = 0;
      return;
    }
    const tick = (ts) => {
      if (!lastTimeRef.current) lastTimeRef.current = ts;
      const dt = (ts - lastTimeRef.current) / 1000;
      lastTimeRef.current = ts;
      const velocity = WPM_TO_PX_PER_SEC(wpm, fontSize);
      setScrollPos(p => {
        const next = p + velocity * dt;
        const maxScroll = scrollerRef.current 
          ? scrollerRef.current.scrollHeight - scrollerRef.current.clientHeight
          : 0;
        if (next >= maxScroll) {
          setScrolling(false);
          return maxScroll;
        }
        return next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [scrolling, wpm, fontSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case ' ': e.preventDefault(); setScrolling(s => !s); break;
        case 'Escape': setShowStagePicker(false); setShowVarForm(false); break;
        case 'ArrowUp': e.preventDefault(); setWpm(w => Math.min(500, w + 25)); break;
        case 'ArrowDown': e.preventDefault(); setWpm(w => Math.max(50, w - 25)); break;
        case 'g': case 'G': setShowStagePicker(s => !s); break;
        case 'v': case 'V': setShowVarForm(s => !s); break;
        case 'r': case 'R': setScrollPos(0); break;
        case '+': case '=': setFontSize(s => Math.min(6, s + 0.25)); break;
        case '-': setFontSize(s => Math.max(1.5, s - 0.25)); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error) {
    return (
      <div className="tp-error" style={{ padding: '2rem' }}>
        <h2 style={{ color: 'var(--danger)' }}>❌ Error</h2>
        <p>{error}</p>
        <p style={{ color: 'var(--text-tertiary)', marginTop: '1rem' }}>
          Make sure you're logged in to the CRM.
        </p>
      </div>
    );
  }

  if (loading || !renderedScript) {
    return (
      <div className="tp-loading" style={{ padding: '2rem' }}>
        <h2>Loading teleprompter...</h2>
      </div>
    );
  }

  return (
    <div className="tp-app">
      <style>{`
        .tp-app {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 60px);
          background: #000;
          color: #fff;
          margin: -2rem;
          margin-top: -1rem;
        }
        .tp-controls {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          align-items: center;
          flex-shrink: 0;
        }
        .tp-controls button, .tp-controls select {
          background: #1f2937;
          color: #fff;
          border: 1px solid #374151;
          padding: 0.4rem 0.7rem;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          font-family: inherit;
        }
        .tp-controls button:hover { background: #374151; }
        .tp-controls button.tp-primary { background: #fbbf24; color: #000; border-color: #fbbf24; font-weight: 600; }
        .tp-controls button.tp-danger { background: #ef4444; border-color: #ef4444; }
        .tp-stage-info { display: flex; flex-direction: column; margin-left: auto; text-align: right; }
        .tp-stage-info .tp-label { font-weight: 700; font-size: 1rem; }
        .tp-stage-info .tp-owner { color: #9ca3af; font-size: 0.8rem; }
        .tp-scroller-wrap { flex: 1; overflow: hidden; position: relative; }
        .tp-scroller {
          position: absolute;
          top: 0; left: 0; right: 0;
          padding: 3rem 5rem;
          font-size: 3rem;
          line-height: 1.4;
          font-weight: 500;
          color: #fff;
          transition: transform 0.1s linear;
        }
        .tp-scroller .tp-section { margin-bottom: 2.5rem; }
        .tp-scroller .tp-section-label {
          font-size: 1.25rem;
          color: #fbbf24;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.4rem;
        }
        .tp-scroller .tp-placeholder {
          background: rgba(251, 191, 36, 0.2);
          border: 2px dashed #fbbf24;
          padding: 0 0.3em;
          border-radius: 4px;
        }
        .tp-scroller .tp-red-flag { color: #ef4444; font-weight: 700; }
        .tp-scroller .tp-objection-q { color: #fbbf24; font-style: italic; }
        .tp-scroller .tp-objection-a { margin-left: 1.5rem; }
        .tp-bottom {
          display: flex;
          gap: 1.5rem;
          padding: 0.6rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          align-items: center;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .tp-bottom .tp-speed { display: flex; align-items: center; gap: 0.5rem; }
        .tp-bottom input[type=range] { width: 160px; }
        .tp-bottom .tp-wpm { font-size: 1.5rem; font-weight: 800; color: #fbbf24; min-width: 60px; text-align: right; }
        .tp-bottom .tp-hint { color: #9ca3af; margin-left: auto; }
        .tp-bottom kbd {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 3px;
          padding: 0.1em 0.4em;
          font-family: monospace;
          font-size: 0.75rem;
        }
        .tp-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .tp-stage-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.5rem;
          max-width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          padding: 2rem;
        }
        .tp-stage-grid h2 { grid-column: 1 / -1; color: #fbbf24; margin-bottom: 1rem; font-size: 1.5rem; }
        .tp-stage-grid .tp-bucket { grid-column: 1 / -1; font-weight: 700; color: #fbbf24; margin-top: 0.5rem; }
        .tp-stage-grid button {
          background: #1f2937;
          color: #fff;
          border: 1px solid #374151;
          padding: 0.75rem 0.5rem;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          font-size: 0.8rem;
          min-height: 50px;
          font-family: inherit;
        }
        .tp-stage-grid button:hover { background: #374151; border-color: #fbbf24; }
        .tp-stage-grid button .tp-owner { color: #9ca3af; font-size: 0.65rem; margin-top: 0.2rem; }
        .tp-var-form {
          background: #1f2937;
          padding: 1.5rem;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
        }
        .tp-var-form h2 { color: #fbbf24; margin-bottom: 0.75rem; }
        .tp-var-form input {
          background: #111827;
          color: #fff;
          border: 1px solid #374151;
          padding: 0.4rem 0.6rem;
          border-radius: 4px;
          font-size: 0.85rem;
          width: 200px;
          font-family: inherit;
        }
        .tp-var-form .tp-var-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
        .tp-var-form .tp-var-row label { min-width: 120px; color: #9ca3af; font-size: 0.85rem; }
      `}</style>

      <div className="tp-controls">
        <button onClick={() => setShowStagePicker(true)}>
          📋 {labels[currentStage] || currentStage}
        </button>
        <button onClick={() => setShowVarForm(s => !s)}>
          ✏️ Vars ({Object.values(variables).filter(v => v && v !== '').length})
        </button>
        <button onClick={() => setScrolling(s => !s)} className={scrolling ? 'tp-danger' : 'tp-primary'}>
          {scrolling ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={() => setScrollPos(0)}>⏮ Reset</button>
        {leadId && (
          <button onClick={() => navigate(`/leads/${leadId}`)}>
            ← Back to Lead
          </button>
        )}
        <div className="tp-stage-info">
          <div className="tp-label">{renderedScript.title}</div>
          <div className="tp-owner">Owner: {owners[currentStage]}</div>
        </div>
      </div>

      <div className="tp-scroller-wrap" ref={scrollerRef}>
        <div
          className="tp-scroller"
          style={{
            transform: `translateY(-${scrollPos}px)`,
            fontSize: `${fontSize}rem`
          }}
        >
          <div className="tp-section">
            <div className="tp-section-label">🎯 Goal</div>
            <div>{highlightPlaceholders(renderedScript.goal)}</div>
          </div>

          <div className="tp-section">
            <div className="tp-section-label">👋 Opener</div>
            <div>{highlightPlaceholders(renderedScript.opener)}</div>
          </div>

          {renderedScript.discovery && renderedScript.discovery.length > 0 && (
            <div className="tp-section">
              <div className="tp-section-label">❓ Discovery Questions</div>
              <ul style={{ listStyle: 'none' }}>
                {renderedScript.discovery.map((q, i) => (
                  <li key={i} style={{ marginBottom: '0.4em' }}>• {highlightPlaceholders(q)}</li>
                ))}
              </ul>
            </div>
          )}

          {renderedScript.objection && Object.keys(renderedScript.objection).length > 0 && (
            <div className="tp-section">
              <div className="tp-section-label">⚡ Objection Handling</div>
              {Object.entries(renderedScript.objection).map(([q, a], i) => (
                <div key={i} style={{ marginBottom: '0.8em' }}>
                  <div className="tp-objection-q">"{q}"</div>
                  <div className="tp-objection-a">→ {a}</div>
                </div>
              ))}
            </div>
          )}

          <div className="tp-section">
            <div className="tp-section-label">🎬 Close / Next Step</div>
            <div>{highlightPlaceholders(renderedScript.close)}</div>
          </div>

          {renderedScript.red_flags && renderedScript.red_flags.length > 0 && (
            <div className="tp-section">
              <div className="tp-section-label" style={{ color: '#ef4444' }}>🚩 Red Flags</div>
              <ul style={{ listStyle: 'none' }}>
                {renderedScript.red_flags.map((rf, i) => (
                  <li key={i} className="tp-red-flag">⚠ {rf}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="tp-bottom">
        <div className="tp-speed">
          <span>WPM:</span>
          <input
            type="range"
            min="50" max="500" step="25"
            value={wpm}
            onChange={e => setWpm(Number(e.target.value))}
          />
          <span className="tp-wpm">{wpm}</span>
        </div>
        <div className="tp-speed">
          <span>Font:</span>
          <input
            type="range"
            min="1.5" max="6" step="0.25"
            value={fontSize}
            onChange={e => setFontSize(Number(e.target.value))}
          />
          <span>{fontSize}rem</span>
        </div>
        <div className="tp-hint">
          <kbd>Space</kbd> play • <kbd>↑↓</kbd> speed • <kbd>+-</kbd> font • <kbd>G</kbd> stages • <kbd>V</kbd> vars • <kbd>R</kbd> reset
        </div>
      </div>

      {showStagePicker && (
        <div className="tp-modal-bg" onClick={() => setShowStagePicker(false)}>
          <div className="tp-stage-grid" onClick={e => e.stopPropagation()}>
            <h2>📋 Pick a Stage</h2>
            {Object.entries(buckets).map(([bucket, stageList]) => (
              <div key={bucket} style={{ display: 'contents' }}>
                <div className="tp-bucket">{bucket} ({stageList.length})</div>
                {stageList.map(s => (
                  <button key={s} onClick={() => { setCurrentStage(s); setShowStagePicker(false); }}>
                    {labels[s]}
                    <div className="tp-owner">{owners[s]}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {showVarForm && (
        <div className="tp-modal-bg" onClick={() => setShowVarForm(false)}>
          <div className="tp-var-form" onClick={e => e.stopPropagation()}>
            <h2>✏️ Variables</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              Fill in the values for placeholders. Press Enter to apply.
            </p>
            {(script?.variables || []).map(v => (
              <div key={v} className="tp-var-row">
                <label>{v}:</label>
                <input
                  type="text"
                  value={variables[v] || ''}
                  onChange={e => setVariables(prev => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`Enter ${v}...`}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setVariables({})} style={{ background: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '0.4rem 0.7rem', borderRadius: '6px', cursor: 'pointer' }}>Clear</button>
              <button onClick={() => setShowVarForm(false)} className="tp-primary" style={{ background: '#fbbf24', color: '#000', border: '1px solid #fbbf24', padding: '0.4rem 0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
