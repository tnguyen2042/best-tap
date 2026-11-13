// Run with: npx tsx tests/engine.test.mjs   (or any runner that can import ES modules)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, MERCHANTS, evaluate, rankWallet, newInstance, setSpent, highlights, quarterKey, activationUpside } from '../src/engine.js';
import { classify, parseElements, formatDistance } from '../src/places.js';
import { mapPlace, nearbyBody, textBody, loadPlaces, CHIPS } from '../src/google.js';
import { emojiFor, CAT_EMOJI } from '../src/emoji.js';
import { mapsUrl, osmAddress } from '../src/maps.js';
import { activeDeals, dealWhen } from '../src/deals.js';

const catalog = JSON.parse(readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(catalog.cards.map((c) => [c.id, c]));
const NOW = new Date('2026-11-10T12:00:00');
let passed = 0;
const pending = [];
const test = (name, fn) => {
  const r = fn();
  const done = () => { passed++; console.log('ok  ' + name); };
  if (r && r.then) pending.push(r.then(done)); else done();
};

// ---- Catalog integrity ----
test('catalog ids are unique and cards are well formed', () => {
  assert.equal(new Set(catalog.cards.map((c) => c.id)).size, catalog.cards.length);
  for (const c of catalog.cards) {
    assert.ok(c.name && c.issuer, c.id + ' needs name and issuer');
    assert.ok(['cash', 'points'].includes(c.type), c.id + ' type');
    assert.equal(typeof c.base, 'number', c.id + ' base');
    assert.equal(typeof c.fee, 'number', c.id + ' fee');
    if (c.type === 'points') assert.ok(c.cpp > 0, c.id + ' needs cpp');
    assert.ok(Array.isArray(c.src) && c.src.length, c.id + ' needs sources');
    for (const s of c.src) assert.ok(catalog.sources[s], c.id + ' unknown source ' + s);
  }
});

test('every rule references a known category, merchant, pool, choice or rotation', () => {
  for (const c of catalog.cards) {
    for (const r of c.rules) {
      assert.equal(typeof r.rate, 'number', c.id + ' rate');
      const kinds = ['cat', 'merchant', 'rotating', 'choice'].filter((k) => r[k] !== undefined);
      assert.equal(kinds.length, 1, c.id + ' rule must have exactly one matcher: ' + JSON.stringify(r));
      if (r.cat) assert.ok(CATEGORIES[r.cat], c.id + ' unknown category ' + r.cat);
      if (r.merchant) assert.ok(MERCHANTS[r.merchant], c.id + ' unknown merchant ' + r.merchant);
      if (r.pool) assert.ok(c.pools && c.pools[r.pool], c.id + ' unknown pool ' + r.pool);
      if (r.choice) assert.ok(c.choices && c.choices[r.choice], c.id + ' unknown choice ' + r.choice);
      if (r.rotating) assert.ok(c.rotating, c.id + ' rotating rule needs a rotating table');
    }
    for (const p of Object.values(c.pools || {})) {
      assert.ok(p.cap > 0 && ['quarter', 'year'].includes(p.period), c.id + ' pool');
    }
    for (const ch of Object.values(c.choices || {})) {
      assert.ok(ch.options.includes(ch.default), c.id + ' choice default');
      for (const o of ch.options) assert.ok(CATEGORIES[o], c.id + ' choice option ' + o);
    }
    for (const cats of Object.values(c.rotating || {})) {
      for (const o of cats) assert.ok(CATEGORIES[o], c.id + ' rotating category ' + o);
    }
    for (const cat of Object.values(CATEGORIES)) if (cat.parent) assert.ok(CATEGORIES[cat.parent]);
  }
});

test('current quarter has rotating data for rotating cards', () => {
  assert.equal(quarterKey(NOW), '2026Q4');
  for (const id of ['chase-freedom-flex', 'discover-it-cash-back']) assert.ok(byId[id].rotating['2026Q4'].length);
});

test('highlights render for every card', () => {
  for (const c of catalog.cards) assert.match(highlights(c, NOW), /else$/);
});

// ---- Ranking: Costco + Sapphire Preferred ----
const wallet2 = ['costco-anywhere-visa', 'chase-sapphire-preferred'].map((id) => newInstance(byId[id]));
const rank = (wallet, ctx, amt = 50) => rankWallet(wallet, byId, ctx, amt, NOW);
const topName = (rows) => rows[0].card.id;
const cashOf = (rows, id) => rows.find((r) => r.card.id === id).e.cash;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' vs ' + b);

