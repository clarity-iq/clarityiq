# ClarityIQ — DTC Build Specs (Layer 2)

Generated from the Six Layer Tracker v2, July 9 2026. This is the hand-off document for Claude Code — each spec below corresponds to a specific 🤖 or 🤖+👤 row in the tracker. Work in batch order; each batch depends on the one before it. Complete a batch, let Martin review, then move to the next.

**Do not build:** anything tagged N/A or 👤-only in the tracker (Layers 3–4 entirely, business entity, distribution, pricing, usability testing). If a task requires a business/legal/pricing/clinical decision not specified here, stop and ask.

---

## BATCH 1 — Foundation
*Everything else depends on this data layer existing first.*

### 1.1 Basic telemetry
**Tracker row:** Layer 5 — Basic telemetry
**Why it matters:** This is the actual point of the DTC phase — proving the core thesis needs real usage data, not just a working demo. Every other analytics row (track distribution, conversion correlation, topic coverage) reads from this.
**Goal:** Capture session-level analytics as a patient moves through the six-stage conversation.
**Capture fields:** stage reached at drop-off (1–6), session duration, timestamp, track assigned (A/B/C), age band (see 1.3), clarity-tap count if that UI element exists (stub the field if not).
**Storage:** lightest option available — Cloudflare KV or a logging endpoint on the existing `clarityiq-proxy` Worker. No new database.
**Acceptance criteria:** a completed session produces one retrievable record with all fields populated. An abandoned session at any stage still produces a partial record showing where it dropped off.
**Non-goals:** no viewing dashboard yet — raw records are sufficient for now.

### 1.2 Session / reference code
**Tracker row:** Layer 5 — Session/reference code, redefined for DTC
**Why it matters:** In the practice-embedded model this would tag a cohort. In DTC there's no practice-side tagging — this code is what pairs pre/post survey answers, telemetry, and the summary together without needing an email or account, since the free tier requires neither to start.
**Goal:** Unique code generated at session start, present on the telemetry record and on the final summary output.
**Acceptance criteria:** code generated client- or server-side at session start; appears on the summary; matches the telemetry record for that session.
**Non-goals:** not a login credential — no persistence requirement beyond that session's own data trail.

### 1.3 Age-band question
**Tracker row:** Layer 1 — Age-band question in-session
**Why it matters:** Required for telemetry segmentation — without this, usage data can't be broken down by the population that actually matters (55–75+).
**Goal:** Single question, asked once early in the flow (Stage 1), capturing a coarse bracket: under 55 / 55–64 / 65–74 / 75+.
**Acceptance criteria:** answer stored on the telemetry record; placement doesn't disrupt the existing anchor-phrase stage-detection flow (coordinate with the existing Stage 1 script so anchor matching isn't broken).
**Non-goals:** no content gating based on the answer yet — capture only.

### 1.4 Population filter question
**Tracker row:** Layer 1 — Population filter question (new, added July 9)
**Why it matters:** Separates real target-population signal (patients actually near a cataract decision) from general researchers. This also reflects the optometry-first distribution decision — traffic may arrive pre-diagnosis via a referring optometrist, not just post-referral to a surgeon, so the question needs to catch both cases.
**Goal:** Ask whether the patient has an upcoming cataract consultation scheduled, OR has been told by an eye doctor they may need one.
**Acceptance criteria:** stored on the telemetry record; phrasing captures both "scheduled consult" and "referred, no date yet" patients.
**Non-goals:** no branching logic yet — capture only, for later analysis.

---

## BATCH 2 — Core DTC Screens
*Start only after Batch 1 is reviewed and approved.*

### 2.1 Pre/post confidence survey screens
**Tracker row:** Layer 1 — Pre/post confidence survey screens (new)
**Why it matters:** This is the actual proxy metric the whole DTC phase is built to produce — confidence delta and stated lens preference, not just conversation completion. Backend telemetry alone doesn't capture this; it needs real screens.
**Goal:** A short screen before the conversation starts (confidence rating + stated lens leaning) and an equivalent screen after it ends.
**Acceptance criteria:** both screens present in the flow; answers stored on the telemetry record, joined via the session code (1.2); asked pre-email, as part of the free experience — not gated.
**Non-goals:** no need to display results back to the patient yet.

