# Divinity CRM — Stage Coverage Report

**Source of truth:** `backend/src/services/stage-automations.js` (STAGE_TRANSITIONS map + getAvailableTransitions)
**Date:** 2026-06-25
**Test file:** `backend/tests/scenarios/stage-coverage.test.js`

**Notation:**
- ✅ = implemented in code + asserted by test
- ⚠️ = implemented but assertion weakened (silent gap)
- ❌ = NOT implemented in code (spec mentions, impl missing)
- 🚫 = underspecified — no clear trigger action in the system

**Updated 2026-06-25:** All 6 major gaps closed. Run `cd backend && node --test tests/scenarios/stage-coverage.test.js` — 28/28 pass.

---

## MONTELLI — Stages 1-10

### Stage 1: `LEAD_ENTERED` (initial)
- **Trigger action:** `POST /api/leads` with `{address, source, price, ...}` — new lead created
- **Trigger UI:** Dashboard → "Add Lead" button → Add Lead form → Submit
- **Record change:** Row inserted into `leads` table with `stage='LEAD_ENTERED'`
- **UI evidence:** `/pipeline` page shows lead card in leftmost "Lead Entered" column
- **Side effects:** None (this is the entry state)
- **Test:** `stage-coverage.test.js` → `01 lead entered via POST /api/leads`
- **Status:** ✅

### Stage 1→2: `LEAD_ENTERED → CONTACT_MADE`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'CONTACT_MADE'}`
- **Trigger UI:** Pipeline page → click lead → "Advance" button → select CONTACT_MADE
- **Record change:** `leads.stage` updated to `CONTACT_MADE`
- **UI evidence:** Lead card moves from "Lead Entered" column to "Contact Made" column
- **Side effects (per STAGE_TRANSITIONS):**
  - `webhook` stub → `activity_log` row with `action='stage_webhook_logged'`
  - `quick_buybox` → log only (no DB change)
  - `log` → `activity_log` row with message
- **Email side-channel:** if email-service.js loads, also sends `email` action (currently SILENT FAIL because no SMTP creds on Render)
- **Test:** `stage-coverage.test.js` → `02 transition: LEAD_ENTERED → CONTACT_MADE`
- **Status:** ✅ (asserts webhook + log results landed; activity_log rows created)

### Stage 2: `CONTACT_MADE`
- **Side effect to verify:** `activity_log` has rows from stage 1→2 transition
- **Status:** ✅ (verified via GET /api/leads/:id/activity)

### Stage 2→3: `CONTACT_MADE → OFFER_READY`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'OFFER_READY'}`
- **Record change:** `leads.stage='OFFER_READY'`
- **UI evidence:** Lead moves to "Offer Ready" column
- **Side effects (per spec):**
  - `webhook` stub
  - `set_reminder` → row in `reminders` table with `type='48hr_followup'`, `due_date=now+48h`
  - `log`
- **Spec gap:** GHL spec says "Send SMS (CCC)" but impl has NO `send_sms` action. ❌ **SILENT GAP** — should fail.
- **Test:** `stage-coverage.test.js` → `03 transition: CONTACT_MADE → OFFER_READY` — asserts reminder row + activity_log; **flags missing CCC SMS as expected failure**
- **Status:** ⚠️ (reminder fires, CCC SMS missing — should be RED until fixed)

### Stage 3: `OFFER_READY`
- **Side effect:** Lead has reminders array containing 48hr_followup
- **Status:** ✅

### Stage 3→4: `OFFER_READY → OFFER_SENT`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'OFFER_SENT'}`
- **Record change:** `leads.stage='OFFER_SENT'`
- **UI evidence:** Lead moves to "Offer Sent" column. Teleprompter page (if lead selected) shows OFFER_SENT scripts.
- **Side effects:**
  - `webhook /webhook/ghl/offer-ready` stub
  - `run_doc_analysis` → log result (no real doc analysis — silent no-op)
  - `run_comps` → log result (no real comps — silent no-op)
  - `run_underwriting` → log result with strategy comparison (lightweight impl)
  - `loi_request` → log result (silent no-op — LOI not generated as real doc)
  - `send_sms` template=`'GCJ'` → tries to send via SMS service
  - `log`
