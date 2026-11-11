import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { classify, findNearby, formatDistance } from './src/places';

const STORAGE_KEY = 'besttap.wallet.v1';
const RADIUS_METERS = 400;
const BY_ID = Object.fromEntries(catalog.cards.map((c) => [c.id, c]));
const ISSUER_HUE = {
  Chase: 220, Citi: 205, 'American Express': 185, 'Capital One': 355, Discover: 28,
  'Wells Fargo': 8, 'Bank of America': 345, Synchrony: 150, Target: 0, Verizon: 350,
  'T-Mobile': 320, "Lowe's": 215, OnePay: 260, Fidelity: 140, 'Goldman Sachs': 0,
  'Bread Financial': 175,
};
const hueOf = (card) => (ISSUER_HUE[card.issuer] != null ? ISSUER_HUE[card.issuer] : 200);
const cardColor = (card) => 'hsl(' + hueOf(card) + ', 52%, 32%)';

const LIGHT = {
  bg: '#EDF0F2', surface: '#FFFFFF', surface2: '#E3E8EB', fg: '#10202A', muted: '#566872',
  line: '#CAD3D9', accent: '#0B7A66', accentInk: '#FFFFFF', accentSoft: '#D6EFE8',
  warn: '#7D4A00', warnSoft: '#FBEBCB', bad: '#B3261E',
};
const DARK = {
  bg: '#0C171C', surface: '#13232A', surface2: '#1B2F38', fg: '#E6EEF1', muted: '#8FA4AF',
  line: '#27404B', accent: '#4FD1B0', accentInk: '#06231C', accentSoft: '#12372F',
  warn: '#F0B95A', warnSoft: '#3A2B0E', bad: '#FF8A80',
};

function makeStyles(t) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingBottom: 8 },
    title: { fontSize: 28, fontWeight: '800', color: t.fg, letterSpacing: -0.5 },
    sub: { fontSize: 13, color: t.muted, marginTop: 2 },
    body: { padding: 16, gap: 12, paddingBottom: 40 },
    panel: { backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: t.muted },
    input: { backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: t.fg },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    h2: { fontSize: 17, fontWeight: '700', color: t.fg },
    text: { fontSize: 15, color: t.fg },
    muted: { fontSize: 13, color: t.muted },
    big: { fontSize: 22, fontWeight: '800', color: t.accent },
    swatch: { width: 34, height: 22, borderRadius: 5 },
    placeRow: { backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    placeRowOpen: { borderColor: t.accent },
    bestLine: { fontSize: 14, color: t.fg },
    rank: { gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: t.line },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    banner: { backgroundColor: t.warnSoft, borderRadius: 10, padding: 10 },
    bannerText: { color: t.warn, fontSize: 13 },
    primary: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
    primaryText: { color: t.accentInk, fontWeight: '700', fontSize: 15 },
    ghost: { borderColor: t.line, borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center' },
    ghostText: { color: t.fg, fontWeight: '600', fontSize: 14 },
    dangerText: { color: t.bad, fontWeight: '600', fontSize: 14 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderColor: t.line, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: t.surface },
    chipOn: { backgroundColor: t.accent, borderColor: t.accent },
    chipText: { fontSize: 13, color: t.fg },
    chipTextOn: { color: t.accentInk, fontWeight: '600' },
    tabBar: { flexDirection: 'row', backgroundColor: t.surface, borderTopColor: t.line, borderTopWidth: 1 },
    tab: { flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 10 },
    tabText: { fontSize: 14, fontWeight: '600', color: t.muted },
    tabTextOn: { color: t.accent },
    plastic: { width: 124, aspectRatio: 1.586, borderRadius: 10, padding: 9, justifyContent: 'space-between' },
    plasticName: { color: '#fff', fontWeight: '700', fontSize: 11.5, lineHeight: 14 },
    plasticChip: { width: 22, height: 16, borderRadius: 3, backgroundColor: '#d9c58a' },
    ruleLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
    small: { fontSize: 12.5, color: t.muted },
    modalWrap: { flex: 1, backgroundColor: t.bg },
    pickRow: { paddingVertical: 12, paddingHorizontal: 16, borderBottomColor: t.line, borderBottomWidth: 1, gap: 3 },
  });
}

function Plastic({ card, s }) {
  return (
    <View style={[s.plastic, { backgroundColor: cardColor(card) }]}>
      <View style={s.plasticChip} />
      <Text style={s.plasticName} numberOfLines={3}>{card.name}</Text>
    </View>
  );
}

