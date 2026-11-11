import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import catalog from './src/catalog.json';
import {
  CATEGORIES,
  MERCHANTS,
  activationUpside,
  highlights,
  money,
  money0,
  newInstance,
  num,
  pct,
  pointValue,
  quarterKey,
  rankWallet,
  ruleLabel,
  setSpent,
  spentFor,
} from './src/engine';
import { classify, formatDistance } from './src/places';
import { CHIPS, hasGoogleKey, loadPlaces } from './src/google';
import { CAT_EMOJI, MERCHANT_EMOJI } from './src/emoji';
import { activeDeals, dealWhen } from './src/deals';
import { CARD_IMAGES } from './src/cardArt';

const STORAGE_KEY = 'besttap.wallet.v1';
const SETTINGS_KEY = 'besttap.settings.v1';
const MILE = 1609.34;
const DEFAULT_SETTINGS = {
  theme: 'system',
  radius: 2,
  units: 'mi',
  amount: 50,
  alerts: { deals: true, activate: true, expiring: false },
};
const BY_ID = Object.fromEntries(catalog.cards.map((c) => [c.id, c]));
const ISSUER_HUE = {
  Chase: 220, Citi: 205, 'American Express': 185, 'Capital One': 355, Discover: 28,
  'Wells Fargo': 8, 'Bank of America': 345, Synchrony: 150, Target: 0, Verizon: 350,
  'T-Mobile': 320, "Lowe's": 215, OnePay: 260, Fidelity: 140, 'Goldman Sachs': 0,
  'Bread Financial': 175,
};
const hueOf = (card) => (ISSUER_HUE[card.issuer] != null ? ISSUER_HUE[card.issuer] : 200);
const cardColor = (card) => 'hsl(' + hueOf(card) + ', 55%, 38%)';

const LIGHT = {
  bg: '#F4F0FF', surface: '#FFFFFF', surface2: '#F4F0FF', fg: '#1B1030', muted: '#5B5370',
  line: '#E3DAFB', shadow: '#E3DAFB', accent: '#6C4DFF', accentInk: '#FFFFFF', accentText: '#6C4DFF',
  lime: '#C8F560', limeInk: '#1B1030', chipOn: '#1B1030', chipOnInk: '#FFFFFF',
  warn: '#7D4A00', warnSoft: '#FBEBCB', bad: '#E5484D', dealBg: '#1B1030', dealInk: '#FFFFFF',
};
const DARK = {
  bg: '#140D24', surface: '#221838', surface2: '#2E2349', fg: '#F5F1FF', muted: '#B8ADD3',
  line: '#3A2D5C', shadow: '#0B0615', accent: '#6C4DFF', accentInk: '#FFFFFF', accentText: '#B3A5FF',
  lime: '#C8F560', limeInk: '#1B1030', chipOn: '#C8F560', chipOnInk: '#1B1030',
  warn: '#F0B95A', warnSoft: '#3A2B0E', bad: '#FF7A80', dealBg: '#0F0A1C', dealInk: '#F5F1FF',
};
// Tile colors per spending category: [light, dark].
const TILES = {
  dining: ['#FFD9C9', '#4A2A1F'], groceries: ['#D6F5CE', '#23421F'], groceries_online: ['#D6F5CE', '#23421F'],
  wholesale: ['#FFE7A3', '#4A3E14'], gas: ['#D3E6FF', '#1F3552'], drugstore: ['#FFD1E8', '#4A2038'],
  home: ['#CFF2EE', '#1E4440'], hotels: ['#FFD9F0', '#46203A'], entertainment: ['#FFE0B8', '#4A3414'],
  transit: ['#D3E6FF', '#1F3552'], streaming: ['#E6D8FF', '#35295A'], online: ['#E6D8FF', '#35295A'],
  general: ['#E6D8FF', '#35295A'], flights: ['#D3E6FF', '#1F3552'], travel: ['#D3E6FF', '#1F3552'],
  travel_portal: ['#D3E6FF', '#1F3552'], utilities: ['#FFE7A3', '#4A3E14'], phone: ['#CFF2EE', '#1E4440'],
};
const tileColor = (cat, dark) => (TILES[cat] || TILES.general)[dark ? 1 : 0];

