# SnugCut

Nest SVG and DXF parts onto sheets for laser, vinyl, CNC and plasma cutters, in one HTML file. Open
[`snugcut.html`](snugcut.html) in a browser (double-click is fine): no install, no build, no server.
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
  Studio, MakeIT, Silhouette Studio, …). Otherwise the kerf is applied twice: parts come out a full kerf too big and
  holes a full kerf too small. Don't offset the downloaded files yourself either.
- **Measure the kerf** for the material and settings you cut with ("Measure it from a test cut"). A wrong kerf makes
  every part the wrong size.
- **Every closed, unfilled path is treated as a cut.** A closed score or engrave outline moves too.
- **Curves become fine straight segments** (within 0.002 mm), so compensated circles aren't true arcs in a DXF.
- **Compensated files are marked** (an SVG comment, a DXF `999` comment). If one is added to SnugCut again, it
  is recognised and not compensated a second time. Parts kept as original markup (text, images, effects) and holes
  narrower than the kerf are exported as drawn, with a notice.

**Export format: DXF** writes the same plates as DXF R12 (ASCII, mm, origin bottom-left) for CAM software that prefers
DXF. It has the same cut paths, cut order and joined outlines as the SVG. Circles and circular arcs stay true arcs
(polyline bulges), and other curves are flattened to within 0.01 mm. There is one layer per colour (named by its hex
value), or per source layer for parts imported from DXF. Text, images and fills can't be written to DXF: filled
shapes become outlines, and a notice names anything that was left out.

## Test cuts

`fixtures/test-cuts/` has small pieces for dialling in the kerf and the fit before cutting a real job. Red `#ff0000`
is cut and blue `#0000ff` is score; set any black filled marks to engrave or turn them off. Cut each test from the
material and with the speed and power you will use, because the kerf changes with all three. Set "Edge margin" and
"Extra gap" as usual, and set **Rotation: None** so the pieces stay the way they are drawn.

| File | Size | What it tells you |
|---|---|---|
| `kerf-test.svg` | 20 × 20 mm | Whether kerf compensation gives parts at their drawn size |
| `fingers-inplane-a.svg` + `fingers-inplane-b.svg` | 50 × 30 mm each | How a finger joint fits, independent of material thickness |
| `box-corner-a.svg` + `box-corner-b.svg` | 53 × 40 mm each | How a 90° box corner fits in 3 mm stock |
| `slot-gauge-3mm.svg` | 64 × 24 mm | Which slot width your 3 mm stock actually needs |

**Kerf test** (`kerf-test.svg`)

1. Enter your kerf. To measure it, cut a square and use "Measure it from a test cut" under Kerf.
2. Cut the piece with **Compensate kerf on objects** off, and again with it on and the kerf offset in your cutter's
   software turned off.
3. Measure both with calipers (k = the kerf):

   | | Compensation off | Compensation on |
   |---|---|---|
   | Outer square | 20 − k | 20.0 mm |
   | Square hole | 10 + k | 10.0 mm |
   | Round hole | Ø 6 + k | Ø 6.0 mm |

   With compensation on, parts still too small and holes too big mean the kerf value is too small: raise it by the
   difference (19.96 mm → add 0.04). Parts too big and holes too small mean the kerf value is too big, or the cutter's
   software is also offsetting. The blue score line, the black mark and the 0.06 mm pin hole stay as drawn; the pin
   hole is narrower than any kerf, so the download names it in a notice.

**Finger joint** (`fingers-inplane-a.svg` + `fingers-inplane-b.svg`)

Cut both pieces on one plate, lay them flat and push A's three 6 mm fingers into B's gaps. The fit depends only on
the kerf, not on the material thickness.

- **Compensation off:** about one kerf of play is expected.
- **Compensation on, too tight:** lower the kerf a little.
- **Compensation on, too loose:** raise it.

Fingers grow and gaps shrink by the same amount, so the fit changes twice as fast as the setting: 0.02 mm less kerf
makes the joint about 0.04 mm looser.

**Box corner** (`box-corner-a.svg` + `box-corner-b.svg`, 3 mm stock)

Fingers 8 mm wide and 3 mm deep, the way a box side is joined. Fit the two pieces at 90°: A's fingers on segments 1,
3 and 5 fill B's gaps. With the right kerf the joint is snug and the faces are flush. If the fingers stick out or sit
short, the material isn't 3 mm: check it with the slot gauge. The finger depth is drawn for 3 mm; regenerate the pair
for other stock.

**Slot gauge** (`slot-gauge-3mm.svg`)

Five open slots 2.8, 2.9, 3.0, 3.1 and 3.2 mm wide, marked by 1 to 5 score ticks under each slot. Push an offcut of
the same sheet into each one. The narrowest slot it still enters is the slot width to draw for this material and
machine, kerf included. Cut it with and without compensation to see how much the kerf changes the fit. With
compensation on and the right kerf, a sheet that measures 3.0 mm fits the 3.0 slot snugly.

## Files

| Path                 | What                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `snugcut.html`       | the app: HTML, CSS and inline JavaScript in one file                          |
| `fixtures/`          | Files for manual testing, by topic: `geometry/`, `css/`, `makeit/`, `security/`, `dxf/`, `test-cuts/` (see `fixtures/README.md`) |

Like the original reference apps, the page loads two libraries by script tag: `clipper-lib@6.4.2` (polygon clipping) and
`jszip` (zip download), plus Google Fonts. It needs network access for those on first load. A
Content-Security-Policy in the page allows only those URLs, so an imported SVG can't make the browser load anything
else.

## Workflow

git-flow: `main` + `develop`, feature branches off `develop`, PRs into `develop`. Versions are
`major.minor.iterative`, shown in the page footer and in [CHANGELOG.md](CHANGELOG.md): major and minor are bumped only
on request; the iterative number is bumped with every change.
