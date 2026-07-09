---
mode: testing
max_steps: 60
timeout: 60
---

# Scenario UI Test 1: Lead intake to offer sent (visual)

Validates the Dashboard → Pipeline → Lead Detail navigation for a real
in-progress lead, and confirms the stage rail + 21-stage progression.

## Sign in

Go to https://divinitycrm-ggi5.onrender.com/#/login.

Type `montelliscottrei@gmail.com` into the email field.
Type `Prolific2026!` into the password field.
Click the Sign In button.

Assert the URL contains `/#/`.

## Open Pipeline

Click Pipeline in the sidebar.

Assert the URL contains `/#/pipeline`.
Assert the 21-stage rail is visible.

## Find an OFFER_SENT lead

Look at any column with "Offer Sent" header.

Assert at least one lead card is visible in the Offer Sent column.

Click that lead card.

Assert the URL contains `/#/leads/`.

## Verify lead detail page

Assert the H1 shows the lead address.
Assert the stage badge at the top says "Offer Sent" or matches stage 4.
Assert the activity log / scripts panel shows teleprompter content.

## Done

Visual scenario 1 passes if every assertion above passed.
