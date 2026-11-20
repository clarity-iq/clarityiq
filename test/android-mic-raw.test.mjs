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
  const rawC = extractFn('ciqMicRawConstraints');
  const framePeak = extractFn('ciqFramePeak');
  const bucket = extractFn('ciqPeakBucket');
  const discInfo = extractFn('ciqDisconnectInfo');

  test('mic mode: URL flag wins, then saved flag, else default', () => {
    assert.equal(modeFrom('', null), 'default');
    assert.equal(modeFrom('?code=abc', '0'), 'default');
    assert.equal(modeFrom('', '1'), 'raw_saved');
    assert.equal(modeFrom('?mic=raw', null), 'raw_url');
    assert.equal(modeFrom('?a=1&mic=RAW&b=2', null), 'raw_url');
    assert.equal(modeFrom('?mic=default', '1'), 'default_url');
    assert.equal(modeFrom('?mic=rawx', null), 'default');
    assert.equal(modeFrom('?nomic=raw', null), 'default');
  });

  test('raw constraints turn processing off and keep the rest', () => {
    assert.deepEqual(rawC(true), { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false });
    const sdk = { voiceIsolation: true, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, deviceId: { exact: 'x' } };
    const out = rawC(sdk);
    assert.deepEqual(out, { voiceIsolation: false, sampleRate: { ideal: 16000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, deviceId: { exact: 'x' } });
    assert.equal(sdk.echoCancellation, true, 'input not mutated');
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

  test('mic check action: raw swap only when the input context went to sleep and would not wake', () => {
    const act = extractFn('ciqMicCheckAction');
    assert.equal(act('suspended', false), 'swap');
    assert.equal(act('suspended', true), 'tap');
    assert.equal(act('not_running', false), 'tap');
    assert.equal(act('silent_running', false), 'log');
    assert.equal(act('ok', false), 'none');
    assert.equal(act('muted', false), 'log');
    assert.equal(act('track_ended', false), 'log');
  });

  test('wiring: held mic opened in the tap before any await; released on end/drop/failed start; telemetry carries audio_diag', () => {
    assert.match(html, /audio_diag: ciqAudioDiagSnapshot\(\)/);
    assert.match(html, /if \(ciqMicRawActive\) ciqInstallRawMicWrapper\(\);/);
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
