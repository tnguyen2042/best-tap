// Nearby places from OpenStreetMap (free, no key) plus merchant and category detection.

// [name pattern, category, merchant key, optional note]
const BRANDS = [
  [/costco\s*(gas|fuel)/i, 'gas', 'costco_gas'],
  [/costco/i, 'wholesale', 'costco'],
  [/sam'?s club/i, 'wholesale', 'sams'],
  [/bj'?s wholesale/i, 'wholesale', null],
  [/whole foods/i, 'groceries', 'whole_foods'],
  [/amazon fresh/i, 'groceries_online', 'amazon'],
  [/amazon/i, 'online', 'amazon'],
  [/\btarget\b/i, 'general', 'target', 'Superstores can code as groceries or general retail depending on the store. Tap a category to compare.'],
  [/walmart/i, 'general', 'walmart', 'Superstores can code as groceries or general retail depending on the store. Tap a category to compare.'],
  [/lowe'?s/i, 'home', 'lowes'],
  [/apple store|apple\.com/i, 'general', 'apple'],
  [/united airlines|united\.com/i, 'flights', 'united'],
  [/southwest/i, 'flights', 'southwest'],
  [/american airlines/i, 'flights', 'aa'],
  [/marriott|bonvoy|courtyard by|sheraton|westin|residence inn|fairfield inn|springhill suites|ritz-?carlton/i, 'hotels', 'marriott'],
  [/verizon/i, 'phone', 'verizon'],
  [/t-?mobile/i, 'phone', 'tmobile'],
  [/at&t|\batt store/i, 'phone', 'att'],
];

const NAME_WORDS = [
  [/uber eats|doordash|grubhub|restaurant|cafe|coffee|pizza|burger|taco|sushi|\bpho\b|grill|kitchen|bistro|diner|boba/i, 'dining'],
  [/instacart|shipt|online grocer/i, 'groceries_online'],
  [/supermarket|grocery|\bmarket\b/i, 'groceries'],
  [/\bgas\b|fuel|petrol|ev charg/i, 'gas'],
  [/pharmacy|drug ?store|\bcvs\b|walgreens|rite aid/i, 'drugstore'],
  [/airline|airways|\bhotel\b|\binn\b|resort|airbnb/i, 'travel'],
  [/uber|lyft|\bbart\b|metro|transit/i, 'transit'],
  [/netflix|spotify|hulu|disney|youtube/i, 'streaming'],
  [/cinema|theatre|theater|stadium|concert/i, 'entertainment'],
  [/home depot|hardware/i, 'home'],
];

function tagCategory(tags) {
  const a = tags.amenity;
  const s = tags.shop;
  if (['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court', 'ice_cream'].includes(a)) return 'dining';
  if (a === 'fuel' || a === 'charging_station') return 'gas';
  if (a === 'pharmacy' || s === 'chemist') return 'drugstore';
  if (a === 'cinema' || a === 'theatre') return 'entertainment';
  if (s === 'supermarket' || s === 'greengrocer') return 'groceries';
  if (s === 'wholesale') return 'wholesale';
  if (['doityourself', 'hardware', 'garden_centre'].includes(s)) return 'home';
  if (tags.tourism === 'hotel' || tags.tourism === 'motel') return 'hotels';
  return null;
}

// Returns { cat, merchant, note, known }.
export function classify(name, tags = {}) {
  const n = (name || '').trim();
  if (!n) return { cat: 'general', merchant: null, note: '', known: false };
  for (const [re, cat, merchant, note] of BRANDS) {
    if (re.test(n)) {
      if (merchant === 'costco' && tags.amenity === 'fuel') return { cat: 'gas', merchant: 'costco_gas', note: '', known: true };
      return { cat, merchant: merchant || null, note: note || '', known: true };
    }
  }
  const t = tagCategory(tags);
  if (t) return { cat: t, merchant: null, note: '', known: true };
  for (const [re, cat] of NAME_WORDS) {
    if (re.test(n)) return { cat, merchant: null, note: '', known: true };
  }
  return { cat: 'general', merchant: null, note: '', known: false };
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m) {
  if (m < 160) return Math.max(10, Math.round((m * 3.281) / 10) * 10) + ' ft';
  return (m / 1609.34).toFixed(1) + ' mi';
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export function buildQuery(lat, lon, radius) {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:15];(
nwr${around}["name"]["amenity"~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|fuel|charging_station|pharmacy|cinema|theatre)$"];
nwr${around}["name"]["shop"~"^(supermarket|greengrocer|wholesale|doityourself|hardware|department_store|variety_store|chemist|convenience|mall|electronics|clothes)$"];
nwr${around}["name"]["tourism"~"^(hotel|motel)$"];
);out center 120;`;
}

export function parseElements(elements, lat, lon) {
  const seen = new Map();
  for (const el of elements) {
    const tags = el.tags || {};
    const plat = el.lat != null ? el.lat : el.center && el.center.lat;
    const plon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (!tags.name || plat == null || plon == null) continue;
    const c = classify(tags.name, tags);
    const dist = distanceMeters(lat, lon, plat, plon);
    const key = tags.name.toLowerCase() + '|' + c.cat;
    const place = { id: String(el.type) + el.id, name: tags.name, cat: c.cat, merchant: c.merchant, note: c.note, dist };
    if (!seen.has(key) || seen.get(key).dist > dist) seen.set(key, place);
  }
  return Array.from(seen.values()).sort((a, b) => a.dist - b.dist).slice(0, 30);
}

export async function findNearby(lat, lon, radius = 400) {
  const body = 'data=' + encodeURIComponent(buildQuery(lat, lon, radius));
  let lastErr = null;
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return parseElements(json.elements || [], lat, lon);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr || new Error('No endpoint answered');
}
