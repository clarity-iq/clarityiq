// hard-mute-v1: instant mute on interruption, opt-in only (?mute=hard), default OFF.
// Local file reads only. No network, no Worker, no voice sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(process.env.APP_INDEX || join(root, 'index.html'), 'utf8');
const block = src.slice(src.indexOf('// ── hard-mute-v1 BEGIN'), src.indexOf('// ── hard-mute-v1 END'));
function load(search = '', seed = {}) {
  const m = new Map(Object.entries(seed));
  const storage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const ctx = vm.createContext({ URLSearchParams, location: { search }, sessionStorage: storage });
  vm.runInContext(block + ';Object.assign(globalThis,{HARD_MUTE_ENABLED,ciqResolveHardMuteFlag,ciqHardMuteOnInterrupt,ciqHardMuteOnAudio});', ctx);
  return { ctx, storage };
}
const fakeConv = () => { const c = { vols: [], setVolume(o) { c.vols.push(o.volume); } }; return c; };

test('hard mute is OFF by default and for unrelated URLs', () => {
  assert.equal(load('').ctx.HARD_MUTE_ENABLED, false);
  for (const s of ['?v=s2', '?mute=soft', '?mute=1', '?mute=true', '?checkout_session_id=cs_1']) assert.equal(load(s).ctx.HARD_MUTE_ENABLED, false, s);
  assert.equal(load('').storage.getItem('ciq_mute'), null);
});

test('?mute=hard turns it on and persists in sessionStorage; ?mute=off clears it', () => {
  const on = load('?mute=hard');
  assert.equal(on.ctx.HARD_MUTE_ENABLED, true);
  assert.equal(on.storage.getItem('ciq_mute'), 'hard');
  assert.equal(load('?checkout_session_id=cs_1', { ciq_mute: 'hard' }).ctx.HARD_MUTE_ENABLED, true);
  const off = load('?mute=off', { ciq_mute: 'hard' });
  assert.equal(off.ctx.HARD_MUTE_ENABLED, false);
  assert.equal(off.storage.getItem('ciq_mute'), null);
});

test('when OFF the interrupt and audio hooks do nothing at all', () => {
  const { ctx } = load('');
  const c = fakeConv();
  ctx.ciqHardMuteOnInterrupt(c); ctx.ciqHardMuteOnAudio(c, false);
  assert.deepEqual(c.vols, []);
});

test('when ON: volume 0 at the interruption, restored on the next agent audio, never twice', () => {
  const { ctx } = load('?mute=hard');
  const c = fakeConv();
  ctx.ciqHardMuteOnAudio(c, false); // audio with no interruption before it: no change
  assert.deepEqual(c.vols, []);
  ctx.ciqHardMuteOnInterrupt(c);
  assert.deepEqual(c.vols, [0]);
  ctx.ciqHardMuteOnAudio(c, false);
  ctx.ciqHardMuteOnAudio(c, false);
  assert.deepEqual(c.vols, [0, 1]);
  ctx.ciqHardMuteOnInterrupt(c); ctx.ciqHardMuteOnAudio(c, true); // Speaker button off stays off
  assert.deepEqual(c.vols, [0, 1, 0, 0]);
  ctx.ciqHardMuteOnInterrupt(null); // no conversation: no throw
});

test('app wiring: callbacks are passed only when the flag is on; Speaker button clears a pending cut; no other audio code added', () => {
  assert.match(src, /\.\.\.\(HARD_MUTE_ENABLED \? \{\s*onInterruption: \(\) => ciqHardMuteOnInterrupt\(conversation\),\s*onAudio: \(\) => ciqHardMuteOnAudio\(conversation, isSpeakerMuted\),\s*\} : \{\}\),/);
  assert.match(src, /isSpeakerMuted = !isSpeakerMuted;\s*hardMuteCut = false;/);
  assert.equal((src.match(/onInterruption/g) || []).length, 1); // only inside the flag-gated options
  assert.doesNotMatch(src, /AudioContext\(|createGain|exponentialRamp|linearRamp/);
  assert.doesNotMatch(block, /localStorage|fetch\(|XMLHttpRequest/);
});