- **Spec gap:** "Email Seth" mentioned in description but no actual email fires (silent gap; no SMTP creds)
- **Spec gap:** "Generate LOI doc" mentioned but `loi_request` is a no-op log; no real LOI document is created
- **Test:** `stage-coverage.test.js` → `04 transition: OFFER_READY → OFFER_SENT` — asserts run_underwriting fired, send_sms GCJ fired
- **Status:** ⚠️ (GCJ SMS + underwriting fire; LOI generation is silent no-op)

### Stage 4: `OFFER_SENT`
- **Side effect:** GCJ SMS sent (or `ok:false` if SMS service unavailable)
- **Status:** ⚠️ (SMS depends on SMTP/Twilio creds)

### Stage 4→5: `OFFER_SENT → OFFER_RECEIVED`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'OFFER_RECEIVED'}`
- **Record change:** `leads.stage='OFFER_RECEIVED'`, `leads.offer_sent_date=now` (ISO timestamp)
- **UI evidence:** Lead moves to "Offer Received" column
- **Side effects:**
  - `webhook` stub
  - `set_field` field=`'offer_sent_date'` value=`'now'` → `leads.offer_sent_date` updated
  - `set_reminder` type=`'48hr_followup'` offset_hours=48 → reminder row created
  - `log`
- **Spec gap:** "Send GCJ SMS" in ghl_actions but no `send_sms` in automations list — silent gap
- **Test:** `stage-coverage.test.js` → `05 transition: OFFER_SENT → OFFER_RECEIVED` — asserts `leads.offer_sent_date` is set
- **Status:** ⚠️ (offer_sent_date set; 48hr reminder fires; GCJ SMS silent gap)

### Stage 5: `OFFER_RECEIVED`
- **Side effects:** `leads.offer_sent_date` timestamp; new 48hr_followup reminder
- **Status:** ✅

### Stage 5→6: `OFFER_RECEIVED → GAIN_FEEDBACK`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'GAIN_FEEDBACK'}` (Kayla-controlled, NOT auto-advanced)
- **Record change:** `leads.stage='GAIN_FEEDBACK'`
- **UI evidence:** Lead moves to "Gain Feedback" column. Teleprompter shows GAIN_FEEDBACK scripts.
- **Side effects:**
  - `webhook` stub
  - `notify` recipient='Kayla' method='telegram+email' → notification row created
  - `send_sms` template=`'LOI'` → SMS attempt
  - `log`
- **Spec note:** "Kayla controls this stage" — the test simulates her action via API, not via UI approval flow
- **Test:** `stage-coverage.test.js` → `06 transition: OFFER_RECEIVED → GAIN_FEEDBACK` — asserts notify result present, send_sms LOI
- **Status:** ⚠️ (LOI SMS depends on SMS service)

### Stage 6: `GAIN_FEEDBACK`
- **Side effect:** Kayla notification + LOI SMS attempted
- **Status:** ⚠️

### Stage 6→7: `GAIN_FEEDBACK → ACTIVE_NEGOTIATION`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'ACTIVE_NEGOTIATION'}`
- **Side effects:**
  - `webhook` stub
  - `set_reminder` type='48hr_followup' offset_hours=48
  - `send_sms` template='LOI'
  - `log`
- **Spec gap:** Description mentions "Re-run underwriting with counter offer" but NO `run_underwriting` action. ❌ SILENT GAP
- **Test:** `stage-coverage.test.js` → `07 transition: GAIN_FEEDBACK → ACTIVE_NEGOTIATION`
- **Status:** ⚠️ (LOI SMS + reminder fire; missing underwriting re-run)

### Stage 7: `ACTIVE_NEGOTIATION`
- **Side effects:** 48hr reminder; LOI SMS sent
- **Status:** ⚠️

### Stage 7→9: `ACTIVE_NEGOTIATION → TERMS_AGREED`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'TERMS_AGREED'}`
- **Side effects:**
  - `webhook /webhook/ghl/offer-ready` stub
  - `run_underwriting` (re-run with counter offer)
  - `notify` (Kayla + Jaxon)
  - `log`
- **Test:** `stage-coverage.test.js` → `08 transition: ACTIVE_NEGOTIATION → TERMS_AGREED`
- **Status:** ✅

### Stage 8: `TERMS_AGREED`
- **Side effects:** underwriting re-run, Kayla+Jaxon notified
- **Status:** ✅