### 2.2 Summary v2 (5-field spec)
**Tracker row:** Layer 1 — Summary v2
**Why it matters:** Becomes the free-tier output patients receive at the end of the session — the thing they get in exchange for their email.
**Goal:** Implement the previously spec'd 5-field summary format.
**Acceptance criteria:** summary generates correctly at session end, includes the session code, matches the 5-field spec already decided (July 7).
**Non-goals:** this is the free-tier version — the enhanced/premium summary sheet is a separate, later task (3.2 below).

### 2.3 Email capture at summary delivery
**Tracker row:** Layer 6 — Email capture placement (revised)
**Why it matters:** This was a deliberate reversal from an earlier assumption. The free session requires no email to start or complete — email is requested only at the moment the summary is delivered, exchanging real value (the summary) for the ask, rather than gating entry. Don't "fix" this toward gating earlier — it's intentional.
**Goal:** Prompt for email only after the session (and post-survey) is complete, in order to receive/save the summary.
**Acceptance criteria:** free session is fully completable with zero email prompt until the summary delivery step; summary is withheld/undeliverable without an email at that point only.
**Non-goals:** no account creation, no password — just an email capture tied to summary delivery.

### 2.4 Tier-aware content/data model
**Tracker row:** Layer 6 — Tier-aware content/data model
**Why it matters:** Cheap to build now, expensive to retrofit. This is what makes the payment fast-follow (Stripe, entitlements) a quick add later instead of a rebuild.
**Goal:** Tag each relevant feature/content block as `free` or `premium` in the data/config layer, even though payment enforcement doesn't exist yet.
**Acceptance criteria:** free-tier features and premium-tier features (full IOL catalog, enhanced summary sheet — see Batch 3) are structurally separated in the codebase, gated by a flag that currently defaults everyone to `free`.
**Non-goals:** no actual payment enforcement, no Stripe integration — that's fast-follow, not this batch.

### 2.5 Free tier scope
**Tracker row:** Layer 6 — Free tier scope
**Why it matters:** Defines what ships at launch vs. what's held for the paid upgrade.
**Goal:** Confirm/implement the free tier as the basic single-lens-class education walkthrough (the current core conversation), tagged `free` per 2.4.
**Acceptance criteria:** a patient can complete a full session, get the pre/post surveys, and receive the v2 summary — entirely within the free tier, no paid content required.
**Non-goals:** full IOL catalog and enhanced summary sheet are explicitly premium (see Batch 3).

---

## BATCH 3 — Content-Dependent
*Unblocked as of July 9 — inputs below are now available.*

