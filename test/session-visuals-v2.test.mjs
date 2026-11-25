// session-visuals-v2 (v3 manifest + Next-only + dynamic dots): modular visuals
// manifest with enabled flags, stage changes ONLY by Next, 3 lens categories
// one at a time, dynamic Near/Arm's/Far dots for Monofocal and Goals, toric
// add-on equal on all 3 lenses, nuance slides, and words always hidden.
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
vm.runInContext(
  pure + ';Object.assign(globalThis,{STAGE_CHANGE_NEXT_ONLY,VISUALS_MANIFEST,LENS_CATEGORIES,RANGE_KEYS,visualApplyProfile,visualStageMain,visualCuePlan,visualApplyCue,visualForStage,visualForTrack,visualFromTool,visualFrameOf});',
  V
);
const cues = (stage, line, m) => [...V.visualCuePlan(stage, line, m)].map(c => c.cue);
const run = (state, line, track = null, m) => V.visualCuePlan(state.stage, line, m).reduce((s, c) => V.visualApplyCue(s, c.cue, track, m), state);
const L = V.visualForStage('lens_options');
const G = V.visualForStage('vision_goals');

test('six stages each have one main image in VISUALS_MANIFEST, and every image file exists', () => {
  const mains = ['welcome', 'foundations', 'vision_goals', 'lens_options', 'readiness', 'summary'].map(s => V.visualStageMain(s));
  assert.deepEqual(mains, ['welcome', 'cataract', 'daily_life', 'lens_map', 'readiness', 'summary']);
  assert.equal(V.visualStageMain('tier_gate'), 'daily_life');
  for (const slide of Object.values(V.VISUALS_MANIFEST.slides)) {
    if (slide.src) readFileSync(join(root, slide.src));
  }
});

test('a new stage always starts on its main image (Next clears any slide and range dots)', () => {
  const popped = run(V.visualForStage('foundations'), 'it is called astigmatism');
  assert.equal(V.visualFrameOf(popped), 'astigmatism');
  const next = V.visualForStage('vision_goals');
  assert.equal(V.visualFrameOf(next), 'daily_life');
  assert.equal(next.slide, null);
  assert.equal(next.category, null);
  assert.equal(next.monoRange, null);
  assert.equal(next.goalRange, null);
});

test('keywords never change the stage, and do nothing outside their stage', () => {
  for (const stage of ['welcome', 'readiness', 'summary']) {
    const s = V.visualForStage(stage);
    const after = run(s, 'multifocal, toric, astigmatism, focal points, ic-8, light adjustable lens, reading, computer, driving');
    assert.deepEqual({ ...after }, { ...s }, stage);
  }
  const f = run(V.visualForStage('foundations'), 'multifocal and toric lenses');
  assert.equal(f.stage, 'foundations');
  assert.equal(V.visualFrameOf(f), 'cataract');
  assert.equal(run(L, 'focal points').slide, null); // Basics slides stay in Basics
  assert.doesNotMatch(block, /applyStageTransition|current_stage\s*=/);
});

test('exactly three lens categories; toric is not one of them; monofocal defaults to no single range lit', () => {
  assert.deepEqual([...V.LENS_CATEGORIES], ['monofocal', 'edof', 'multifocal']);
  for (const cls of ['lens-map-wide', 'lens-map-tall']) {
    const i = src.indexOf(`class="lens-map ${cls}"`);
    const svg = src.slice(i, src.indexOf('</svg>', i));
    assert.deepEqual([...svg.matchAll(/data-zone="(\w+)"/g)].map(m => m[1]), ['monofocal', 'edof', 'multifocal'], cls);
    assert.match(svg, /Includes enhanced monofocal|ONE FOCAL POINT/);
    const monoEnd = svg.indexOf('data-zone="edof"');
    const monoSvg = svg.slice(0, monoEnd);
    assert.doesNotMatch(monoSvg, /lz-dot on/, `${cls} monofocal must default to no range lit`);
  }
  assert.match(V.VISUALS_MANIFEST.categories.monofocal.caption, /one focal point, set for near, arm\u2019s length or far/i);
});

