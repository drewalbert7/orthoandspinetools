# Reported safety signal (FDA MAUDE)

Version `ost-safety-v1`, used by Directory Score `ost-dir-v3`.
Code: `backend/src/lib/implantSafetySignal.ts` (pure math), `backend/src/lib/implantSafetyData.ts`
(openFDA queries), `backend/src/lib/openFdaHttp.ts` (HTTP client). Tests:
`backend/src/lib/implantSafetySignal.test.ts`, `backend/src/lib/implantMaudeSignal.test.ts`.
Public summary: `/implants/methodology#safety-signal`.

## What it is and is not

MAUDE reports are voluntary and there is no denominator (no count of implants in use), so this is
a reporting signal relative to similar devices, not a failure rate, an incidence, or an FDA
judgment. A popular implant gets more reports simply because more are implanted; the score
therefore looks at the severity mix of the reports, not their volume.

Rule 1: never output a number without evidence. Below the thresholds below, the UI shows
"Insufficient data" and the score is `null`.

## Inputs (openFDA)

All MAUDE counts use the same search and window as the MAUDE snapshot on the implant page
(`getMaudeBrandSynopsis`: specialty scope, brand phrase on `device.brand_name`, 365 days ending
yesterday UTC). The device report count `N` is therefore the snapshot count.

| Input | Query |
| --- | --- |
| Deaths, injuries, malfunctions, other | `device/event.json?search=<device search>&count=event_type.exact&limit=8` |
| Breaks | `device/event.json?search=<device search> AND (product_problems:"Break" OR product_problems:"Fracture")&limit=1` (meta total) |
| 12-month trend | `device/event.json?search=<device search>&count=date_received`, bucketed by month |
| Product codes | `device/event.json?search=<device search>&count=device.device_report_product_code.exact&limit=20` |
| Category baseline, per code | same four counts on `device.device_report_product_code:"<code>" AND date_received:[window]` (all brands), plus `count=device.brand_name.exact&limit=999` for the brand count |
| Recalls by brand | `device/enforcement.json?search=product_description:"<brand>" AND recall_initiation_date:[5 years]` |
| Recalls by FDA number | `device/recall.json?search=k_numbers:"K..."` or `pma_numbers:"P..."`, then the class from `device/enforcement.json?search=recall_number:"Z-..."` |

Every query is stored with the score as a cited source URL (api.fda.gov, never with an API key)
and shown under "openFDA sources" on the implant page, with the date pulled.

`event_type` mapping: `Death` is death, `Injury` is serious injury (MDR "serious injury" includes
events needing medical or surgical intervention, which is how revisions are reported),
`Malfunction` is malfunction, anything else (`Other`, `No answer provided`) is other.

## Thresholds (Insufficient data)

The score is `null` and the UI shows "Insufficient data" when any of these hold:

- `N < 5` reports in the window.
- No product code holds at least 5% of the device's reports, or the selected codes have fewer
  than 50 reports in total in the window.
- The largest selected code has fewer than 3 distinct brands (no real peer group).
- openFDA could not be read (the error is stored; no number is shown).

## Formula

Per-report severity weights: death 10, injury 4, malfunction 1, other 0.5, and +3 when the report
names a device break or fracture.

1. Device severity index:
   `S_dev = (10*D + 4*I + 1*M + 0.5*O + 3*B) / N`
2. Category baseline. Product codes with at least 5% of the device's reports (up to 5) are kept,
   with shares `w_c` (renormalized). For each code, `S_c` is the same index over all brands'
   reports in that code and window, and `p_c` its break share. Baseline:
   `S_cat = sum(w_c * S_c) / sum(w_c)`, `p_cat = sum(w_c * p_c) / sum(w_c)`.
   The baseline includes the device's own reports; when the device is more than half of its
   baseline, confidence is lowered one level.
3. Bayesian shrinkage toward the category. Prior: the category mix, with strength `k = 25`
   pseudo-reports (a Gamma/Beta style conjugate update on the mean):
   `S_post = (N * S_dev + k * S_cat) / (N + k)`, `p_post = (B + k * p_cat) / (N + k)`.
   With 5 reports the device's own data carries 17% of the estimate; with 100 reports, 80%; with
   369 reports, 94%. `k = 25` was chosen so a handful of reports cannot move a device far from its
   category in either direction.
