// Local only: parse index.html and exercise emailCaptureOutcome.
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
      if (depth === 0) {
        return new Function(html.slice(start, i + 1) + '\nreturn ' + name + ';')();
      }
    }
  }
  throw new Error('unclosed ' + name);
}

describe('email send note', () => {
  const emailCaptureOutcome = extractFn('emailCaptureOutcome');
  const fail = "We couldn't email it, so use Save summary or Print.";

  test('res.ok and sent:true shows the sent line; markup is present', () => {
    assert.match(html, /id="email-send-note"/);
    assert.match(html, /captureOk = res\.ok/);
    assert.match(html, /showEmailSendNote\(captureOk, payload\)/);
    assert.deepEqual(emailCaptureOutcome(true, { sent: true }), {
      sent: true,
      text: 'Summary sent to your email.',
    });
  });

  test('failed send or a bad response shows the save/print line', () => {
    assert.deepEqual(emailCaptureOutcome(true, { sent: false }), { sent: false, text: fail });
    assert.deepEqual(emailCaptureOutcome(false, { sent: true }), { sent: false, text: fail });
    assert.deepEqual(emailCaptureOutcome(true, {}), { sent: false, text: fail });
    assert.deepEqual(emailCaptureOutcome(true, null), { sent: false, text: fail });
  });
});