test('monofocal dynamic dots light near, arms, or far as spoken and fall back safely to default', () => {
  const cOpen = V.visualForTrack(L, 'C');
  assert.equal(cOpen.category, 'monofocal');
  assert.equal(cOpen.monoRange, null);
  const plan = V.visualCuePlan('lens_options', 'would it matter more to see things up close, like reading; at arm\'s length, like a computer; or farther out, like driving? or are you not sure?');
  const monoSteps = [...plan].filter(s => s.cue.startsWith('mono:')).map(s => s.cue);
  assert.deepEqual(monoSteps, ['mono:near', 'mono:arms', 'mono:far', 'mono:clear']);
  assert.equal(run(cOpen, 'if set up close for reading').monoRange, 'near');
  assert.equal(run(cOpen, 'set for intermediate, like a computer screen').monoRange, 'arms');
  assert.equal(run(cOpen, 'set for distance, like driving').monoRange, 'far');
  assert.equal(run(cOpen, 'set for near, or are you not sure?').monoRange, null);
  // never fires on EDOF, Multifocal, Toric, or outside lens_options
  const edof = { ...L, category: 'edof' };
  assert.equal(run(edof, 'reading and driving').monoRange, null);
  assert.equal(run(edof, 'reading and driving').category, 'edof');
  assert.equal(run(V.visualForStage('foundations'), 'reading and driving').monoRange, null);
});

test('goals dynamic dots default to none lit and light near, arms, or far as the goal is named', () => {
  assert.equal(G.goalRange, null);
  const gStart = src.indexOf('<div id="goals-map"');
  const gHtml = src.slice(gStart, src.indexOf('</div>', gStart));
  assert.deepEqual([...gHtml.matchAll(/data-zone="(\w+)"/g)].map(m => m[1]), ['near', 'arms', 'far']);
  assert.doesNotMatch(gHtml, /gz is-on/);
  assert.equal(run(G, 'how about reading books or medication labels?').goalRange, 'near');
  assert.equal(run(G, 'what about a computer screen or cooking?').goalRange, 'arms');
  assert.equal(run(G, 'and night driving?').goalRange, 'far');
  assert.equal(run(G, 'driving, or are you not sure yet?').goalRange, null);
  assert.equal(run(V.visualForStage('tier_gate'), 'computer time').goalRange, 'arms');
  assert.equal(run(V.visualForStage('readiness'), 'reading and driving').goalRange, null);
});

test('one category at a time, in the order they are spoken', () => {
  const plan = V.visualCuePlan('lens_options', 'a monofocal lens gives one focal point. extended-range lenses reach arm\'s length. multifocal lenses add reading.');
  assert.deepEqual([...plan].filter(c => V.LENS_CATEGORIES.includes(c.cue)).map(c => c.cue), ['monofocal', 'edof', 'multifocal']);
  assert.equal(run(L, 'enhanced monofocal lenses like eyhance').category, 'monofocal');
  assert.equal(run(L, 'vivity and puresee are extended-range lenses').category, 'edof');
  assert.equal(run(L, 'panoptix is a trifocal').category, 'multifocal');
});

test('track openings: C lights Monofocal, B opens the toric add-on, A lights nothing until named', () => {
  const c = V.visualForTrack(L, 'C');
  assert.equal(c.category, 'monofocal');
  assert.equal(c.monoRange, null);
  const b = V.visualForTrack(L, 'B');
  assert.equal(V.visualFrameOf(b), 'toric');
  assert.equal(b.category, null);
  const a = V.visualForTrack({ ...L, category: 'monofocal', monoRange: 'far' }, 'A');
  assert.equal(a.category, null);
  assert.equal(a.monoRange, null);
  assert.equal(V.visualFrameOf(a), 'lens_map');
  assert.equal(V.visualForTrack(G, 'A').stage, 'vision_goals');
});