function makeStyles(t) {
  const card = { backgroundColor: t.surface, borderRadius: 24, borderBottomWidth: 3, borderBottomColor: t.shadow };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 20, paddingBottom: 6 },
    title: { fontSize: 34, fontWeight: '800', color: t.fg, letterSpacing: -0.8 },
    sub: { fontSize: 14, color: t.muted, marginTop: 2 },
    body: { paddingHorizontal: 20, paddingTop: 12, gap: 14, paddingBottom: 40 },
    panel: { ...card, padding: 16, gap: 12 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: t.muted },
    section: { fontSize: 18, fontWeight: '800', color: t.fg },
    input: { backgroundColor: t.surface2, borderRadius: 16, minHeight: 48, paddingHorizontal: 14, fontSize: 15, color: t.fg },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    h2: { fontSize: 18, fontWeight: '800', color: t.fg },
    text: { fontSize: 15, color: t.fg },
    muted: { fontSize: 13, color: t.muted },
    small: { fontSize: 13, color: t.muted },
    amountPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.lime, borderRadius: 16, height: 48, paddingHorizontal: 14 },
    amountText: { fontSize: 18, fontWeight: '800', color: t.limeInk },
    amountInput: { minWidth: 44, fontSize: 18, fontWeight: '800', color: t.limeInk, padding: 0 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: 16, height: 48, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: t.shadow },
    searchInput: { flex: 1, fontSize: 15, color: t.fg, padding: 0 },
    chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: t.surface, borderBottomWidth: 2, borderBottomColor: t.shadow },
    chipOn: { backgroundColor: t.chipOn, borderBottomColor: t.chipOn },
    chipText: { fontSize: 14, fontWeight: '700', color: t.fg },
    chipTextOn: { color: t.chipOnInk },
    sortOn: { backgroundColor: t.accent, borderBottomColor: t.accent },
    sortTextOn: { color: t.accentInk },
    smallChip: { paddingVertical: 7, paddingHorizontal: 11 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    placeCard: { ...card, padding: 14, gap: 12 },
    tile: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    tileEmoji: { fontSize: 28 },
    placeName: { fontSize: 16, fontWeight: '700', color: t.fg, lineHeight: 20 },
    pctPill: { backgroundColor: t.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    pctText: { fontSize: 22, fontWeight: '800', color: t.limeInk },
    useBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface2, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
    useText: { flex: 1, fontSize: 14, color: t.fg },
    rank: { gap: 10 },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    medal: { fontSize: 20, width: 28, textAlign: 'center', color: t.muted },
    banner: { backgroundColor: t.warnSoft, borderRadius: 12, padding: 10 },
    bannerText: { color: t.warn, fontSize: 13 },
    primary: { backgroundColor: t.accent, borderRadius: 16, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: t.accentInk, fontWeight: '800', fontSize: 15 },
    addCard: { borderColor: t.accent, borderWidth: 2, borderStyle: 'dashed', borderRadius: 24, height: 64, alignItems: 'center', justifyContent: 'center' },
    addCardText: { color: t.accentText, fontWeight: '800', fontSize: 16 },
    ghost: { borderColor: t.line, borderWidth: 2, borderRadius: 16, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: t.bad, fontWeight: '700', fontSize: 15 },
    dangerBtn: { borderColor: t.bad, borderWidth: 2, borderRadius: 16, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    tabBar: { flexDirection: 'row', gap: 8, backgroundColor: t.surface, borderTopColor: t.line, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10 },
    tab: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 },
    tabOn: { backgroundColor: t.accent },
    tabText: { fontSize: 14, fontWeight: '700', color: t.fg },
    tabTextOn: { color: t.accentInk },
    cardImg: { width: '100%', aspectRatio: 1.5 },
    cardFallback: { width: '100%', aspectRatio: 1.5, borderRadius: 18, padding: 16, justifyContent: 'space-between' },
    cfIssuer: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    cfName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 28 },
    perk: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
    perkText: { fontSize: 13, fontWeight: '700' },
    dealBox: { backgroundColor: t.dealBg, borderRadius: 18, padding: 12, gap: 8 },
    dealHead: { color: t.lime, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    dealRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    dealText: { flex: 1, color: t.dealInk, fontSize: 14 },
    dealWhen: { color: t.dealInk, fontSize: 14, fontWeight: '700' },
    noDeal: { backgroundColor: t.surface2, borderRadius: 18, padding: 12 },
    ruleLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
    seg: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 },
    segOn: { backgroundColor: t.accent },
    segText: { fontSize: 14, fontWeight: '700', color: t.fg },
    segTextOn: { color: t.accentInk },
    soon: { backgroundColor: t.lime, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    soonText: { color: t.limeInk, fontSize: 12, fontWeight: '800' },
    note: { backgroundColor: t.surface2, borderRadius: 14, padding: 12 },
    modalWrap: { flex: 1, backgroundColor: t.bg },
    pickRow: { paddingVertical: 12, paddingHorizontal: 20, borderBottomColor: t.line, borderBottomWidth: 1, gap: 3 },
  });
}

