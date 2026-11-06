# Claude typography

Checked against https://claude.com/ and https://www.anthropic.com/ on 7 November 2026.
Both sites currently declare `anthropicSans`, `anthropicSerif`, and `anthropicMono`.
Source stylesheet: https://claude.com/_next/static/chunks/98bcbf1381ffeee3.css.

`anthropic-font-discovery.json` records the discovered font-face rules.
`anthropic-fonts.json` records the three downloaded Roman font URLs, hashes,
file sizes, variable axes, and Cyrillic coverage checks.
The original files are stored in `public/fonts/anthropic/`.

The public Anthropic files have no Russian Cyrillic glyphs. Russian text uses
explicit companion families, rather than being described as original Anthropic typography:

| Role | Original Latin family | Cyrillic companion |
| --- | --- | --- |
| Hero, section and page headings | Anthropic Serif | Source Serif 4 |
| Product titles, descriptions, controls | Anthropic Sans | Source Sans 3 |
| Latin tier labels | Anthropic Mono | Sans companion if needed |

The Source families were retrieved from Adobe's official repositories:
https://github.com/adobe-fonts/source-serif and https://github.com/adobe-fonts/source-sans.
Their SIL Open Font License files accompany the local font files.
The Cyrillic WOFF2 subsets retain the original font name and license metadata.
The Anthropic web files are source assets from the official site; no open font
license is asserted for those files.

`src/claude-fonts.css` scopes typography to `[data-theme=claude]`. The existing
Geologica wordmark is preserved. Other sections retain their existing typography.
Font files load locally, with `font-display: swap` and no third-party font requests.

Verification includes the existing Clawd responsive scenarios and Chromium's
`CSS.getPlatformFontsForNode` to verify the fonts actually rendering the glyphs.
Evidence: `qa/claude-fonts.json`; screenshots: `previews/claude-fonts-*.png`.