4. Relative severity `R = S_post / S_cat`, mapped to 0 to 10, higher is quieter:
   `base = 10 / (1 + R^2)`. At the category mean the score is 5.0; half the category's severity
   gives 8.0; twice gives 2.0.
5. Break ceiling (device-attributable failures): `cap = 10 * (1 - p_post)`. A device where 40% of
   reports name a break cannot score above 6.0, whatever its category.
6. `score = min(base, cap, 9.5)`. 9.5 is the best a device with reports can reach.
7. Recalls in the last 60 months, one per recall event (openFDA `event_id`), using the most
   serious class in the event: multiply by 0.5 for Class I, 0.75 for Class II, 0.92 for Class III.
   Any Class I recall also caps the score at 4.0.
8. Round to one decimal.

The 12-month trend (last 6 months vs the earlier months of the window) is shown next to the
score but does not change it.

Recall matching is conservative: a recall counts when the brand phrase appears in the product
description and the recalling firm matches the implant's company, its FDA applicant, or a
manufacturer that files MAUDE reports for the brand, or when the recall record lists the
implant's 510(k) or PMA number **and** the enforcement product description still matches that
brand key. Shared PMAs (for example P070001 covering prodisc C Vivo / SK / Nova) must not attach
sibling-line recalls to the wrong listing. Recalls of system instruments sold under the brand
still count when the product text matches; the implant page lists each recall with its openFDA
record so the reader can judge it.

**Commercial line, not family.** `maude_brand_key` should be the commercial line openFDA reports
use in `device.brand_name` (e.g. `prodisc C Vivo`, `prodisc C SK`), not an umbrella family string
that phrase-matches every sibling. Size/SKU rows still roll up within a line on `/maude` charts;
sibling lines stay separate.

## Confidence

- High: `N >= 100`, baseline at least 1000 reports, selected codes cover at least 80% of the
  device's reports.
- Medium: `N >= 25`, baseline at least 200 reports, coverage at least 50%.
- Low: anything else above the thresholds.
- One level lower when the device is more than half of its own baseline.

## Directory Score coupling

`hazard = 1 - score / 10`. Score below 3.5 is "elevated" (full hazard), 3.5 to 4.9 is "watch"
(hazard times 0.55), 5 and above is not applied. See `applyMaudeHazard` in
`backend/src/lib/implantDirectoryScore.ts`. Insufficient data never changes the Directory Score.

## Worked example (CD Horizon Solera, pulled 2026-10-17 8:43 PM ET, 2026-10-18 00:43 UTC)

N = 369 (death 0, injury 58, malfunction 311), breaks 149. Codes NKB (50%) and HXX (37%).
`S_dev = 2.683`, `S_cat = 2.871`, `S_post = 2.695`, `R = 0.939`, `base = 5.32`,
`p_post = 0.40`, `cap = 6.0`, one Class II recall event (2023-07-12): `5.32 * 0.75 = 4.0`.
Confidence High.

## openFDA limits and keys

Without a key openFDA allows about 240 requests per minute and 1000 per day per IP, and rejects
count queries with `limit=1000` ("No api_key was supplied", HTTP 403). The client clamps keyless
count limits to 999, paces requests (300 ms keyless, 80 ms keyed), retries 429 and 5xx, and falls
back to keyless once if a configured key is rejected. A full recompute of the directory is about
150 to 250 requests. Set `OPENFDA_API_KEY` in production for headroom; set `OPENFDA_CACHE_DIR`
in local development to cache responses on disk.

## Known limits

- No denominator: a quiet score is not evidence of a low failure rate.
- The specialty scope of the snapshot search can miss reports filed under unusual device names
  (for example GMRS returns 0 reports in the ortho-onc scope); those devices read Insufficient data.
- Product codes that are instruments (for example HXX, screwdriver) join the baseline when the
  brand's own reports are filed under them.
- MAUDE has reporting lags and duplicates; openFDA data is unvalidated.