function Chip({ label, on, onPress, s }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
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
        style={[s.input, { width, paddingVertical: 6 }]}
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

function RankList({ rows, upside, s, per100 }) {
  if (!rows.length) return null;
  return (
    <View style={s.rank}>
      {rows.map((r, i) => (
        <View key={r.inst.id} style={s.rankRow}>
          <View style={[s.swatch, { backgroundColor: cardColor(r.card) }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontWeight: i === 0 ? '700' : '500' }]}>{r.card.name}</Text>
            <Text style={s.small}>
              {r.e.note}
              {r.e.inactive ? ' · ' + num(r.e.inactive.rate) + '% needs activation' : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.text, { fontWeight: '700' }]}>{pct(r.e.eff)}</Text>
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

function NearbyTab({ wallet, s, t, insets, onGoWallet }) {
  const [amountText, setAmountText] = useState('50');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState({ status: 'loading', items: [], message: '' });
  const [openId, setOpenId] = useState(null);

  const amount = parseFloat(amountText);
  const per100 = !(amount > 0);
  const amt = per100 ? 100 : amount;

  const load = useCallback(async () => {
    setPlaces((p) => ({ ...p, status: 'loading', message: '' }));
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setPlaces({ status: 'denied', items: [], message: 'Location is off. Allow it in Settings, or type a store below.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const items = await findNearby(pos.coords.latitude, pos.coords.longitude, RADIUS_METERS);
      setPlaces({ status: 'ready', items, message: items.length ? '' : 'No named stores within ' + RADIUS_METERS + ' m. Pull down to retry or type a store.' });
    } catch (e) {
      setPlaces({ status: 'error', items: [], message: 'Could not load nearby places. Pull down to retry, or type a store below.' });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const manual = query.trim() ? classify(query.trim()) : null;
  const manualRows = manual && wallet.length ? rankWallet(wallet, BY_ID, manual, amt) : [];
  const placeRows = useMemo(
    () => places.items.map((p) => ({ p, rows: wallet.length ? rankWallet(wallet, BY_ID, { cat: p.cat, merchant: p.merchant }, amt) : [] })),
    [places.items, wallet, amt]
  );

  return (
    <ScrollView
      contentContainerStyle={s.body}
      refreshControl={<RefreshControl refreshing={places.status === 'loading'} onRefresh={load} tintColor={t.accent} />}
      keyboardShouldPersistTaps="handled"
    >
      {!wallet.length ? (
        <View style={s.panel}>
          <Text style={s.h2}>Add your cards first</Text>
          <Text style={s.muted}>Pick the cards you carry in Wallet. No card numbers needed.</Text>
          <Pressable style={s.primary} onPress={onGoWallet}><Text style={s.primaryText}>Go to Wallet</Text></Pressable>
        </View>
      ) : null}

      <View style={s.panel}>
        <View style={s.spread}>
          <Text style={s.label}>Amount</Text>
          <NumberField value={amountText} onCommit={(v) => setAmountText(String(v))} s={s} t={t} width={100} prefix="$" />
        </View>
        <TextInput
          style={s.input}
          placeholder="Or type a store, like Costco Gas"
          placeholderTextColor={t.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
        />
        {manual ? (
          <View>
            <Text style={s.muted}>
              {manual.known ? CATEGORIES[manual.cat].label + (manual.merchant ? ' · ' + MERCHANTS[manual.merchant] : '') : 'Not recognized, using everything else'}
              {manual.note ? '. ' + manual.note : ''}
            </Text>
            <RankList rows={manualRows} upside={activationUpside(manualRows, manual, amt)} s={s} per100={per100} />
          </View>
        ) : null}
      </View>

      <View style={s.spread}>
        <Text style={s.label}>Near you</Text>
        {places.status === 'loading' ? <ActivityIndicator color={t.accent} /> : <Text style={s.small}>within {RADIUS_METERS} m</Text>}
      </View>
      {places.message ? <Text style={s.muted}>{places.message}</Text> : null}

      {placeRows.map(({ p, rows }) => {
        const open = openId === p.id;
        const top = rows[0];
        return (
          <Pressable key={p.id} onPress={() => setOpenId(open ? null : p.id)} style={[s.placeRow, open && s.placeRowOpen]}>
            <View style={s.spread}>
              <View style={{ flex: 1 }}>
                <Text style={[s.text, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={s.small}>
                  {CATEGORIES[p.cat].label} · {formatDistance(p.dist)}
                </Text>
              </View>
              {top ? <Text style={s.big}>{pct(top.e.eff)}</Text> : null}
            </View>
            {top ? (
              <Text style={s.bestLine}>
                Use <Text style={{ fontWeight: '700' }}>{top.card.name}</Text> · {top.e.note}
              </Text>
            ) : null}
            {open ? (
              <View>
                {p.note ? <Text style={s.small}>{p.note}</Text> : null}
                <RankList rows={rows} upside={activationUpside(rows, { cat: p.cat, merchant: p.merchant }, amt)} s={s} per100={per100} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <View style={{ height: insets.bottom }} />
    </ScrollView>
  );
}

function CardItem({ inst, onChange, onRemove, s, t }) {
  const card = BY_ID[inst.cardId];
  const now = new Date();
  const [confirm, setConfirm] = useState(false);
  const cpp = pointValue(card, inst);
  const needsActivation = card.rules.some((r) => r.activation);
  const lines = card.rules
    .filter((r) => !(r.until && now > new Date(r.until + 'T23:59:59')))
    .map((r, i) => {
      let label;
      if (r.rotating) {
        const cats = (card.rotating && card.rotating[quarterKey(now)]) || [];
        label = 'Rotating: ' + (cats.map((c) => CATEGORIES[c].label.toLowerCase()).join(', ') || 'not announced');
      } else {
        label = ruleLabel(card, inst, r, { cat: 'general' });
      }
      return { key: i, label, rate: cpp ? num(r.rate) + 'x' : num(r.rate) + '%', value: cpp ? pct(r.rate * cpp) : '' };
    });
  return (
    <View style={s.panel}>
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <Plastic card={card} s={s} />
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>{card.name}</Text>
          <Text style={s.small}>{card.issuer} · {card.fee ? '$' + card.fee + ' annual fee' : 'No annual fee'}</Text>
        </View>
      </View>

      <View>
        {lines.map((l) => (
          <View key={l.key} style={s.ruleLine}>
            <Text style={[s.text, { flex: 1 }]}>{l.label}</Text>
            <Text style={[s.text, { fontWeight: '700' }]}>{l.rate}{l.value ? '  ' + l.value : ''}</Text>
          </View>
        ))}
        <View style={s.ruleLine}>
          <Text style={[s.text, { flex: 1 }]}>Everything else</Text>
          <Text style={[s.text, { fontWeight: '700' }]}>{cpp ? num(card.base) + 'x  ' + pct(card.base * cpp) : num(card.base) + '%'}</Text>
        </View>
      </View>

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
          <View style={s.chips}>
            {ch.options.map((o) => (
              <Chip
                key={o}
                s={s}
                label={CATEGORIES[o].label}
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
        <View style={[s.spread, { paddingHorizontal: 16, paddingBottom: 8 }]}>
          <Text style={s.title}>Add a card</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={s.dangerText}>Close</Text></Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TextInput style={s.input} placeholder="Search cards or issuers" placeholderTextColor={t.muted} value={q} onChangeText={setQ} autoCorrect={false} />
          <Text style={[s.small, { marginTop: 6 }]}>{list.length} cards. Only the card type is saved, never a number.</Text>
        </View>
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable style={s.pickRow} onPress={() => { onPick(item); setQ(''); }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{item.name}</Text>
              <Text style={s.small}>{item.issuer} · {item.fee ? '$' + item.fee + ' fee' : 'No annual fee'}</Text>
              <Text style={s.small}>{highlights(item)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={[s.muted, { padding: 16 }]}>No cards match.</Text>}
        />
      </View>
    </Modal>
  );
}

function WalletTab({ wallet, setWallet, s, t, insets }) {
  const [picking, setPicking] = useState(false);
  const owned = useMemo(() => new Set(wallet.map((w) => w.cardId)), [wallet]);
  const update = (next) => setWallet((w) => w.map((x) => (x.id === next.id ? next : x)));
  return (
    <>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Pressable style={s.primary} onPress={() => setPicking(true)}>
          <Text style={s.primaryText}>Add a card</Text>
        </Pressable>
        {!wallet.length ? <Text style={s.muted}>No cards yet. Choose the cards you carry from the list.</Text> : null}
        {wallet.map((inst) => (
          <CardItem key={inst.id} inst={inst} onChange={update} onRemove={() => setWallet((w) => w.filter((x) => x.id !== inst.id))} s={s} t={t} />
        ))}
        <Text style={s.small}>{catalog.note} Catalog updated {catalog.updated}.</Text>
        <View style={{ height: insets.bottom }} />
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

function Root() {
  const scheme = useColorScheme();
  const t = scheme === 'dark' ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('nearby');
  const [wallet, setWallet] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setWallet(parsed.filter((w) => BY_ID[w.cardId]));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(wallet)).catch(() => {});
  }, [wallet, loaded]);

  return (
    <View style={s.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Best Tap</Text>
        <Text style={s.sub}>{tab === 'nearby' ? 'The best card for where you are' : 'Cards you carry'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'nearby' ? (
          <NearbyTab wallet={wallet} s={s} t={t} insets={{ bottom: 0 }} onGoWallet={() => setTab('wallet')} />
        ) : (
          <WalletTab wallet={wallet} setWallet={setWallet} s={s} t={t} insets={{ bottom: 0, top: insets.top }} />
        )}
      </View>
      <View style={[s.tabBar, { paddingBottom: insets.bottom }]}>
        <Pressable style={s.tab} onPress={() => setTab('nearby')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'nearby' }}>
          <Text style={[s.tabText, tab === 'nearby' && s.tabTextOn]}>Nearby</Text>
        </Pressable>
        <Pressable style={s.tab} onPress={() => setTab('wallet')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'wallet' }}>
          <Text style={[s.tabText, tab === 'wallet' && s.tabTextOn]}>Wallet{wallet.length ? ' (' + wallet.length + ')' : ''}</Text>
        </Pressable>
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
