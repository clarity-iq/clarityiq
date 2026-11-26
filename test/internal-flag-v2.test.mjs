// Local only, no network: runs the real internal-flag code from the app
// (extracted from index.html) against a fake browser (cookie jar +
// localStorage) and checks the v2 rules:
//  - ?ciq_internal=1 sets the cookie (1 year, Path=/, SameSite=Lax, Secure,
//    Domain=.clarityiq.ai on our hosts) AND the localStorage key
//  - ?ciq_internal=0 clears both
//  - either one alone counts, and the two heal each other
//  - when set, CIQ_SRC reports utm_source=internal / utm_medium=flag
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function extract(html) {
  const a = html.indexOf("const CIQ_SRC_KEY = 'ciq_src';");
  const b = html.indexOf('// Funnel tracking v2 (2026-11-17)', a);
  assert.ok(a > 0 && b > a, 'flag code found');
  const appOpen = html.slice(html.indexOf('function ciqAppOpenSource()'), html.indexOf('function ciqSendAppOpen()'));
  return html.slice(a, b) + '\n' + appOpen + '\n;({ CIQ_INTERNAL, CIQ_SRC, CIQ_SRC_STATE, ciqSessionSource, ciqAdoptPurchaseSource, ciqAppOpenSource });';
}

// Minimal cookie jar honouring Max-Age=0 deletes and Domain/host-only keys.
function makeEnv({ url, store = {}, cookies = [], storageBroken = false }) {
  const u = new URL(url);
  const jar = new Map(); // key: name|domain-or-host -> {value, attrs}
  const writes = [];
  for (const c of cookies) jar.set(c.split('=')[0] + '|' + u.hostname, { value: c.split('=')[1], attrs: '' });
  const doc = {
    referrer: '',
    get cookie() { return [...jar.entries()].map(([k, v]) => k.split('|')[0] + '=' + v.value).join('; '); },
    set cookie(s) {
      writes.push(s);
      const parts = s.split(';').map(x => x.trim());
      const [name, value] = [parts[0].split('=')[0], parts[0].split('=').slice(1).join('=')];
      const attrs = Object.fromEntries(parts.slice(1).map(p => { const [k, ...v] = p.split('='); return [k.toLowerCase(), v.join('=') || true]; }));
      const dom = attrs.domain ? String(attrs.domain).replace(/^\./, '') : u.hostname;
      if (attrs.secure && u.protocol !== 'https:') return; // browsers drop these
      const key = name + '|' + dom;
      if (attrs['max-age'] === '0') jar.delete(key); else jar.set(key, { value, attrs });
    },
  };
  const data = new Map(Object.entries(store));
  const ls = { setItem: (k, v) => { if (storageBroken) throw new Error('blocked'); data.set(k, String(v)); },
    getItem: k => { if (storageBroken) throw new Error('blocked'); return data.has(k) ? data.get(k) : null; },
    removeItem: k => { if (storageBroken) throw new Error('blocked'); data.delete(k); } };
  const win = { localStorage: ls, sessionStorage: ls };
  const ctx = vm.createContext({ window: win, document: doc, location: { search: u.search, pathname: u.pathname, hostname: u.hostname, protocol: u.protocol },
    URLSearchParams, URL, Date, JSON, Object, String, RegExp, Error });
  return { ctx, jar, data, writes };
}
function run(html, opts) {
  const env = makeEnv(opts);
  const out = vm.runInContext(extract(html), env.ctx);
  return { ...env, ...out, internal: out.CIQ_INTERNAL, src: out.CIQ_SRC };
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const APP = 'https://app.clarityiq.ai/';

describe('internal flag v2 in the app', () => {
  test('?ciq_internal=1 sets cookie + localStorage and tags internal', () => {
    const r = run(html, { url: APP + '?ciq_internal=1' });
    assert.equal(r.internal, true);
    assert.equal(r.data.get('ciq_internal'), '1');
    assert.ok(r.jar.has('ciq_internal|clarityiq.ai'));
    const w = r.writes.find(s => s.startsWith('ciq_internal=1'));
    for (const part of ['Max-Age=31536000', 'Path=/', 'SameSite=Lax', 'Secure', 'Domain=.clarityiq.ai']) assert.ok(w.includes(part), part);
    assert.equal(r.src.utm_source, 'internal');
    assert.equal(r.src.utm_medium, 'flag');
  });
  test('?ciq_internal=0 clears storage, turns the cookie off (0, 30 days) and untags', () => {
    const r = run(html, { url: APP + '?ciq_internal=0', store: { ciq_internal: '1' }, cookies: ['ciq_internal=1'] });
    assert.equal(r.internal, false);
    assert.equal(r.data.has('ciq_internal'), false);
    assert.equal(r.jar.get('ciq_internal|clarityiq.ai').value, '0');
    assert.notEqual(r.src.utm_source, 'internal');
  });
  test('off marker set on the site clears the app storage and stays off (no resurrection)', () => {
    const r = run(html, { url: APP, store: { ciq_internal: '1' }, cookies: ['ciq_internal=0'] });
    assert.equal(r.internal, false);
    assert.equal(r.data.has('ciq_internal'), false);
    assert.equal(r.writes.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(r.ciqSessionSource())), {});
  });
  test('cookie set on the site flags the app with no URL tag (carry-over)', () => {
    const r = run(html, { url: APP, cookies: ['ciq_internal=1'] });
    assert.equal(r.internal, true);
    assert.equal(r.data.get('ciq_internal'), '1');
    assert.equal(r.src.utm_source, 'internal');
  });
  test('old-link device (storage only) gains the cookie', () => {
    const r = run(html, { url: APP, store: { ciq_internal: '1' } });
    assert.equal(r.internal, true);
    assert.ok(r.jar.has('ciq_internal|clarityiq.ai'));
  });
  test('no flag stays untagged: no cookie written, session source empty, app_open untagged', () => {
    const r = run(html, { url: APP });
    assert.equal(r.internal, false);
    assert.equal(r.writes.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(r.ciqSessionSource())), {});
    assert.equal(r.ciqAppOpenSource().utm_source, 'untagged');
  });
  test('session telemetry carries internal when the flag is set, even with no URL tag', () => {
    const r = run(html, { url: APP, cookies: ['ciq_internal=1'] });
    const s = JSON.parse(JSON.stringify(r.ciqSessionSource()));
    assert.equal(s.utm_source, 'internal');
    assert.equal(s.utm_medium, 'flag');
    assert.equal(r.ciqAppOpenSource().utm_source, 'internal');
  });
  test('a Stripe return cannot un-tag an internal device', () => {
    const r = run(html, { url: APP + '?checkout_session_id=cs_test_1', cookies: ['ciq_internal=1'] });
    r.ciqAdoptPurchaseSource({ utm_source: 'direct', utm_medium: 'none' });
    assert.equal(r.src.utm_source, 'internal');
    assert.equal(JSON.parse(JSON.stringify(r.ciqSessionSource())).utm_source, 'internal');
  });
  test('a Stripe return still adopts the purchase source on a normal device', () => {
    const r = run(html, { url: APP + '?checkout_session_id=cs_test_1' });
    r.ciqAdoptPurchaseSource({ utm_source: 'linkedin', utm_medium: 'post' });
    assert.equal(r.src.utm_source, 'linkedin');
  });
  test('blocked localStorage: the cookie still flags the device', () => {
    const r = run(html, { url: APP + '?ciq_internal=1', storageBroken: true });
    assert.equal(r.internal, true);
    assert.equal(r.src.utm_source, 'internal');
  });
});
