# Plate Nester

Nest SVG parts onto sheets for laser, vinyl, CNC and plasma cutters, in one HTML file. Open
[`plate-nester.html`](plate-nester.html) in a browser (double-click is fine): no install, no build, no server.
Everything runs in the page; nothing is uploaded.

Two modes:

- **True shape** (default): parts interlock by their real outlines and can rotate (none / 180 / 90 / 45 / 30 / 15°).
  Spacing envelopes → no-fit polygons → first-fit on multiple plates, improved by a seeded order search
  ("Search 30 s more", Stop).
- **Bounding box**: MaxRects packing (4 heuristics × 5 sort orders) with optional 90° rotation.

Exports one SVG per plate (sizes in mm, one object per part, unique ids) or a zip of all plates. The export format
was verified in WeCreat MakeIT 3.06 (macOS) for the WeCreat Vision Pro 45W and must not change.

## Files

| Path                 | What                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `plate-nester.html`  | the app: HTML, CSS and inline JavaScript in one file                          |
| `fixtures/`          | SVGs for manual testing: transforms, skew, CSS classes, hidden groups, text, arcs, gradient, external links, ids that look like colours, clashing class names, element/universal selector leaks, stroke caps/joins/dashes, MakeIT CSS support and id-colour tests, currentColor, CAD-style <line> outlines |

Like the original reference apps, the page loads two libraries by script tag: `clipper-lib@6.4.2` (polygon clipping) and
`jszip` (zip download), plus Google Fonts. It needs network access for those on first load. A
Content-Security-Policy in the page allows only those URLs, so an imported SVG can't make the browser load anything
else.

## Workflow

git-flow: `main` + `develop`, feature branches off `develop`, PRs into `develop`. Versions are
`major.minor.iterative`, shown in the page footer and in [CHANGELOG.md](CHANGELOG.md): major and minor are bumped only
on request; the iterative number is bumped with every change.