function CardArt({ card, s }) {
  const src = CARD_IMAGES[card.id];
  if (src) return <Image source={src} resizeMode="contain" style={s.cardImg} accessibilityLabel={card.name} />;
  return (
    <View style={[s.cardFallback, { backgroundColor: cardColor(card) }]}>
      <Text style={s.cfIssuer}>{card.issuer}</Text>
      <Text style={s.cfName}>{card.name.replace(/[®™]/g, '')}</Text>
    </View>
  );
}

function Chip({ label, on, onPress, s, sort, small }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, small && s.smallChip, on && (sort ? s.sortOn : s.chipOn)]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
    >
      <Text style={[s.chipText, on && (sort ? s.sortTextOn : s.chipTextOn)]}>{label}</Text>
    </Pressable>
  );
}

function NumberField({ value, onCommit, s, t, width = 90, prefix }) {
  const [text, setText] = useState(String(value == null ? '' : value));
  useEffect(() => { setText(String(value == null ? '' : value)); }, [value]);
  return (
    <View style={s.row}>
      {prefix ? <Text style={s.muted}>{prefix}</Text> : null}
      <TextInput
        style={[s.input, { width, minHeight: 40, paddingVertical: 6 }]}
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const v = parseFloat(text);
          onCommit(isFinite(v) ? v : 0);
        }}
        keyboardType="decimal-pad"
        placeholderTextColor={t.muted}
      />
    </View>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

