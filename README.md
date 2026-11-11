# Best Tap

A pilot mobile app that tells you which of your credit cards to use at the place you're standing in.

- **Wallet:** pick the cards you carry from a searchable list of 37 cards. No card number, expiry or security code is ever asked for or stored.
- **Nearby:** uses your phone's GPS to find named stores within 400 m (OpenStreetMap, no API key), maps each to a spending category or merchant, and shows the best card for each with the cash back on your amount.
- **Rules it understands:** category and merchant bonuses, rotating quarterly categories with activation, choose-your-own categories, shared quarterly and annual caps, expiring bonuses, and points valued in cents.

## Install it on your phone

### Fastest: Expo Go (free, about 10 minutes)

1. On your computer, install Node 20+. On your phone, install **Expo Go** from the App Store or Google Play.
2. Build the project and start it:

```bash
npx create-expo-app@latest best-tap --template blank
cd best-tap
# copy App.js, src/ and tests/ from this repo over the generated files
npx expo install expo-location @react-native-async-storage/async-storage react-native-safe-area-context expo-status-bar
npx expo start
```

3. Open the QR code in the terminal: on Android, scan it from inside Expo Go; on iPhone, scan it with the Camera app.
4. Your phone and computer must be on the same Wi-Fi. If it will not connect, run `npx expo start --tunnel`.
5. On iPhone, run `npx expo login` and sign in to Expo Go with the same Expo account.
6. Allow location when asked.

Expo Go only runs while your computer is serving the app. For an app that stays on your phone, use a build below.

### Permanent install with EAS Build

```bash
npm install -g eas-cli
eas login
eas build:configure
```

- **Android:** copy `eas.json` from this repo, then `eas build -p android --profile preview`. It produces an APK you download and install on the phone.
- **iPhone:** `eas build -p ios --profile preview` makes an ad hoc build for registered devices. Apple requires a paid Apple Developer Program membership ($99/year) for this and for TestFlight.

Add this to `app.json` so the location prompt has a message:

```json
"plugins": [["expo-location", { "locationWhenInUsePermission": "Best Tap uses your location to find stores near you and suggest the best card to use." }]]
```

## Tests

```bash
npx tsx tests/engine.test.mjs
```

Checks every card in the catalog against the engine's vocabulary, then the ranking (shared gas cap, rotating quarters, activation, choice categories, expiry) and place detection.

## Layout

| Path | What it is |
| --- | --- |
| `App.js` | The two screens (Nearby, Wallet) and the card picker |
| `src/catalog.json` | The card catalog: rates, caps, fees, notes and sources, with a last-checked date |
| `src/engine.js` | Ranking logic, no device dependencies |
| `src/places.js` | OpenStreetMap lookup and merchant/category detection |
| `tests/engine.test.mjs` | Catalog validation and ranking tests |

## Keeping the catalog current

- **Rotating categories** live in each card's `rotating` table, keyed like `2026Q4`. After Dec 31, 2026 the rotating cards fall back to their base rate until a `2027Q1` entry is added.
- **Choice categories** (Bank of America) are picked by the user in the Wallet tab.
- **Point values** default to 1 cent. Airline and hotel cards use the estimate their source gave. Users can change the value per card.
- Every card lists its `src` keys, which point to the pages in `sources`.

## Known limits

- **Last checked: 2026-11-11.** Rates for Chase Sapphire Preferred, Freedom Flex and Unlimited, Bank of America Customized Cash, Costco Anywhere Visa, Citi Double Cash, Blue Cash Preferred and Everyday were confirmed on the issuers' own pages (cards with a `verified` list in `catalog.json`). Capital One, Wells Fargo, Amex Gold and Platinum, and the store and co-brand cards were not confirmed on issuer pages and rest on review sites and Credit Karma.
- Discover and Chase did not show their Q4 2026 rotating category lists when checked, so those come from earlier sources. Confirm in your account.
- Terms change often, so confirm with the issuer before relying on a rate.
- The public Overpass server is fine for a pilot but rate limited. A production app would use a places API.
- Merchant detection uses name patterns and OpenStreetMap tags, so some stores will land in the wrong category. Users can type a store to compare.
- Cards that depend on a bank relationship or membership level (for example 2% cards that need a checking account) are not in the catalog yet.