test('Costco gas: 5% beats Sapphire 3x', () => {
  const rows = rank(wallet2, { cat: 'gas', merchant: 'costco_gas' });
  assert.equal(topName(rows), 'costco-anywhere-visa');
  close(cashOf(rows, 'costco-anywhere-visa'), 2.5);
  close(cashOf(rows, 'chase-sapphire-preferred'), 1.5);
});
test('other gas: Costco 4% beats Sapphire 3x', () => {
  const rows = rank(wallet2, { cat: 'gas', merchant: null });
  assert.equal(topName(rows), 'costco-anywhere-visa');
  close(cashOf(rows, 'costco-anywhere-visa'), 2.0);
});
test('Costco warehouse: 2% vs 1%', () => {
  const rows = rank(wallet2, { cat: 'wholesale', merchant: 'costco' }, 100);
  assert.equal(topName(rows), 'costco-anywhere-visa');
  close(cashOf(rows, 'costco-anywhere-visa'), 2);
  close(cashOf(rows, 'chase-sapphire-preferred'), 1);
});
test('dining ties at 3% with default 1 cent points; higher point value breaks the tie', () => {
  let rows = rank(wallet2, { cat: 'dining', merchant: null });
  close(cashOf(rows, 'costco-anywhere-visa'), 1.5);
  close(cashOf(rows, 'chase-sapphire-preferred'), 1.5);
  const w = wallet2.map((i) => (i.cardId === 'chase-sapphire-preferred' ? { ...i, cpp: 1.25 } : i));
  rows = rank(w, { cat: 'dining', merchant: null });
  assert.equal(topName(rows), 'chase-sapphire-preferred');
  close(cashOf(rows, 'chase-sapphire-preferred'), 50 * 3 * 1.25 / 100);
});
test('Chase Travel portal beats Costco travel; plain flights use 2x vs 3%', () => {
  let rows = rank(wallet2, { cat: 'travel_portal', merchant: null }, 100);
  assert.equal(topName(rows), 'chase-sapphire-preferred');
  close(cashOf(rows, 'chase-sapphire-preferred'), 5);
  close(cashOf(rows, 'costco-anywhere-visa'), 3);
  rows = rank(wallet2, { cat: 'flights', merchant: null }, 100);
  assert.equal(topName(rows), 'costco-anywhere-visa');
  close(cashOf(rows, 'costco-anywhere-visa'), 3);
  close(cashOf(rows, 'chase-sapphire-preferred'), 2);
});
test('online groceries, streaming, rideshare go to Sapphire; in-store groceries tie at base', () => {
  for (const cat of ['groceries_online', 'streaming', 'transit']) {
    assert.equal(topName(rank(wallet2, { cat, merchant: null })), 'chase-sapphire-preferred', cat);
  }
  const rows = rank(wallet2, { cat: 'groceries', merchant: null });
  close(cashOf(rows, 'costco-anywhere-visa'), 0.5);
  close(cashOf(rows, 'chase-sapphire-preferred'), 0.5);
});

// ---- Caps ----
test('shared annual gas cap: partial boost, then exhausted', () => {
  const costco = byId['costco-anywhere-visa'];
  let inst = newInstance(costco);
  inst = setSpent(inst, 'gas', costco.pools.gas, 6990, NOW);
  let e = evaluate(costco, inst, { cat: 'gas', merchant: 'costco_gas' }, 50, NOW);
  close(e.cash, (10 * 5 + 40 * 1) / 100);
  assert.match(e.note, /before the cap/);
  inst = setSpent(inst, 'gas', costco.pools.gas, 7000, NOW);
  e = evaluate(costco, inst, { cat: 'gas', merchant: 'costco_gas' }, 50, NOW);
  close(e.cash, 0.5);
  assert.match(e.note, /cap reached/);
});
test('spent amounts from an earlier period are ignored', () => {
  const costco = byId['costco-anywhere-visa'];
  let inst = newInstance(costco);
  inst = setSpent(inst, 'gas', costco.pools.gas, 7000, new Date('2025-06-01T12:00:00'));
  const e = evaluate(costco, inst, { cat: 'gas', merchant: null }, 50, NOW);
  close(e.cash, 2);
});