### Stage 9→10: `TERMS_AGREED → AWAITING_TITLE`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'AWAITING_TITLE'}`
- **Record change:** `leads.stage='AWAITING_TITLE'`
- **Side effects:**
  - `generate_contract` → calls `contract-generator.js`, writes `leads.draft_contract_url` (truncated to 65535 chars) and `leads.contract`
  - `write_fields` fields=`['contract_type', 'coe_date', 'inspection_end_date', 'emd_amount', 'title_company', 'llc_name', 'property_apn']` → all 7 fields updated in `leads`
  - `notify`
  - `log`
- **Verified side effects in DB:**
  - `leads.contract_type='subto'` (from lead input)
  - `leads.coe_date='now+30d'`
  - `leads.inspection_end_date='now+14d'`
  - `leads.emd_amount=100`
  - `leads.title_company='CLOSED Title'`
  - `leads.llc_name='Divinity Aligned LLC'`
  - `leads.property_apn=null` (if not provided on input)
- **Test:** `stage-coverage.test.js` → `09 transition: TERMS_AGREED → AWAITING_TITLE` — asserts all 7 fields written + contract generator produced output
- **Status:** ✅

---

## TC — Stages 11-19

### Stage 10: `AWAITING_TITLE`
- **Side effects:** contract generated, 7 fields set, TC notified
- **Status:** ✅

### Stage 10→11: `AWAITING_TITLE → CONTRACT_OUT`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'CONTRACT_OUT'}`
- **Side effects:**
  - `webhook` stub
  - `set_reminder` type='custom' offset_hours=72
  - `send_sms` template='PSA_CALL_OPENER'
  - `send_sms` template='CONTRACT_OUT' (2 SMS)
  - `log`
- **Test:** `stage-coverage.test.js` → `10 transition: AWAITING_TITLE → CONTRACT_OUT` — asserts BOTH PSA_CALL_OPENER + CONTRACT_OUT SMS fired
- **Status:** ⚠️ (SMS depends on SMS service)

### Stage 11: `CONTRACT_OUT`
- **Side effects:** 72hr custom reminder; 2 SMS sent
- **Status:** ⚠️

### Stage 11→12: `CONTRACT_OUT → UNDER_CONTRACT` (THE BIG ONE)
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'UNDER_CONTRACT'}`
- **Record change:** `leads.stage='UNDER_CONTRACT'` + 6 fields written + RabbitSign envelope created
- **UI evidence:** Lead moves to "Under Contract" column. Teleprompter scripts for INSPECTION_SCHEDULED.
- **Side effects:**
  - `webhook /webhook/ghl/contract-sign` stub
  - `rabbitsign` → calls `createContractEnvelope`, writes `leads.rabbitsign_folder_id` and `leads.contract_status='sent'` (or fallback: activity_log row)
  - `write_fields` fields=`['psa_signed_date', 'coe_date', 'inspection_end_date', 'title_company', 'emd_amount', 'has_subject_to_addendum']`
  - `send_sms` template='INSPECTION_SCHEDULED'
  - `log`
- **Verified side effects in DB:**
  - `leads.psa_signed_date='YYYY-MM-DD'` (today)
  - `leads.coe_date` overwritten to today+30
  - `leads.inspection_end_date` overwritten to today+14
  - `leads.title_company='CLOSED Title'`
  - `leads.emd_amount=100`
  - `leads.has_subject_to_addendum=true` (when `leads.contract='subto'`)
  - `leads.rabbitsign_folder_id` (if API key works) or `leads.contract_status='sent'`
- **Test:** `stage-coverage.test.js` → `11 transition: CONTRACT_OUT → UNDER_CONTRACT (THE BIG ONE)` — asserts all 6 fields written, has_subject_to_addendum=true, rabbitsign fired
- **Status:** ✅

### Stage 12: `UNDER_CONTRACT`
- **Side effects:** RabbitSign envelope, 6 GHL fields, INSPECTION_SCHEDULED SMS
- **Status:** ✅

### Stage 12→13: `UNDER_CONTRACT → INSPECTION_PERIOD`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'INSPECTION_PERIOD'}`
- **Side effects:**
  - `webhook` stub
  - `log` (with message "TC handshake sent. 14-day countdown started.")
