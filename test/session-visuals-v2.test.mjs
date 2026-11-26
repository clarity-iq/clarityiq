// session-visuals-v2..v4 (launched ON by default; ?v=off is the kill switch): modular visuals manifest with enabled flags, stage
// changes ONLY by Next, 3 lens categories one at a time, STATIC range dots (v4:
// no speech-driven dots in Lens options or Goals), toric add-on only on the word
// "toric" or a Track B call and never over the IC-8 or LAL slide, nuance slides,
// and words always hidden.
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
    pure + ';Object.assign(globalThis,{CIQ_VISUALS_KEY,CIQ_VISUALS_ON_VALUE,VISUALS_ENABLED,STAGE_CHANGE_NEXT_ONLY,ciqResolveVisualsFlag,VISUALS_MANIFEST,LENS_CATEGORIES,visualApplyProfile,visualStageMain,visualCuePlan,visualApplyCue,visualForStage,visualForTrack,visualFromTool,visualFrameOf,ciqVisualSync,ciqVisualOnAgentLine,ciqVisualOnTrack,ciqVisualFromTool});',
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

test('a new stage always starts on its main image (Next clears any slide)', () => {
  const popped = run(V.visualForStage('foundations'), 'it is called astigmatism');
  assert.equal(V.visualFrameOf(popped), 'astigmatism');
  const next = V.visualForStage('vision_goals');
  assert.equal(V.visualFrameOf(next), 'daily_life');
  assert.equal(next.slide, null);
  assert.equal(next.category, null);
  assert.deepEqual(Object.keys(next).sort(), ['category', 'slide', 'stage', 'toolAt']); // v4: no range state
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

test('v4: no speech-driven range dots anywhere; lens cards keep their fixed dots', () => {
  for (const [stage, line] of [
    ['lens_options', "would it matter more to see things up close, like reading; at arm's length, like a computer; or farther out, like driving?"],
    ['lens_options', 'set for distance, like driving'],
    ['vision_goals', 'how about reading books or medication labels?'],
    ['vision_goals', 'what about a computer screen or cooking?'],
    ['vision_goals', 'and night driving?'],
    ['tier_gate', 'computer time'],
  ]) {
    assert.deepEqual(cues(stage, line), [], line);
  }
  const cOpen = V.visualForTrack(L, 'C');
  const after = run(cOpen, 'if set up close for reading, or for distance, like driving');
  assert.equal(after.category, 'monofocal');
  assert.equal('monoRange' in after, false);
  assert.doesNotMatch(block, /monoRange|goalRange|monoRanges|goalRanges|'mono:'|'goal:'/);
  assert.doesNotMatch(block, /\.lz-dot, \.lz-rl/); // render never toggles dots
  // Fixed dots per card: Monofocal none filled (dashed = one of the three), EDOF arm's+far, Multifocal all three.
  for (const cls of ['lens-map-wide', 'lens-map-tall']) {
    const i = src.indexOf(`class="lens-map ${cls}"`);
    const svg = src.slice(i, src.indexOf('</svg>', i));
    const zone = z => { const a = svg.indexOf(`data-zone="${z}"`); const b = svg.indexOf('data-zone=', a + 12); return svg.slice(a, b < 0 ? undefined : b); };
    const on = z => [...zone(z).matchAll(/class="lz-dot on" data-range="(\w+)"/g)].map(m => m[1]);
    assert.deepEqual(on('monofocal'), [], cls);
    assert.deepEqual(on('edof'), ['arms', 'far'], cls);
    assert.deepEqual(on('multifocal'), ['near', 'arms', 'far'], cls);
  }
});

test('v4: goals board is a static image (three scenes, labels, no dots, nothing lights)', () => {
  const gStart = src.indexOf('<div id="goals-map"');
  const gHtml = src.slice(gStart, src.indexOf('</div>', gStart));
  assert.deepEqual([...gHtml.matchAll(/data-zone="(\w+)"/g)].map(m => m[1]), ['near', 'arms', 'far']);
  assert.doesNotMatch(gHtml, /gz-dot|is-on/);
  assert.match(gHtml, />Near</);
  assert.match(gHtml, />Arm's length</);
  assert.match(gHtml, />Far</);
  assert.doesNotMatch(block, /gmap\.classList|gmap\.querySelectorAll/);
  assert.doesNotMatch(src, /#goals-map\.has-focus|#goals-map \.gz\.is-on/);
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
  const b = V.visualForTrack(L, 'B');
  assert.equal(V.visualFrameOf(b), 'toric');
  assert.equal(b.category, null);
  const a = V.visualForTrack({ ...L, category: 'monofocal' }, 'A');
  assert.equal(a.category, null);
  assert.equal(V.visualFrameOf(a), 'lens_map');
  assert.equal(V.visualForTrack(G, 'A').stage, 'vision_goals');
});

test('toric add-on highlights no single category (all 3 equal with axis marks)', () => {
  const edof = { ...L, category: 'edof' };
  const t = run(edof, 'many of these lenses also come in a toric version');
  assert.equal(V.visualFrameOf(t), 'toric');
  assert.equal(t.category, null);
  const b = run(V.visualForTrack(L, 'B'), 'the same single-focal-point design as the basic lens, built to correct astigmatism', 'B');
  assert.equal(V.visualFrameOf(b), 'toric');
  assert.equal(b.category, null);
  const back = run(t, 'multifocal lenses', 'A');
  assert.equal(V.visualFrameOf(back), 'lens_map');
  assert.equal(back.category, 'multifocal');
});

test('v4 toric gating: only the word "toric" or a Track B call; never astigmatism phrases', () => {
  for (const line of [
    'these lenses can also correct astigmatism, to varying degrees',
    "this lens doesn't correct astigmatism, which can also blur vision at that distance",
    'it is built to correct astigmatism',
    'correcting astigmatism is something your surgeon plans for',
    'options for astigmatism are on the list',
    'the lal is approved for people with some astigmatism, and your surgeon checks if you qualify',
    'astigmatism as a goal or need',
  ]) {
    assert.ok(!cues('lens_options', line).includes('toric'), line);
    assert.notEqual(V.visualFrameOf(run({ ...L, category: 'edof' }, line)), 'toric', line);
  }
  assert.equal(V.VISUALS_MANIFEST.slides.toric.cuePattern, '\\btoric\\b');
  assert.deepEqual(cues('lens_options', "let's talk about your toric lens options."), ['toric']);
  // A negated mention is not a cue.
  assert.deepEqual(cues('lens_options', "that lens isn't available in a toric version"), []);
  assert.deepEqual(cues('lens_options', 'not a toric lens'), []);
  // Outside Lens options the word does nothing.
  for (const stage of ['foundations', 'vision_goals', 'readiness']) {
    assert.equal(V.visualFrameOf(run(V.visualForStage(stage), 'toric lenses')), V.visualStageMain(stage), stage);
  }
});

test('v4 toric gating: never while the IC-8 or LAL slide is up (word, Track B call, or set_visual)', () => {
  // Live prompt IC-8 line: "the other eye gets a basic or toric lens" must keep the IC-8 slide (the v3 bug).
  const icLine = 'ic-8 apthera, from bausch + lomb: used in one eye only. the other eye gets a basic or toric lens set for distance.';
  assert.deepEqual(cues('lens_options', icLine), ['ic8']);
  const ic8 = run(L, icLine, 'A');
  assert.equal(V.visualFrameOf(ic8), 'ic8');
  for (const s of [ic8, run(L, 'the light adjustable lens, lal, from rxsight')]) {
    const slide = V.visualFrameOf(s);
    assert.ok(['ic8', 'lal'].includes(slide));
    assert.equal(V.visualFrameOf(run(s, 'and toric lenses come in many versions', 'B')), slide, 'word');
    assert.equal(V.visualFrameOf(V.visualApplyCue(s, 'toric', 'B')), slide, 'cue');
    assert.equal(V.visualFrameOf(V.visualForTrack(s, 'B')), slide, 'track B call');
    assert.equal(V.visualFromTool(s, 'toric'), null, 'set_visual refuses toric over IC-8/LAL');
  }
  // A category word still leaves the IC-8/LAL slide, and then "toric" works again.
  const backToMap = run(ic8, 'multifocal lenses', 'A');
  assert.equal(V.visualFrameOf(backToMap), 'lens_map');
  assert.equal(V.visualFrameOf(run(backToMap, 'a toric version', 'A')), 'toric');
  // LAL first, then the toric word later in the same line: stays on LAL.
  assert.deepEqual(cues('lens_options', 'the light adjustable lens, from rxsight, is approved for people with some astigmatism; toric lenses are another way'), ['lal']);
  // Track B call outside IC-8/LAL still opens the toric add-on.
  assert.equal(V.visualFrameOf(V.visualForTrack({ ...L, category: 'edof' }, 'B')), 'toric');
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

  // Goals (v4): no dynamic dots, so the scripted lifestyle questions give no cues.
  assert.deepEqual(cues('vision_goals', 'how much does reading books or medication labels matter?'), []);
  assert.deepEqual(cues('vision_goals', 'does that make sense so far?'), []);

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
  // Toric (v4): the explicit word only; "correct astigmatism" and "some astigmatism" do not.
  assert.ok(!cues('lens_options', 'these lenses can also correct astigmatism, to varying degrees').includes('toric'));
  assert.ok(!cues('lens_options', 'the lal is approved for people with some astigmatism, and your surgeon checks if you qualify').includes('toric'));
  assert.ok(cues('lens_options', 'the light adjustable lens, lal, from rxsight').includes('lal'));
  assert.ok(cues('lens_options', 'a light-adjustable lens can be fine-tuned').includes('lal'));
  assert.ok(cues('lens_options', 'the ic8 apthera is used in one eye').includes('ic8'));

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
  assert.equal(V.visualFromTool(G, 'arms'), null); // v4: no range dots to light
  assert.equal(V.visualFromTool({ ...L, category: 'monofocal' }, 'near'), null);
  const t = V.visualFromTool(L, 'toric');
  assert.equal(V.visualFrameOf(t), 'toric');
  assert.equal(t.category, null);
  assert.equal(V.visualFromTool(V.visualForStage('readiness'), 'toric'), null);
  assert.match(src, /set_visual: async \(\{ visual \}\) => ciqVisualFromTool\(visual\)/);
  assert.doesNotMatch(src, /set_stage/);
});

test('feature flag: ON by default; ?v=off is the kill switch (persisted per tab); ?v=s2 is harmless', () => {
  const def = loadVisuals('');
  assert.equal(def.ctx.VISUALS_ENABLED, true);
  assert.equal(def.ctx.STAGE_CHANGE_NEXT_ONLY, true); // Next-only behaviour is unchanged from the visuals build
  assert.equal(def.storage.getItem('ciq_visuals'), null); // default writes nothing

  // Unrelated ?v= values and unrelated URLs leave the default (ON) alone.
  for (const s of ['?v=1', '?v=true', '?v=on', '?v=visuals', '?visuals=1', '?checkout_session_id=cs_test_123']) {
    assert.equal(loadVisuals(s).ctx.VISUALS_ENABLED, true, s);
  }

  // ?v=s2 stays harmless: on, and it clears an earlier off in the same tab.
  const on = loadVisuals('?v=s2');
  assert.equal(on.ctx.VISUALS_ENABLED, true);
  assert.equal(on.ctx.STAGE_CHANGE_NEXT_ONLY, true);
  assert.equal(on.storage.getItem('ciq_visuals'), 's2');
  assert.equal(loadVisuals('?v=s2', { ciq_visuals: 'off' }).ctx.VISUALS_ENABLED, true);

  // ?v=off turns visuals off and the kill switch survives gate/checkout reloads in the tab.
  const off = loadVisuals('?v=off');
  assert.equal(off.ctx.VISUALS_ENABLED, false);
  assert.equal(off.ctx.STAGE_CHANGE_NEXT_ONLY, false);
  assert.equal(off.storage.getItem('ciq_visuals'), 'off');
  const stays = loadVisuals('?checkout_session_id=cs_test_123', { ciq_visuals: 'off' });
  assert.equal(stays.ctx.VISUALS_ENABLED, false);
  assert.equal(stays.ctx.STAGE_CHANGE_NEXT_ONLY, false);
  // Storage that throws must not break the page.
  assert.equal(typeof loadVisuals('?v=off', {}).ctx.VISUALS_ENABLED, 'boolean');
});

test('when visuals are switched off (?v=off): no eager images, no ciq-visuals class, and no visuals JS runs', () => {
  assert.match(src, /<div id="app" role="main">/);
  assert.doesNotMatch(src, /<div id="app"[^>]*ciq-visuals/);
  assert.match(src, /<div id="visual-panel" hidden>/);
  assert.match(src, /<img id="visual-img" alt="" width="720" height="480" decoding="async" hidden>/);
  assert.doesNotMatch(src, /<img id=\"visual-img\"[^>]*\ssrc=/);
  assert.doesNotMatch(src, /<image\s+href="images\/session\//);
  assert.match(block, /function initVisuals\(\) \{\s*if \(!VISUALS_ENABLED\) return;/);

  const off = loadVisuals('?v=off');
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
