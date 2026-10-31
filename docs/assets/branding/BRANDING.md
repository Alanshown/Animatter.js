# Animatter.js brand

Motion · Matter · Interaction · Life.

The original **elastic A** joins a geometric stance, two contact nodes and a curved crossbar. The coral apex represents a visible actor; the continuous teal curve represents its shared, invisible field. Neither mode has a separate logo. Lettering is original geometric path work, not a font or a stock mark. No remote assets, embedded raster images or external fonts are used.

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#142c32` | Light-background lettering, banner ground |
| Field | `#087f83` | Light-background symbol |
| Field light | `#70d1c7` | Dark-background symbol |
| Motion | `#ec6842` | Apex / active matter |
| Paper | `#edf4ef` | Dark-background lettering |

`logo-light.svg` means **for a light background**, with ink lettering. `logo-dark.svg` means **for a dark background**, with paper lettering. `logo.svg` is the light-background default. README uses a GitHub theme-aware `<picture>` with a light fallback. `wordmark.svg` is lettering only; `symbol.svg` is the compact mark; `banner.svg` is the 1280 × 400 project card. PNG icons are transparent exports of the symbol at the stated size.

Keep the 64-unit symbol square intact, including its built-in margin. Leave at least 8 units outside the symbol and 16 units around a full logo. Minimum symbol size is 24 CSS pixels; use 32 or 64 where space permits. Never stretch, add gradients/shadows, separate the apex, or recolor only one contact node. At 24 pixels the crossbar and contact nodes intentionally merge into one elastic stroke. Use the dark variant against dark surfaces; do not put the default teal symbol on an equally dark background.

Demos retain their own colors and scene art. A small 20-pixel symbol in the shared, neutral controls and the common favicon provide attribution without changing scene layouts. The toolbar mark is decorative beside the visible ANIMATTER label.

All vector shapes and lettering were authored for this repository. Covered by the repository MIT license; no third-party font/license dependency. This is a design provenance statement, not a trademark clearance claim. Reference the framework honestly; do not imply endorsement of a derivative project.

Validation: `npm run verify:branding` parses SVGs in Chromium, renders symbols at 24/32/64 pixels on light/dark surfaces, and checks transparent 192/512 PNG dimensions. Human visual review accompanies the automated structural checks. No AI-generated image is used as a logo or demo screenshot.
