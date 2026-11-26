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
function makeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}
function loadVisuals(search = '', seed = {}) {
  const storage = makeStorage(seed);
  const ctx = vm.createContext({
    convoState: null,
    document: {},
    console,
    URLSearchParams,
    location: { search },
    sessionStorage: storage,
  });
  vm.runInContext(
    pure + ';Object.assign(globalThis,{CIQ_VISUALS_KEY,CIQ_VISUALS_ON_VALUE,VISUALS_ENABLED,STAGE_CHANGE_NEXT_ONLY,ciqResolveVisualsFlag,VISUALS_MANIFEST,LENS_CATEGORIES,RANGE_KEYS,visualApplyProfile,visualStageMain,visualCuePlan,visualApplyCue,visualForStage,visualForTrack,visualFromTool,visualFrameOf,ciqVisualSync,ciqVisualOnAgentLine,ciqVisualOnTrack,ciqVisualFromTool});',
    ctx
  );
  return { ctx, storage };
}
const { ctx: V } = loadVisuals('?v=s2');
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

test('cue matcher follows live v3.8.3 scripted wording (paraphrased; no personal data)', () => {
  // Foundations: the teaching line uses plural "focal points"; singular "focal point"
  // in the astigmatism block must not steal the slide back.
  assert.deepEqual(cues('foundations', 'every iol gives one or more focal points, ranges where vision is clearest without glasses'), ['focal_points']);
  assert.deepEqual(cues('foundations', "it's called astigmatism; it can blur vision at any focal point"), ['astigmatism']);
  assert.deepEqual(cues('foundations', 'one focal point usually means glasses for the other ranges'), []);

  // Goals: scripted lifestyle questions and routing.
  assert.deepEqual(cues('vision_goals', 'how much does reading books or medication labels matter?'), ['goal:near']);
  assert.deepEqual(cues('vision_goals', "what about things at about arm's length — a computer screen, the car dashboard, cooking?"), ['goal:arms']);
  assert.deepEqual(cues('vision_goals', 'and night driving and headlight glare?'), ['goal:far']);
  assert.deepEqual(cues('vision_goals', "or you're not sure yet, which is a perfectly good answer too"), ['goal:clear']);
  assert.deepEqual(cues('vision_goals', 'work at about arm\u2019s length, like a computer'), ['goal:arms']); // typographic apostrophe
  // Scripted comprehension check must not light Far.
  assert.deepEqual(cues('vision_goals', 'does that make sense so far?'), []);
  // "readers for small print" is the residual on a far-plus-arm's goal, not a near goal;
  // naming two ranges in one line finishes on the default (none lit).
  assert.deepEqual(
    cues('vision_goals', "seeing well far away and at arm's length, with readers for small print"),
    ['goal:far', 'goal:arms', 'goal:clear']
  );
  // Monovision history in Goals must not light the Near or Far goal dots.
  assert.deepEqual(cues('vision_goals', 'have you ever tried monovision before — where one eye is set for near and the other for distance?'), []);
  assert.deepEqual(cues('vision_goals', 'and which eye was set for distance, which for near?'), []);

  // Lens categories, from scripted Stage 4 lines.
  assert.equal(run(L, 'a basic lens is set for one distance, usually far').category, 'monofocal');
  assert.equal(run(L, "extended-range lenses are designed for far through arm's length").category, 'edof');
  assert.equal(run(L, 'puresee, from j&j vision, and vivity, from alcon').category, 'edof');
  assert.equal(run(L, "full-range lenses are designed for far, arm's length and near").category, 'multifocal');
  assert.equal(run(L, 'clareon monofocal, from alcon, is designed for one distance').category, 'monofocal');
  assert.equal(run(L, "they're still mainly a one-focal-point lens").category, 'monofocal');
  assert.equal(run(L, 'they are approved as standard lenses').category, 'monofocal');
  // "Clareon" is a platform name: Clareon PanOptix Pro is multifocal, not monofocal.
  assert.deepEqual(cues('lens_options', "clareon panoptix pro, alcon's newer version of it"), ['multifocal']);
  // Comparisons and negations should not steal the highlight.
  assert.deepEqual(cues('lens_options', 'night halos are usually milder than with multifocal lenses'), []);
  assert.deepEqual(cues('lens_options', 'the ic-8 is a small-aperture lens, not an extended-range or edof lens'), ['ic8']);
  // Toric: the scripted "correct astigmatism" line hits; passing "some astigmatism" does not.
  assert.ok(cues('lens_options', 'these lenses can also correct astigmatism, to varying degrees').includes('toric'));
  assert.ok(!cues('lens_options', 'the lal is approved for people with some astigmatism, and your surgeon checks if you qualify').includes('toric'));
  assert.ok(cues('lens_options', 'the light adjustable lens, lal, from rxsight').includes('lal'));
  assert.ok(cues('lens_options', 'a light-adjustable lens can be fine-tuned').includes('lal'));
  assert.ok(cues('lens_options', 'the ic8 apthera is used in one eye').includes('ic8'));

  // Monofocal dots: a multi-range overview must not land on the last named range;
  // "so far" and "far fewer" must not light Far.
  const cOpen = V.visualForTrack(L, 'C');
  assert.equal(cOpen.category, 'monofocal');
  const intro = run(cOpen, "a basic lens is set for one distance, usually far. for the other distances, like arm's length and reading, you'll need glasses.");
  assert.equal(intro.monoRange, null);
  assert.equal(run(cOpen, 'does that make sense so far?').monoRange, null);
  assert.equal(run(cOpen, 'far fewer people were bothered very much').monoRange, null);
  assert.equal(run(cOpen, 'set for one distance, usually far').monoRange, 'far');
});

