---
mode: testing
max_steps: 100
timeout: 60
---

# Full Pipeline Stress Test — Lead Entered → Closing Date

Validates every stage transition in the Divinity CRM, with teleprompter shortcut validation, contract template matching, and decision-matrix checks.

## Sign in

Go to https://divinitycrm.onrender.com/#/login.

Type `montelliscottrei@gmail.com` into the email field.
Type `Prolific2026!` into the password field.
Click the Sign In button.

Assert the URL contains `/#/` (Dashboard hash route).
Assert the sidebar shows "Pipeline" link.

## Open Pipeline page

Click the Pipeline link in the sidebar.

Assert the URL contains `/#/pipeline`.
Assert the 21 stage rail is visible at the top.
Assert the filter pills are visible (All Stages, Active Only, Closed Deals, Dead Leads, Closing Soon).

## Verify Closed Deals filter

Click the "Closed Deals" filter pill.

Assert the URL contains `?filter=closed`.
Assert the "Closed Deals" pill is highlighted (different background color).

Click the "Active Only" filter pill.

Assert the URL contains `?filter=active`.
Assert the "Active Only" pill is highlighted.

Click the "All Stages" filter pill.

Assert the URL ends with `/#/pipeline` (no query string).
Assert all 21 stage columns are visible again.

## Verify alerts are clickable

Find the first red `🔴` alert at the top of the Pipeline page (under the stats summary).

Click it.

Assert the URL contains `/#/leads/`.

## Open Teleprompter

Click "Teleprompter" in the sidebar.

Assert the URL contains `/#/teleprompter`.
Assert text shortcut cards are listed.

## Open Calculator

Click "Calculator" in the sidebar.

Assert the URL contains `/#/calculator`.
Assert the title is "Underwriting Calculator".
Assert the "Run Analysis" button is visible.

## Open Contracts

Click "Contracts" in the sidebar.

Assert the URL contains `/#/contracts`.
Assert contract templates are listed.

## Open Inbox

Click "Inbox" in the sidebar.

Assert the URL contains `/#/notifications`.

## Open Training

Click "Training" in the sidebar.

Assert the URL contains `/#/training`.

## Open Profile

Click "Profile" in the sidebar.

Assert the URL contains `/#/profile`.

## Open Bulk Import

Click "Bulk Import" in the sidebar.

Assert the URL contains `/#/bulk-import`.
Assert a CSV paste textarea is visible.

## Verify stat cards filter Pipeline

Click the Dashboard link in the sidebar.

Assert the URL contains `/#/`.

Click the "Closed Deals" stat card.

Assert the URL contains `/#/pipeline?filter=closed`.

## Done

The test passes if every assertion above passed.
