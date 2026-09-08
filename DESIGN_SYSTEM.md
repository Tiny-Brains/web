# TinyBrains design system — Cobalt

Open [the static reference](public/design-system.html) directly in a browser, or visit `/design-system.html` on the web development server. It includes a light/dark switch, live colour values, logo downloads, typography, spacing, component specimens, and a future game replay placeholder. It works offline without a build.

## Source of truth

[public/design-system/tokens.css](public/design-system/tokens.css) provides the shared tokens used by both the React app and the reference. `index.html` loads this stylesheet. Dark is the default; set `data-theme="light"` on `<html>` for light mode. The reference toggle is local to that page and does not change the application preference.

Use semantic variables rather than literal colours:

```css
.card { background: var(--surface); color: var(--ink); border: 1px solid var(--line); }
.primary { background: var(--accent); color: var(--accent-ink); }
```

- `bg`, `surface`, `surface-raised`: page, panels, nested surfaces.
- `ink`, `muted`: primary and supporting text on neutral surfaces.
- `accent`, `accent-ink`: links/focus and primary-button foreground/background pair.
- `success`, `warning`, `danger`: labelled outcomes; never communicate state by colour alone.
- `line`: decorative boundaries. Use `muted` for an input boundary that must remain visible.
- `frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem`: decorative logo regions.

Existing app aliases `panel`, `warn`, `bad`, and `mono` resolve to the shared tokens. Keep new code on the semantic names above.

## Typography and layout

Use the system sans stack for reading and navigation and the system mono stack for code, identifiers, scores, and replay metadata. Reference body text is 16px/1.6; compact application body text remains 15px/1.55. Metadata is 12–14px. Use a 4px spacing base with tokens for 4, 8, 12, 16, 24, 32, 48, and 64px. Radii are 6, 10, and 18px for small elements, controls, and feature cards.

Keep controls at least 44px high in new layouts. Provide a visible 2px accent focus ring with an offset. Pair accent backgrounds with `accent-ink`. Do not use decorative borders or logo hues for ordinary text. Disabled specimens are intentionally subdued; disabled controls must actually be disabled.

## Logo

- [Dark-surface SVG](public/logo-network.svg)
- [Light-surface SVG](public/logo-network-light.svg)

Use the appropriate asset for the background. Both share the same 512 × 512 geometry and transparent background. Retain the full viewBox for clear space and preserve the aspect ratio. Recommended minimum display width: 40px.

The left stem line has moved 12 units left at the bend and terminal, creating a 32-unit separation. Both stem paths use 12-unit strokes and their grey joints use an 11-unit radius. The new upper endpoint joins the lower brain contour. Other network paths retain 10-unit strokes. When editing geometry, update both variants together; region colours match the corresponding theme tokens.

## Game visuals

Include a replay placeholder wherever a worked example benefits from an actual game. Replace it later with recorded replay data, play/pause and turn-step controls, player labels, and an accessible text explanation. Do not present fabricated replay metadata as live game data. The reference includes a labelled specimen for this future component.
