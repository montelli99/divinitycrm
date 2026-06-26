# Contract Library & RabbitSign Configuration

Source-of-truth configuration for the contract generation + RabbitSign
send flow. See `backend/src/services/contract-library.js` for the runtime
implementation.

## Architecture

```
┌──────────────────────────────────────┐
│ ai-rei/kay-exclusive/                │  ← workspace root (live source)
│   (Kayla's private contract library) │
└──────────────┬───────────────────────┘
               │ copy on sync
               ▼
┌──────────────────────────────────────┐
│ backend/src/assets/contracts/        │  ← ships with deploy
│   (bundled copies of .txt extracts)  │
└──────────────┬───────────────────────┘
               │ read by
               ▼
┌──────────────────────────────────────┐
│ backend/src/services/                │
│   contract-library.js                │  ← single source of truth
│   - getTemplateText(type)            │     at runtime
│   - getRabbitSignTemplateId(type)    │
└──────────────┬───────────────────────┘
               │ used by
               ▼
┌──────────────────────────────────────┐
│ backend/src/services/rabbitsign.js   │
│   createContractEnvelope(lead, type) │  ← signing envelope
└──────────────────────────────────────┘
```

**Why bundled?** Render deploys only `backend/` and `frontend/`
(`render.yaml` `rootDir: backend`). The upstream `ai-rei/` workspace
folder is NOT deployed, so we bundle `.txt` extracts into the backend
repo. This keeps the CRM production-safe and self-contained.

## Path resolution

`contract-library.js` resolves source files via `resolveSourceDir()`:

1. If `KAY_EXCLUSIVE_DIR` env var is set AND that path exists → use it (live upstream sync)
2. Otherwise → use `backend/src/assets/contracts/` (bundled)

This means local dev can point at the workspace folder for live sync,
and Render automatically uses the bundled directory.

## Required env vars

Each contract type requires its own RabbitSign template ID. The library
throws a hard error if a type is requested without its env var set —
**no silent fallback** (per LRN-20260626-008/009/011).

| Contract type | Env var | Status (as of 2026-06-26) |
|---------------|---------|---------------------------|
| `cash` | `RABBITSIGN_TEMPLATE_CASH` | ⚠️ needs upload + ID |
| `subto` | `RABBITSIGN_TEMPLATE_SUBTO` | ✅ `w5EC5hnVWRoGVYUTbxuHwz` |
| `stack50` | `RABBITSIGN_TEMPLATE_STACK50` | ✅ `Vf0ahJ1AXi3QWVhXNCBN0C` |
| `stack10` | `RABBITSIGN_TEMPLATE_STACK10` | ⚠️ needs upload + ID |
| `stack_interest_only` | `RABBITSIGN_TEMPLATE_STACK_IO` | ⚠️ needs upload + ID |
| `stack_mfh` | `RABBITSIGN_TEMPLATE_STACK_MFH` | ⚠️ needs upload + ID |
| `seller_finance` | `RABBITSIGN_TEMPLATE_SF` | ⚠️ needs upload + ID |
| `commercial` | `RABBITSIGN_TEMPLATE_COMMERCIAL` | ⚠️ needs upload + ID |
| `portfolio` | `RABBITSIGN_TEMPLATE_PORTFOLIO` | ⚠️ needs upload + ID |
| `jv_4party` | `RABBITSIGN_TEMPLATE_JV` | ✅ `rPx7lrG27B1u2pxVzwl21e` |
| `jv_5party` | `RABBITSIGN_TEMPLATE_JV` | (uses same ID as jv_4party) |

Optional:
- `KAY_EXCLUSIVE_DIR` — if set + exists, library reads from this path
  instead of the bundled directory. Useful for live local-dev sync.

## Contract flow

```
underwriting → calculator.recommendStrategy()
            → selectContractType(strategy)     [contract-generator.js]
            → POST /api/contracts/generate      [creates contract as 'draft']
            → human reviews the draft
            → POST /api/contracts/:id/approve   [status = 'approved']
            → POST /api/contracts/send-rabbitsign  [uses approved contract, marks 'sent']
```

**Hard rules:**
- `generate` does NOT auto-send or auto-advance stage. It creates a draft.
- `send-rabbitsign` requires an approved contract. Returns 409 with hint
  if no approved contract exists.
- `createContractEnvelope` (in rabbitsign.js) calls
  `contract-library.getRabbitSignTemplateId(type)` which throws hard if
  the env var is missing. NO silent fallback to a different type's
  template (the bug we just fixed).

## Operator visibility

Two surfaces to monitor drift:

1. **Morning brief cron** (`backend/src/scripts/cron-daily.js`) calls
   `auditLibrary()` and surfaces missing source files + missing
   RabbitSign env vars. Operators see the list every day at 7 AM ET.

2. **Admin endpoint** `GET /api/admin/contracts/library-audit`
   (team-only via `isTeamViewer`). Returns JSON summary.

## Audit endpoint example

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://divinitycrm-api.onrender.com/api/admin/contracts/library-audit
```

Returns:
```json
{
  "total": 11,
  "sourceDir": "/app/src/assets/contracts",
  "liveOverride": null,
  "okCount": 0,
  "issueCount": 11,
  "issuesByType": [
    {
      "type": "cash",
      "rabbitsignMissing": true,
      "sourceMissing": false,
      "issues": ["missing RabbitSign template ID: set RABBITSIGN_TEMPLATE_CASH"]
    }
  ]
}
```

## Tests

`backend/tests/scenarios/contract-flow.test.js` — 26 tests:
- `selectContractType` mapping (PascalCase → lowercase)
- Draft creation (no auto-send, no auto-stage-advance)
- Approve gate (no send without approval)
- End-to-end: generate → approve → send
- Missing template → hard error
- Unsupported type → hard error
- Env var override
- Local template extraction (11 families load from bundled dir)
- `fillTemplate` substitutes lead fields
- `fillTemplate` preserves formatting
- `auditLibrary` reports all 11 types + missing files loudly

## Sync procedure

When Kayla updates a contract in `ai-rei/kay-exclusive/`:

1. Get the `.txt` extract (run the docx → txt extractor if needed)
2. Copy it to `backend/src/assets/contracts/` using the matching filename:
   - See `backend/src/assets/contracts/README.md` for the full mapping
3. Commit + push (auto-deploys to Render)

The library will read the bundled copy on next deploy. No code changes
needed if the source structure stays the same.