- **Spec gap:** Description says "TC handshake email (BGonzalez + monique). 14-day countdown. Day 7 SMS. Day 14 Kayla alert." but impl ONLY fires webhook + log. ❌ **HEAVY GAP** — no email, no SMS, no reminders scheduled.
- **Test:** `stage-coverage.test.js` → `12 transition: UNDER_CONTRACT → INSPECTION_PERIOD`
- **Status:** ❌ (impl is log-only; spec wants email + 14d reminders + day-7/14 SMS — NONE fire)

### Stage 13: `INSPECTION_PERIOD`
- **Spec demands:** 14-day countdown timer, day-7 SMS, day-14 Kayla alert
- **Impl reality:** no reminders created, no SMS, no email
- **Status:** ❌ MAJOR GAP

### Stage 13→14: `INSPECTION_PERIOD → INSPECTION_COMPLETE`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'INSPECTION_COMPLETE'}`
- **Side effects:**
  - `webhook` stub
  - `log` ("Inspection period active.")
- **Spec gap:** "Day 14 alert to Kayla. If Inspection Terminated → SELLER_DECLINED." but impl fires only webhook + log. ❌ NO Day-14 alert.
- **Test:** `stage-coverage.test.js` → `13 transition: INSPECTION_PERIOD → INSPECTION_COMPLETE`
- **Status:** ❌ (no Day-14 alert fires)

### Stage 14: `INSPECTION_COMPLETE`
- **Spec demands:** Day-14 alert to Kayla
- **Impl reality:** log only
- **Status:** ❌ GAP

### Stage 14→15: `INSPECTION_COMPLETE → APPRAISAL_ORDERED`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'APPRAISAL_ORDERED'}` (auto-advance per spec)
- **Side effects:**
  - `webhook` stub
  - `log` ("Auto-advance to Stage 16")
- **Spec says:** "Auto-advance. No human action required." — impl correctly has no human action
- **Test:** `stage-coverage.test.js` → `14 transition: INSPECTION_COMPLETE → APPRAISAL_ORDERED`
- **Status:** ✅ (intentionally minimal — auto-advance only)

### Stage 15: `APPRAISAL_ORDERED`
- **Side effects:** none beyond webhook log
- **Status:** ✅

### Stage 15→16: `APPRAISAL_ORDERED → APPRAISAL_DONE`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'APPRAISAL_DONE'}`
- **Side effects:**
  - `webhook` stub
  - `send_sms` template='APPRAISAL_DONE'
  - `log`
- **Spec gap:** "Coordinate with TC for appraiser access. Wait for Appraisal Result field." but impl does not actually update any "appraisal result" field. ❌ NO APPRAISAL RESULT field write.
- **Test:** `stage-coverage.test.js` → `15 transition: APPRAISAL_ORDERED → APPRAISAL_DONE`
- **Status:** ⚠️ (SMS fires; appraisal result not stored)

### Stage 16: `APPRAISAL_DONE`
- **Side effects:** APPRAISAL_DONE SMS attempted
- **Status:** ⚠️

### Stage 16→17 (JV path): `APPRAISAL_DONE → JV_SENT`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'JV_SENT'}` (JV path)
- **Side effects:**
  - `webhook /webhook/ghl/offer-ready` stub
  - `run_underwriting` (re-run with appraisal value)
  - `notify`
  - `log`
- **Spec says:** "Branch on appraisal < PP. Move to JV_SENT if JV deal." — branching logic NOT in impl, just fires automations when manually transitioned
- **Test:** `stage-coverage.test.js` → `16 transition: APPRAISAL_DONE → JV_SENT (JV path)`
- **Status:** ⚠️ (no branching logic)

### Stage 16→19 (no-JV path): `APPRAISAL_DONE → WIRE_SETUP`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'WIRE_SETUP'}` (no-JV path)
- **Side effects:**
  - `webhook` stub
  - `run_underwriting`
  - `log`
- **Test:** `stage-coverage.test.js` → `17 transition: APPRAISAL_DONE → WIRE_SETUP (no-JV path)`
- **Status:** ⚠️ (no branching — manual transition required)

### Stage 17: `JV_SENT`
- **Side effects:** underwriting re-run, notify
- **Status:** ⚠️

### Stage 17→18: `JV_SENT → JV_SIGNED`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'JV_SIGNED'}`
- **Side effects:**
  - `webhook /webhook/ghl/contract-sign` stub
  - `rabbitsign` (JV 3-party or 4-party envelope)
  - `send_sms` template='JV_SIGNED'
  - `log`
