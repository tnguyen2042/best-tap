// Ranking engine. Pure functions with no React or device dependencies.

export const CATEGORIES = {
  dining: { label: 'Dining' },
  groceries: { label: 'Groceries' },
  groceries_online: { label: 'Online groceries' },
  wholesale: { label: 'Warehouse clubs' },
  gas: { label: 'Gas & EV charging' },
  flights: { label: 'Flights', parent: 'travel' },
  hotels: { label: 'Hotels', parent: 'travel' },
  travel: { label: 'Travel' },
  travel_portal: { label: 'Booked in a card travel portal', parent: 'travel' },
  transit: { label: 'Transit & rideshare' },
  streaming: { label: 'Streaming' },
  entertainment: { label: 'Entertainment' },
  drugstore: { label: 'Drugstores' },
  online: { label: 'Online shopping' },
  home: { label: 'Home improvement' },
  utilities: { label: 'Utilities' },
  phone: { label: 'Phone & internet', parent: 'utilities' },
  general: { label: 'Everything else' },
};

export const MERCHANTS = {
  costco: 'Costco',
  costco_gas: 'Costco gas',
  amazon: 'Amazon',
  whole_foods: 'Whole Foods',
  target: 'Target',
  walmart: 'Walmart',
  lowes: "Lowe's",
  sams: "Sam's Club",
  apple: 'Apple',
  verizon: 'Verizon',
  tmobile: 'T-Mobile',
  att: 'AT&T',
  united: 'United',
  southwest: 'Southwest',
  aa: 'American Airlines',
  marriott: 'Marriott',
  lyft: 'Lyft',
  peloton: 'Peloton',
};

export const num = (n) => Number(Number(n).toFixed(2));
export const money = (n) => '$' + n.toFixed(2);
export const money0 = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const pct = (n) => num(n) + '%';

// A category plus its ancestors, so a "flights" purchase also matches "travel" rules.
export function lineageOf(cat) {
  const out = [];
  let c = cat;
  while (c) {
    out.push(c);
    c = CATEGORIES[c] && CATEGORIES[c].parent;
  }
  return out;
}

export function quarterKey(d) {
  return d.getFullYear() + 'Q' + (Math.floor(d.getMonth() / 3) + 1);
}
export function periodKey(period, d) {
  return period === 'year' ? String(d.getFullYear()) : quarterKey(d);
}

// Spent amounts are stored with the period they belong to, so they reset on their own.
export function spentFor(inst, poolId, pool, now) {
  const s = inst.spent && inst.spent[poolId];
  return s && s.period === periodKey(pool.period, now) ? s.amount : 0;
}
export function setSpent(inst, poolId, pool, amount, now) {
  return {
    ...inst,
    spent: {
      ...(inst.spent || {}),
      [poolId]: { amount: Math.max(0, amount || 0), period: periodKey(pool.period, now) },
    },
  };
}

export function newInstance(card) {
  return {
    id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    cardId: card.id,
    cpp: null,
    activated: false,
    spent: {},
    choices: {},
  };
}

function choiceFor(card, inst, slot) {
  return (inst.choices && inst.choices[slot]) || card.choices[slot].default;
}

function expired(rule, now) {
  return rule.until && now > new Date(rule.until + 'T23:59:59');
}

function ruleMatches(card, inst, rule, ctx, lin, now) {
  if (rule.merchant) return rule.merchant === ctx.merchant;
  if (rule.rotating) {
    const cats = (card.rotating && card.rotating[quarterKey(now)]) || [];
    return cats.some((c) => lin.includes(c));
  }
  if (rule.choice) return lin.includes(choiceFor(card, inst, rule.choice));
  return lin.includes(rule.cat);
}

export function ruleLabel(card, inst, rule, ctx) {
  if (rule.merchant) return MERCHANTS[rule.merchant] || rule.merchant;
  if (rule.rotating) return 'Rotating ' + CATEGORIES[ctx.cat].label.toLowerCase();
  if (rule.choice) return 'Your ' + CATEGORIES[choiceFor(card, inst, rule.choice)].label.toLowerCase() + ' pick';
  return CATEGORIES[rule.cat].label;
}

export function pointValue(card, inst) {
  return card.type === 'points' ? inst.cpp || card.cpp || 1 : null;
}

