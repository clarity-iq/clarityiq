// session-visuals-v1: stage visuals, lens-map triggers, drift guards, words toggle.
// Local file reads only. No network, no Worker, no voice sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(process.env.APP_INDEX || join(root, 'index.html'), 'utf8');
const begin = src.indexOf('// ── session-visuals-v1 BEGIN');
const end = src.indexOf('// ── session-visuals-v1 END');
const block = src.slice(begin, end);

// Pure functions only: drop the DOM init + timer, then evaluate in a sandbox.
const pure = block
  .replace(/\(function initVisuals\(\) \{[\s\S]*?\}\)\(\);/, '')
  .replace(/setInterval\([\s\S]*?\}, 15000\);/, '');
const nextStageFor = (s) => ({ welcome: 'foundations', foundations: 'vision_goals', vision_goals: s.tier === 'session' ? 'lens_options' : 'tier_gate', tier_gate: s.tier === 'session' ? 'lens_options' : 'readiness', lens_options: 'readiness', readiness: 'summary' })[s.current_stage] || null;
const ctx = vm.createContext({ nextStageFor, convoState: null, document: {}, console });
vm.runInContext(pure + `;Object.assign(globalThis,{lensZonesInText,foundationsFrameInText,visualBaseFor,resolveVisual,visualHintFromLine,visualHintFromTool,visualHintValid,stageRequestDecision,VISUAL_HINT_TTL_MS,VISUAL_TOOL_PRIORITY_MS,STAGE_FRAMES,VISUAL_IMAGES,LENS_CAPTIONS});`, ctx);
const V = ctx;
const S = (stage, track = null, tier = 'session') => ({ current_stage: stage, current_track: track, tier });
const T0 = 1_000_000;

test('every stage has a default visual, and every image file exists', () => {
  for (const stage of ['welcome', 'foundations', 'vision_goals', 'tier_gate', 'lens_options', 'readiness', 'summary']) {
    const frame = V.STAGE_FRAMES[stage][0];
    assert.ok(frame === 'lens_map' || V.VISUAL_IMAGES[frame], stage);
  }
  for (const meta of Object.values(V.VISUAL_IMAGES)) readFileSync(join(root, meta.src));
  assert.equal(V.visualBaseFor(S('vision_goals')).frame, 'daily_life');
  assert.equal(V.visualBaseFor(S('tier_gate', null, 'starter')).frame, 'daily_life');
  assert.equal(V.visualBaseFor(S('lens_options')).frame, 'lens_map');
});

test('lens words map to the four zones', () => {
  assert.deepEqual([...V.lensZonesInText('a basic monofocal lens is set for one distance')], ['monofocal']);
  assert.deepEqual([...V.lensZonesInText("let's talk about your toric lens options.")], ['toric']);
  assert.deepEqual([...V.lensZonesInText("some are designed to extend your range from distance into arm's length")], ['edof']);
  assert.deepEqual([...V.lensZonesInText('vivity, from alcon, is an extended-range lens')], ['edof']);
  assert.deepEqual([...V.lensZonesInText('panoptix and synergy are full-range lenses')], ['multifocal']);
  assert.deepEqual([...V.lensZonesInText('thanks, that makes sense')], []);
});

test('track zones are the base; word hints narrow within the track and never leave it', () => {
  const now = T0;
  assert.deepEqual([...V.visualBaseFor(S('lens_options', 'A')).zones], ['edof', 'multifocal']);
  assert.deepEqual([...V.visualBaseFor(S('lens_options', 'B')).zones], ['toric']);
  assert.deepEqual([...V.visualBaseFor(S('lens_options', 'C')).zones], ['monofocal']);
  assert.deepEqual([...V.visualBaseFor(S('lens_options')).zones], []); // overview: nothing dimmed
  const a = S('lens_options', 'A');
  const h = V.visualHintFromLine(a, 'others give a fuller range, like panoptix', now, null);
  assert.deepEqual([...V.resolveVisual(a, h, now).zones], ['multifocal']);
  assert.equal(V.visualHintFromLine(a, 'ask your surgeon about a toric version', now, null), null);
  const c = S('lens_options', 'C');
  assert.equal(V.visualHintFromLine(c, 'not covered the way it often is with toric lens options', now, null), null);
  const b = S('lens_options', 'B');
  const hb = V.visualHintFromLine(b, 'the same single-focal-point design as the basic lens, built to correct astigmatism. toric', now, null);
  assert.deepEqual([...V.resolveVisual(b, hb, now).zones], ['toric']);
});

test('overview line naming 3+ types lights nothing in particular', () => {
  const s = S('lens_options');
  const h = V.visualHintFromLine(s, 'a basic monofocal lens, a toric lens, extended-range lenses and full-range multifocal lenses', T0, null);
  assert.deepEqual([...V.resolveVisual(s, h, T0).zones], []);
});

test('drift guards: hints expire, never cross a stage, never change the stage', () => {
  const s = S('lens_options', 'A');
  const h = V.visualHintFromLine(s, 'extended-range lenses', T0, null);
  assert.deepEqual([...V.resolveVisual(s, h, T0 + 1000).zones], ['edof']);
  assert.deepEqual([...V.resolveVisual(s, h, T0 + V.VISUAL_HINT_TTL_MS + 1).zones], ['edof', 'multifocal']);
  const later = S('readiness', 'A');
  const r = V.resolveVisual(later, h, T0 + 1000);
  assert.equal(r.stage, 'readiness');
  assert.equal(r.frame, 'readiness');
  assert.equal(V.visualHintFromLine(S('vision_goals'), 'multifocal lenses', T0, null), null);
});

