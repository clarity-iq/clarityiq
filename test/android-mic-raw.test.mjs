// Local only: parse index.html and exercise the android-mic-raw-v1 helpers.
// No network, no Worker, no voice sessions.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function extractFn(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return new Function(html.slice(start, i + 1) + '\nreturn ' + name + ';')();
    }
  }
  throw new Error('unclosed ' + name);
}

function extractSrc(name) {
  const start = html.indexOf('function ' + name + '(');
  return html.slice(start, html.indexOf('\n}\n', start) + 2);
}

describe('android audio wake / mic helpers', () => {
  const modeFrom = extractFn('ciqMicModeFrom');
  const rawC = extractFn('ciqMicConstraints');
  const framePeak = extractFn('ciqFramePeak');
  const bucket = extractFn('ciqPeakBucket');
  const discInfo = extractFn('ciqDisconnectInfo');

  test('mic mode: URL flag wins, then saved ec, then old raw flag migrates to ec, else default', () => {
    assert.deepEqual(modeFrom('', null, null), { mode: 'default', src: 'default' });
    assert.deepEqual(modeFrom('?code=abc', null, '0'), { mode: 'default', src: 'default' });
    assert.deepEqual(modeFrom('', 'ec', null), { mode: 'ec', src: 'saved' });
    assert.deepEqual(modeFrom('', null, '1'), { mode: 'ec', src: 'migrated' });
    assert.deepEqual(modeFrom('', 'raw', null), { mode: 'default', src: 'default' });
    assert.deepEqual(modeFrom('?mic=ec', null, null), { mode: 'ec', src: 'url' });
    assert.deepEqual(modeFrom('?a=1&mic=RAW&b=2', 'ec', null), { mode: 'raw', src: 'url' });
    assert.deepEqual(modeFrom('?mic=default', 'ec', '1'), { mode: 'default', src: 'url' });
    assert.deepEqual(modeFrom('?mic=ecx', null, null), { mode: 'default', src: 'default' });
    assert.deepEqual(modeFrom('?nomic=ec', null, null), { mode: 'default', src: 'default' });
  });

  test('constraints: default unchanged; ec keeps echo cancellation only; raw all off', () => {
    const sdk = { voiceIsolation: true, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, deviceId: { exact: 'x' } };
    assert.equal(rawC(sdk, 'default'), sdk);
    assert.equal(rawC(true, 'default'), true);
    assert.deepEqual(rawC(true, 'ec'), { echoCancellation: true, noiseSuppression: false, autoGainControl: false, voiceIsolation: false });
    assert.deepEqual(rawC(sdk, 'ec'), { voiceIsolation: false, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, deviceId: { exact: 'x' } });
    assert.deepEqual(rawC(true, 'raw'), { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false });
    assert.equal(sdk.noiseSuppression, true, 'input not mutated');
  });

  test('frame peak and dB buckets', () => {
    assert.equal(framePeak(new Float32Array(16)), 0);
    assert.equal(framePeak(Float32Array.from([0.1, -0.5, 0.2])), 0.5);
    assert.equal(bucket(0), 'zero');
    assert.equal(bucket(0.00005), 'lt-80db');
    assert.equal(bucket(0.0005), 'lt-60db');
    assert.equal(bucket(0.005), 'lt-40db');
    assert.equal(bucket(0.5), 'ge-40db');
    assert.equal(bucket(null), null);
  });

  test('disconnect info keeps reason + close code only, never message text', () => {
    assert.deepEqual(discInfo({ reason: 'error', message: 'secret words', context: { type: 'close', code: 1006, reason: 'x' } }), { reason: 'error', code: 1006 });
    assert.deepEqual(discInfo({ reason: 'agent', closeCode: 1000 }), { reason: 'agent', code: 1000 });
    assert.deepEqual(discInfo({ reason: 'user' }), { reason: 'user', code: null });
    assert.deepEqual(discInfo({ reason: 'weird' }), { reason: 'other', code: null });
    assert.deepEqual(discInfo(undefined), { reason: 'other', code: null });
  });

  test('mic check action: ec switch only when the input context went to sleep and would not wake', () => {
    const act = extractFn('ciqMicCheckAction');
    assert.equal(act('suspended', 'default'), 'swap');
    assert.equal(act('suspended', 'ec'), 'tap');
    assert.equal(act('suspended', 'raw'), 'tap');
    assert.equal(act('not_running', 'default'), 'tap');
    assert.equal(act('silent_running', 'default'), 'log');
    assert.equal(act('ok', 'default'), 'none');
    assert.equal(act('muted', 'default'), 'log');
  });

  test('wiring: held mic opened in the tap before any await; released on end/drop/failed start; telemetry carries audio_diag', () => {
    assert.match(html, /audio_diag: ciqAudioDiagSnapshot\(\)/);
    assert.match(html, /if \(ciqMicMode !== 'default'\) ciqInstallMicWrapper\(\);/);
    assert.match(html, /st\.removeItem\(CIQ_MIC_RAW_KEY\);/);
    const start = html.slice(html.indexOf('async function startConversation(opts) {'), html.indexOf('async function startConversationInner('));
    assert.ok(start.indexOf('ciqHoldMicStart();') > 0 && start.indexOf('ciqHoldMicStart();') < start.indexOf('await'), 'held mic requested before the first await');
    assert.match(start, /finally \{\n    if \(!ciqSessionStarted\) ciqEndAudioSession\(\);/);
    assert.match(html, /await ciqHeldMicPromise;\n\n    conversation = await Conversation\.startSession\(/);
    assert.doesNotMatch(html, /permStream/);
    const endFn = extractSrc('endConversation');
    assert.match(endFn, /ciqEndAudioSession\(\)/);
    assert.match(html, /ciqEndAudioSession\(\);\n        callConnected = false;/);
    assert.match(html, /window\.AudioContext = CiqAudioContext;/);
  });
});
