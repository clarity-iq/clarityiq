# ClarityIQ — Architecture & Systems Reference

Companion to CLAUDE.md. This is the "how it all fits together" document — read this before touching anything related to the conversation flow, stage detection, or the ElevenLabs/proxy integration. Several things here are exact-match/fragile by design; the note on each explains why, so you don't "fix" something that's actually intentional.

---

## 1. How a session works, end to end

1. Patient opens app.clarityiq.ai → static `index.html`.
2. Patient clicks "Begin conversation" → connects to ElevenLabs via the browser SDK (`@elevenlabs/client`), which opens a live voice session with the configured Agent (see §2).
3. As the agent talks, the frontend listens to the transcript stream and checks each agent line against the **anchor phrase registry** (§3) to detect which of the 6 stages the conversation has reached. This is how the on-screen progress bar/roadmap advances — it is NOT timed and NOT keyword-guessed, it's exact-phrase matching, forward-only.
4. At Stage 6, the summary button activates. When clicked, the full transcript is sent to a **Cloudflare Worker proxy** (`clarityiq-proxy`), which calls the Anthropic API server-side (keeping the API key off the client) and returns a structured JSON summary.
5. Summary is rendered on-screen and can be saved as an image.

## 2. ElevenLabs configuration

- **Agent ID:** `agent_1401kws7xzy8ev4ryzbwvza7mex5`
- **Voice:** Eryn
- **Underlying LLM:** Claude 4.5
- **Turn detection:** Turn V3
- **Interruption handling:** ON (patient can interrupt the agent mid-sentence)
- **Where this lives:** ElevenLabs dashboard, not in the repo. If a task requires changing agent behavior (tone, pacing, new content), that's a dashboard-side change to the agent's system prompt/knowledge base — not something to try to replicate in frontend code.
- **Knowledge Base:** this is where the FDA SSED-derived IOL patient-labeling content (Batch 3.1 in the build specs) needs to be uploaded — via the ElevenLabs dashboard, not committed to GitHub.

## 3. Anchor phrase registry — exact sync required

The agent is scripted to say specific sentences at the start of each stage. The frontend code listens for these exact phrases (lowercased, substring match) to advance the stage indicator. **If the agent's script ever changes in the ElevenLabs dashboard, this table must be updated in the code at the same time, or stage detection silently breaks.** This is the single most fragile coupling in the whole system — flag any task that touches either side of it.

| Stage | Label | Progress % | Agent says exactly | Code matches on |
|---|---|---|---|---|
| 1 | Welcome | 5% | Scripted opening, no anchor | `"ready to get started"` / `"ready to begin"` |
| 2 | IOL Education | 20% | "Let me start with a quick overview of how this works." | exact phrase |
| 3 | Your Goals | 40% | "Now let's talk about your goals." | exact phrase (2 variants synced) |
| 4 | Lens Options | 60% | "Based on what you've shared, let's talk about your lens options." | exact phrase |
| 5 | Your Questions | 80% | "Now let's cover any questions you have." | exact phrase |
| 6 | Summary | 100% | "We're ready to put together your summary." | exact phrase, also triggers the summary button |

Detection logic: iterates forward through stages only — a patient can't accidentally trigger stage 2's phrase after already reaching stage 4 and have it count backwards. Matching is on agent messages only, never patient messages.

**Any new content (Batch 1-4 tasks that touch Stage 1 or add new questions) must not collide with these phrases or disrupt this detection loop.** If a new question is being inserted into an existing stage (e.g., the age-band or population-filter questions), place it so the stage-opening anchor phrase still fires normally — test that the stage still advances correctly after the change.

## 4. Cloudflare Worker proxy

- **Purpose:** keeps the Anthropic API key server-side. The frontend never holds it directly.
- **Current production URL:** `https://clarityiq-proxy.dlpventures13.workers.dev` — verified directly against `index.html` and the live Cloudflare account on July 9, 2026, following the account migration. (The old, pre-migration URL was `clarityiq-proxy.martindelapresa.workers.dev` — retired, do not use.)
- **What it does:** receives the full transcript, sends a structured extraction prompt to the Anthropic API, returns JSON (vision goal, lens preference, topics covered, surgeon question — see summary v2 spec for the full field list).
- **Secret stored here:** `ANTHROPIC_KEY`, as an encrypted Cloudflare environment variable — never in GitHub, never in the frontend code.
- **Rate limiting (Batch 4.4)** is implemented as of July 24, 2026: per-IP throttling on both the ElevenLabs signed-URL endpoint (5/hour) and this summary-generation route (10/hour), plus session-context gating on every client-tool/telemetry endpoint so none of them are callable without a real voice session having actually started. The client also no longer connects to ElevenLabs with a bare public agent ID — it requests a short-lived signed URL from this Worker first, which holds the real ElevenLabs key server-side.

## 5. Data & consumer health information architecture — locked decisions, not open questions

These were deliberate decisions, made after evaluating alternatives. Do not treat them as gaps to "fix":

