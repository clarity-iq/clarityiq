# ClarityIQ — Project Context

## What this is
Voice-first AI patient education platform for ophthalmology, starting with cataract/IOL (intraocular lens) education. Core thesis: patients decline premium IOLs not from disinterest, but because they arrive at surgical consultations undereducated. This product closes that gap before the consultation happens.

## Current phase: DTC (Direct-to-Consumer) — stepping stone, not the end state
We are NOT currently building for practices. The end-state product (Final Product) will be customizable per practice and surgeon — but that comes AFTER this phase proves the core thesis with real patient data. Do not build practice branding, surgeon customization, per-practice IOL inventory/pricing, or admin dashboards. That work is explicitly out of scope right now — flag it if asked, but don't build it unprompted.

## Architecture
- Six-stage conversation flow, patient walks through via voice (ElevenLabs).
- Anchor-phrase stage detection: exact scripted sentences trigger stage transitions — this is deliberately deterministic, not keyword/time-based. Do not change this detection method without flagging it — it's a considered decision, not an oversight.
- Three-track routing (A/B/C) based on patient responses, tailors depth/content.
- Stack: static HTML/JS frontend (index.html), Cloudflare Worker (clarityiq-proxy) proxying Anthropic API calls, ElevenLabs for voice. No build step, no framework — keep it that way unless a task specifically calls for a change.
- Repos: `clarity-iq/clarityiq` (prototype/app, deploys to app.clarityiq.ai), `clarity-iq/clarityiq-web` (landing page, deploys to clarityiq.ai).

## Guardrails philosophy
Clinical accuracy and legal/consumer-safety guardrails already exist and are considered load-bearing — don't loosen or route around them for convenience. Any new patient-facing content (disclaimers, IOL info, etc.) should be additive to this system, not a replacement.

## Business context relevant to build decisions
- LLC: DLP Ventures, LLC (Wyoming). Support email: dlpventures13@gmail.com.
- Free tier requires no email to start or complete. Email is requested only at summary delivery (end of session) — this is deliberate, not a bug to "fix" toward gating earlier.
- Paid tier is a ONE-TIME payment, not a subscription. Don't build recurring billing logic.
- No refunds as stated policy (discretionary case-by-case is a business decision outside this codebase — don't build refund logic beyond noting the policy in ToS text).
- Founder is a board-certified ophthalmic surgeon. Do NOT name his employer or specific practice anywhere in DTC-facing content — this is a deliberate legal/business separation, not an oversight.

## When something isn't specified
If a task requires a business, legal, pricing, or clinical judgment call that isn't covered in the task description, stop and ask rather than deciding it yourself.
