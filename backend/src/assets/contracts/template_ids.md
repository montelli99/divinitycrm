# RabbitSign Template IDs

## Created
- `a8wb3Oiljkp2Y4QW1zzvsS` — Subject To PSA
  - URL: https://www.rabbitsign.com/template/roles/a8wb3Oiljkp2Y4QW1zzvsS
  - PDF source: `divinitycrm/backend/src/assets/contracts/pdfs/subto-psa.pdf`
  - Roles: Seller, Buyer (no fields assigned — created via "Continue anyway")

## Pending (PDFs ready in pdfs/ folder)
- Cash Offer — `cash-offer.pdf`
- Subject To Addendum — `subto-addendum.pdf`
- Subject To LOI — `subto-loi.pdf`
- Stack LOI — `stack-loi.pdf`
- Stack 50% (Hybrid) — `stack50.pdf`
- Stack 10% (70% LTV) — `stack10.pdf`
- Stack 10% Balance — `stack10-bal.pdf`
- Stack Interest-Only — `stack-io.pdf`
- Stack Multi-Family — `stack-mfh.pdf`
- Commercial PSA — `commercial-psa.pdf`
- Portfolio LOI — `portfolio-loi.pdf`
- JV 4-Party — `jv-4party.pdf`
- JV 5-Party — `jv-5party.pdf`

## Existing folder IDs (NOT templates — used for sent documents)
- `w5EC5hnVWRoGVYUTbxuHwz` — PSA Creative SubTo
- `3sIaAVDxaLO386eHCPXe2F` — Subject To Addendum
- `rPx7lrG27B1u2pxVzwl21e` — JV 4-Party
- `Vf0ahJ1AXi3QWVhXNCBN0C` — Stack PSA

## Render env var to set
```
RABBITSIGN_TEMPLATE_SUBTO=a8wb3Oiljkp2Y4QW1zzvsS
RABBITSIGN_TEMPLATE_CASH=<pending>
RABBITSIGN_TEMPLATE_SUBTO_ADDENDUM=<pending>
# ... etc
```