// ---- Rotating, choice, expiry ----
test('rotating 5% needs activation, then applies to this quarter only', () => {
  const flex = byId['chase-freedom-flex'];
  const inst = newInstance(flex);
  let e = evaluate(flex, inst, { cat: 'groceries', merchant: null }, 100, NOW);
  close(e.cash, 1);
  assert.ok(e.inactive);
  e = evaluate(flex, { ...inst, activated: true }, { cat: 'groceries', merchant: null }, 100, NOW);
  close(e.cash, 5);
  e = evaluate(flex, { ...inst, activated: true }, { cat: 'groceries', merchant: null }, 100, new Date('2027-05-10T12:00:00'));
  close(e.cash, 1);
});
test('activation upside is reported when an inactive card would win', () => {
  const w = ['wells-fargo-active-cash', 'discover-it-cash-back'].map((id) => newInstance(byId[id]));
  const rows = rank(w, { cat: 'dining', merchant: null }, 100);
  assert.equal(topName(rows), 'wells-fargo-active-cash');
  const up = activationUpside(rows, { cat: 'dining', merchant: null }, 100, NOW);
  assert.ok(up && up.gain > 2.9 && up.gain < 3.1, JSON.stringify(up));
});
test('Bank of America choice category follows the user pick and shares the cap with groceries', () => {
  const boa = byId['bofa-customized-cash'];
  let inst = newInstance(boa);
  close(evaluate(boa, inst, { cat: 'gas', merchant: null }, 100, NOW).cash, 3);
  close(evaluate(boa, inst, { cat: 'online', merchant: null }, 100, NOW).cash, 1);
  inst = { ...inst, choices: { c1: 'online' } };
  close(evaluate(boa, inst, { cat: 'online', merchant: null }, 100, NOW).cash, 3);
  close(evaluate(boa, inst, { cat: 'groceries', merchant: null }, 100, NOW).cash, 2);
  inst = setSpent(inst, 'q', boa.pools.q, 2500, NOW);
  close(evaluate(boa, inst, { cat: 'groceries', merchant: null }, 100, NOW).cash, 1);
});
test('expired bonuses stop applying', () => {
  const sw = byId['southwest-priority'];
  const inst = newInstance(sw);
  const before = evaluate(sw, inst, { cat: 'streaming', merchant: null }, 100, NOW);
  const after = evaluate(sw, inst, { cat: 'streaming', merchant: null }, 100, new Date('2027-01-05T12:00:00'));
  assert.ok(before.cash > after.cash);
});
test('merchant rules: Amazon Prime Visa at Amazon and Whole Foods, parent category matching for phone', () => {
  const prime = byId['amazon-prime-visa'];
  const inst = newInstance(prime);
  close(evaluate(prime, inst, { cat: 'online', merchant: 'amazon' }, 100, NOW).cash, 5);
  close(evaluate(prime, inst, { cat: 'groceries', merchant: 'whole_foods' }, 100, NOW).cash, 5);
  const disc = byId['discover-it-cash-back'];
  close(evaluate(disc, { ...newInstance(disc), activated: true }, { cat: 'phone', merchant: 'verizon' }, 100, NOW).cash, 5);
});

// ---- Place detection ----
test('place classification', () => {
  assert.deepEqual(pick(classify('Costco Gas')), ['gas', 'costco_gas']);
  assert.deepEqual(pick(classify('Costco', { amenity: 'fuel' })), ['gas', 'costco_gas']);
  assert.deepEqual(pick(classify('Costco Wholesale', { shop: 'wholesale' })), ['wholesale', 'costco']);
  assert.deepEqual(pick(classify('Whole Foods Market', { shop: 'supermarket' })), ['groceries', 'whole_foods']);
  assert.deepEqual(pick(classify("Trader Joe's", { shop: 'supermarket' })), ['groceries', null]);
  assert.deepEqual(pick(classify('Chipotle', { amenity: 'fast_food' })), ['dining', null]);
  assert.deepEqual(pick(classify('Shell', { amenity: 'fuel' })), ['gas', null]);
  assert.deepEqual(pick(classify('Target', { shop: 'department_store' })), ['general', 'target']);
  assert.deepEqual(pick(classify('Home Depot', { shop: 'doityourself' })), ['home', null]);
  assert.deepEqual(pick(classify('Verizon Wireless')), ['phone', 'verizon']);
  assert.equal(classify('Joe Smith Tax Service').known, false);
  assert.equal(classify('').cat, 'general');
});
function pick(c) { return [c.cat, c.merchant]; }

