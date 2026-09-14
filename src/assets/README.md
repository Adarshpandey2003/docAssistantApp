# src/assets

Static art that ships inside the JS bundle: illustrations, empty-state graphics,
and any custom icon PNG/SVG that is not covered by `@expo/vector-icons`.

No in-app art is required today — every icon in V1 comes from
`@expo/vector-icons/MaterialCommunityIcons`, and every colour, radius and type
step comes from `src/constants/theme.ts`. Drop files in here and import them by
relative path (`import logo from '../assets/logo.png'`) when you need art that
tokens cannot express.

## Launcher icons

| File | Used as | Notes |
| --- | --- | --- |
| `icon.png` | `expo.icon` | 1024×1024, opaque, full bleed |
| `adaptive-icon.png` | `expo.android.adaptiveIcon.foregroundImage` | Same artwork, composition pulled into the central 512 px circle so Android's circle/squircle mask cannot clip it |

Both were generated in Google Stitch from the project's design system, so they
use the same `#3B6EF0 → #1353D6` primary gradient and `#00A98F` accent as the
screens. The vector sources are in `design/app-icon.svg` and
`design/app-icon-adaptive-foreground.svg` — edit those and re-export if the
artwork needs to change. There is no splash image: `app.json` gives the splash a
flat `#F8F9FB`.

Keep anything added here small: the whole point of DocAssistant is an install
that stays light, and bundled art is paid for on every device.
