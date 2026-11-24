// Checks the proposed app wording in a patched index.html (scratch copy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const indexPath = process.env.APP_INDEX || join(dirname(fileURLToPath(import.meta.url)), '../index.html');
const src = readFileSync(indexPath, 'utf8');

test('email-gate uses session-summary wording, not lens-preference', () => {
  assert.match(src, /Enter your email to view and save your ClarityIQ session summary\./);
  assert.equal(src.includes('personal lens preference summary'), false);
});

test('on-screen and prompt wording do not treat a lens type as a match or a fallback topic', () => {
  assert.match(src, /Lens types you asked about/);
  assert.equal(src.includes('Lens category interest'), false);
  assert.equal(src.includes('Cataracts and lens options — the basics'), false);
  assert.equal(src.includes('which lens best fits'), false);
  assert.match(src, /omit topics_by_group entirely/);
  assert.match(src, /Do not say a type .matches your goal/);
  assert.match(src, /Do not start from the preferred track/);
});
