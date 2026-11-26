// Direct (direct-drop-surgeon-settings): the consumer app never passes
// surgeon settings to the agent. Summary may show a Past refractive
// surgery line (allow-listed values only) and monovision_history; neither
// is a new stored field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');

function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('could not extract ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractFn('normalizePastRefractiveSurgery'), sandbox);
const norm = sandbox.normalizePastRefractiveSurgery;

test('practice_profile is the constant NONE; Worker value is never read', () => {
  assert.match(src, /const practiceProfile = 'NONE';/);
  assert.equal(src.includes('voiceData.practice_profile'), false);
});

test('surgeon-made code refused with a friendly message at gate and at start', () => {
  assert.match(src, /result\.reason === 'practice_code'/);
  assert.match(src, /data\.error === 'practice_code'/);
});

test('summary: monovision_history unchanged; Past refractive surgery line is on-screen only', () => {
  assert.match(src, /"monovision_history"/);
  assert.match(src, /summary\.monovision_history/);
  assert.match(src, /past_refractive_surgery/);
  assert.match(src, /Past refractive surgery/);
  assert.match(src, /normalizePastRefractiveSurgery/);
  assert.equal(src.includes('NO HEALTH HISTORY RULE'), false);
  // Email capture still only posts the summary; the in-app comment says
  // the Worker does not persist it.
  assert.match(src, /the Worker never/);
  assert.match(src, /persists it \(worker\.js handleEmailCapture/);
});

test('normalizePastRefractiveSurgery allow-list only', () => {
  assert.equal(norm('LASIK'), 'LASIK');
  assert.equal(norm('PRK'), 'PRK');
  assert.equal(norm('RK'), 'RK');
  assert.equal(norm('lasik and prk'), 'LASIK and PRK');
  assert.equal(norm('LASIK, PRK and RK'), 'LASIK, PRK and RK');
  assert.equal(norm('none'), 'none');
  assert.equal(norm('not shared'), 'not shared');
  assert.equal(norm('I had LASIK in 2012 on my right eye and still use drops'), 'LASIK');
  assert.equal(norm('macular degeneration'), 'not shared');
  assert.equal(norm(''), 'not shared');
  assert.equal(norm(undefined), 'not shared');
});