function RankList({ rows, upside, s, per100 }) {
  if (!rows.length) return null;
  return (
    <View style={s.rank}>
      <Text style={s.label}>Your wallet, ranked</Text>
      {rows.map((r, i) => (
        <View key={r.inst.id} style={s.rankRow}>
          <Text style={s.medal}>{MEDALS[i] || String(i + 1)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontWeight: i === 0 ? '800' : '500' }]}>{r.card.name}</Text>
            <Text style={s.small}>
              {r.e.note}
              {r.e.inactive ? ' · ' + num(r.e.inactive.rate) + '% needs activation' : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.text, { fontWeight: '800' }]}>{pct(r.e.eff)}</Text>
            <Text style={s.small}>
              {per100 ? money(r.e.cash) + ' per $100' : money(r.e.cash)}
              {r.card.type === 'points' ? ' · ' + Math.round(r.e.pts).toLocaleString('en-US') + ' pts' : ''}
            </Text>
          </View>
        </View>
      ))}
      {upside ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            {upside.name} would earn {money(upside.gain)} more here at {pct(upside.eff)} once you activate it. Turn it on in Wallet.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function NearbyTab({ wallet, settings, s, t, dark, onGoWallet }) {
  const [amountText, setAmountText] = useState(String(settings.amount));
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [chip, setChip] = useState('all');
  const [sort, setSort] = useState('distance');
  const [places, setPlaces] = useState({ status: 'loading', items: [], message: '' });
  const [openId, setOpenId] = useState(null);
  const posRef = useRef(null);
  const radiusMeters = Math.round(settings.radius * MILE);
  const radiusLabel = settings.units === 'km' ? Math.round(settings.radius * 1.609) + ' km' : settings.radius + ' miles';

  useEffect(() => { setAmountText(String(settings.amount)); }, [settings.amount]);

  const amount = parseFloat(amountText);
  const per100 = !(amount > 0);
  const amt = per100 ? 100 : amount;

  const run = useCallback(async (chipId, text, fresh) => {
    setPlaces((p) => ({ ...p, status: 'loading', message: '' }));
    try {
      if (fresh || !posRef.current) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setPlaces({ status: 'denied', items: [], message: 'Location is off. Allow it in your phone settings to see places near you.' });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        posRef.current = pos.coords;
      }
      const { latitude, longitude } = posRef.current;
      const items = await loadPlaces({ lat: latitude, lon: longitude, radius: radiusMeters, chip: chipId, query: text });
      setPlaces({ status: 'ready', items, message: items.length ? '' : 'No places found nearby. Try another category or search.' });
    } catch (e) {
      setPlaces({ status: 'error', items: [], message: 'Could not load places: ' + ((e && e.message) || 'unknown error') });
    }
  }, [radiusMeters]);
  useEffect(() => { run(chip, submitted, false); }, [chip, submitted, run]);

  const placeRows = useMemo(() => {
    const rows = places.items.map((p) => ({ p, rows: wallet.length ? rankWallet(wallet, BY_ID, { cat: p.cat, merchant: p.merchant }, amt) : [] }));
    if (sort === 'cash') rows.sort((a, b) => (b.rows[0] ? b.rows[0].e.cash : 0) - (a.rows[0] ? a.rows[0].e.cash : 0) || a.p.dist - b.p.dist);
    return rows;
  }, [places.items, wallet, amt, sort]);

  const manual = !hasGoogleKey() && query.trim() ? classify(query.trim()) : null;
  const manualRows = manual && wallet.length ? rankWallet(wallet, BY_ID, manual, amt) : [];

  return (
    <ScrollView
      contentContainerStyle={s.body}
      refreshControl={<RefreshControl refreshing={places.status === 'loading'} onRefresh={() => run(chip, submitted, true)} tintColor={t.accentText} />}
      keyboardShouldPersistTaps="handled"
    >
      {!wallet.length ? (
        <View style={s.panel}>
          <Text style={s.h2}>Add your cards first 💳</Text>
          <Text style={s.muted}>Pick the cards you carry in Wallet. No card numbers needed.</Text>
          <Pressable style={s.primary} onPress={onGoWallet}><Text style={s.primaryText}>Go to Wallet</Text></Pressable>
        </View>
      ) : null}

      <View style={s.row}>
        <View style={s.amountPill}>
          <Text style={s.amountText}>$</Text>
          <TextInput
            style={s.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount in dollars"
          />
        </View>
        <View style={s.searchBox}>
          <Text>🔎</Text>
          <TextInput
            style={s.searchInput}
            placeholder={hasGoogleKey() ? 'Search Costco, sushi, boba…' : 'Type a store, like Costco Gas'}
            placeholderTextColor={t.muted}
            value={query}
            onChangeText={(v) => { setQuery(v); if (!v.trim() && submitted) setSubmitted(''); }}
            onSubmitEditing={() => hasGoogleKey() && setSubmitted(query.trim())}
            returnKeyType="search"
            autoCapitalize="words"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {CHIPS.map((c) => (
          <Chip key={c.id} label={c.emoji + ' ' + c.label} on={chip === c.id} onPress={() => { setChip(c.id); setQuery(''); setSubmitted(''); }} s={s} />
        ))}
      </ScrollView>

      {manual ? (
        <View style={s.panel}>
          <Text style={s.muted}>
            {manual.known ? CATEGORIES[manual.cat].label + (manual.merchant ? ' · ' + MERCHANTS[manual.merchant] : '') : 'Not recognized, using everything else'}
            {manual.note ? '. ' + manual.note : ''}
          </Text>
          <RankList rows={manualRows} upside={activationUpside(manualRows, manual, amt)} s={s} per100={per100} />
        </View>
      ) : null}

      <View style={s.spread}>
        <Text style={s.section}>{submitted ? 'Results for "' + submitted + '"' : 'Near you'}</Text>
        {places.status === 'loading' ? <ActivityIndicator color={t.accentText} /> : <Text style={s.small}>within {radiusLabel}{hasGoogleKey() ? '' : ' · OpenStreetMap'}</Text>}
      </View>
      <View style={s.row}>
        <Chip small sort label="📍 Nearest" on={sort === 'distance'} onPress={() => setSort('distance')} s={s} />
        <Chip small sort label="💸 Best cash back" on={sort === 'cash'} onPress={() => setSort('cash')} s={s} />
      </View>
      {places.message ? <Text style={s.muted}>{places.message}</Text> : null}

      {placeRows.map(({ p, rows }) => {
        const open = openId === p.id;
        const top = rows[0];
        return (
          <Pressable key={p.id} onPress={() => setOpenId(open ? null : p.id)} style={s.placeCard} accessibilityRole="button" accessibilityState={{ expanded: open }}>
            <View style={s.row}>
              <View style={[s.tile, { backgroundColor: tileColor(p.cat, dark) }]}>
                <Text style={s.tileEmoji}>{p.emoji || CAT_EMOJI[p.cat] || '🛍️'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.placeName}>{p.name}</Text>
                <Text style={s.small}>{CATEGORIES[p.cat].label} · {formatDistance(p.dist, settings.units)}</Text>
              </View>
              {top ? <View style={s.pctPill}><Text style={s.pctText}>{pct(top.e.eff)}</Text></View> : null}
            </View>
            {top ? (
              <View style={s.useBox}>
                <Text>💳</Text>
                <Text style={s.useText}><Text style={{ fontWeight: '800' }}>{top.card.name}</Text> · {top.e.note}</Text>
                <Text style={s.small}>{open ? '▲' : '▼'}</Text>
              </View>
            ) : null}
            {open ? (
              <View style={{ gap: 8 }}>
                {p.note ? <Text style={s.small}>{p.note}</Text> : null}
                <RankList rows={rows} upside={activationUpside(rows, { cat: p.cat, merchant: p.merchant }, amt)} s={s} per100={per100} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Perk chips for a card: "🍕 3x dining", colored by category.
function perkList(card, inst, now, dark) {
  const cpp = card.type === 'points';
  const out = [];
  for (const r of card.rules) {
    if (r.until && now > new Date(r.until + 'T23:59:59')) continue;
    const rate = num(r.rate) + (cpp ? 'x' : '%');
    if (r.rotating) {
      const cats = (card.rotating && card.rotating[quarterKey(now)]) || [];
      out.push({ key: out.length, text: '🔄 ' + rate + ' rotating: ' + (cats.map((c) => CATEGORIES[c].label.toLowerCase()).join(', ') || 'not announced'), bg: tileColor('general', dark) });
    } else if (r.choice) {
      out.push({ key: out.length, text: '⭐ ' + rate + ' your pick', bg: tileColor('general', dark) });
    } else if (r.merchant) {
      out.push({ key: out.length, text: (MERCHANT_EMOJI[r.merchant] || '🏷️') + ' ' + rate + ' ' + MERCHANTS[r.merchant], bg: tileColor('wholesale', dark) });
    } else {
      out.push({ key: out.length, text: (CAT_EMOJI[r.cat] || '🛍️') + ' ' + rate + ' ' + CATEGORIES[r.cat].label.toLowerCase(), bg: tileColor(r.cat, dark) });
    }
  }
  out.push({ key: out.length, text: '🛍️ ' + num(card.base) + (cpp ? 'x' : '%') + ' everything else', bg: tileColor('general', dark) });
  return out;
}

function DealsBox({ card, s }) {
  const now = new Date();
  const deals = activeDeals(card, now);
  if (!deals.length) {
    return (
      <View style={s.noDeal}>
        <Text style={s.small}>🔥 No limited-time deals right now. Checked {catalog.updated}.</Text>
      </View>
    );
  }
  return (
    <View style={s.dealBox}>
      <Text style={s.dealHead}>🔥 Deals right now</Text>
      {deals.map((d, i) => (
        <View key={i} style={s.dealRow}>
          <Text style={s.dealText}>{d.emoji} {d.text}</Text>
          <Text style={s.dealWhen}>{dealWhen(d, now)}</Text>
        </View>
      ))}
    </View>
  );
}

function CardItem({ inst, onChange, onRemove, s, t, dark }) {
  const card = BY_ID[inst.cardId];
  const now = new Date();
  const [confirm, setConfirm] = useState(false);
  const cpp = pointValue(card, inst);
  const needsActivation = card.rules.some((r) => r.activation);
  const perks = perkList(card, inst, now, dark);
  return (
    <View style={s.panel}>
      <CardArt card={card} s={s} />
      <View>
        <Text style={s.h2}>{card.name.replace(/[®™]/g, '')}</Text>
        <Text style={s.small}>{card.issuer} · {card.fee ? '$' + card.fee + ' annual fee' : 'No annual fee'}</Text>
      </View>

      <View style={s.chipsWrap}>
        {perks.map((p) => (
          <View key={p.key} style={[s.perk, { backgroundColor: p.bg }]}>
            <Text style={[s.perkText, { color: t.fg }]}>{p.text}</Text>
          </View>
        ))}
      </View>

      <DealsBox card={card} s={s} />

      {cpp ? (
        <View style={s.spread}>
          <Text style={s.text}>Point value (¢ each)</Text>
          <NumberField value={cpp} onCommit={(v) => v > 0 && onChange({ ...inst, cpp: v })} s={s} t={t} width={80} />
        </View>
      ) : null}

      {needsActivation ? (
        <View style={s.spread}>
          <Text style={s.text}>Activated this quarter</Text>
          <Switch value={!!inst.activated} onValueChange={(v) => onChange({ ...inst, activated: v })} trackColor={{ true: t.accent }} />
        </View>
      ) : null}

      {Object.entries(card.choices || {}).map(([slot, ch]) => (
        <View key={slot} style={{ gap: 6 }}>
          <Text style={s.label}>{ch.label}</Text>
          <View style={s.chipsWrap}>
            {ch.options.map((o) => (
              <Chip
                key={o}
                s={s}
                small
                label={(CAT_EMOJI[o] || '') + ' ' + CATEGORIES[o].label}
                on={((inst.choices && inst.choices[slot]) || ch.default) === o}
                onPress={() => onChange({ ...inst, choices: { ...(inst.choices || {}), [slot]: o } })}
              />
            ))}
          </View>
        </View>
      ))}

      {Object.entries(card.pools || {}).map(([id, pool]) => (
        <View key={id} style={s.spread}>
          <Text style={[s.text, { flex: 1 }]}>
            Spent toward {money0(pool.cap)} {pool.period === 'year' ? 'yearly' : 'quarterly'} cap
          </Text>
          <NumberField
            value={spentFor(inst, id, pool, now)}
            onCommit={(v) => onChange(setSpent(inst, id, pool, v, now))}
            s={s} t={t} width={90} prefix="$"
          />
        </View>
      ))}

      {card.notes ? <Text style={s.small}>{card.notes}</Text> : null}

      <Pressable style={s.ghost} onPress={() => (confirm ? onRemove() : setConfirm(true))}>
        <Text style={s.dangerText}>{confirm ? 'Tap again to remove' : 'Remove card'}</Text>
      </Pressable>
    </View>
  );
}

function Picker({ visible, onClose, onPick, owned, s, t, insets }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.cards
      .filter((c) => !owned.has(c.id))
      .filter((c) => !term || (c.name + ' ' + c.issuer).toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, owned]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.modalWrap, { paddingTop: insets.top + 8 }]}>
        <View style={[s.spread, { paddingHorizontal: 20, paddingBottom: 8 }]}>
          <Text style={s.title}>Add a card ➕</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={s.dangerText}>Close</Text></Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <TextInput style={s.input} placeholder="Search cards or issuers" placeholderTextColor={t.muted} value={q} onChangeText={setQ} autoCorrect={false} />
          <Text style={[s.small, { marginTop: 6 }]}>{list.length} cards. Only the card type is saved, never a number. 🔒</Text>
        </View>
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable style={s.pickRow} onPress={() => { onPick(item); setQ(''); }}>
              <Text style={[s.text, { fontWeight: '800' }]}>{item.name}</Text>
              <Text style={s.small}>{item.issuer} · {item.fee ? '$' + item.fee + ' fee' : 'No annual fee'}</Text>
              <Text style={s.small}>{highlights(item)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={[s.muted, { padding: 20 }]}>No cards match.</Text>}
        />
      </View>
    </Modal>
  );
}

function WalletTab({ wallet, setWallet, s, t, dark, insets }) {
  const [picking, setPicking] = useState(false);
  const owned = useMemo(() => new Set(wallet.map((w) => w.cardId)), [wallet]);
  const update = (next) => setWallet((w) => w.map((x) => (x.id === next.id ? next : x)));
  return (
    <>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {!wallet.length ? <Text style={s.muted}>No cards yet. Choose the cards you carry from the list.</Text> : null}
        {wallet.map((inst) => (
          <CardItem key={inst.id} inst={inst} onChange={update} onRemove={() => setWallet((w) => w.filter((x) => x.id !== inst.id))} s={s} t={t} dark={dark} />
        ))}
        <Pressable style={s.addCard} onPress={() => setPicking(true)} accessibilityRole="button">
          <Text style={s.addCardText}>➕ Add a card</Text>
        </Pressable>
        <Text style={s.small}>{catalog.note} Catalog updated {catalog.updated}.</Text>
      </ScrollView>
      <Picker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(card) => { setWallet((w) => [...w, newInstance(card)]); setPicking(false); }}
        owned={owned} s={s} t={t} insets={insets}
      />
    </>
  );
}

function Segmented({ options, value, onPick, s }) {
  return (
    <View style={s.row}>
      {options.map((o) => (
        <Pressable
          key={String(o.id)}
          style={[s.seg, value === o.id && s.segOn]}
          onPress={() => onPick(o.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.id }}
        >
          <Text style={[s.segText, value === o.id && s.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Soon({ label, s }) {
  return (
    <View style={s.spread}>
      <Text style={[s.text, { fontWeight: '700', flex: 1 }]}>{label}</Text>
      <View style={s.soon}><Text style={s.soonText}>Soon</Text></View>
    </View>
  );
}

function SettingsTab({ settings, setSettings, wallet, setWallet, s, t }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (patch) => setSettings((p) => ({ ...p, ...patch }));
  const km = settings.units === 'km';
  const radiusOptions = [1, 2, 5].map((r) => ({ id: r, label: km ? Math.round(r * 1.609) + ' km' : r + ' mi' }));
  const themeNote =
    settings.theme === 'system' ? 'Follows your phone, so it switches when your phone does.'
    : settings.theme === 'dark' ? 'Easy on the eyes at night.' : 'Bright and bold, always.';
  const toggles = [
    ['deals', '🔥', 'New deals', 'Ping me when one of my cards gets a new offer'],
    ['activate', '⏰', 'Activation reminders', 'Rotating 5% categories need a tap each quarter'],
    ['expiring', '⌛', 'Offers ending soon', 'A heads-up a week before a deal expires'],
  ];
  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={s.panel}>
        <Text style={s.h2}>🎨 Appearance</Text>
        <Segmented
          s={s}
          value={settings.theme}
          onPick={(v) => set({ theme: v })}
          options={[{ id: 'light', label: '☀️ Light' }, { id: 'dark', label: '🌙 Dark' }, { id: 'system', label: '📱 System' }]}
        />
        <Text style={s.small}>{themeNote}</Text>
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>📍 Nearby</Text>
        <Text style={[s.text, { fontWeight: '700' }]}>Search radius</Text>
        <Segmented s={s} value={settings.radius} onPick={(v) => set({ radius: v })} options={radiusOptions} />
        <Text style={[s.text, { fontWeight: '700' }]}>Distance units</Text>
        <Segmented s={s} value={settings.units} onPick={(v) => set({ units: v })} options={[{ id: 'mi', label: 'Miles' }, { id: 'km', label: 'Kilometers' }]} />
        <View style={s.spread}>
          <Text style={[s.text, { fontWeight: '700' }]}>Default amount</Text>
          <View style={s.amountPill}>
            <Text style={s.amountText}>$</Text>
            <NumberFieldPlain value={settings.amount} onCommit={(v) => set({ amount: v > 0 ? v : 50 })} s={s} />
          </View>
        </View>
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>🔔 Alerts</Text>
        {toggles.map(([key, emoji, label, desc]) => (
          <View key={key} style={s.row}>
            <Text style={{ fontSize: 24, width: 32, textAlign: 'center' }}>{emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{label}</Text>
              <Text style={s.small}>{desc}</Text>
            </View>
            <Switch
              value={!!settings.alerts[key]}
              onValueChange={(v) => set({ alerts: { ...settings.alerts, [key]: v } })}
              trackColor={{ true: t.accent }}
              accessibilityLabel={label}
            />
          </View>
        ))}
        <Text style={s.small}>Your choices are saved now. Alerts start arriving at launch.</Text>
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>💳 Cards & deals</Text>
        <View style={s.spread}><Text style={[s.text, { fontWeight: '700' }]}>Card deals updated</Text><Text style={s.muted}>{catalog.updated}</Text></View>
        <View style={s.spread}><Text style={[s.text, { fontWeight: '700' }]}>Checked</Text><Text style={s.muted}>Every day</Text></View>
        <View style={s.spread}><Text style={[s.text, { fontWeight: '700' }]}>Point value</Text><Text style={s.muted}>Set per card in Wallet</Text></View>
        <Pressable
          style={s.dangerBtn}
          onPress={() => { if (confirmReset) { setWallet([]); setConfirmReset(false); } else setConfirmReset(true); }}
          accessibilityRole="button"
        >
          <Text style={s.dangerText}>{confirmReset ? 'Tap again to remove all ' + wallet.length + ' cards' : '🗑️ Reset my wallet'}</Text>
        </Pressable>
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>🔒 Privacy</Text>
        <View style={s.note}><Text style={s.text}>No card numbers, expiry dates or security codes are ever asked for or stored.</Text></View>
        <View style={s.spread}><Text style={[s.text, { fontWeight: '700' }]}>Location</Text><Text style={s.muted}>Change in your phone settings</Text></View>
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>🚀 Coming at launch</Text>
        <Soon s={s} label="👤 Account & sync across devices" />
        <Soon s={s} label="⭐ Best Tap Plus" />
        <Soon s={s} label="💬 Send feedback" />
        <Soon s={s} label="📄 Privacy policy & terms" />
      </View>

      <Text style={[s.small, { textAlign: 'center' }]}>Best Tap pilot · v0.1 · Made with 💜</Text>
    </ScrollView>
  );
}

function NumberFieldPlain({ value, onCommit, s }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <TextInput
      style={s.amountInput}
      value={text}
      onChangeText={setText}
      onEndEditing={() => { const v = parseFloat(text); onCommit(isFinite(v) ? v : 0); }}
      keyboardType="decimal-pad"
      accessibilityLabel="Default amount in dollars"
    />
  );
}

const TAB_TITLES = {
  nearby: ['Best Tap 👆', 'Right card. Every tap. 💳'],
  wallet: ['Your wallet 👛', null],
  settings: ['Settings ⚙️', 'Make it yours ✨'],
};

function Root() {
  const scheme = useColorScheme();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && scheme === 'dark');
  const t = dark ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('nearby');
  const [wallet, setWallet] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(SETTINGS_KEY)])
      .then(([rawWallet, rawSettings]) => {
        if (rawWallet) {
          const parsed = JSON.parse(rawWallet);
          if (Array.isArray(parsed)) setWallet(parsed.filter((w) => BY_ID[w.cardId]));
        }
        if (rawSettings) {
          const saved = JSON.parse(rawSettings);
          if (saved && typeof saved === 'object') setSettings({ ...DEFAULT_SETTINGS, ...saved, alerts: { ...DEFAULT_SETTINGS.alerts, ...(saved.alerts || {}) } });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)).catch(() => {});
  }, [wallet, loaded]);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  if (!loaded) return <View style={s.root} />;

  const [title, sub] = TAB_TITLES[tab];
  const subtitle = tab === 'wallet' ? wallet.length + (wallet.length === 1 ? ' card' : ' cards') + ' · no numbers stored, ever 🔒' : sub;
  const tabs = [
    ['nearby', '🔎 Nearby'],
    ['wallet', '👛 Wallet'],
    ['settings', '⚙️ Settings'],
  ];

  return (
    <View style={s.root}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'nearby' ? (
          <NearbyTab wallet={wallet} settings={settings} s={s} t={t} dark={dark} onGoWallet={() => setTab('wallet')} />
        ) : tab === 'wallet' ? (
          <WalletTab wallet={wallet} setWallet={setWallet} s={s} t={t} dark={dark} insets={{ bottom: 0, top: insets.top }} />
        ) : (
          <SettingsTab settings={settings} setSettings={setSettings} wallet={wallet} setWallet={setWallet} s={s} t={t} />
        )}
      </View>
      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {tabs.map(([id, label]) => (
          <Pressable key={id} style={[s.tab, tab === id && s.tabOn]} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={[s.tabText, tab === id && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
