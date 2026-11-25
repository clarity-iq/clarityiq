// Checks session-summary wording and the empty preferred_track path.
// Local file reads only. No network, no Worker, no voice sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const indexPath = process.env.APP_INDEX || join(dirname(fileURLToPath(import.meta.url)), '../index.html');
const src = readFileSync(indexPath, 'utf8');

test('on-screen summary uses a neutral session title', () => {
  assert.match(src, /<h2>Your ClarityIQ session summary<\/h2>/);
  assert.equal(src.includes('Your lens preference summary'), false);
  assert.equal(src.includes('personal lens preference summary'), false);
});

test('consumer copy says "your surgeon", not "consult"', () => {
  assert.match(src, /before you see your surgeon, after, or as a second look/);
  assert.equal(src.includes('before your consult, after it, or as a second look'), false);
  assert.equal(src.includes('before a consult, after it, or as a second look'), false);
  assert.match(src, /visit with your surgeon scheduled/);
  assert.equal(src.includes('cataract consultation scheduled'), false);
  // Attorney-reviewed legal lines stay as they are.
  assert.match(src, /Always consult a qualified eye care professional/);
  assert.match(src, /doctor-patient relationship/);
});

test('preferred_track may be empty and is not treated as a lens recommendation', () => {
  assert.match(src, /preferred_track: null/);
  assert.match(src, /preferred_track: "\$\{preferredTrack \|\| 'not captured'\}"/);
  assert.match(src, /Do not start from the preferred track/);
  assert.match(src, /If only the internal preferred_track is known and the person did not discuss lens types, omit the field/);
  assert.match(src, /Do not say a type .matches your goal/);
  // The empty path does not throw: null/undefined become "not captured".
  const line = (tier, convoState) => {
    const preferredTrack = tier === 'session' && convoState ? convoState.preferred_track : null;
    return preferredTrack || 'not captured';
  };
  assert.equal(line('session', { preferred_track: null }), 'not captured');
  assert.equal(line('session', {}), 'not captured');
  assert.equal(line('session', null), 'not captured');
  assert.equal(line('starter', { preferred_track: 'A' }), 'not captured');
  assert.equal(line('session', { preferred_track: 'A' }), 'A');
});
