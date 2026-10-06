# Plate Nester

Nest SVG and DXF parts onto sheets for laser, vinyl, CNC and plasma cutters, in one HTML file. Open
[`plate-nester.html`](plate-nester.html) in a browser (double-click is fine): no install, no build, no server.
Everything runs in the page; nothing is uploaded.

Two modes:

- **True shape** (default): parts interlock by their real outlines and can rotate (none / 180 / 90 / 45 / 30 / 15°).
  Spacing envelopes → no-fit polygons → first-fit on multiple plates, improved by a seeded order search
  ("Search 30 s more", Stop).
- **Bounding box**: MaxRects packing (4 heuristics × 5 sort orders) with optional 90° rotation.

DXF files (ASCII, any version) are read directly: lines, arcs, circles, ellipses, (LW)polylines with bulges,
splines and block inserts (scaled, rotated, mirrored, arrays) from model space, in the drawing's units (`$INSUNITS`;
unitless files are read as mm). Each DXF colour becomes a stroke colour. Text, hatches and dimensions are skipped
with a notice, and so are frozen, off and non-plotting layers.

Exports one SVG per plate (sizes in mm, one object per part, unique ids) or a zip of all plates. The SVG export
format was verified in WeCreat MakeIT 3.06 (macOS) for the WeCreat Vision Pro 45W and must not change.

**Compensate kerf on objects** (off by default) builds the kerf into the downloaded files. Closed cut paths move by
half the kerf, outlines outward and holes inward, so parts come out at their drawn size. Filled areas and open lines
stay as drawn, and nesting spacing and margins grow to match. Read this before using it:

- **Don't compensate twice.** Turn off kerf offset (kerf compensation) in your cutter's software (LightBurn, xTool
  Studio, MakeIT, Silhouette Studio, …), and don't offset the downloaded files yourself. If the kerf is applied twice,
  before or after export, parts come out a full kerf too big and holes a full kerf too small.
- **Measure the kerf** for the material and settings you cut with ("Measure it from a test cut"). A wrong kerf makes
  every part the wrong size.
- **Every closed, unfilled path is treated as a cut.** A closed score or engrave outline moves too.
- **Curves become fine straight segments** (within 0.002 mm), so compensated circles aren't true arcs in a DXF.
- **Compensated files are marked** (an SVG comment, a DXF `999` comment). If one is added to Plate Nester again, it
  is recognised and not compensated a second time. Parts kept as original markup (text, images, effects) and holes
  narrower than the kerf are exported as drawn, with a notice.

**Export format: DXF** writes the same plates as DXF R12 (ASCII, mm, origin bottom-left) for CAM software that prefers
DXF. It has the same cut paths, cut order and joined outlines as the SVG. Circles and circular arcs stay true arcs
(polyline bulges), and other curves are flattened to within 0.01 mm. There is one layer per colour (named by its hex
value), or per source layer for parts imported from DXF. Text, images and fills can't be written to DXF: filled
shapes become outlines, and a notice names anything that was left out.

## Files

| Path                 | What                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `plate-nester.html`  | the app: HTML, CSS and inline JavaScript in one file                          |
| `fixtures/`          | Files for manual testing, by topic: `geometry/`, `css/`, `makeit/`, `security/`, `dxf/`, `test-cuts/` (see `fixtures/README.md`) |

Like the original reference apps, the page loads two libraries by script tag: `clipper-lib@6.4.2` (polygon clipping) and
`jszip` (zip download), plus Google Fonts. It needs network access for those on first load. A
Content-Security-Policy in the page allows only those URLs, so an imported SVG can't make the browser load anything
else.

## Workflow

git-flow: `main` + `develop`, feature branches off `develop`, PRs into `develop`. Versions are
`major.minor.iterative`, shown in the page footer and in [CHANGELOG.md](CHANGELOG.md): major and minor are bumped only
on request; the iterative number is bumped with every change.