test('C-loop IOL haptics have opposite-shoulder attachment and matching rotational curvature', () => {
  for (const file of ['foundations-cataract.svg', 'lal.svg', 'ic8.svg']) {
    const svg = readFileSync(join(root, 'images/session', file), 'utf8');
    const paths = [...svg.matchAll(/d="M(-?[\d.]+),(-?[\d.]+) C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)"/g)];
    assert.ok(paths.length >= 2, file);
    const [a, b] = paths.slice(0, 2).map(m => m.slice(1).map(Number));
    for (let i = 0; i < 8; i++) assert.ok(Math.abs(a[i] + b[i]) < 0.2, `${file} idx ${i}: ${a[i]} vs ${b[i]}`);
    assert.ok(a[0] > 0 && a[1] < 0, `${file}: superior haptic must exit on the right and sit above the optic`);
  }
});

test('session-visuals-v3: lens map shows the painted cut-outs (no drawn optics) with code-drawn toric rim dots', () => {
  const lm = src.slice(src.indexOf('<div id="lens-map"'), src.indexOf('<div id="goals-map"'));
  assert.doesNotMatch(lm, /class="lz-hap"|class="lz-optic"|class="lz-axis"/);
  const imgs = [...lm.matchAll(/<image class="lz-img" data-href="(images\/session\/v3\/lens-(\w+)\.png)"/g)];
  assert.deepEqual(imgs.map(m => m[2]), ['monofocal', 'edof', 'multifocal', 'monofocal', 'edof', 'multifocal']);
  for (const m of imgs) readFileSync(join(root, m[1]));
  assert.doesNotMatch(lm, /<image[^>]*\shref=/); // hydrated only when the flag is on
  const toric = [...lm.matchAll(/<g class="lz-toric">(.*?)<\/g>/g)];
  assert.equal(toric.length, 6);
  for (const t of toric) {
    assert.equal((t[1].match(/<circle /g) || []).length, 6); // 3 rim dots each side
    assert.doesNotMatch(t[1], /<path|<line/); // no line across the optic
  }
  assert.match(block, /#goals-map image\[data-href\], #lens-map image\[data-href\]/);
});

test('session-visuals-v3: painted slides, overlays drawn in code, astigmatism shows two focal points', () => {
  const S = V.VISUALS_MANIFEST.slides;
  for (const k of ['welcome', 'focal_points', 'astigmatism', 'lal', 'ic8', 'readiness', 'summary']) {
    assert.match(S[k].src, /^images\/session\/v3\/[\w-]+\.jpg$/, k);
  }
  assert.match(S.cataract.src, /lens-guide-eye-macula\.jpg$/); // anchor painting stays
  for (const z of ['near', 'arms', 'far']) assert.match(src, new RegExp(`data-href="images/session/v3/goals-${z}\\.jpg"`));
  assert.equal(JSON.stringify(S.focal_points.overlay.filter(o => o.t === 'text').map(o => o.s)), JSON.stringify(['Near', 'Arm\u2019s length', 'Far']));
  const notes = S.readiness.overlay.filter(o => o.t === 'text').map(o => o.s);
  assert.equal(notes.length, 3);
  assert.match(notes.join(' '), /3 questions/);
  assert.match(notes.join(' '), /recovery/);
  assert.match(notes.join(' '), /100% decided/);
  const foci = S.astigmatism.overlay.filter(o => o.t === 'circle').map(o => o.cx);
  const retinaX = 532;
  assert.equal(foci.length, 2);
  assert.ok(foci.some(x => x < retinaX) && foci.some(x => x > retinaX), String(foci));
  assert.match(block, /function ciqDrawSlideSvg\(svg, meta\)/);
  assert.doesNotMatch(block, /innerHTML/);
  assert.match(src, /<svg id="visual-svg" viewBox="0 0 720 480" role="img" aria-label="" hidden>/);
  assert.doesNotMatch(src, /<image id="visual-svg-img"[^>]*\shref=/);
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

test('feature flag: OFF by default, ?v=s2 persists in sessionStorage, ?v=off clears it', () => {
  const def = loadVisuals('');
  assert.equal(def.ctx.VISUALS_ENABLED, false);
  assert.equal(def.ctx.STAGE_CHANGE_NEXT_ONLY, false);
  assert.equal(def.storage.getItem('ciq_visuals'), null);

  // Non-obvious flag only: unrelated ?v= values keep visuals off.
  for (const s of ['?v=1', '?v=true', '?v=on', '?v=visuals', '?visuals=1']) {
    const other = loadVisuals(s);
    assert.equal(other.ctx.VISUALS_ENABLED, false, s);
  }

  // ?v=s2 turns visuals on and persists across gate/checkout reloads in the same tab.
  const on = loadVisuals('?v=s2');
  assert.equal(on.ctx.VISUALS_ENABLED, true);
  assert.equal(on.ctx.STAGE_CHANGE_NEXT_ONLY, true);
  assert.equal(on.storage.getItem('ciq_visuals'), 's2');

  const persisted = loadVisuals('?checkout_session_id=cs_test_123', { ciq_visuals: 's2' });
  assert.equal(persisted.ctx.VISUALS_ENABLED, true);
  assert.equal(persisted.ctx.STAGE_CHANGE_NEXT_ONLY, true);

  // ?v=off turns visuals off and removes the persisted flag.
  const off = loadVisuals('?v=off', { ciq_visuals: 's2' });
  assert.equal(off.ctx.VISUALS_ENABLED, false);
  assert.equal(off.ctx.STAGE_CHANGE_NEXT_ONLY, false);
  assert.equal(off.storage.getItem('ciq_visuals'), null);
});

test('when visuals flag is OFF: no eager images, no ciq-visuals class, and no visuals JS runs', () => {
  assert.match(src, /<div id="app" role="main">/);
  assert.doesNotMatch(src, /<div id="app"[^>]*ciq-visuals/);
  assert.match(src, /<div id="visual-panel" hidden>/);
  assert.match(src, /<img id="visual-img" alt="" width="720" height="480" decoding="async" hidden>/);
  assert.doesNotMatch(src, /<img id=\"visual-img\"[^>]*\ssrc=/);
  assert.doesNotMatch(src, /<image\s+href="images\/session\//);
  assert.match(block, /function initVisuals\(\) \{\s*if \(!VISUALS_ENABLED\) return;/);

  const off = loadVisuals('');
  off.ctx.convoState = { current_stage: 'foundations', current_track: 'C' };
  assert.equal(off.ctx.ciqVisualSync(), undefined);
  assert.equal(off.ctx.ciqVisualOnAgentLine('astigmatism'), undefined);
  assert.equal(off.ctx.ciqVisualOnTrack(), undefined);
  assert.equal(off.ctx.ciqVisualFromTool('focal_points'), 'ignored');
});

test('stage changes ONLY by Next when visuals are ON; agent stage-opening sentence triggers follow the flag', () => {
  assert.equal(V.STAGE_CHANGE_NEXT_ONLY, true);
  assert.match(src, /if \(!STAGE_CHANGE_NEXT_ONLY\) \{\s*for \(const entry of ANCHOR_PHRASES\)/);
  assert.match(src, /if \(!STAGE_CHANGE_NEXT_ONLY && STAGE_ORDER\.indexOf\(convoState\.current_stage\)/);
  assert.match(src, /if \(VISUALS_ENABLED\) ciqVisualSync\(\); \/\/ session-visuals-v2\n\}/);
  assert.match(src, /if \(VISUALS_ENABLED\) ciqVisualOnAgentLine\(lower\);/);
  assert.equal((src.match(/if \(VISUALS_ENABLED\) ciqVisualOnTrack\(\);/g) || []).length, 2);
});

test('words panel always starts hidden; nothing remembered', () => {
  assert.match(src, /<button id="words-toggle" type="button" aria-controls="transcript-wrap" aria-expanded="false" hidden>/);
  assert.match(block, /app\.classList\.add\('ciq-visuals'\)/);
  assert.match(block, /ciqSetWords\(false\);/);
  assert.doesNotMatch(src, /ciq_words_open/);
  assert.doesNotMatch(block, /localStorage/);
});

test('visual copy follows the wording rules and monofocal omits halo/glare claim', () => {
  assert.doesNotMatch(V.VISUALS_MANIFEST.categories.monofocal.caption, /halo|glare/i);
  const svgs = Object.values(V.VISUALS_MANIFEST.slides)
    .filter(s => s.src && /\.(svg|html|txt)$/i.test(s.src))
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
