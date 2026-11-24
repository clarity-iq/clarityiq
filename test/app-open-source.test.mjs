// Local only: parse index.html and exercise the Stripe-return app_open deferral
// helpers. No network, no Worker, no voice sessions.
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

describe('app_open waits for /verify-purchase source after Stripe return', () => {
  const ciqHasCheckoutSessionId = extractFn('ciqHasCheckoutSessionId');

  test('defers only when checkout_session_id is in the landing URL', () => {
    assert.equal(ciqHasCheckoutSessionId('?checkout_session_id=cs_test_x'), true);
    assert.equal(ciqHasCheckoutSessionId('?checkout_session_id=cs_live_1&sv=abc'), true);
    assert.equal(ciqHasCheckoutSessionId('?utm_source=internal'), false);
    assert.equal(ciqHasCheckoutSessionId(''), false);
    assert.equal(ciqHasCheckoutSessionId('?foo=bar'), false);
  });

  test('source still adopts /verify-purchase tags and flushes after verify', () => {
    assert.match(html, /function ciqAdoptPurchaseSource\(/);
    assert.match(html, /function ciqFlushPendingAppOpen\(/);
    assert.match(html, /function ciqSendAppOpen\(/);
    assert.match(html, /function ciqAppOpenSource\(/);
    assert.match(html, /window\.__ciqAppOpenPending = true/);
    assert.match(html, /if \(fromQuery\) ciqFlushPendingAppOpen\(\);/);
    // Adoption happens inside applyVerifiedPurchase, which runs in the try
    // before the finally flush, so a tagged purchase is on CIQ_SRC first.
    const adoptAt = html.indexOf('function applyVerifiedPurchase');
    const adoptCall = html.indexOf('ciqAdoptPurchaseSource(result)', adoptAt);
    const flushAt = html.indexOf('if (fromQuery) ciqFlushPendingAppOpen();');
    assert.ok(adoptAt > 0 && adoptCall > adoptAt && flushAt > adoptCall);
  });

  test('app_open body is still event name + path + source only', () => {
    assert.match(html, /name: 'app_open', path: ciqTag\(location\.pathname\) \|\| '\/', src: ciqAppOpenSource\(\)/);
    const send = html.slice(html.indexOf('function ciqSendAppOpen()'), html.indexOf('function ciqFlushPendingAppOpen()'));
    assert.doesNotMatch(send, /access_code|email|survey|transcript|checkout_session_id/);
  });
});