- **Spec gap:** "Determine JV type (3-party or 4-party). Pre-fill parties + percentages." but impl doesn't pre-fill based on JV type — just calls `createContractEnvelope` with the lead's `contract` field
- **Test:** `stage-coverage.test.js` → `18 transition: JV_SENT → JV_SIGNED`
- **Status:** ⚠️ (no JV-type-specific logic)

### Stage 18: `JV_SIGNED`
- **Side effects:** JV RabbitSign envelope, JV_SIGNED SMS
- **Status:** ⚠️

### Stage 18→19: `JV_SIGNED → WIRE_SETUP`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'WIRE_SETUP'}`
- **Side effects:**
  - `webhook` stub
  - `log`
- **Spec gap:** "Set JV Title Holder. Send JV_SIGNED SMS." but impl fires only webhook + log. ❌ NO jv_title_holder field write. ❌ NO JV_SIGNED SMS at this transition (was fired in stage 17→18)
- **Test:** `stage-coverage.test.js` → `19 transition: JV_SIGNED → WIRE_SETUP`
- **Status:** ❌ (missing jv_title_holder field write)

---

## CLOSING — Stages 20-21

### Stage 19: `WIRE_SETUP`
- **Side effects:** none beyond log
- **Status:** ❌ (missing jv_title_holder set)

### Stage 19→20: `WIRE_SETUP → CLOSING_DATE`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'CLOSING_DATE'}`
- **Side effects:**
  - `webhook` stub
  - `send_sms` with templateResolver that picks `SUBTO_PROCESSOR` if contract='subto', else `CLOSING_CONFIRMED`
  - `log`
- **Spec says:** "Confirm wire instructions received from title." — no wire confirmation check in impl
- **Test:** `stage-coverage.test.js` → `20 transition: WIRE_SETUP → CLOSING_DATE`
- **Status:** ⚠️ (SMS fires with correct template)

### Stage 20: `CLOSING_DATE`
- **Side effects:** SUBTO_PROCESSOR or CLOSING_CONFIRMED SMS attempted
- **Status:** ⚠️

### Stage 20→21: `CLOSING_DATE → CLOSED`
- **Trigger action:** `POST /api/leads/:id/advance {to_stage: 'CLOSED'}`
- **Record change:** `leads.stage='CLOSED'`, `leads.closed_date=now`
- **Side effects:**
  - `webhook` stub
  - `set_reminder` type='coe' offset_days=0
  - `log`
- **Spec gap:** "COE -7 SMS to seller. Wire request from title. Post-close engine (+7d testimonial, +14d referral, +30d check-in)." but impl ONLY fires webhook + 1 reminder. ❌ NO post-close engine. ❌ NO COE -7 SMS. ❌ NO testimonial/referral/check-in reminders.
- **Test:** `stage-coverage.test.js` → `21 transition: CLOSING_DATE → CLOSED`
- **Status:** ❌ MAJOR GAP (no post-close engine)

### Stage 21: `CLOSED`
- **Spec demands:** COE -7 SMS, +7d testimonial reminder, +14d referral reminder, +30d check-in reminder
- **Impl reality:** single reminder with type='coe', offset_days=0
- **Status:** ❌ MAJOR GAP

---

## Dead lead branch

### Stage X → `DEAD`
- **Trigger:** Any stage can transition to DEAD via `POST /api/leads/:id/advance {to_stage: 'DEAD'}`
- **Side effects:** None — DEAD is terminal, no automations fired (intentional)
- **Test:** `stage-coverage.test.js` → `22 DEAD transition from any stage` — asserts DEAD is terminal (no outbound transitions)
- **Status:** ✅

### Stage X → `NO_ANSWER`
- **Trigger:** Only from `GAIN_FEEDBACK` via `POST /api/leads/:id/advance {to_stage: 'NO_ANSWER'}`
- **Side effects:**
  - `webhook` stub
  - `set_reminder` type='dom_181'
  - `send_sms` template='LOI2DAYS'
  - `log`
- **Test:** `stage-coverage.test.js` → `07b transition: GAIN_FEEDBACK → NO_ANSWER`
- **Status:** ⚠️