- **Not PHI — consumer health information, a different category.** "PHI" is a HIPAA term of art that only applies to HIPAA-covered entities and their business associates; ClarityIQ is neither, so it's not possible for us to "have PHI" in the first place. What we handle is consumer health information, governed by a different set of rules. Don't describe this system's data as "no PHI retained" — say "no consumer health information retained beyond the session" instead.
- **Zero/minimal retention regardless of category.** No audio, transcripts, or generated summary kept server-side. The transcript exists client-side during the session and is sent once to the proxy for summary generation, not stored there. The summary itself is emailed to the person once (their own inbox is the sole place it lives) and is never written to persistent storage — the summary-generation endpoint writes to no database, no object storage, nothing that survives the request. (An earlier version of this system did save a copy onto the purchase record, auto-purged after 60 days — removed entirely as of July 24, 2026, not just shortened, since nothing ever read it back out. Confirmed via SendGrid's own documentation that the email provider itself retains no message body content post-delivery either.)
- **Anonymous learning data only**, fixed schema (this is what the telemetry in Batch 1 extends): topics asked, re-ask rates, variant IDs, clarity ratings, drop-off stage, duration, age band, track A/B/C. Enums and counts — no free text, no identifiers, by design.
- **Patient owns their summary.** It's generated for them, on their device — not stored in a ClarityIQ-controlled database tied to their identity. The session code (Batch 1.2) is what allows joining telemetry + survey + summary for a single session without needing an email or account for the free tier.
- **Clinical content sourcing rule:** all clinical content must trace back to FDA sources (SSED patient labeling, per Batch 3.1) — not personal clinical opinion, not invented. This is a decided rule, not a suggestion.

## 6. Track routing logic (A/B/C)

Conversation branches into three tracks based on how the patient responds during the goals stage (Stage 3). Roughly: ~20% of the conversation is fully scripted (opening, closing, guardrails, cost framing), ~40% is rules-based branching (which track, focal point questions, astigmatism depth), ~40% is freeform within system-prompt constraints (patient's own questions, follow-up depth). Track logic itself lives in the ElevenLabs agent's system prompt, not in the frontend — the frontend only records which track was ultimately used, for telemetry.

## 7. Repos and hosting

**Three-repo structure as of July 21, 2026 (Batch 3.5 in progress — repo structure and content migration done; DNS record and GitHub Pages activation for the new repo still pending, see below):**
- `clarity-iq/clarityiq` → deploys to app.clarityiq.ai (the patient-facing prototype/app)
- `clarity-iq/clarityiq-web` → deploys to clarityiq.ai (the new DTC consumer landing page — replaced the practice-facing content this repo used to serve)
- `clarity-iq/clarityiq-practices` → deploys to practices.clarityiq.ai (the original practice-facing lead-gen page, migrated unchanged from clarityiq-web; kept live for future practice-facing outreach but deliberately not linked from anywhere on the consumer site — undiscoverable by navigation, `noindex, nofollow` + `robots.txt` disallow-all to also keep it out of search)
- Hosting: GitHub Pages for all three. **DNS authority correction (July 10, 2026): Cloudflare is NOT yet the live DNS authority for clarityiq.ai, despite earlier notes in this doc suggesting otherwise.** The domain is under an ICANN 60-day transfer lock until **September 4, 2026**. A Cloudflare zone exists for clarityiq.ai but shows status `pending` — its assigned nameservers have not been applied at the registrar, and the domain's actual nameservers are still `ns8.wixdns.net` / `ns9.wixdns.net`. Any Cloudflare-side DNS changes made before the transfer completes have no live effect. Confirmed working as of this date: `clarityiq.ai` and `app.clarityiq.ai` resolve correctly via Wix's DNS to GitHub Pages — the site itself is unaffected. `practices.clarityiq.ai` requires a new CNAME record at Wix (see below) before it resolves. Wix's own DNS panel does support adding custom MX/TXT/CNAME records directly, without a nameserver change. Don't treat Cloudflare as the DNS authority for any new subdomain/record work until the transfer is confirmed resolved.
- **practices.clarityiq.ai setup, two manual steps outside this session's tool access (flagged, not completed by Claude):** (1) At Wix's DNS panel, add a CNAME record: host `practices`, value `clarity-iq.github.io` (same pattern as the existing `app` and `www` CNAME records). (2) In the `clarity-iq/clarityiq-practices` repo's GitHub Settings → Pages, enable Pages (source: `main` branch, root) — the sandboxed session used for this build has no GitHub Pages API access (blocked by the environment's proxy) and no dashboard access, so this couldn't be completed programmatically.
- No build step, no framework, static HTML/JS. Keep it that way unless a task specifically requires otherwise.
- **Email:** `support@clarityiq.ai` forwards to `dlpventures13@gmail.com` via ImprovMX, set up directly via Wix's DNS panel — interim solution (forwarding only, not a real inbox), not through Cloudflare Email Routing, since Cloudflare isn't the DNS authority yet (see above). **Future to-do, not urgent:** once the domain transfers to Cloudflare in September 2026, ImprovMX's MX/TXT records will need to be re-added in Cloudflare's DNS zone (or reconsidered in favor of Cloudflare Email Routing directly, which does the same forwarding job natively once Cloudflare is authoritative), or email will break the moment the nameserver cutover happens.

## 8. If something here seems wrong or outdated

This document reflects decisions as of July 9, 2026. If you find the live code contradicts something here (e.g., the proxy URL, the anchor phrases, the agent ID), don't assume the doc is right and the code is wrong, or vice versa — flag the discrepancy and ask before proceeding, since a mismatch here means something drifted out of sync and needs a human decision on which is correct.
