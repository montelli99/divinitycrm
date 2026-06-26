# Contract Source Files (bundled)

These text files are bundled copies of the contract source documents
that live in `ai-rei/kay-exclusive/` (Kayla's private contract library).

## Source of truth

The canonical source is **`../../../../ai-rei/kay-exclusive/`** at the
prolificcapital workspace root. This directory ships bundled copies so
the backend deploys independently on Render without needing workspace
mounts.

## Sync procedure

When Kayla updates a contract in `ai-rei/kay-exclusive/`, copy the
matching `.txt` extract over the file in this directory:

| Source (kay-exclusive)                                                  | Bundled here             |
|-------------------------------------------------------------------------|--------------------------|
| `LOI's/Cash Offer LOI/Cash Offer Template _text.txt`                    | `cash-offer.txt`         |
| `PSA's + JV/PSA Creative _ Sub To_text.txt`                             | `subto-psa.txt`          |
| `PSA's + JV/Subject to Addendum_text.txt`                               | `subto-addendum.txt`     |
| `LOI's/Subject To LOI/Subject To LOI Template.docx_text.txt`            | `subto-loi.txt`          |
| `LOI's/Stack LOI's/Stack LOI_text.txt`                                  | `stack-loi.txt`          |
| `LOI's/Stack LOI's/Stack w Principal _text.txt`                         | `stack50.txt`            |
| `LOI's/Stack LOI's/Ai 10% DP 2 year balloon_text.txt`                   | `stack10.txt`            |
| `LOI's/Stack LOI's/Stack LOI 5 yr BAL_text.txt`                         | `stack10-bal.txt`        |
| `LOI's/Stack LOI's/Interest Only Stack LOI_text.txt`                    | `stack-io.txt`           |
| `LOI's/Stack LOI's/Ai LOI MFH Stack.docx_text.txt`                      | `stack-mfh.txt`          |
| `PSA's + JV/Real Estate Commercial Purchase Agreement.docx_text.txt`    | `commercial-psa.txt`     |
| `LOI's/Portfolio Stack LOI_text.txt`                                    | `portfolio-loi.txt`      |
| `PSA's + JV/4 party JV_text.txt`                                        | `jv-4party.txt`          |
| `PSA's + JV/Copy of 4 party JV_text.txt`                                | `jv-5party.txt`          |

## Why bundled, not live-mounted

Render deploys only `backend/` (per `render.yaml` `rootDir: backend`).
The `ai-rei/` workspace is not deployed. To keep the CRM production-safe
and self-contained, the contract source files are checked in here.

If you need to swap the live source (e.g., use a different folder during
local dev), set `KAY_EXCLUSIVE_DIR` env var to point elsewhere.
`backend/src/services/contract-library.js` will read from that path
before falling back to this bundled directory.

## Drift detection

`backend/src/services/contract-library.js` exposes `auditLibrary()`
which checks for missing source files and missing RabbitSign env vars.
Wire it into the morning brief cron to surface drift.