test('toric add-on highlights no single category (all 3 equal with axis marks)', () => {
  const edof = { ...L, category: 'edof' };
  const t = run(edof, 'these lenses can also correct astigmatism, to varying degrees');
  assert.equal(V.visualFrameOf(t), 'toric');
  assert.equal(t.category, null);
  const b = run(V.visualForTrack(L, 'B'), 'the same single-focal-point design as the basic lens, built to correct astigmatism', 'B');
  assert.equal(V.visualFrameOf(b), 'toric');
  assert.equal(b.category, null);
  const back = run(t, 'multifocal lenses', 'A');
  assert.equal(V.visualFrameOf(back), 'lens_map');
  assert.equal(back.category, 'multifocal');
});

test('nuance slides only when named, each pointing back to its home category', () => {
  assert.deepEqual(cues('lens_options', 'the light adjustable lens, lal, from rxsight'), ['lal']);
  const lal = run(L, 'the light adjustable lens can be fine-tuned');
  assert.equal(V.visualFrameOf(lal), 'lal');
  assert.equal(lal.category, 'monofocal');
  const ic8 = run(L, 'the ic-8 apthera is used in one eye');
  assert.equal(V.visualFrameOf(ic8), 'ic8');
  assert.equal(ic8.category, 'edof');
  assert.match(V.VISUALS_MANIFEST.slides.lal.kicker, /Monofocal/);
  assert.match(V.VISUALS_MANIFEST.slides.ic8.kicker, /EDOF/);
  assert.equal(V.visualFrameOf(run(L, 'a basic monofocal lens')), 'lens_map');
});

test('C-loop IOL haptics have opposite-shoulder attachment and matching rotational curvature', () => {
  for (const file of ['foundations-cataract.svg', 'lal.svg', 'ic8.svg']) {
    const svg = readFileSync(join(root, 'images/session', file), 'utf8');
    const paths = [...svg.matchAll(/d="M(-?[\d.]+),(-?[\d.]+) C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)"/g)];
    assert.ok(paths.length >= 2, file);
    const [a, b] = paths.slice(0, 2).map(m => m.slice(1).map(Number));
    for (let i = 0; i < 8; i++) assert.ok(Math.abs(a[i] + b[i]) < 0.2, `${file} idx ${i}: ${a[i]} vs ${b[i]}`);
  }
  const lm = src.slice(src.indexOf('<div id="lens-map"'), src.indexOf('<div id="goals-map"'));
  const haps = [...lm.matchAll(/class="lz-hap" d="M(-?[\d.]+),(-?[\d.]+) C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)"/g)];
  assert.equal(haps.length, 12); // 2 haptics x 3 lenses x 2 layouts
  for (let i = 0; i < haps.length; i += 2) {
    const a = haps[i].slice(1).map(Number), b = haps[i + 1].slice(1).map(Number);
    for (let j = 0; j < 8; j++) assert.ok(Math.abs(a[j] + b[j]) < 0.2, `lens-map pair ${i} idx ${j}`);
  }
});

test('welcome sketch contains no stage numbers', () => {
  const w = readFileSync(join(root, 'images/session/welcome.svg'), 'utf8');
  assert.doesNotMatch(w, />\s*[123]\.\s/);
});

test('modular manifest is JSON-serializable and enabled flags switch slides on or off', () => {
  const roundTrip = JSON.parse(JSON.stringify(V.VISUALS_MANIFEST));
  assert.equal(roundTrip.version, 3);
  const noNuance = V.visualApplyProfile(V.VISUALS_MANIFEST, {
    slides: { lal: { enabled: false }, ic8: { enabled: false }, focal_points: { enabled: false } },
  });
  assert.deepEqual(cues('lens_options', 'light adjustable lens and ic-8 apthera', noNuance), []);
  assert.equal(V.visualFrameOf(run(L, 'light adjustable lens', 'A', noNuance), noNuance), 'lens_map');
  assert.equal(V.visualFromTool(L, 'lal', noNuance), null);
  assert.equal(V.visualFromTool(V.visualForStage('foundations'), 'focal_points', noNuance), null);
  const noToric = V.visualApplyProfile(V.VISUALS_MANIFEST, { slides: { toric: { enabled: false } } });
  assert.equal(V.visualFrameOf(V.visualForTrack(L, 'B', noToric), noToric), 'lens_map');
});

