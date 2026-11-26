// Direct (direct-drop-surgeon-settings): the consumer app never passes
// surgeon settings to the agent and never extracts or shows health history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');

test('practice_profile is the constant NONE; Worker value is never read', () => {
  assert.match(src, /const practiceProfile = 'NONE';/);
  assert.equal(src.includes('voiceData.practice_profile'), false);
});

test('surgeon-made code refused with a friendly message at gate and at start', () => {
  assert.match(src, /result\.reason === 'practice_code'/);
  assert.match(src, /data\.error === 'practice_code'/);
});

test('summary: no monovision_history field, NO HEALTH HISTORY rule present', () => {
  assert.equal(/"monovision_history"/.test(src), false);
  assert.equal(/summary\.monovision_history/.test(src), false);
  assert.match(src, /NO HEALTH HISTORY RULE/);
  assert.match(src, /LASIK, PRK, RK/);
});