test('overpass elements parse, dedupe and sort by distance', () => {
  const els = [
    { type: 'node', id: 1, lat: 37.7750, lon: -122.4194, tags: { name: 'Chipotle', amenity: 'fast_food' } },
    { type: 'node', id: 2, lat: 37.7751, lon: -122.4194, tags: { name: 'Chipotle', amenity: 'fast_food' } },
    { type: 'way', id: 3, center: { lat: 37.7760, lon: -122.4194 }, tags: { name: 'Shell', amenity: 'fuel' } },
    { type: 'node', id: 4, lat: 37.7750, lon: -122.4194, tags: { amenity: 'cafe' } },
  ];
  const out = parseElements(els, 37.7749, -122.4194);
  assert.deepEqual(out.map((p) => p.name), ['Chipotle', 'Shell']);
  assert.equal(out[0].id, 'node1');
  assert.ok(out[0].dist < out[1].dist);
  assert.match(formatDistance(90), /ft$/);
  assert.match(formatDistance(800), /mi$/);
});

const G = (name, types, primaryType) => ({ id: name, displayName: { text: name }, types, primaryType, location: { latitude: 37.001, longitude: -122 } });
test('google places: types map to spending categories and brands override', () => {
  assert.equal(mapPlace(G('Joe Pizza', ['restaurant']), 37, -122).cat, 'dining');
  assert.equal(mapPlace(G('Shell', ['gas_station', 'convenience_store']), 37, -122).cat, 'gas');
  assert.equal(mapPlace(G('Safeway', ['supermarket']), 37, -122).cat, 'groceries');
  const costco = mapPlace(G('Costco Wholesale', ['warehouse_store']), 37, -122);
  assert.equal(costco.merchant, 'costco');
  assert.equal(costco.cat, 'wholesale');
  const cgas = mapPlace(G('Costco Gasoline', ['gas_station']), 37, -122);
  assert.equal(cgas.merchant, 'costco_gas');
  assert.equal(cgas.cat, 'gas');
  assert.ok(mapPlace(G('Joe Pizza', ['restaurant']), 37, -122).dist > 100);
});
test('google places: request bodies and chips', () => {
  const b = nearbyBody(37, -122, 3219, ['gas_station']);
  assert.equal(b.rankPreference, 'DISTANCE');
  assert.equal(b.locationRestriction.circle.radius, 3219);
  assert.ok(b.maxResultCount <= 20);
  assert.equal(textBody(37, -122, 3219, 'sushi').textQuery, 'sushi');
  assert.ok(CHIPS.every((c) => c.id && c.label));
});
test('google places: loadPlaces sends the key, sorts by distance and surfaces API errors', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = 'test-key';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ places: [
      { ...G('Far Cafe', ['cafe']), location: { latitude: 37.02, longitude: -122 } },
      G('Near Cafe', ['cafe']),
    ] }) };
  };
  const out = await loadPlaces({ lat: 37, lon: -122, radius: 3219, chip: 'coffee' });
  assert.equal(out[0].name, 'Near Cafe');
  assert.match(calls[0].url, /places:searchNearby$/);
  assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'test-key');
  await loadPlaces({ lat: 37, lon: -122, radius: 3219, query: 'sushi' });
  assert.match(calls[1].url, /places:searchText$/);
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API key not valid' } }) });
  let msg = '';
  try { await loadPlaces({ lat: 37, lon: -122, radius: 3219 }); } catch (e) { msg = e.message; }
  assert.equal(msg, 'API key not valid');
  delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
});