export function evaluate(card, inst, ctx, amt, now = new Date()) {
  const cpp = pointValue(card, inst);
  const val = (r) => (cpp ? r * cpp : r);
  const fmt = (r) => (cpp ? num(r) + 'x' : num(r) + '%');
  const lin = lineageOf(ctx.cat);
  const baseP = val(card.base);
  let best = {
    cash: (amt * baseP) / 100,
    rate: baseP,
    rule: null,
    note: 'Base rate ' + fmt(card.base) + (cpp ? ' (' + pct(baseP) + ' value)' : ''),
  };
  let inactive = null;
  let capHit = null;

  for (const rule of card.rules) {
    if (expired(rule, now)) continue;
    if (!ruleMatches(card, inst, rule, ctx, lin, now)) continue;
    if (rule.activation && !inst.activated) {
      if (!inactive || rule.rate > inactive.rate) inactive = rule;
      continue;
    }
    const pool = rule.pool && card.pools ? card.pools[rule.pool] : null;
    const remaining = pool ? Math.max(0, pool.cap - spentFor(inst, rule.pool, pool, now)) : Infinity;
    if (remaining <= 0) {
      capHit = { rule, pool };
      continue;
    }
    const rp = val(rule.rate);
    const boosted = Math.min(amt, remaining);
    const cash = (boosted * rp + (amt - boosted) * baseP) / 100;
    if (cash > best.cash + 1e-9) {
      let note = ruleLabel(card, inst, rule, ctx) + ' ' + fmt(rule.rate) + (cpp ? ' (' + pct(rp) + ' value)' : '');
      if (boosted < amt) {
        note = fmt(rule.rate) + ' on the first ' + money(boosted) + ' before the cap, then ' + fmt(card.base);
      } else if (pool) {
        note += ' · ' + money0(remaining) + ' left of the ' + (pool.period === 'year' ? 'annual' : 'quarterly') + ' cap';
      }
      best = { cash, rate: rp, rule, note };
    }
  }
  if (!best.rule && capHit) {
    best.note = fmt(capHit.rule.rate) + ' cap reached this ' + (capHit.pool.period === 'year' ? 'year' : 'quarter') + ', so the base rate applies';
  }
  best.eff = amt > 0 ? (best.cash / amt) * 100 : baseP;
  best.cpp = cpp;
  best.pts = cpp ? (best.cash * 100) / cpp : 0;
  best.inactive = inactive;
  return best;
}

export function rankWallet(wallet, catalogById, ctx, amt, now = new Date()) {
  return wallet
    .map((inst) => {
      const card = catalogById[inst.cardId];
      return card ? { inst, card, e: evaluate(card, inst, ctx, amt, now) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.e.cash - a.e.cash || b.e.eff - a.e.eff);
}

// If a card with an inactive rotating bonus would win once activated, say how much more it earns.
export function activationUpside(rows, ctx, amt, now = new Date()) {
  if (!rows.length) return null;
  const top = rows[0];
  let best = null;
  for (const r of rows) {
    if (!r.e.inactive) continue;
    const pot = evaluate(r.card, { ...r.inst, activated: true }, ctx, amt, now);
    const gain = pot.cash - top.e.cash;
    if (gain > 0.005 && (!best || gain > best.gain)) best = { name: r.card.name, gain, eff: pot.eff };
  }
  return best;
}

// A short "best at" line for the card picker.
export function highlights(card, now = new Date()) {
  const cpp = card.type === 'points' ? card.cpp || 1 : null;
  const items = [];
  for (const rule of card.rules) {
    if (expired(rule, now)) continue;
    const label = rule.merchant
      ? MERCHANTS[rule.merchant]
      : rule.rotating
      ? 'rotating'
      : rule.choice
      ? 'your pick'
      : CATEGORIES[rule.cat].label.toLowerCase();
    items.push({ rate: rule.rate, text: (cpp ? num(rule.rate) + 'x ' : num(rule.rate) + '% ') + label });
  }
  items.sort((a, b) => b.rate - a.rate);
  const top = items.slice(0, 3).map((i) => i.text);
  top.push((cpp ? num(card.base) + 'x' : num(card.base) + '%') + ' else');
  return top.join(' · ');
}
