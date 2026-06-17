/**
 * Stage Automation Engine + Script Prompt Engine
 */

const { sql } = require('../db/connection');
const { getTransitionScripts } = require('./script-prompts');

const STAGE_AUTOMATIONS = {
  'NEW_LEAD→QUALIFIED': { name: 'Contact Made', actions: [
    { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
    { type: 'log', message: 'Contact made. CCC sent.' },
  ]},
  'QUALIFIED→LOI_REQUESTED': { name: 'Offer Ready', actions: [
    { type: 'run_underwriting' },
    { type: 'log', message: 'LOI requested.' },
  ]},
  'LOI_REQUESTED→LOI_APPROVED': { name: 'LOI Approved', actions: [
    { type: 'notify', role: 'closer', message: 'LOI approved' },
    { type: 'log', message: 'LOI approved.' },
  ]},
  'LOI_APPROVED→OFFER_SENT': { name: 'Offer Sent', actions: [
    { type: 'set_field', field: 'offer_sent_date', value: 'now' },
    { type: 'set_field', field: 'follow_up_48hr_due', value: 'now+48h' },
    { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
    { type: 'log', message: 'Offer sent.' },
  ]},
  'OFFER_SENT→NEGOTIATING': { name: 'Negotiating', actions: [
    { type: 'set_field', field: 'follow_up_48hr_done', value: true },
    { type: 'log', message: 'Negotiating.' },
  ]},
  'NEGOTIATING→UNDER_CONTRACT': { name: 'Under Contract', actions: [
    { type: 'set_field', field: 'contract_date', value: 'now' },
    { type: 'set_field', field: 'psa_signed_date', value: 'now' },
    { type: 'set_field', field: 'coe_date', value: 'now+30d' },
    { type: 'set_field', field: 'inspection_end_date', value: 'now+14d' },
    { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7 },
    { type: 'set_reminder', reminder_type: 'coe', offset_days: 23 },
    { type: 'notify', role: 'closer', message: 'Contract out' },
    { type: 'log', message: 'Under contract.' },
  ]},
  'UNDER_CONTRACT→CLOSED': { name: 'Closed', actions: [
    { type: 'set_field', field: 'closed_date', value: 'now' },
    { type: 'set_reminder', reminder_type: 'testimonial', offset_days: 7 },
    { type: 'set_reminder', reminder_type: 'referral', offset_days: 14 },
    { type: 'log', message: 'Closed.' },
  ]},
  '*→DEAD': { name: 'Dead', actions: [
    { type: 'set_reminder', reminder_type: 'dom_181' },
    { type: 'log', message: 'Dead.' },
  ]},
  '*→ARCHIVED': { name: 'Archived', actions: [
    { type: 'log', message: 'Archived.' },
  ]},
};

async function executeStageAutomations(leadId, userId, fromStage, toStage, leadData) {
  const key = `${fromStage}→${toStage}`;
  const config = STAGE_AUTOMATIONS[key] || STAGE_AUTOMATIONS[`*→${toStage}`];
  const results = [];
  const now = new Date();

  if (config) {
    for (const action of config.actions) {
      try {
        switch (action.type) {
          case 'set_field': {
            let value = action.value;
            if (value === 'now') value = now.toISOString();
            else if (value === 'now+48h') { const d = new Date(now); d.setHours(d.getHours()+48); value = d.toISOString(); }
            else if (value === 'now+30d') { const d = new Date(now); d.setDate(d.getDate()+30); value = d.toISOString().split('T')[0]; }
            else if (value === 'now+14d') { const d = new Date(now); d.setDate(d.getDate()+14); value = d.toISOString().split('T')[0]; }
            await sql`UPDATE leads SET ${sql.unsafe(action.field)} = ${value} WHERE id = ${leadId}`;
            results.push({ type: 'set_field', field: action.field, value, ok: true });
            break;
          }
          case 'set_reminder': {
            let dueDate = new Date(now);
            if (action.offset_hours) dueDate.setHours(dueDate.getHours()+action.offset_hours);
            else if (action.offset_days) dueDate.setDate(dueDate.getDate()+action.offset_days);
            await sql`INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes) VALUES (gen_random_uuid(), ${leadId}, ${userId}, ${action.reminder_type}, ${dueDate.toISOString()}, ${action.notes||null})`;
            results.push({ type: 'set_reminder', reminder_type: action.reminder_type, ok: true });
            break;
          }
          case 'run_underwriting': {
            const { price, monthly_rent: rent, sqft, arv, condition, existing_loan_balance, existing_loan_rate } = leadData;
            const onePercentValue = price>0 ? rent/price : 0;
            const onePercentRule = onePercentValue>=0.01;
            let rate = 30; if (condition==='reno') rate=60; else if (condition==='livable') rate=45;
            const repairs = (sqft||0)*rate;
            const fee = leadData.wholesale_fee || 20000;
            const inv = (arv||0)*0.70;
            const cash = inv - repairs - fee;
            const f50 = cash>0 ? Math.round(cash*1.27) : 0;
            const subto = arv>0 ? arv-repairs-(existing_loan_balance||0) : 0;
            let rec = 'cash';
            if ((existing_loan_balance||0)>0 && existing_loan_rate>0 && existing_loan_rate<0.05) rec='subto';
            else if (condition==='turnkey') rec='f50';
            else if (condition==='reno') rec='f10';
            await sql`UPDATE leads SET one_percent_rule=${onePercentRule}, one_percent_value=${onePercentValue}, repair_tier_rate=${rate}, repairs_estimate=${repairs}, cash_offer=${cash}, f50_offer=${f50}, f50_down=${Math.round(f50*0.5)}, f50_carryback=${Math.round(f50*0.5)}, f10_offer=${f50}, f10_down=${Math.round(f50*0.1)}, f10_carryback=${Math.round(f50*0.9)}, subto_offer=${subto}, recommended_strategy=${rec} WHERE id=${leadId}`;
            results.push({ type:'run_underwriting', ok:true, data:{ onePercentRule, cash, f50, subto, rec } });
            break;
          }
          case 'notify': {
            await sql`INSERT INTO activity_log (user_id, lead_id, action, details) VALUES (${userId}, ${leadId}, 'notification_sent', ${JSON.stringify({role:action.role,msg:action.message})})`;
            results.push({ type:'notify', role:action.role, ok:true });
            break;
          }
          case 'log': {
            await sql`INSERT INTO activity_log (user_id, lead_id, action, details) VALUES (${userId}, ${leadId}, 'automation_log', ${JSON.stringify({message:action.message})})`;
            results.push({ type:'log', message:action.message, ok:true });
            break;
          }
          default: results.push({ type: action.type, ok:false, error:'Unknown' });
        }
      } catch (err) { results.push({ type:action.type, ok:false, error:err.message }); }
    }
  }

  let scripts = [];
  try { scripts = getTransitionScripts(fromStage, toStage, leadData); } catch (err) { scripts = [{ error: err.message }]; }

  return { automated:!!config, workflow:config?.name||`${fromStage}→${toStage}`, actions_executed:results.length, results, scripts };
}

function getAvailableTransitions(currentStage) {
  const fwd = { NEW_LEAD:['QUALIFIED','DEAD'], QUALIFIED:['LOI_REQUESTED','DEAD'], LOI_REQUESTED:['LOI_APPROVED','DEAD'], LOI_APPROVED:['OFFER_SENT','DEAD'], OFFER_SENT:['NEGOTIATING','DEAD'], NEGOTIATING:['UNDER_CONTRACT','DEAD'], UNDER_CONTRACT:['CLOSED','DEAD'], CLOSED:['ARCHIVED'], DEAD:['NEW_LEAD'], ARCHIVED:['NEW_LEAD'] };
  return fwd[currentStage]||[];
}

module.exports = { STAGE_AUTOMATIONS, executeStageAutomations, getAvailableTransitions };
