---
mode: testing
max_steps: 100
timeout: 60
---

# Full Lead Lifecycle — Stage Transitions

Tests the complete 21-stage pipeline progression for a single test lead.

## Sign in

Go to https://divinitycrm.onrender.com/#/login.

Type `montelliscottrei@gmail.com` into the email field.
Type `Prolific2026!` into the password field.
Click the Sign In button.

Assert the URL contains `/#/`.

## Create a new lead

Click "Dashboard" in the sidebar.

Assert the URL contains `/#/`.

Scroll down to find "Add Lead" or "+ New Lead" or "New Lead" form.

If a form appears (with "Add Lead" heading), fill in:
- Address: `123 Test Lifecycle Lane, Test City, TS 99999`
- City: `Test City`
- State: `TS`
- Price: `200000`
- Source: `other`

Click Submit / Save.

Assert a success message appears or the form clears.
Assert a lead with "123 Test Lifecycle Lane" appears somewhere on the page.

## Open Pipeline to find the lead

Click "Pipeline" in the sidebar.

Assert the URL contains `/#/pipeline`.

Click the lead card with address containing "123 Test Lifecycle Lane".

Assert the URL contains `/#/leads/`.
Assert the lead detail page shows the address.

## Advance through stages — Stage 1

Click the "Advance" button (or whatever the next-stage button is).

Assert the lead stage advances to stage 2 (Contact Made) or the URL/state shows it.

## Advance to OFFER_READY

Click Advance again.

Assert the stage changes.

## Advance to OFFER_SENT

Click Advance again.

Assert the stage changes.

## Verify Teleprompter reflects stage

Click "Teleprompter" in the sidebar.

Assert the URL contains `/#/teleprompter`.
Assert the current stage indicator at the top of the page matches the lead's stage (e.g. "Offer Sent" or stage 4).

## Check teleprompter scripts for current stage

Assert the page shows scripts relevant to the current stage.
If scripts are listed, click one and verify it opens with the expected body text.

## Continue advancing to GAIN_FEEDBACK

Click Advance.

Assert the stage advances to GAIN_FEEDBACK (stage 5 or 6).

## Advance through NEGOTIATION stages

Click Advance twice.

Assert the stage moves through stages 6-9.

## Advance to TERMS_AGREED

Click Advance once more.

Assert the stage shows TERMS_AGREED or AWAITING_TITLE.

## Verify contract templates available

Click "Contracts" in the sidebar.

Assert the URL contains `/#/contracts`.
Assert the contract templates are listed (PSA Creative SubTo, Cash Offer, etc).

## Done

The lead lifecycle test passes if all 21 stages advance correctly with teleprompter and contract context updating per stage.