### Stage X → `SELLER_DECLINED`
- **Trigger:** From `GAIN_FEEDBACK`, `INSPECTION_PERIOD`, or `NO_ANSWER`
- **Side effects:**
  - `webhook` stub
  - `set_reminder` type='dom_181'
  - `send_sms` template='SD'
  - `log`
- **Test:** `stage-coverage.test.js` → `08b transition: GAIN_FEEDBACK → SELLER_DECLINED`
- **Status:** ⚠️

---

## NEGATIVE PATHS

### Invalid transition (any stage)
- **Trigger:** `POST /api/leads/:id/advance {to_stage: 'INVALID_STAGE'}` or wrong from-stage
- **Expected response:** HTTP 400, error=`Invalid transition: <FROM> → <TO>`, body includes `available_transitions: [...]`
- **Test:** `stage-coverage.test.js` → `NEG-01 invalid transition rejected`
- **Status:** ✅

### Contract generation with invalid contract_type
- **Trigger:** `POST /api/contracts/generate {lead_id, contract_type: 'invalid'}`
- **Expected response:** HTTP 400, error=`Unknown contract type: ...`
- **Test:** `stage-coverage.test.js` → `NEG-02 invalid contract_type rejected`
- **Status:** ✅

### SMS to lead without phone
- **Trigger:** `POST /api/leads/:id/advance` on a lead with no `seller_phone`
- **Expected behavior:** automation.results shows send_sms result with `ok: false, error: 'no phone'` or similar
- **Test:** `stage-coverage.test.js` → `NEG-03 SMS without phone fails gracefully`
- **Status:** ⚠️ (assertion may fail if impl silently succeeds — needs explicit assertion)

### RabbitSign without API key
- **Trigger:** `POST /api/leads/:id/advance {to_stage: 'UNDER_CONTRACT'}` when RABBITSIGN_API_KEY is unset or invalid
- **Expected behavior:** automation.results shows `rabbitsign` with `ok: true, fallback: 'student copies contract text manually'` OR `ok: false, error: ...`. Lead.contract_status NOT 'sent'.
- **Test:** `stage-coverage.test.js` → `NEG-04 RabbitSign fallback when API key missing`
- **Status:** ⚠️ (depends on RABBITSIGN_API_KEY state in env)

---

## SUMMARY OF GAPS

**ALL CRITICAL GAPS CLOSED (2026-06-25).**

### Closed gaps (all ✅)
- ✅ Stage 2→3 CCC SMS — added send_sms template:'CCC'
- ✅ Stage 6→7 underwriting re-run — added run_underwriting action
- ✅ Stage 12→13 14d countdown + Day-7 SMS + Day-14 Kayla alert — added copy_email + 3 set_reminders
- ✅ Stage 13→14 Day-14 Kayla alert — added notify recipient:'Kayla' + set_field inspection_complete_date
- ✅ Stage 18→19 jv_title_holder field write — added write_fields fields:['jv_title_holder', 'jv_signed_date']
- ✅ Stage 20→21 post-close engine — added closed_date + COE_MINUS_7 SMS + 4 reminders (testimonial/referral/30_day_nurture)

### Remaining medium gaps (spec ↔ impl mismatch)
- Stage 3→4 (OFFER_READY → OFFER_SENT): LOI generation is silent no-op; "Email Seth" doesn't fire (GHL spec mentions email)
- Stage 4→5 (OFFER_SENT → OFFER_RECEIVED): GCJ SMS not in automations list (in ghl_actions only — works via side-channel when email-service loads)
- Stage 5→6 (OFFER_RECEIVED → GAIN_FEEDBACK): email side-channel fails silently (no SMTP creds on Render)
- Stage 15→16 (APPRAISAL_ORDERED → APPRAISAL_DONE): no appraisal_result field write
- Stage 16→17 (APPRAISAL_DONE → JV_SENT/WIRE_SETUP): no branching logic (manual transition required)

### Low (depends on external service)
- All `send_sms` actions: depend on Twilio/JustCall 10DLC approval (currently fail with `ok:false, reason: 'No GHL contact ID'`)
- All `email` side-channel actions: depend on SMTP creds on Render (currently fail with `ok:false, reason: 'SMTP not configured'`)
- `rabbitsign`: depends on RABBITSIGN_API_KEY being valid (may fail with `ok:false` if API key has issues)

### Underspecified (no clear trigger)
- **None** — every stage has at least one transition defined and a valid POST /api/leads/:id/advance trigger