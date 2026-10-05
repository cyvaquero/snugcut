# Changelog

Format `major.minor.iterative`. Major/minor change only on request; the iterative number increments with every change.

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
