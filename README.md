# DocAssistant

An offline-first Android document utility: scan, convert, sign and compress PDFs
without an account, without a network call, and without ads.

It runs **entirely inside Expo Go** — no `expo prebuild`, no custom dev client,
no native modules beyond what Expo Go already ships. Every PDF operation is
plain JavaScript (`pdf-lib`, `mammoth`) or an Expo module (`expo-print`,
`expo-image-manipulator`, `react-native-svg`).

## Quick start

```bash
npm install
npm start          # then scan the QR code with Expo Go on Android
```

Useful checks:

```bash
npm run typecheck   # tsc --noEmit — currently clean
npm run fix-deps    # expo install --fix, if a dependency drifts off SDK 57
```

Verified on this codebase: `expo install --check` reports **dependencies are up
to date** for SDK 57, and `expo export --platform android` produces a working
Hermes bundle.

## What each tool actually does

| Tool | Engine | Notes |
| --- | --- | --- |
| Scan / Images to PDF | `expo-camera` + `expo-image-manipulator` + `pdf-lib` | Every shot and every imported photo is offered a crop on arrival; filters are baked with a `react-native-svg` colour matrix, so the export matches the preview exactly |
| Word to PDF | `mammoth` → HTML → `expo-print` | `.docx` only; the Android WebView is the renderer |
| Sign | SVG drawing → transparent PNG → `pdf-lib` `drawImage` | Placement is normalised 0..1 per page, y-flipped into PDF space |
| Compress | `pdf-lib` | Re-encodes source images for PDFs made here; structural re-pack for imported files |

## Layout

```
src/
  assets/          static art (see its README — nothing required in V1)
  components/
    ads/           AdContainer, BannerPlaceholder, withAdInterstitial
    common/        Button, Card, Badge, Header, ProgressBar, BottomActionBar, ResultSheet
    scanner/       PageThumbnail, FilterToggle, FilterCanvas, CropOverlay, imageFilters
    signature/     SignaturePad, DraggableSignature, SignatureCaptureModal
  constants/       theme.ts (Stitch tokens), config.ts (feature flags)
  hooks/           useAdManager, useDocumentProcessor
  navigation/      AppNavigator.tsx
  screens/         Home, Scanner, ImgToPdf, WordToPdf, Sign, Compress
  services/        pdfService.ts (engine), storageService.ts, adService.ts
  polyfills.ts     Buffer / process shims, imported first from index.js
```

### Stitch design → screen

| Stitch screen | Implementation |
| --- | --- |
| 1 · Dashboard / Home Hub | `screens/HomeScreen.tsx` |
| 2 · Scanner & Image-to-PDF Studio | `screens/ScannerScreen.tsx` (capture) + `screens/ImgToPdfScreen.tsx` (studio) |
| 3 · Word-to-PDF Converter | `screens/WordToPdfScreen.tsx` |
| 4 · Document Signer Canvas | `screens/SignScreen.tsx` |
| 5 · PDF Compressor | `screens/CompressScreen.tsx` |

Design tokens, palettes and type scale are recorded in [`DESIGN.md`](./DESIGN.md)
and implemented verbatim in `src/constants/theme.ts`.

## Ads: wired, and off

V1 ships **zero ads**. The architecture is in place so V2 is a config change,
not a refactor:

```ts
// src/constants/config.ts
export const APP_CONFIG = { ADS_ENABLED: false, AD_PROVIDER: 'admob' };
```

While `ADS_ENABLED` is `false`:

- `AdContainer` renders `null` — no wrapper view, no reserved height, no layout shift.
- `adService.showInterstitialIfReady()` resolves immediately, with no artificial delay.
- Every tool already routes its completion through that call, so pacing works the
  day it is switched on.

To enable ads in V2: flip the flag, fill in `AD_UNITS`, and implement the two
`TODO(v2)` bodies in `src/services/adService.ts`. Note that AdMob itself needs a
custom dev build — it does not run in Expo Go — so enabling ads is the point at
which this project leaves the Expo Go constraint behind.

## Known limits of the Expo Go constraint

These are real and deliberate, not bugs:

1. **Compressing imported PDFs saves little.** `pdf-lib` cannot decode the JPEG
   streams inside a PDF it did not create, and Expo Go has no JPEG decoder to
   lend it. Files produced in this app keep their source images, so they
   genuinely shrink; imported ones only get a structural re-pack.
2. **No PDF rasteriser.** The signing canvas draws each page to scale from the
   PDF's own MediaBox, backed by the real page image when this app generated the
   file. Placement coordinates are normalised, so the signature lands exactly
   where you put it either way. `pdf.js` in a WebView is the upgrade path.
3. **`.docx` conversion is HTML-faithful, not Word-exact.** Headings, lists,
   tables, images and links carry over; page-exact layout and exotic fonts are
   approximated.
4. **Fonts are the Android system stack.** The Stitch design specifies Plus
   Jakarta Sans and Inter; bundling them would add an `expo-font` loading gate
   for no functional gain, so the sizes, weights and line heights are preserved
   while the families map to `sans-serif`.