### 3.1 FDA SSED extraction for IOL knowledge base
**Tracker row:** Layer 1 — IOL package inserts in Knowledge Base
**Why it matters:** Previously blocked on an Alcon rep relationship. No longer — FDA's public SSED (Summary of Safety and Effectiveness Data) documents are a better source: FDA-reviewed, more rigorous than a manufacturer package insert.
**Goal:** Search fda.gov (start at https://www.fda.gov/search?s=intraocular+lens) for relevant IOL PMAs (PanOptix, AcrySof/ReSTOR, Toric family, and others as found), extract the **patient labeling** sections specifically — not the full SSED, which is dense trial-methodology/adverse-event material written for FDA reviewers, not patients.
**Acceptance criteria:** knowledge base populated with structured, clinically accurate indications/safety/patient-labeling info per lens; sourced from FDA documents, not manufacturer marketing material.
**Non-goals:** don't dump raw SSED text into the KB — extract and structure the patient-relevant facts. Existing clinical guardrails govern how this gets translated into conversation language — don't bypass them.

### 3.2 Premium summary sheet (spec + build)
**Tracker row:** Layer 1 — Premium summary sheet
**Why it matters:** The paid tier's flagship feature, and a second distribution channel — a patient who pays for this and hands it to any surgeon at any practice is a bottom-up wedge into future practice sales, independent of any BD effort.
**Goal:** Enhanced summary including patient's stated goals, IOL selection/leaning, and "what's important to you" — surgeon-ready format.
**Acceptance criteria:** tagged `premium` per 2.4; not yet gated behind actual payment (that's fast-follow) but structurally separate from the free v2 summary.
**Non-goals:** payment enforcement — build the feature, not the paywall.

### 3.3 Consumer legal pages (ToS, Privacy, Refund, AI-disclosure)
**Tracker row:** Layer 6 — Consumer ToS/Privacy/medical disclaimer, AI-disclosure moment, Refund policy
**Why it matters:** Load-bearing since there's no clinical relationship wrapping the DTC experience — these pages carry weight a practice's own terms would otherwise cover.
**Inputs to use:**
- Entity: DLP Ventures, LLC (Wyoming)
- Support/contact email: dlpventures13@gmail.com
- Refund stance: no refunds stated as policy (this is a legal-page text decision only — do not build any refund-processing logic)
- AI-disclosure: needs to be its own clear, prominent moment — several states (e.g., California) regulate AI-disclosure specifically; this is distinct from the general ToS, not buried inside it.
**Acceptance criteria:** draft ToS, Privacy Policy, Refund policy, and a standalone AI-disclosure notice, all referencing the correct entity/contact info. Medical disclaimer language present (educational only, not medical advice, consult your surgeon).
**Non-goals:** Martin approves final legal language before it goes live (🤖+👤) — draft only, don't treat as final/publish-ready.

### 3.4 Founder credibility layer
**Tracker row:** Layer 6 — Founder credibility layer
**Why it matters:** Trust substitute for the practice-brand halo DTC doesn't have — the founder's surgical credentials are the trust anchor for a stranger talking to an AI about their eye surgery.
**Inputs to use:** Martin's CV (board-certified ophthalmic surgeon, cornea/cataract/refractive/glaucoma fellowship-trained at Cincinnati Eye Institute, Adjunct Clinical Associate Professor, multiple peer-reviewed publications in *Cornea*/*AJO*/*JAMA Ophthalmology*, currently Primary Investigator on active IOL and corneal clinical trials) and martindelapresa.com.
**Explicit exclusion:** do NOT name Grene Vision Group, ECP, or any specific employer/practice anywhere in this content — deliberate legal/business separation, not an oversight.
**Acceptance criteria:** an About/credibility page or section drafted, credentials-forward, no practice name.
**Non-goals:** Martin approves final bio copy before publish (🤖+👤).

### 3.5 Landing page split
**Tracker row:** Layer 6 — Landing page split
**Why it matters:** clarityiq.ai needs to become the patient-facing DTC entry point. The existing practice-facing lead-gen content (Formspree form, "request early access") isn't deleted — it moves to an unlinked subdomain, live but undiscoverable, ready to promote later when approaching practices.
**Goal:** New consumer-facing copy/design for clarityiq.ai (patient audience); migrate existing practice lead-gen content to `practices.clarityiq.ai`; DNS/subdomain setup on Cloudflare.
**Acceptance criteria:** clarityiq.ai reachable and patient-facing; practices.clarityiq.ai live with the original content, not linked from clarityiq.ai's navigation or anywhere else public.
**Non-goals:** Martin reviews/approves consumer copy and positioning before publish (🤖+👤).

---

## BATCH 4 — UX / Polish

### 4.1 On-screen tappable choice options (partial)
**Tracker row:** Layer 1 — On-screen tappable choice options, pulled forward from Final Product
**Why it matters:** Reduces screen clutter and is accessibility-relevant for the 55+ population this product actually serves.
**Goal:** Show track A/B/C options as tappable on-screen elements while the agent talks through them, rather than requiring a spoken answer only.
**Acceptance criteria:** at minimum, the track-selection moment supports tap-to-answer alongside voice.
**Non-goals:** full multi-input rework across every question in the conversation — that remains Final Product scope.

### 4.2 Bullet-point on-screen display
**Tracker row:** Layer 1 — Bullet-point display (new)
**Why it matters:** Same clutter/accessibility motivation as 4.1 — full transcript text on screen is hard to read for this population.
**Goal:** Display key points as bullets rather than full agent monologue text.
**Acceptance criteria:** on-screen text is visibly reduced/summarized relative to current full-transcript display, without losing information the patient needs.

### 4.3 Accessibility pass
**Tracker row:** Layer 6 — Accessibility pass (new)
**Why it matters:** This is the actual patient population — 55–75+, often with vision impairment by definition (they're evaluating cataract surgery). This is a legibility requirement, not generic mobile-responsive polish.
**Goal:** Review and adjust font size, contrast, and tap-target size across the patient-facing flow.
**Acceptance criteria:** text meets accessible contrast ratios; font sizes are legible at typical viewing distance for the target age group; interactive elements are large enough for less precise taps.

### 4.4 Rate limiting / abuse control
**Tracker row:** Layer 2 — Rate limiting (new)
**Why it matters:** The public DTC link has no practice gate in front of it, unlike the earlier embedded-practice model — real cost exposure (ElevenLabs/Anthropic usage) from abuse or bots.
**Goal:** Basic per-session/per-IP rate limiting on the `clarityiq-proxy` Worker.
**Acceptance criteria:** excessive requests from a single source are throttled or blocked; normal patient usage is unaffected.

### 4.5 Web analytics
**Tracker row:** Layer 2 — Web analytics (new)
**Why it matters:** Separate from in-session telemetry — needed to know whether the informal optometry-referral traffic channel is actually working.
**Goal:** Basic traffic source, bounce rate, and start-to-completion rate tracking.
**Acceptance criteria:** these three metrics are visible/retrievable for site visits, distinct from the in-conversation telemetry in Batch 1.

### 4.6 Lightweight feedback channel
**Tracker row:** Layer 2 — Feedback channel (new)
**Goal:** Simple "was this helpful?" + open text box, shown at session end.
**Acceptance criteria:** feedback is captured and retrievable, tied to the session code where possible.

### 4.7 Track routing distribution + topic coverage analytics
**Tracker row:** Layer 5 — Track routing distribution, Topic coverage analytics
**Goal:** Log which track (A/B/C) each session was routed to, and which topics/questions came up during off-script moments.
**Acceptance criteria:** both are retrievable alongside the Batch 1 telemetry records.

---

## BATCH 5 — Pre-Launch Gate Removal
*Do NOT execute this until explicitly told to. This is the last step before real distribution goes out — not automatic once Batch 4 completes.*

### 5.1 Remove password gate
**Context:** A password gate + shared-secret header (`X-ClarityIQ-Key`) and CORS restriction to `app.clarityiq.ai` were added during the build phase to prevent cost abuse of the unauthenticated Worker while the site wasn't yet distributed. This was a deliberate, temporary measure — approved by Martin — not a permanent access control.
**Why this matters:** The entire DTC thesis depends on this page being open and reachable by anyone referred to it (optometry referral traffic). Leaving the gate in place after build wraps would silently block the traffic this phase exists to capture.
**Goal:** Remove the password gate from the patient-facing flow once Batches 1-4 are complete and Martin has confirmed he's ready to distribute.
**Acceptance criteria:** `app.clarityiq.ai` is reachable with no password prompt. Rate limiting (Batch 4.4) and any other abuse controls remain in place — this task removes the password gate specifically, not general abuse protection.
**Do not execute without explicit go-ahead from Martin.**

---

## Explicitly held back — not in scope for Code at all
- Stripe Checkout, entitlement store, passwordless identity (fast-follow, after free launch produces usage data)
- Premium tier pricing (business decision, Martin only, not urgent)
- Layers 3–4 in full (practice/surgeon customization)
- Distribution/outreach to optometrists (Martin only)
- Business entity, Cloudflare/Stripe account setup (already done)
