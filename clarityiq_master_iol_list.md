# ClarityIQ — Master IOL List (v4, per Martin's review)

Purpose: definitive list of lenses Code should search for and extract patient-labeling content on.

---

## Multifocal / Trifocal / Continuous Range

| Lens | Manufacturer | Notes |
|---|---|---|
| AcrySof IQ PanOptix / Clareon PanOptix | Alcon | Only FDA-approved trifocal for years; market leader |
| Clareon PanOptix Pro | Alcon | Separate entry from base PanOptix |
| Tecnis Synergy | Johnson & Johnson | Hybrid multifocal/EDOF |
| Tecnis Odyssey | Johnson & Johnson | FDA approved Oct 2024; continuous full-range lens, largely replacing Synergy in J&J's current lineup |
| enVista Envy | Bausch + Lomb | Diffractive trifocal, built on enVista toric platform. Was voluntarily recalled ~April 2025 (TASS complications) — confirmed back on market. |

## EDOF (Extended Depth of Focus)

| Lens | Manufacturer | Notes |
|---|---|---|
| Clareon Vivity | Alcon | Non-diffractive EDOF |
| Tecnis Symfony | Johnson & Johnson | Established EDOF |
| Tecnis PureSee | Johnson & Johnson | FDA approved March 2026. Purely refractive EDOF |

## Enhanced / Standard Monofocal

| Lens | Manufacturer | Notes |
|---|---|---|
| AcrySof IQ / Clareon Monofocal | Alcon | Standard |
| Tecnis 1-Piece | Johnson & Johnson | Standard |
| Tecnis Eyhance | Johnson & Johnson | Enhanced monofocal (not EDOF) |
| enVista | Bausch + Lomb | Standard |
| enVista Aspire | Bausch + Lomb | Enhanced monofocal (extended depth of focus via central zone). Was voluntarily recalled ~April 2025 — confirmed back on market. |

## Small Aperture / Pinhole

| Lens | Manufacturer | Notes |
|---|---|---|
| IC-8 Apthera | Bausch + Lomb | |

## Light Adjustable Lens

| Lens | Manufacturer | Notes |
|---|---|---|
| Light Adjustable Lens (LAL) | RxSight | Adjustable post-operatively; requires additional office visits |
| LAL+ | RxSight | |

## Toric (monofocal astigmatism-correcting only)

| Lens | Manufacturer | Notes |
|---|---|---|
| AcrySof IQ Toric / Clareon Toric | Alcon | |
| Tecnis Toric II | Johnson & Johnson | |
| enVista Toric | Bausch + Lomb | |
| enVista Aspire Toric | Bausch + Lomb | |

---

## Misc — do not pull data, tracking only

| Lens | Manufacturer | Why it's here |
|---|---|---|
| Tecnis Synergy Plus | Johnson & Johnson | Not yet FDA-approved |
| Rayner Galaxy | Rayner | Multifocal, AI-designed, in FDA trials — not yet approved |
| Tecnis Symfony OptiBlue | Johnson & Johnson | Unconfirmed whether this is a distinct lens or current branding/coating variant of Symfony — needs Martin's confirmation before treating as separate |
| LuxSmart | Bausch + Lomb | Not confidently confirmed to exist as described — needs verification |
| RayOne Aspheric | Rayner | Not confidently confirmed — needs verification |
| C-flex | Rayner | Not confidently confirmed — needs verification |
| RayOne EMV | Rayner | Approval status not yet confirmed |

---

## Per-lens document template

Each lens gets its own document in the ElevenLabs Knowledge Base — not one combined file. Every document should follow this structure:

1. **Metadata** — lens name, manufacturer, category, FDA approval date, PMA number.
2. **Indications** — who the lens is FDA-labeled for (e.g., astigmatism range for torics, eligibility criteria from the label).
3. **How it works** — diffractive vs. refractive, intended range of vision (near/intermediate/distance), in plain terms.
4. **Expected visual outcomes** — population-level findings from FDA data (e.g., "X% of patients reported functioning without glasses for most daily activities") — phrased as population outcomes, never as individual guarantees.
5. **Known side effects / visual disturbances** — halos, glare, reduced contrast sensitivity, whatever the label discloses. This section matters most for keeping the agent balanced rather than promotional — flag for Martin's review per lens, don't treat as auto-approved like the rest.
6. **Contraindications / poor-candidate factors** — anything the label notes about who might not be a good fit.
7. **Source citation** — PMA number and FDA record link, so any claim can be traced back to its origin.

---

## Instructions for Code once this list is finalized

Upload via the ElevenLabs Knowledge Base API (not manual dashboard upload) — API access is being set up separately. Search fda.gov specifically for each lens above by name (not a general "intraocular lens" search), confirm current FDA approval status and PMA number, and extract patient-labeling sections only, structured per the template above. Do not pull data for anything in the Misc section. Flag anything where you can't find a matching FDA record, rather than guessing or substituting a similar-sounding product. Create one document per lens, named clearly (e.g., "PanOptix — Patient Labeling"), and confirm with Martin before finalizing section 5 (side effects/visual disturbances) for any lens.