test('set_visual tool (design) is limited to the current stage', () => {
  assert.equal(V.visualFromTool(V.visualForStage('foundations'), 'multifocal'), null);
  assert.equal(V.visualFrameOf(V.visualFromTool(V.visualForStage('foundations'), 'focal_points')), 'focal_points');
  assert.equal(V.visualFromTool(L, 'focal_points'), null);
  assert.equal(V.visualFromTool(L, 'edof').category, 'edof');
  assert.equal(V.visualFromTool(G, 'arms').goalRange, 'arms');
  assert.equal(V.visualFromTool({ ...L, category: 'monofocal' }, 'near').monoRange, 'near');
  const t = V.visualFromTool(L, 'toric');
  assert.equal(V.visualFrameOf(t), 'toric');
  assert.equal(t.category, null);
  assert.equal(V.visualFromTool(V.visualForStage('readiness'), 'toric'), null);
  assert.match(src, /set_visual: async \(\{ visual \}\) => ciqVisualFromTool\(visual\)/);
  assert.doesNotMatch(src, /set_stage/);
});

test('stage changes ONLY by Next; agent stage-opening sentence triggers are turned off', () => {
  assert.equal(V.STAGE_CHANGE_NEXT_ONLY, true);
  assert.match(src, /if \(!STAGE_CHANGE_NEXT_ONLY\) \{\s*for \(const entry of ANCHOR_PHRASES\)/);
  assert.match(src, /if \(!STAGE_CHANGE_NEXT_ONLY && STAGE_ORDER\.indexOf\(convoState\.current_stage\)/);
  assert.match(src, /ciqVisualSync\(\); \/\/ session-visuals-v2\n\}/);
  assert.match(src, /ciqVisualOnAgentLine\(lower\);/);
  assert.equal((src.match(/ciqVisualOnTrack\(\);/g) || []).length, 2);
});

test('words panel always starts hidden; nothing remembered', () => {
  assert.match(src, /<div id="app" role="main" class="ciq-visuals" data-words="closed">/);
  assert.match(src, /<button id="words-toggle" type="button" aria-controls="transcript-wrap" aria-expanded="false">/);
  assert.match(block, /ciqSetWords\(false\);/);
  assert.doesNotMatch(src, /ciq_words_open/);
  assert.doesNotMatch(block, /localStorage/);
});

test('visual copy follows the wording rules and monofocal omits halo/glare claim', () => {
  assert.doesNotMatch(V.VISUALS_MANIFEST.categories.monofocal.caption, /halo|glare/i);
  const svgs = Object.values(V.VISUALS_MANIFEST.slides)
    .filter(s => s.src)
    .map(m => readFileSync(join(root, m.src), 'utf8'))
    .join('\n');
  const mapStart = src.indexOf('<div id="lens-map"');
  const map = src.slice(mapStart, src.indexOf('<figcaption', mapStart));
  const copy = [JSON.stringify(V.VISUALS_MANIFEST), svgs, map].join('\n').toLowerCase();
  for (const bad of [/\bpatients?\b/, /\bbest\b/, /\brecommend/, /\bfits?\b/, /matches your goal/, /\bconsult\b/, /\bguarantee/, /\bperfect vision\b/, /\bglasses[- ]free\b/, /\$\d/, /\bcovered by\b/, /\bcoverage\b/, /\binsurance\b/, /\bmedicare\b/, /\bpremium\b/, /\bupgrade\b/, /\badvanced\b/]) {
    assert.equal(bad.test(copy), false, String(bad));
  }
  assert.match(copy, /your surgeon/);
  const lens = V.LENS_CATEGORIES.map(z => V.VISUALS_MANIFEST.categories[z].caption.length);
  assert.ok(Math.max(...lens) / Math.min(...lens) < 1.4, String(lens));
});
