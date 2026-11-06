# Clawd in the Claude section

Source: [MyClawd by CodeChrisB](https://codechrisb.github.io/MyClawd/#working).

Local assets in `public/clawd/` are the original seamless `loop.gif` files for
`hello`, `writing`, `thinking`, `tools`, `agents`, and `idle-coffee`.
Each PNG is a still frame from the corresponding GIF for paused/reduced-motion display.
The six GIFs total approximately 214 KB. Assets do not contact the source site at runtime.

The source site's Legal section permits fun and non-commercial use. These assets
are included for the existing local frontend demo. Commercial publication requires
permission from the author or replacement assets with suitable terms.
MyClawd is a fan project, unaffiliated with Anthropic.

`src/ClaudeSection.tsx` selects scenes from the product ID/title, renders the hero,
and shares a motion toggle across all scenes. Small navigation and cart logos keep
using the existing brand artwork. `src/claude-section.css` contains the scoped styling.

Verification: `node scripts/qa-clawd.mjs` (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if needed).
Results: `qa/clawd-checks.json`; screenshots: `previews/clawd-*.png`.
