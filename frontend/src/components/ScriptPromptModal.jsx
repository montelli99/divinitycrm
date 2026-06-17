import { useState } from 'react';

/**
 * ScriptPromptModal — Shows the EXACT message a student must send.
 * Copy-to-clipboard button + "Mark as Sent" + dismiss.
 */
export default function ScriptPromptModal({ scripts, onDismiss, onMarkSent }) {
  const [copied, setCopied] = useState({});
  const [sent, setSent] = useState({});

  if (!scripts || scripts.length === 0) return null;

  async function handleCopy(scriptName, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [scriptName]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [scriptName]: false })), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function handleMarkSent(scriptName) {
    setSent(prev => ({ ...prev, [scriptName]: true }));
    onMarkSent?.(scriptName);
  }

  return (
    <div className="script-modal-overlay" onClick={onDismiss}>
      <div className="script-modal" onClick={e => e.stopPropagation()}>
        <div className="script-modal-header">
          <h3>📱 Messages to Send</h3>
          <button className="script-modal-close" onClick={onDismiss}>&times;</button>
        </div>

        <div className="script-modal-body">
          {scripts.map((script, idx) => (
            <div key={idx} className="script-card">
              <div className="script-meta">
                <span className="script-name">{script.name || script.templateName}</span>
                <span className="script-recipient">
                  To: {script.recipient || 'Seller'}
                </span>
                {script.actionRequired && script.actionRequired !== 'Ready to send' && (
                  <span className="script-warning">{script.actionRequired}</span>
                )}
              </div>

              <div className="script-text-container">
                <pre className="script-text">{script.filled || script.error || 'No text generated'}</pre>
              </div>

              {script.unfilled && script.unfilled.length > 0 && (
                <div className="script-unfilled">
                  Missing: {script.unfilled.join(', ')}
                </div>
              )}

              <div className="script-actions">
                <button
                  className={`btn btn-sm ${copied[script.templateName] ? 'btn-success' : 'btn-primary'}`}
                  onClick={() => handleCopy(script.templateName, script.filled)}
                  disabled={!script.filled || script.error}
                >
                  {copied[script.templateName] ? '✓ Copied!' : '📋 Copy to Clipboard'}
                </button>

                <button
                  className={`btn btn-sm ${sent[script.templateName] ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => handleMarkSent(script.templateName)}
                  disabled={sent[script.templateName]}
                >
                  {sent[script.templateName] ? '✓ Marked Sent' : '✓ Mark as Sent'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="script-modal-footer">
          <button className="btn btn-secondary" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