// ---- Emoji, deals, units, new merchants ----
test('emoji: restaurants get creative tiles, other categories follow their category', () => {
  assert.equal(emojiFor('Dunkin Donuts', 'dining'), '🍩');
  assert.equal(emojiFor('Brooklyn Bagel Co', 'dining'), '🥯');
  assert.equal(emojiFor('Pho 79', 'dining'), '🍜');
  assert.equal(emojiFor('Tokyo Noodle House', 'dining'), '🍜');
  assert.equal(emojiFor("Joe's Pizza", 'dining'), '🍕');
  assert.equal(emojiFor('Blue Door', 'dining', ['coffee_shop']), '☕');
  assert.equal(emojiFor('Corner Spot', 'dining'), '🍽️');
  assert.equal(emojiFor('Shell', 'gas'), '⛽');
  assert.equal(emojiFor('Tesla Supercharger', 'gas', ['electric_vehicle_charging_station']), '🔌');
  assert.equal(emojiFor('Ace Hardware', 'home', ['hardware_store']), '🔨');
  assert.equal(emojiFor('Ikea', 'home'), '🛋️');
  assert.equal(CAT_EMOJI.groceries, '🛒');
});
test('deals: expired ones drop, labels read naturally', () => {
  const card = { deals: [
    { emoji: 'a', text: 'old', until: '2026-01-01' },
    { emoji: 'b', text: 'soon', until: '2026-12-31' },
    { emoji: 'c', text: 'later', until: '2027-09-30' },
    { emoji: 'd', text: 'dash', until: '2029-12-31', tag: 'activate' },
    { emoji: 'e', text: 'yearly', tag: 'every year' },
  ] };
  const now = new Date('2026-11-11T12:00:00');
  const d = activeDeals(card, now);
  assert.deepEqual(d.map((x) => x.text), ['soon', 'later', 'dash', 'yearly']);
  assert.equal(dealWhen(d[0], now), '⏰ by Dec 31');
  assert.equal(dealWhen(d[1], now), 'to Sep 30, 2027');
  assert.equal(dealWhen(d[2], now), 'by Dec 31, 2029');
  assert.equal(dealWhen(d[3], now), 'every year');
  assert.deepEqual(activeDeals({}, now), []);
});
test('Sapphire: Lyft and Peloton earn 5x until they expire, then fall back', () => {
  const inst = newInstance(byId['chase-sapphire-preferred']);
  const card = byId['chase-sapphire-preferred'];
  const before = evaluate(card, inst, { cat: 'transit', merchant: 'lyft' }, 100, new Date('2027-06-01T12:00:00'));
  assert.equal(before.eff, 5);
  const after = evaluate(card, inst, { cat: 'transit', merchant: 'lyft' }, 100, new Date('2027-11-01T12:00:00'));
  assert.equal(after.eff, 2);
  const peloton = evaluate(card, inst, { cat: 'general', merchant: 'peloton' }, 100, new Date('2027-06-01T12:00:00'));
  assert.equal(peloton.eff, 5);
});
test('distance formatting supports kilometers', () => {
  assert.equal(formatDistance(80, 'km'), '80 m');
  assert.equal(formatDistance(1609, 'km'), '1.6 km');
  assert.match(formatDistance(1609, 'mi'), /mi/);
});
test('catalog deals are well formed and merchants referenced exist', () => {
  for (const c of catalog.cards) {
    for (const d of c.deals || []) assert.ok(d.emoji && d.text, c.id + ' deal needs emoji and text');
    for (const r of c.rules) if (r.merchant) assert.ok(MERCHANTS[r.merchant], c.id + ' unknown merchant ' + r.merchant);
  }
});

test('addresses and map links', () => {
  const g = mapPlace({ ...G('Joe Pizza', ['restaurant']), shortFormattedAddress: '12 Main St, Springfield' }, 37, -122);
  assert.equal(g.address, '12 Main St, Springfield');
  assert.equal(g.lat, 37.001);
  assert.equal(mapPlace(G('Joe Pizza', ['restaurant']), 37, -122).address, '');
  assert.equal(osmAddress({ 'addr:housenumber': '12', 'addr:street': 'Main St', 'addr:city': 'Springfield' }), '12 Main St, Springfield');
  assert.equal(osmAddress({}), '');
  const url = mapsUrl({ name: "Joe's Pizza", lat: 37.5, lon: -122.25 }, 'ios');
  assert.equal(url, 'https://maps.apple.com/?q=Joe\'s%20Pizza&ll=37.5,-122.25');
  assert.equal(mapsUrl({ name: 'Shell', lat: 1, lon: 2 }, 'android'), 'geo:1,2?q=1,2(Shell)');
  assert.match(mapsUrl({ name: 'Shell', address: '5 Oak Ave' }, 'ios'), /q=Shell%205%20Oak%20Ave$/);
});

await Promise.all(pending);
console.log('\n' + passed + ' tests passed, ' + catalog.cards.length + ' cards validated');
