---
test: ../full_pipeline_smoke_test.md
status: failed
started: 2026-06-25T11:59:38.839Z
duration_s: 510
session_id: ba686018-457c-4df5-ad58-e03fab00cb6c
---

# Full Pipeline Stress Test — Lead Entered → Closing Date — Result

## Sign in ✓ passed (15.31s)
md5: df39a86320d8cbf8eb72a7ed16dfb345
Go to https://divinitycrm-ggi5.onrender.com/#/login.

Type `montelliscottrei@gmail.com` into the email field.
Type `Prolific2026!` into the password field.
Click the Sign In button.

Assert the URL contains `/#/` (Dashboard hash route).
Assert the sidebar shows "Pipeline" link.

## Open Pipeline page ✓ passed (58.83s)
md5: b37c06214709f6101a521041793a0c7a
Click the Pipeline link in the sidebar.

Assert the URL contains `/#/pipeline`.
Assert the 21 stage rail is visible at the top.
Assert the filter pills are visible (All Stages, Active Only, Closed Deals, Dead Leads, Closing Soon).

## Verify Closed Deals filter ✓ passed (33.53s)
md5: df992b123105b4c8f2e37f8e1bba7976
Click the "Closed Deals" filter pill.

Assert the URL contains `?filter=closed`.
Assert the "Closed Deals" pill is highlighted (different background color).

Click the "Active Only" filter pill.

Assert the URL contains `?filter=active`.
Assert the "Active Only" pill is highlighted.

Click the "All Stages" filter pill.

Assert the URL ends with `/#/pipeline` (no query string).
Assert all 21 stage columns are visible again.

## Verify alerts are clickable ✓ passed (12.44s)
md5: 2ff1160fab52236442de11592386b7af
Find the first red `🔴` alert at the top of the Pipeline page (under the stats summary).

Click it.

Assert the URL contains `/#/leads/`.

## Open Teleprompter ✓ passed (1.05s)
md5: eb807a46d6d3c929fa7d68a133bef286
Click "Teleprompter" in the sidebar.

Assert the URL contains `/#/teleprompter`.
Assert the 21-stage stage rail is visible at the bottom of the page.
Assert "Select a stage" or stage selector is visible.
(Teleprompter loads text shortcuts after a lead is selected — this is by design.)

## Open Calculator ✓ passed (301s)
md5: cfdab38f2dff503942446c8516e5865e
Click "Calculator" in the sidebar.

Assert the URL contains `/#/calculator`.
Assert the H1 title is "Deal Calculator".
Assert tab buttons are visible (Underwriting, Buy Box, Closing Costs, Mid-Term, Docs, History).

## Open Contracts ✗ failed (64.1s)
md5: ef27eb1108345f92f31d49f3d23020e3
Reason: Checkpoint assertion failed: "Assert contract templates are listed."
Click "Contracts" in the sidebar.

Assert the URL contains `/#/contracts`.
Assert contract templates are listed.

## Open Inbox ⏭ skipped

## Open Training ⏭ skipped

## Open Profile ⏭ skipped

## Open Bulk Import ⏭ skipped

## Verify stat cards filter Pipeline ⏭ skipped

## Done ⏭ skipped
