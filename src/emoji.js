// Emoji for categories, merchants and individual places.

export const CAT_EMOJI = {
  dining: '🍕', coffee: '☕', groceries: '🛒', groceries_online: '🛒', wholesale: '📦', gas: '⛽',
  flights: '✈️', hotels: '🏨', travel: '✈️', travel_portal: '🧳', transit: '🚇', streaming: '📺',
  entertainment: '🎬', drugstore: '💊', online: '💻', home: '🛋️', utilities: '💡', phone: '📱',
  general: '🛍️', shopping: '🛍️',
};

export const MERCHANT_EMOJI = {
  costco: '📦', costco_gas: '⛽', amazon: '📦', whole_foods: '🥬', target: '🎯', walmart: '🛒',
  lowes: '🔨', sams: '📦', apple: '🍎', verizon: '📱', tmobile: '📱', att: '📱', united: '✈️',
  southwest: '✈️', aa: '✈️', marriott: '🏨', lyft: '🚗', peloton: '🚴',
};

// Restaurant name hints, checked in order (so "Donuts & Sandwiches" is a donut shop).
const NAME_EMOJI = [
  [/donut|doughnut|dunkin/i, '🍩'],
  [/bagel/i, '🥯'],
  [/\bph[oở]\b|ramen|noodle|udon|\bmi\b/i, '🍜'],
  [/sushi|izakaya|omakase/i, '🍣'],
  [/dim sum|dumpling/i, '🥟'],
  [/pizza|pizzeria/i, '🍕'],
  [/taco|burrito|mexican|cantina|taqueria/i, '🌮'],
  [/burger/i, '🍔'],
  [/boba|bubble tea|milk tea/i, '🧋'],
  [/bakery|pastry|patisserie|croissant/i, '🥐'],
  [/ice cream|gelato|froyo|frozen yogurt/i, '🍦'],
  [/starbucks|peet|philz|blue bottle|coffee|caf[eé]|espresso|roaster/i, '☕'],
  [/bbq|barbecue/i, '🍖'],
  [/chicken|wings/i, '🍗'],
  [/steak/i, '🥩'],
  [/seafood|crab|lobster/i, '🦐'],
  [/curry|indian/i, '🍛'],
  [/breakfast|pancake|waffle|brunch/i, '🥞'],
  [/sandwich|deli\b/i, '🥪'],
  [/pub\b|brewery|taproom|bar & grill/i, '🍺'],
];

// Google primary types and OpenStreetMap amenity values.
const TYPE_EMOJI = {
  pizza_restaurant: '🍕', hamburger_restaurant: '🍔', mexican_restaurant: '🌮',
  japanese_restaurant: '🍜', ramen_restaurant: '🍜', chinese_restaurant: '🍜', korean_restaurant: '🍜',
  thai_restaurant: '🍜', vietnamese_restaurant: '🍜', asian_restaurant: '🍜', noodle_restaurant: '🍜',
  sushi_restaurant: '🍣', indian_restaurant: '🍛', italian_restaurant: '🍝', seafood_restaurant: '🦐',
  steak_house: '🥩', barbecue_restaurant: '🍖', breakfast_restaurant: '🥞', brunch_restaurant: '🥞',
  sandwich_shop: '🥪', donut_shop: '🍩', bagel_shop: '🥯', bakery: '🥐', ice_cream_shop: '🍦', ice_cream: '🍦',
  coffee_shop: '☕', cafe: '☕', tea_house: '🧋', bar: '🍺', pub: '🍺', fast_food_restaurant: '🍟', fast_food: '🍟',
};

// types: Google types (primary first) or OSM values. Returns one emoji for the place's tile.
export function emojiFor(name, cat, types = []) {
  const n = name || '';
  if (cat === 'dining') {
    for (const [re, e] of NAME_EMOJI) if (re.test(n)) return e;
    for (const t of types) if (TYPE_EMOJI[t]) return TYPE_EMOJI[t];
    return '🍽️';
  }
  if (cat === 'home') return types.some((t) => t === 'hardware_store' || t === 'home_improvement_store') ? '🔨' : '🛋️';
  if (cat === 'gas' && types.includes('electric_vehicle_charging_station')) return '🔌';
  return CAT_EMOJI[cat] || '🛍️';
}
