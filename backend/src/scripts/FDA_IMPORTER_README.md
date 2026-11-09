# FDA Device Importer for Implant Catalog Staging

Imports orthopedic implant data from FDA openFDA API into a staging table for human review before promotion to the live implant catalog.

## Quick Start

```bash
# Dry-run (default) - see what would be imported
cd backend
npx tsx src/scripts/importFdaDevices.ts

# Actually write to database
npx tsx src/scripts/importFdaDevices.ts --write

# Verbose output showing each record
npx tsx src/scripts/importFdaDevices.ts --verbose
```

## Features

- **Dry-run by default**: Shows what would be imported without writing to the database
- **Citation tracking**: Every field has a source URL and retrieved timestamp
- **Rate limiting**: Respects openFDA limits (40/min without key, 240/min with key)
- **Resumable**: Uses upsert logic so you can re-run without duplicates
- **Paginated**: Handles large result sets with automatic pagination

## Usage

```
npx tsx src/scripts/importFdaDevices.ts [options]

Options:
  --write           Actually write to the database (default: dry-run)
  --codes CODE,...  Comma-separated product codes (default: spine codes)
  --limit N         Max records per product code (default: 100)
  --skip-pma        Skip PMA endpoint (only import 510(k))
  --skip-510k       Skip 510(k) endpoint (only import PMA)
  --verbose         Print detailed output for each record
  --help            Show help message
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | For --write | PostgreSQL connection string |
| `OPENFDA_API_KEY` | No | Optional API key for higher rate limits |

Get an API key at: https://open.fda.gov/apis/authentication/

## Default Spine Product Codes

The importer prioritizes spine-related FDA product codes:

| Code | Device Name | Approx Records |
|------|-------------|----------------|
| MAX | Intervertebral fusion device with bone graft, lumbar | ~896 |
| NKB | Thoracolumbosacral pedicle screw system | ~914 |
| KWP | Appliance, fixation, spinal interlaminal | ~430 |
| MNI | Orthosis, spinal pedicle fixation | ~303 |
| MNH | Orthosis, spondylolisthesis spinal fixation | ~309 |
| ODP | Intervertebral fusion device with bone graft, cervical | ~354 |
| OVD | Intervertebral fusion device with integrated fixation, lumbar | ~205 |

## Data Sources

1. **510(k) Clearances**: FDA premarket notifications for Class I/II devices
   - API: `https://api.fda.gov/device/510k.json`
   - Fields: K-number, applicant, decision date, device name, product code

2. **PMA Approvals**: FDA premarket approvals for Class III devices
   - API: `https://api.fda.gov/device/pma.json`
   - Fields: P-number, supplement number, applicant, decision date, trade name

## Staging Table Schema

The importer writes to `implant_catalog_staging` with these key fields:

- `source`: Source identifier (openfda-510k, openfda-pma)
- `source_record_id`: K-number or P-number (dedupe key)
- `fda_number`: 510(k) or PMA number
- `fda_applicant`: Company name at time of submission
- `device_name`: Device name from FDA
- `product_code`: FDA product classification code
- `field_citations`: JSONB with source URL/timestamp for each field
- `review_status`: pending | reviewed | approved | rejected

## Citation Tracking

Every populated field carries a citation in the `field_citations` JSONB column:

```json
{
  "fdaNumber": {
    "sourceUrl": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K231234",
    "sourceType": "openfda-510k",
    "retrievedAt": "2026-10-15T12:00:00.000Z",
    "rawValue": "K231234"
  },
  "fdaApplicant": {
    "sourceUrl": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K231234",
    "sourceType": "openfda-510k",
    "retrievedAt": "2026-10-15T12:00:00.000Z",
    "rawValue": "MEDTRONIC SOFAMOR DANEK USA, INC."
  }
}
```

Fields left `null` when the source API doesn't provide them (no guessing).

## Running Tests

```bash
# Run the fixture-based tests
npx tsx src/scripts/importFdaDevices.check.ts
```

Tests cover:
- 510(k) and PMA record mapping
- Citation completeness (every non-null field has a citation)
- Date parsing
- Dedupe key generation
- Product code validation

## Example Output

```
============================================================
FDA Device Importer for Implant Catalog Staging
============================================================
Mode: DRY-RUN (no database writes)
API Key: Not configured (lower rate limit)
Rate limit: ~37 requests/minute
Product codes: MAX, NKB, KWP, MNI, MNH, ODP, OVD
Limit per code: 100
Endpoints: 510(k), PMA

Verifying product codes against openFDA...
  ✓ MAX: Intervertebral Fusion Device With Bone Graft, Lumbar (896 records)
  ✓ NKB: Thoracolumbosacral Pedicle Screw System (914 records)
  ...

────────────────────────────────────────────────────────────
Product Code: MAX
Device: Intervertebral Fusion Device With Bone Graft, Lumbar

  Importing 510K for product code MAX...
    Total available: 896, fetching up to 100
    510(k) results: 100 fetched, 100 new, 0 updated, 0 errors

============================================================
IMPORT SUMMARY
============================================================
Total fetched:  700
New records:    700
Updated:        0
Skipped:        0
Errors:         0
Mode:           DRY-RUN (not persisted)
============================================================

⚠️  This was a DRY RUN. No data was written to the database.
    Run with --write to persist the data.
```

## Future Enhancements

- AccessGUDID integration for material and component fields
- Summary PDF parsing for additional material data
- Human review workflow UI
- Promotion to live implant catalog
