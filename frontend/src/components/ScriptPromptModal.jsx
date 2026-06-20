import { useState } from 'react';

/**
 * ScriptPromptModal — Enhanced Stage Transition Prompt Modal
 * =============================================================
 * Rebuilt 2026-06-17. Shows:
 *   - Stage transition title and description
 *   - Step-by-step instructions (numbered)
 *   - Pre-filled text messages in styled cards
 *   - "To:" field showing recipient name/email
 *   - Copy button for each message
 *   - "Mark as Sent" button
 *   - Missing fields warning
 *   - Action checklist (call, email, take notes)
 *   - Follow-up reminders with dates
 */
export default function ScriptPromptModal({ prompt, scripts, onDismiss, onMarkSent, inline = false }) {
  const [copied, setCopied] = useState({});
  const [sent, setSent] = useState({});
  const [completedSteps, setCompletedSteps] = useState({});

  // Support both new rich prompt format and legacy scripts array
  const hasRichPrompt = prompt && prompt.steps;
  const hasLegacyScripts = scripts && scripts.length > 0;

  if (!hasRichPrompt && !hasLegacyScripts) return null;

  async function handleCopy(id, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [id]: false })), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function handleMarkSent(id, payload) {
    setSent(prev => ({ ...prev, [id]: true }));
    onMarkSent?.(payload || id);
  }

  function toggleStepComplete(stepNum) {
    setCompletedSteps(prev => ({ ...prev, [stepNum]: !prev[stepNum] }));
  }

  const content = (
    <div className="script-modal-enhanced">
      {/* Header */}
      <div className="script-modal-header">
        <div>
          <h2>{prompt?.title || 'Stage Transition Scripts'}</h2>
          {prompt?.description && (
            <p className="script-modal-subtitle">{prompt.description}</p>
          )}
          {prompt?.leadName && (
            <p className="script-modal-lead">
              Lead: <strong>{prompt.leadName}</strong>
              {prompt.leadAddress && ` — ${prompt.leadAddress}`}
            </p>
          )}
        </div>
        {!inline && onDismiss && (
          <button className="script-modal-close" onClick={onDismiss}>&times;</button>
        )}
      </div>

        {/* Body */}
      <div className="script-modal-body">
          {/* Rich Prompt Steps */}
          {hasRichPrompt && prompt.steps.map((step, idx) => (
            <div key={idx} className={`prompt-step ${completedSteps[step.step] ? 'step-completed' : ''}`}>
              {/* Step header */}
              <div className="step-header" onClick={() => toggleStepComplete(step.step)}>
                <div className="step-number">
                  <span className="step-badge">{step.step}</span>
                  {completedSteps[step.step] && <span className="step-check">✓</span>}
                </div>
                <div className="step-title-section">
                  <h4 className="step-action-label">
                    {getActionIcon(step.action)} {getActionLabel(step.action)}
                  </h4>
                  <p className="step-instruction">{step.instruction}</p>
                </div>
              </div>

              {/* Step detail */}
              <div className="step-detail">
                {/* Pre-filled message card */}
                {step.filledMessage && (
                  <div className="message-card">
                    <div className="message-card-header">
                      <span className="message-template-badge">{step.template}</span>
                      <span className="message-to">
                        To: <strong>{step.recipientName || step.to}</strong>
                        {step.recipientType && (
                          <span className="recipient-type-tag">{step.recipientType}</span>
                        )}
                      </span>
                    </div>
                    <div className="message-body">
                      <pre className="message-text">{step.filledMessage}</pre>
                    </div>
                    {step.unfilled && step.unfilled.length > 0 && (
                      <div className="message-warning">
                        ⚠️ Missing fields: {step.unfilled.join(', ')}
                      </div>
                    )}
                    <div className="message-actions">
                      <button
                        className={`btn btn-sm ${copied[`msg-${step.step}`] ? 'btn-success' : 'btn-primary'}`}
                        onClick={() => handleCopy(`msg-${step.step}`, step.filledMessage)}
                      >
                        {copied[`msg-${step.step}`] ? '✓ Copied!' : '📋 Copy'}
                      </button>
                      <button
                        className={`btn btn-sm ${sent[`msg-${step.step}`] ? 'btn-success' : 'btn-secondary'}`}
                        onClick={() => handleMarkSent(`msg-${step.step}`, {
                          source: 'crm',
                          key: step.template,
                          body: step.filledMessage,
                          recipient: step.recipient || step.to,
                          templateName: step.template,
                          recipientType: step.recipientType,
                        })}
                        disabled={sent[`msg-${step.step}`]}
                      >
                        {sent[`msg-${step.step}`] ? '✓ Sent' : '✓ Mark Sent'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Filled script (voice memo / call script) */}
                {step.filledScript && (
                  <div className="script-card">
                    <div className="script-card-header">
                      <span className="script-type-badge">📞 Call Script</span>
                    </div>
                    <div className="script-body">
                      <pre className="script-text">{step.filledScript}</pre>
                    </div>
                    <div className="script-actions">
                      <button
                        className={`btn btn-sm ${copied[`script-${step.step}`] ? 'btn-success' : 'btn-primary'}`}
                        onClick={() => handleCopy(`script-${step.step}`, step.filledScript)}
                      >
                        {copied[`script-${step.step}`] ? '✓ Copied!' : '📋 Copy Script'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Objection handlers */}
                {step.filledObjectionScripts && (
                  <div className="objection-section">
                    <h5>🛡️ Objection Handlers</h5>
                    {Object.entries(step.filledObjectionScripts).map(([key, script]) => (
                      <div key={key} className="objection-card">
                        <span className="objection-label">{formatObjectionKey(key)}</span>
                        <pre className="objection-text">{script}</pre>
                        <button
                          className={`btn btn-sm ${copied[`obj-${step.step}-${key}`] ? 'btn-success' : 'btn-primary'}`}
                          onClick={() => handleCopy(`obj-${step.step}-${key}`, script)}
                        >
                          {copied[`obj-${step.step}-${key}`] ? '✓ Copied!' : '📋 Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Note-taking fields */}
                {step.fields && step.fields.length > 0 && (
                  <div className="fields-section">
                    <h5>📝 Record These Details</h5>
                    <div className="fields-grid">
                      {step.fields.map(field => (
                        <span key={field} className="field-tag">{formatFieldName(field)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email action */}
                {step.action === 'send_email' && (
                  <div className="email-action-card">
                    <h5>📧 Email</h5>
                    <p><strong>To:</strong> {step.to}</p>
                    <p><strong>Subject:</strong> {step.subject_template}{step.subject_alt && ` (or "${step.subject_alt}")`}</p>
                    {step.body_template && (
                      <>
                        <p><strong>Body:</strong></p>
                        <pre className="message-text" style={{ marginTop: '0.25rem' }}>{step.body_template}</pre>
                        <div className="message-actions" style={{ marginTop: '0.5rem' }}>
                          <button
                            className={`btn btn-sm ${copied[`email-${step.step}`] ? 'btn-success' : 'btn-primary'}`}
                            onClick={() => handleCopy(`email-${step.step}`, step.body_template)}
                          >
                            {copied[`email-${step.step}`] ? '✓ Copied!' : '📋 Copy Email'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Notify action */}
                {step.action === 'notify' && step.contacts && (
                  <div className="notify-card">
                    <h5>📢 Notify</h5>
                    <p><strong>Role:</strong> {step.role}</p>
                    <p><strong>Contacts:</strong> {step.contacts.join(', ')}</p>
                  </div>
                )}

                {/* Detail text */}
                {step.detail && !step.filledMessage && !step.filledScript && (
                  <div className="step-detail-text">
                    <p>{step.detail}</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Legacy scripts (backward compatibility) */}
          {!hasRichPrompt && hasLegacyScripts && scripts.map((script, idx) => (
            <div key={idx} className="script-card-legacy">
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
                  {copied[script.templateName] ? '✓ Copied!' : '📋 Copy'}
                </button>
                <button
                  className={`btn btn-sm ${sent[script.templateName] ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => handleMarkSent(script.templateName, {
                    source: 'crm',
                    key: script.templateName,
                    body: script.filled,
                    recipient: script.recipient,
                    templateName: script.templateName,
                    recipientType: script.recipientType,
                  })}
                  disabled={sent[script.templateName]}
                >
                  {sent[script.templateName] ? '✓ Sent' : '✓ Mark Sent'}
                </button>
              </div>
            </div>
          ))}
        </div>

      {/* Reminders */}
      {prompt?.reminders && prompt.reminders.length > 0 && (
        <div className="script-modal-reminders">
          <h4>⏰ Follow-up Reminders Set</h4>
          {prompt.reminders.map((r, idx) => (
            <div key={idx} className="reminder-item">
              <span className="reminder-type-badge">{formatReminderType(r.type)}</span>
              <span className="reminder-desc">{r.description}</span>
              <span className="reminder-date">Due: {r.due_date_formatted || new Date(r.due_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!inline && (
        <div className="script-modal-footer">
          <div className="footer-stats">
            {hasRichPrompt && (
              <span>{prompt.steps.length} steps · {prompt.reminders?.length || 0} reminders</span>
            )}
          </div>
          <div className="footer-actions">
            {onDismiss && (
              <button className="btn btn-secondary" onClick={onDismiss}>
                Dismiss
              </button>
            )}
            {onDismiss && (
              <button className="btn btn-primary" onClick={onDismiss}>
                Got It — I'll Execute
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <section className="script-modal-inline">
        {content}
      </section>
    );
  }

  return (
    <div className="script-modal-overlay" onClick={onDismiss}>
      <div onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================

function getActionIcon(action) {
  const icons = {
    send_text: '📱',
    call: '📞',
    take_notes: '📝',
    evaluate: '🔍',
    run_underwriting: '🧮',
    send_email: '📧',
    notify: '📢',
    send_offer: '📄',
    set_reminder: '⏰',
    handle_objections: '🛡️',
    call_and_sign: '✍️',
    set_dates: '📅',
    notify_tc: '📋',
    ask_referral: '🙏',
    archive: '📦',
    calendar: '📅',
    record_reason: '📝',
    save_contact: '💾',
    import_loi: '📥',
    check_rental_comps: '🏠',
    end_of_day: '📊',
    log: '📋',
  };
  return icons[action] || '▶️';
}

function getActionLabel(action) {
  const labels = {
    send_text: 'Send Text Message',
    call: 'Make Phone Call',
    take_notes: 'Take Notes',
    evaluate: 'Evaluate Deal',
    run_underwriting: 'Run Underwriting',
    send_email: 'Send Email',
    notify: 'Notify Team',
    send_offer: 'Send Offer',
    set_reminder: 'Set Reminder',
    handle_objections: 'Handle Objections',
    call_and_sign: 'Call & Sign PSA',
    set_dates: 'Set Key Dates',
    notify_tc: 'Notify Transaction Coordinator',
    ask_referral: 'Ask for Referrals',
    archive: 'Archive Lead',
    calendar: 'Set Calendar Reminder',
    record_reason: 'Record Reason',
    save_contact: 'Save Contact',
    import_loi: 'Import LOI Link',
    check_rental_comps: 'Check Rental Comps',
    end_of_day: 'End-of-Day Report',
    log: 'Log Activity',
  };
  return labels[action] || action.replace(/_/g, ' ');
}

function formatFieldName(field) {
  const names = {
    agent_name: 'Agent Name',
    agent_phone: 'Agent Phone',
    agent_email: 'Agent Email',
    seller_name: 'Seller Name',
    seller_phone: 'Seller Phone',
    seller_email: 'Seller Email',
    roof_age: 'Roof Age',
    hvac_age: 'HVAC Age',
    occupancy: 'Occupancy',
    current_rent: 'Current Rent',
    monthly_rent: 'Monthly Rent',
    lease_type: 'Lease Type',
    lease_term: 'Lease Term',
    utilities_status: 'Utilities Status',
    other_buyer_feedback: 'Buyer Feedback',
    condition: 'Condition',
    condition_rating: 'Condition Rating',
    population: 'Population',
    population_ok: 'Population ≥10K?',
    buy_box_passed: 'Buy Box Passed?',
    psa_signed_date: 'PSA Signed Date',
    coe_date: 'COE Date',
    inspection_end_date: 'Inspection End Date',
    inspection_period_days: 'Inspection Period Days',
    dead_reason: 'Dead Reason',
  };
  return names[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatObjectionKey(key) {
  const names = {
    wants_cash: '💰 Wants Cash / No Seller Finance',
    ask_viewing: '🏠 Asks About Viewing',
    general_questions: '❓ General Questions',
  };
  return names[key] || key.replace(/_/g, ' ');
}

function formatReminderType(type) {
  const names = {
    '48hr_followup': '48hr Follow-up',
    inspection: 'Inspection',
    coe: 'COE / Closing',
    testimonial: 'Testimonial',
    referral: 'Referral',
    dom_181: 'Listing Expiry',
  };
  return names[type] || type.replace(/_/g, ' ');
}
