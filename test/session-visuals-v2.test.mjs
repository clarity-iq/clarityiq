// session-visuals-v2: one main image per stage (changes on Next only), in-stage
// slides, 3 lens categories one at a time, toric as an add-on layer, nuance
// slides, and a words panel that always starts hidden.
// Local file reads only. No network, no Worker, no voice sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(process.env.APP_INDEX || join(root, 'index.html'), 'utf8');
const block = src.slice(src.indexOf('// ── session-visuals-v2 BEGIN'), src.indexOf('// ── session-visuals-v2 END'));
const pure = block.replace(/\(function initVisuals\(\) \{[\s\S]*?\}\)\(\);/, '');
const V = vm.createContext({ convoState: null, document: {}, console });
vm.runInContext(pure + ';Object.assign(globalThis,{visualCuePlan,visualApplyCue,visualForStage,visualForTrack,visualFromTool,visualFrameOf,STAGE_MAIN,STAGE_SLIDES,VISUAL_IMAGES,LENS_CAPTIONS,LENS_CATEGORIES});', V);
const cues = (stage, line) => [...V.visualCuePlan(stage, line)].map(c => c.cue);
const run = (state, line, track = null) => V.visualCuePlan(state.stage, line).reduce((s, c) => V.visualApplyCue(s, c.cue, track), state);
const L = V.visualForStage('lens_options');

test('six stages each have one main image, and every image file exists', () => {
  const mains = ['welcome', 'foundations', 'vision_goals', 'lens_options', 'readiness', 'summary'].map(s => V.STAGE_MAIN[s]);
  assert.deepEqual(mains, ['welcome', 'cataract', 'daily_life', 'lens_map', 'readiness', 'summary']);
  assert.equal(V.STAGE_MAIN.tier_gate, 'daily_life');
  for (const meta of Object.values(V.VISUAL_IMAGES)) readFileSync(join(root, meta.src));
});

test('a new stage always starts on its main image (Next clears any slide)', () => {
  const popped = run(V.visualForStage('foundations'), 'it is called astigmatism');
  assert.equal(V.visualFrameOf(popped), 'astigmatism');
  const next = V.visualForStage('vision_goals');
  assert.equal(V.visualFrameOf(next), 'daily_life');
  assert.equal(next.slide, null);
  assert.equal(next.category, null);
});

test('keywords never change the stage, and do nothing outside their stage', () => {
  for (const stage of ['welcome', 'vision_goals', 'readiness', 'summary']) {
    const s = V.visualForStage(stage);
    const after = run(s, 'multifocal, toric, astigmatism, focal points, ic-8, light adjustable lens');
    assert.deepEqual({ ...after }, { ...s }, stage);
  }
  const f = run(V.visualForStage('foundations'), 'multifocal and toric lenses');
  assert.equal(f.stage, 'foundations');
  assert.equal(V.visualFrameOf(f), 'cataract');
  assert.equal(run(L, 'focal points').slide, null); // Basics slides stay in Basics
  assert.doesNotMatch(block, /applyStageTransition|current_stage\s*=/);
});

test('exactly three lens categories; toric is not one of them', () => {
  assert.deepEqual([...V.LENS_CATEGORIES], ['monofocal', 'edof', 'multifocal']);
  for (const cls of ['lens-map-wide', 'lens-map-tall']) {
    const i = src.indexOf(`class="lens-map ${cls}"`);
    const svg = src.slice(i, src.indexOf('</svg>', i));
    assert.deepEqual([...svg.matchAll(/data-zone="(\w+)"/g)].map(m => m[1]), ['monofocal', 'edof', 'multifocal'], cls);
    assert.match(svg, /Includes enhanced monofocal|ONE FOCAL POINT/);
  }
});

test('one category at a time, in the order they are spoken', () => {
  const plan = V.visualCuePlan('lens_options', 'a monofocal lens gives one focal point. extended-range lenses reach arm\'s length. multifocal lenses add reading.');
  assert.deepEqual([...plan].map(c => c.cue), ['monofocal', 'edof', 'multifocal']);
  assert.ok(plan[0].delayMs < plan[1].delayMs && plan[1].delayMs < plan[2].delayMs);
  assert.equal(run(L, 'enhanced monofocal lenses like eyhance').category, 'monofocal');
  assert.equal(run(L, 'vivity and puresee are extended-range lenses').category, 'edof');
  assert.equal(run(L, 'panoptix is a trifocal').category, 'multifocal');
});

test('track openings: C lights Monofocal, B opens the toric add-on, A lights nothing until named', () => {
  assert.equal(V.visualForTrack(L, 'C').category, 'monofocal');
  assert.equal(V.visualFrameOf(V.visualForTrack(L, 'B')), 'toric');
  const a = V.visualForTrack({ ...L, category: 'monofocal' }, 'A');
  assert.equal(a.category, null);
  assert.equal(V.visualFrameOf(a), 'lens_map');
  assert.equal(V.visualForTrack(V.visualForStage('vision_goals'), 'A').stage, 'vision_goals');
});

