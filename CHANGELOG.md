# Changelog

Format `major.minor.iterative`. Major/minor change only on request; the iterative number increments with every change.

## 0.1.18

- CSS class rules from one SVG no longer restyle other files' parts on an exported plate (#12). For files with a
  `<style>` block, class names get the file's prefix, like ids already did: in `class` attributes and in `.class`
  selectors (`.cut` becomes `.p3_cut`). Flattened parts and files without `<style>` export unchanged.
  Element and universal selectors (`rect {…}`, `* {…}`) can still leak between files: tracked in #38.
  New fixtures `fixtures/class-clash-a.svg` and `fixtures/class-clash-b.svg`.

## 0.1.17

- Ids that read as hex colours (`fff`, `cafe`, `bad`, …) no longer corrupt colours in `<style>` (#13). Id prefixing
  (on import and per instance on export) now rewrites `#id` only in selectors, not in declaration values, strings,
  comments or attribute selectors, so `stroke:#fff` stays `#fff`. Files without such clashes export unchanged.
  New fixture `fixtures/style-ids.svg`.

## 0.1.16

- Content-Security-Policy (#11), as a `<meta>` tag so it also applies when the page is opened from disk: scripts
  only inline and the two pinned library URLs (clipper-lib 6.4.2, jszip 3.10.1), styles inline and Google Fonts,
  fonts from Google Fonts or `data:`, images only `blob:`/`data:`, nothing else (no fetch/XHR, objects, `<base>`,
  form posts). A second layer behind the import sanitizer (#10): even a link it missed can't be loaded.

## 0.1.15

- Imported SVGs no longer make the browser fetch anything from outside the file (#10). Before a file is measured,
  links to other files are removed: external `href`s on `<image>`, `<use>`, `<feImage>` and the like, `@import`,
  and `url()` / `image-set()` in `<style>`, `style` attributes and presentation attributes (CSS escapes included).
  HTML and MathML elements and SMIL animation elements inside the SVG are dropped. Only `#fragment` and `data:`
  references remain. A notice names the files that had external links. Files without external links are untouched,
  so their export is unchanged. New fixture `fixtures/external-refs.svg`.

## 0.1.14

- Page description covers other cutters (laser, vinyl, CNC, plasma) and materials; the two modes are listed as
  bullets. The kerf field is labelled "Kerf" instead of "Laser kerf", and its hint says "the cut" rather than "the beam". README and CLAUDE.md reworded to match.

## 0.1.13

- Removed `reference/` (the original true-shape and bounding-box apps). `plate-nester.html` is now the only
  source of truth; the originals stay in git history.

## 0.1.12

- Fragmented outlines are joined on export (#27): open subpaths of the same line style whose ends meet (within
  0.01 mm) are chained into continuous paths, reversing pieces where needed, and closed with `Z` when they loop back.
  CAD/DXF-style sources that store every segment separately no longer cut one segment at a time, and their holes are
  now recognised for inside-first ordering (#25). Objects, ids and geometry are unchanged.

## 0.1.11

- Exported plate SVGs carry the app version as a comment (`<!-- Plate Nester v0.1.11 -->`) just inside the
  `<svg>` element, so an export can be traced back to the version that made it.

## 0.1.10

- Cut order in exported plates (#25): parts are listed row by row (top → bottom, left → right), and within each part
  inner cuts (holes, slots, engraving) come before the outline that contains them, deepest first. Layout, ids and
  rendering are unchanged; parts kept as original markup (text, gradients, …) keep their source order.

## 0.1.9

- `plate-nester.html`: both reference apps merged into one self-contained page with inline JavaScript.
  - **True shape** / **Bounding box** mode switch; rotation and outline precision for true shape, 90° rotation for
    bounding box; the search bar ("Search 30 s more", Stop) only in true-shape mode.
  - Same look, controls, sample parts (plus `shop-sign`), settings in localStorage, mm/in switch, kerf test-cut helper.
  - Normal browser downloads (one SVG per plate, or a zip) instead of the artifact-only `window.claude` downloads.
  - Libraries load by script tag as in the references (clipper-lib 6.4.2, jszip, Google Fonts).
- Fixes over the references:
  - Declares UTF-8, so `·`, `°`, `±`, `×` and `…` render correctly when the file is opened from disk.
  - Hidden (`display:none`) shapes no longer shape the true-shape outline (a far-off hidden shape made a part "too big").
  - Original-markup parts (text, gradients, …) placed more than once get per-instance ids, so plates never repeat an id.
- `fixtures/`: SVGs for manual testing (transforms, skew, CSS classes, hidden groups, text, arcs, gradient).
