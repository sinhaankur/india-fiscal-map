# India Fiscal Map

A single-screen interactive dashboard for **state-wise revenue, corruption, and GSDP** across India's 28 states + key UTs, FY15 → FY24.

Click any state to see its 10-year history, governance footprint (IAS cadre strength, total state employees, bribe-paid %), departments split (back-office vs public-facing), and structural pros / cons.

**Live:** _link will be added after first Pages build_

## What's on the map

Eight selectable views, each with a 10-year time slider straddling the 13th, 14th, and 15th Finance Commission periods:

| View | What it shows |
|---|---|
| **Own revenue** | Taxes the state collects itself (SGST share, stamp duty, state excise, motor-vehicle). |
| **Corruption %** | CMS-India 2019 — % of households reporting they paid a bribe to access a public service. |
| **GSDP** | Gross State Domestic Product at current prices. |
| **Revenue / GSDP** | Fiscal effort — share of state economy captured as own revenue. |
| **Net flow** | Devolution + grants received minus estimated federal taxes contributed. Positive = recipient. |
| **Devolution in** | State's share of the divisible pool of central taxes. |
| **Contribution out** | Estimated federal taxes attributable to the state (necessarily approximate). |
| **FC share** | The active Finance Commission's horizontal allocation %. |

## What you see on click

For each state:

- **Fiscal stat grid** — GSDP, own revenue, devolution, grants, contribution, net flow
- **Ratios** — FC share, revenue/GSDP, in:out ratio
- **Governance footprint** — IAS cadre approved strength (with central-deputation caveat), state employees in lakh, CMS-2019 bribe-paid %
- **10-year sparkline** — own revenue, inflow (devolution + grants), contribution out, with FC-period demarcations
- **Government departments** — split into back-office (high payroll, low public output: GAD, PWD, Revenue) and public-facing (Health, Education, Transport)
- **Pros / Cons** — 3 each, structural arguments grounded in fiscal data and known issues

## Data sources

Headline numbers (Finance Commission horizontal shares) are exact. Per-state per-year fiscal figures are approximations within ±10%, sourced from:

- Finance Commission XIV & XV reports (vertical pool, horizontal formula)
- RBI Handbook of Statistics on Indian States (own tax revenue, debt-GSDP)
- MoSPI advance estimates (GSDP)
- Union Budget Receipts (vertical devolution actuals)
- CBDT / GST Council (direct + indirect tax origin proxies)
- CMS-India India Corruption Study 2019 (bribe-paid %)
- DoPT Civil List (IAS cadre strength)
- Datameet open-data (state polygon boundaries)

Full source list and caveats: [references.html](references.html).

## Running locally

The page fetches three JSON/GeoJSON files, so it needs a static server (not `file://`):

```bash
cd india-fiscal-map
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works (`npx serve`, `caddy file-server`, etc.).

## Project structure

```
india-fiscal-map/
├── index.html                  # Standalone single-screen dashboard
├── styles.css                  # All styles (no framework)
├── app.js                      # IIFE — fetches the three data files, builds the Leaflet choropleth
├── india-fiscal.json           # 30 states × 10 years × {gsdp, ownTax, devolution, grants, contribution, fcShares, pros, cons}
├── india-extras.json           # Per-state: IAS strength, state employees, corruption %, departments
├── india-states.geojson        # State polygons (Datameet)
├── references.html             # Source list + methodology + caveats
└── README.md                   # this file
```

## Caveats

- **Per-state per-year figures are ±10% approximations.** FC shares are exact; GSDP / own tax / devolution / grants / contribution are smoothed for year-on-year readability rather than reported to the exact rupee.
- **Contribution to Center is necessarily an estimate** — most central tax incidence is destination-blind (GST is consumption-based, customs are collected at ports, corporate tax at registered HQ).
- **Corruption % is from 2019** — pre-COVID, pre-DBT-acceleration. Treat as directional, not as a current snapshot.
- **Back-office vs public-facing department classification is editorial** — drawn from CAG audit reports and budget composition, but reflects an opinionated read.
- **IAS counts are cadre approved-strength snapshots.** ~25–40% of cadre officers are on Central deputation at any time, so the number is a structural cap, not a live headcount.

## Not yet wired (V2 candidates)

- Minister-by-minister breakdowns with public asset declarations (~700+ ministers; needs scraping)
- Per-department headcount (state-published, but inconsistent format)
- Centrally Sponsored Scheme flows (PMJAY, PMAY, MGNREGS) as a separate view
- State debt-to-GSDP trajectory (RBI data exists; not yet wired as a view)
- Central PSU presence by state (central capital, central employment, but not in FC formula)

## License

MIT for the code. Underlying data belongs to its respective sources (Finance Commission, RBI, MoSPI, CMS-India, Datameet) and is used under fair-use / open-data terms.