test('toric add-on layers on the current category', () => {
  const edof = { ...L, category: 'edof' };
  const t = run(edof, 'these lenses can also correct astigmatism, to varying degrees');
  assert.equal(V.visualFrameOf(t), 'toric');
  assert.equal(t.category, 'edof');
  // in the toric lesson, "basic lens" lights Monofocal under the toric layer
  const b = run(V.visualForTrack(L, 'B'), 'the same single-focal-point design as the basic lens, built to correct astigmatism', 'B');
  assert.equal(V.visualFrameOf(b), 'toric');
  assert.equal(b.category, 'monofocal');
  // outside the toric lesson, a category word returns to the map
  assert.equal(V.visualFrameOf(run(t, 'multifocal lenses', 'A')), 'lens_map');
});

test('nuance slides only when named, each pointing back to its home category', () => {
  assert.deepEqual(cues('lens_options', 'the light adjustable lens, lal, from rxsight'), ['lal']);
  const lal = run(L, 'the light adjustable lens can be fine-tuned');
  assert.equal(V.visualFrameOf(lal), 'lal');
  assert.equal(lal.category, 'monofocal');
  const ic8 = run(L, 'the ic-8 apthera is used in one eye');
  assert.equal(V.visualFrameOf(ic8), 'ic8');
  assert.equal(ic8.category, 'edof');
  assert.match(V.VISUAL_IMAGES.lal.kicker, /Monofocal/);
  assert.match(V.VISUAL_IMAGES.ic8.kicker, /EDOF/);
  assert.equal(V.visualFrameOf(run(L, 'a basic monofocal lens')), 'lens_map');
});

test('set_visual tool (design) is limited to the current stage', () => {
  assert.equal(V.visualFromTool(V.visualForStage('foundations'), 'multifocal'), null);
  assert.equal(V.visualFrameOf(V.visualFromTool(V.visualForStage('foundations'), 'focal_points')), 'focal_points');
  assert.equal(V.visualFromTool(L, 'focal_points'), null);
  assert.equal(V.visualFromTool(L, 'edof').category, 'edof');
  assert.equal(V.visualFrameOf(V.visualFromTool(L, 'toric')), 'toric');
  assert.equal(V.visualFromTool(V.visualForStage('readiness'), 'toric'), null);
  assert.match(src, /set_visual: async \(\{ visual \}\) => ciqVisualFromTool\(visual\)/);
  assert.doesNotMatch(src, /set_stage/);
});

test('hooks are wired; stage machine and anchor table untouched', () => {
  assert.match(src, /ciqVisualSync\(\); \/\/ session-visuals-v2\n\}/);
  assert.match(src, /ciqVisualOnAgentLine\(lower\);/);
  assert.equal((src.match(/ciqVisualOnTrack\(\);/g) || []).length, 2);
  assert.match(src, /\{ phrase: "based on what you've shared, let's talk about your lens options.", to: 'lens_options' \}/);
});

test('words panel always starts hidden; nothing remembered', () => {
  assert.match(src, /<div id="app" role="main" class="ciq-visuals" data-words="closed">/);
  assert.match(src, /<button id="words-toggle" type="button" aria-controls="transcript-wrap" aria-expanded="false">/);
  assert.match(block, /ciqSetWords\(false\);/);
  assert.doesNotMatch(src, /ciq_words_open/);
  assert.doesNotMatch(block, /localStorage/);
});

test('visual copy follows the wording rules', () => {
  const svgs = Object.values(V.VISUAL_IMAGES).map(m => readFileSync(join(root, m.src), 'utf8')).join('\n');
  const mapStart = src.indexOf('<div id="lens-map"');
  const map = src.slice(mapStart, src.indexOf('<figcaption', mapStart));
  const copy = [JSON.stringify(V.VISUAL_IMAGES), JSON.stringify(V.LENS_CAPTIONS), svgs, map].join('\n').toLowerCase();
  for (const bad of [/\bpatients?\b/, /\bbest\b/, /\brecommend/, /\bfits?\b/, /matches your goal/, /\bconsult\b/, /\bguarantee/, /\bperfect vision\b/, /\bglasses[- ]free\b/, /\$\d/, /\bcovered by\b/, /\bcoverage\b/, /\binsurance\b/, /\bmedicare\b/, /\bpremium\b/, /\bupgrade\b/, /\badvanced\b/]) {
    assert.equal(bad.test(copy), false, String(bad));
  }
  assert.match(copy, /your surgeon/);
  const lens = V.LENS_CATEGORIES.map(z => V.LENS_CAPTIONS[z].length);
  assert.ok(Math.max(...lens) / Math.min(...lens) < 1.4, String(lens));
});
