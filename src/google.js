// Google Places API (New) search, with OpenStreetMap as the fallback when no key is set.
import { classify, distanceMeters, findNearby } from './places';

const BASE = 'https://places.googleapis.com/v1/places';
const FIELDS = 'places.id,places.displayName,places.location,places.primaryType,places.types';

export const getKey = () => process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY || '';
export const hasGoogleKey = () => !!getKey();

// Chip id, label, Google place types (Table A) to search for.
export const CHIPS = [
  { id: 'all', label: 'All', types: null },
  { id: 'dining', label: 'Restaurants', types: ['restaurant', 'fast_food_restaurant'] },
  { id: 'coffee', label: 'Coffee', types: ['coffee_shop', 'cafe'] },
  { id: 'gas', label: 'Gas & EV', types: ['gas_station', 'electric_vehicle_charging_station'] },
  { id: 'groceries', label: 'Groceries', types: ['supermarket', 'grocery_store'] },
  { id: 'wholesale', label: 'Warehouse', types: ['warehouse_store'] },
  { id: 'drugstore', label: 'Drugstores', types: ['pharmacy', 'drugstore'] },
  { id: 'shopping', label: 'Shopping', types: ['department_store', 'shopping_mall', 'electronics_store', 'clothing_store', 'discount_store'] },
  { id: 'home', label: 'Home', types: ['home_improvement_store', 'hardware_store'] },
  { id: 'hotels', label: 'Hotels', types: ['hotel', 'lodging'] },
  { id: 'entertainment', label: 'Entertainment', types: ['movie_theater', 'amusement_park'] },
];
const ALL_TYPES = Array.from(new Set(CHIPS.flatMap((c) => c.types || [])));

// Google type -> our spending category, checked in this order.
const TYPE_TO_CAT = [
  [['gas_station', 'electric_vehicle_charging_station'], 'gas'],
  [['pharmacy', 'drugstore'], 'drugstore'],
  [['warehouse_store'], 'wholesale'],
  [['supermarket', 'grocery_store'], 'groceries'],
  [['home_improvement_store', 'hardware_store'], 'home'],
  [['hotel', 'lodging', 'motel'], 'hotels'],
  [['movie_theater', 'amusement_park', 'performing_arts_theater', 'stadium'], 'entertainment'],
  [['transit_station', 'subway_station', 'bus_station', 'train_station', 'taxi_stand'], 'transit'],
  [['restaurant', 'fast_food_restaurant', 'coffee_shop', 'cafe', 'bakery', 'bar', 'meal_takeaway'], 'dining'],
  [['department_store', 'shopping_mall', 'electronics_store', 'clothing_store', 'discount_store', 'convenience_store', 'store'], 'general'],
];

function typeCategory(types) {
  const set = new Set(types || []);
  for (const [list, cat] of TYPE_TO_CAT) if (list.some((t) => set.has(t))) return cat;
  if ((types || []).some((t) => t.endsWith('_restaurant'))) return 'dining';
  return null;
}

// Google place -> the place shape the app uses.
export function mapPlace(g, lat, lon) {
  const name = (g.displayName && g.displayName.text) || '';
  const types = [g.primaryType, ...(g.types || [])].filter(Boolean);
  const brand = classify(name, {});
  let cat = typeCategory(types) || brand.cat;
  let merchant = brand.merchant || null;
  if (merchant === 'costco' && types.includes('gas_station')) { merchant = 'costco_gas'; cat = 'gas'; }
  if (merchant && brand.known && !typeCategory(types)) cat = brand.cat;
  const loc = g.location || {};
  const dist = loc.latitude != null ? distanceMeters(lat, lon, loc.latitude, loc.longitude) : 0;
  return { id: g.id, name, cat, merchant, note: brand.note || '', dist };
}

async function call(endpoint, body) {
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': getKey(), 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.error && json.error.message) || 'Google Places error ' + res.status);
  return json.places || [];
}

const circle = (lat, lon, radius) => ({ circle: { center: { latitude: lat, longitude: lon }, radius } });

export function nearbyBody(lat, lon, radius, types) {
  return { includedTypes: types || ALL_TYPES, maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: circle(lat, lon, radius) };
}
export function textBody(lat, lon, radius, query) {
  return { textQuery: query, maxResultCount: 20, locationBias: circle(lat, lon, radius) };
}

// One entry point for the Nearby screen: a category chip, or a typed search.
export async function loadPlaces({ lat, lon, radius, chip = 'all', query = '' }) {
  if (!hasGoogleKey()) {
    const items = await findNearby(lat, lon, radius);
    const c = CHIPS.find((x) => x.id === chip);
    const q = query.trim().toLowerCase();
    return items.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (chip === 'all' || !c || p.cat === chip || (chip === 'coffee' && p.cat === 'dining') || (chip === 'shopping' && p.cat === 'general')));
  }
  const q = query.trim();
  let raw;
  if (q) raw = await call(':searchText', textBody(lat, lon, radius, q));
  else raw = await call(':searchNearby', nearbyBody(lat, lon, radius, (CHIPS.find((c) => c.id === chip) || CHIPS[0]).types));
  const seen = new Set();
  return raw
    .map((g) => mapPlace(g, lat, lon))
    .filter((p) => p.name && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => a.dist - b.dist);
}