test('foundations frames follow the last-mentioned topic', () => {
  assert.equal(V.foundationsFrameInText('every iol gives one or more focal points'), 'focal_points');
  assert.equal(V.foundationsFrameInText('focal points ... and astigmatism'), 'astigmatism');
  assert.equal(V.foundationsFrameInText('a cataract is a clouding'), null);
});

test('set_visual tool: valid only for the current stage, and wins over word hints for a while', () => {
  const f = S('foundations');
  assert.equal(V.visualHintValid(f, V.visualHintFromTool(f, 'focal_points', T0)), true);
  assert.equal(V.visualHintValid(f, V.visualHintFromTool(f, 'multifocal', T0)), false);
  assert.equal(V.visualHintFromTool(f, 'bogus', T0), null);
  const tool = V.visualHintFromTool(f, 'focal_points', T0);
  assert.equal(V.visualHintFromLine(f, 'astigmatism', T0 + 1000, tool), null);
  assert.ok(V.visualHintFromLine(f, 'astigmatism', T0 + V.VISUAL_TOOL_PRIORITY_MS + 1, tool));
  const a = S('lens_options', 'A');
  assert.equal(V.visualHintValid(a, V.visualHintFromTool(a, 'toric', T0)), false);
  assert.equal(V.visualHintValid(a, V.visualHintFromTool(a, 'edof', T0)), true);
  assert.deepEqual([...V.resolveVisual(a, V.visualHintFromTool(a, 'lens_overview', T0), T0).zones], []);
});

test('set_stage tool: the app only opens the current or the single next stage', () => {
  assert.equal(V.stageRequestDecision(S('foundations'), 'vision_goals'), 'apply');
  assert.equal(V.stageRequestDecision(S('foundations'), 'foundations'), 'already_there');
  assert.equal(V.stageRequestDecision(S('foundations'), 'readiness'), 'refused');
  assert.equal(V.stageRequestDecision(S('readiness'), 'foundations'), 'refused');
  assert.equal(V.stageRequestDecision(S('vision_goals', null, 'starter'), 'lens_options'), 'refused');
  assert.equal(V.stageRequestDecision(S('vision_goals', null, 'starter'), 'tier_gate'), 'apply');
  assert.equal(V.stageRequestDecision(S('foundations'), 'nope'), 'unknown_stage');
});

test('hooks are wired into the existing stage, track and transcript paths', () => {
  assert.match(src, /ciqVisualSync\(\); \/\/ session-visuals-v1\n\}/);
  assert.match(src, /ciqVisualOnAgentLine\(lower\);/);
  assert.equal((src.match(/ciqVisualOnTrack\(\);/g) || []).length, 2);
  assert.match(src, /set_visual: async \(\{ visual \}\) => ciqVisualFromTool\(visual\)/);
  assert.match(src, /set_stage: async \(\{ stage \}\) =>/);
  // anchor phrase table unchanged
  assert.match(src, /\{ phrase: "based on what you've shared, let's talk about your lens options.", to: 'lens_options' \}/);
});

test('words panel is hidden by default with an accessible toggle', () => {
  assert.match(src, /<div id="app" role="main" class="ciq-visuals" data-words="closed">/);
  assert.match(src, /<button id="words-toggle" type="button" aria-controls="transcript-wrap" aria-expanded="false">/);
  assert.match(src, /#app\.ciq-visuals:has\(#roadmap:not\(:empty\)\) #transcript-wrap\{ grid-area:words; display:none;/);
  assert.match(src, /#app\.ciq-visuals\[data-words="open"\]:has\(#roadmap:not\(:empty\)\) #transcript-wrap\{/);
});

test('visual copy follows the wording rules', () => {
  const svgs = Object.values(V.VISUAL_IMAGES).map(m => readFileSync(join(root, m.src), 'utf8')).join('\n');
  const map = src.slice(src.indexOf('<svg id="lens-map"'), src.indexOf('</svg>', src.indexOf('<svg id="lens-map"')));
  const copy = [JSON.stringify(V.VISUAL_IMAGES), JSON.stringify(V.LENS_CAPTIONS), svgs, map].join('\n').toLowerCase();
  for (const bad of [/\bpatients?\b/, /\bbest\b/, /\brecommend/, /\bfits?\b/, /matches your goal/, /\bconsult\b/, /\bguarantee/, /\bperfect vision\b/, /\bglasses[- ]free\b/, /\$\d/, /\bcovered by\b/, /\binsurance\b/, /\bmedicare\b/, /\bpremium\b/, /\bupgrade\b/]) {
    assert.equal(bad.test(copy), false, String(bad));
  }
  assert.match(copy, /your surgeon/);
  // every zone gets one trade-off line of similar length
  const lens = ['monofocal', 'toric', 'edof', 'multifocal'].map(z => V.LENS_CAPTIONS[z].length);
  assert.ok(Math.max(...lens) / Math.min(...lens) < 1.8, String(lens));
});
