// mic-ec-optin-v1: opt-in echo-cancel-only mic. Default devices must be untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const indexPath = process.env.APP_INDEX || join(dirname(fileURLToPath(import.meta.url)), '../index.html');
const src = readFileSync(indexPath, 'utf8');
const start = src.indexOf("const CIQ_MIC_EC_KEY");
const end = src.indexOf("\n}\n", src.indexOf("navigator.mediaDevices.getUserMedia = ")) + 3;
const block = src.slice(start, end);

function run(search, stored) {
  const store = new Map(stored ? [['ciq_mic_ec_optin', stored]] : []);
  const calls = [];
  const md = { getUserMedia: async (c) => { calls.push(c); return 'stream'; } };
  const orig = md.getUserMedia;
  const ctx = { location: { search }, navigator: { mediaDevices: md },
    window: { localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) } } };
  vm.runInNewContext(block + '\nthis.__mode = ciqMicMode;', ctx);
  return { mode: ctx.__mode, wrapped: md.getUserMedia !== orig, store, md, calls };
}

test('SDK stays pinned at 1.37.1 and the block sits right after the import', () => {
  assert.match(src, /esm\.sh\/@elevenlabs\/client@1\.37\.1'/);
  assert.ok(start > src.indexOf("@elevenlabs/client@1.37.1") && start > 0);
});
test('default device: no wrapper, nothing saved', () => {
  const r = run('', null);
  assert.equal(r.mode, 'default'); assert.equal(r.wrapped, false); assert.equal(r.store.size, 0);
});
test('stale Nov 20 keys are ignored (new key only)', () => {
  assert.equal(src.includes("getItem('ciq_mic_mode')"), false);
  const r = run('?utm_source=x', null);
  assert.equal(r.wrapped, false);
});
test('?mic=ec saves and wraps with EC on, NS/AGC off', async () => {
  const r = run('?mic=ec', null);
  assert.equal(r.mode, 'ec'); assert.equal(r.wrapped, true); assert.equal(r.store.get('ciq_mic_ec_optin'), '1');
  await r.md.getUserMedia({ audio: { deviceId: 'x', echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  assert.deepEqual({ ...r.calls[0].audio }, { deviceId: 'x', echoCancellation: true, noiseSuppression: false, autoGainControl: false });
  await r.md.getUserMedia({ audio: true });
  assert.deepEqual({ ...r.calls[1].audio }, { echoCancellation: true, noiseSuppression: false, autoGainControl: false });
  await r.md.getUserMedia({ video: true });
  assert.deepEqual({ ...r.calls[2] }, { video: true });
});
test('saved opt-in persists; ?mic=default clears it', () => {
  assert.equal(run('', '1').mode, 'ec');
  const r = run('?mic=default', '1');
  assert.equal(r.mode, 'default'); assert.equal(r.wrapped, false); assert.equal(r.store.size, 0);
});
test('?mic=raw is not a mode any more (no all-off mic)', () => {
  assert.equal(run('?mic=raw', null).mode, 'default');
});
test('only one change vs main: no audio-wake/held-mic code', () => {
  assert.equal(src.includes('ciqRequestEcSwitch'), false);
  assert.equal(src.includes('ciqHeldMic'), false);
});
