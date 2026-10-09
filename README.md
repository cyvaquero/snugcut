# SnugCut

Nest SVG and DXF parts onto sheets for laser, vinyl, CNC and plasma cutters, in one HTML file. Open
[`snugcut.html`](snugcut.html) in a browser (double-click is fine): no install, no build, no server.
Everything runs in the page; your files are never uploaded (see [Files](#files) for the library and font requests). It needs a current desktop browser (Chrome or Edge, Firefox 101+,
Safari 16.4+); those versions are known API support, not tested minimums.

Two modes:

- **True shape** (default): parts interlock by their real outlines and can rotate (none / 180 / 90 / 45 / 30 / 15°).
  Spacing envelopes → no-fit polygons → first-fit on multiple plates, improved by a seeded order search
  ("Search 30 s more", Stop). The search runs in a background worker, so the page stays responsive; the **Worker
  pool** setting adds up to 3 more, each trying its own orders.
- **Bounding box**: MaxRects packing (4 heuristics × 5 sort orders) with optional 90° rotation.

**Outline precision** (True shape; Standard 0.25 mm or Fine 0.1 mm) sets how closely the outline used for nesting
follows each part. Rounded rectangles nest by their rounded corners and `<use>` copies by the shapes they copy; text,
images and copies of a `<symbol>` nest by the box around them. It changes only the spacing, never the cut paths. Very complex outlines are simplified further,
always outward, so they nest a little less tightly but never overlap.

**Area minimum** is the fewest plates the job could fit on by area alone: the parts' envelopes (outlines plus half
the spacing all round) divided by the plate's usable area. When the best layout uses more plates than that, the status
line suggests a longer search ("A longer search may save a plate").

**Utilization** (each plate, and the average over all plates) is the share of the plate covered by the parts' real
material: their outlines minus their holes, in both modes (parts kept as original markup count their holes as
material).

**Efficiency** rates the whole job from 1 to 10: the parts' real material divided by the material the job uses up,
with the percentage next to it. Full plates count whole; the last plate counts only up to one straight cut just past
its parts, across its width or its height, whichever leaves the larger offcut, and that offcut's size is shown on the
last plate (when it's at least 10 mm across). Nesting parts inside holes raises it. Part shapes cap it: round parts can't cover a plate the way
rectangles can, so a well-nested job of discs still rates lower than one of rectangles.

After any change to the parts or settings, the plates on screen are dimmed and can't be downloaded until the new
layout is ready. While a search is running it can replace the layout at any moment, so single plates of a
multi-plate job can't be downloaded until it ends or you press Stop; **Download all** works throughout and takes every
plate from the same layout.

SVG sizes come from `width`/`height` (mm, cm, in, pt, pc, px at the set DPI) and the `viewBox`. When their aspect
ratios differ, the drawing is scaled the way browsers scale it (`preserveAspectRatio`: fit by default, fill for
`slice`, stretch only for `none`); shapes are never cropped.

DXF files (ASCII, any version) are read directly: lines, arcs, circles, ellipses, (LW)polylines with bulges,
splines and block inserts (scaled, rotated, mirrored, arrays) from model space, in the drawing's units (`$INSUNITS`).
Files that don't declare their units (most R12 files) are read as mm, or as inches when their
`$MEASUREMENT` header says imperial; a notice says which, and a **Drawn in** menu next to the part switches it between
mm and inches. Each DXF color becomes a stroke color. Text, hatches and dimensions are skipped
with a notice, and so is anything on a frozen, off or non-plotting layer or the Defpoints layer. Paper space and
invisible entities are left out without a notice.

Exports one SVG per plate (sizes in mm, one object per part, unique ids) or a zip of all plates. The SVG export
format was verified in WeCreat MakeIT 3.06 (macOS) for the WeCreat Vision Pro 45W and must not change.

**Compensate kerf on objects** (off by default) builds the kerf into the downloaded files. Closed cut paths move by
half the kerf, outlines outward and holes inward, so parts come out at their drawn size. Filled areas and open lines
stay as drawn, and nesting spacing and margins grow to match (except around parts that are exported as drawn). Read this before using it:

- **Turn off kerf offset in your cutter's software.** The downloaded files already include it, so leaving it on
  applies the kerf twice: parts come out a full kerf too big and holes a full kerf too small.
- **Measure the kerf** for the material and settings you cut with ("Measure it from a test cut"). A wrong kerf makes
  every part the wrong size.
- **Every closed, unfilled path is treated as a cut.** A closed score or engrave outline moves too.
- **Curves become fine straight segments** (within 0.002 mm), so compensated circles aren't true arcs in a DXF.
- **Compensated files are marked** (an SVG comment, a DXF `999` comment). If one is added to SnugCut again, it
  is recognized and not compensated a second time. Parts kept as original markup and holes narrower than the kerf
  are exported as drawn (in SVG and DXF), with a notice.

**Parts kept as original markup**: a part with text, images, `<use>` copies, gradient or pattern fills, clip paths,
masks or filters is exported exactly as drawn instead of as cut paths. Such a part nests by its outline only: its kerf
isn't compensated, it gets no **Nest parts inside the holes** button, its holes count as material in the utilization,
and its text, images and `<use>` copies can't be written to DXF.

**Export format: DXF** writes the same plates as DXF R12 (ASCII, mm, origin bottom-left) for CAM software that prefers
DXF. It has the same cut paths, cut order and joined outlines as the SVG. Circles and circular arcs stay true arcs
(polyline bulges), and other curves are flattened to within 0.01 mm. There is one layer per color (named by its hex
value), or per source layer for parts imported from DXF. Text, images and `<use>` copies can't be written to DXF and
are left out; filled shapes become outlines. A notice names anything that was left out.

## Settings

Settings are remembered in this browser (local storage) and restored next time.

- **Nesting mode**: True shape or Bounding box (top right).
- **Worker pool** (True shape, its own box above Plate & cutting): Off (the default) searches in one background
  worker; 2, 3 or 4 workers try that many orders at once, so more layouts are tried in the same time. Each extra
  worker uses more memory, about 100 MB on a job of 120 parts, so on a lower-spec computer (little memory or few
  processor cores) leave it off; the box says so. Layouts and exports don't depend on it beyond the number of layouts
  tried.
- **Units**: mm or in, for every length field and the sizes in the parts list. Files are always written in mm.
  Length fields take `.` or `,` as the decimal point, and numbers on screen use your browser's locale (`0,2` in
  German, for example); exported files always use `.`.
- **Plate width / height**, **Kerf**, **Extra gap**, **Edge margin**: the sheet, the width the cut removes, extra
  spacing between parts, and the empty border around the sheet. "Measure it from a test cut" works out the kerf from a
  designed and a measured size; cut that test with compensation off and no kerf offset in your cutter's software.
- **Compensate kerf on objects**: see above.
- **Rotation** (True shape): none, 180° flips, or 90°, 45°, 30° or 15° steps. **Allow 90° rotation** (Bounding box).
- **Outline precision** (True shape): see above.
- **Unitless SVG scale**: how many px make an inch in SVGs sized in px or without units: 96 (Inkscape, browsers),
  72 (Illustrator) or 90 (old Inkscape). SVG sizes in mm, cm, in, pt and pc are read as they are (and without a
  `viewBox` such a file's drawing is in CSS px, 96 per inch, as in every viewer).
- **Plate outline in export**: adds the sheet's outline as a red rectangle (SVG) or on a `PLATE` layer (DXF).
- **Output file prefix**: put in front of the file names, which are `plate-01-of-03.svg` (or `.dxf`), and
  `nested-plates.zip` without a prefix or `<prefix>-plates.zip` with one. "Download all (.zip)" appears when there is
  more than one plate.
- **Export format**: SVG, or DXF (R12, mm).

In the parts list, each file has a **quantity** (0 leaves it out), a **Lock orientation** button that stops that part
from rotating, and a remove button. A few sample parts are loaded at first; they go away when you add your own files.

**Parts inside holes** (True shape): a part with holes gets a **Nest parts inside the holes** button (off by default;
not on parts kept as original markup);
parts without holes show a dimmed red, slashed stand-in in its place, so the list lines up.
Turned on, smaller parts can be nested in that part's holes, with the same spacing as anywhere else, and they're cut,
whole, before the part around them, so the hole's slug can't drop or shift before they're free. A hole is any closed,
unfilled outline inside the part (the rule kerf compensation uses). SnugCut can't tell a cut from a score, so turn it on
only for parts whose closed inner outlines are all cut: a part nested inside a scored outline would be cut out of the
middle of the part around it. Anything drawn inside a hole (a smaller cut, a score line) is kept clear. Utilization
counts each part's real material: a hole is empty space, whether the button is on or not, until a part is nested in
it, and then that part counts (parts kept as original markup count their holes as material).

What happens to imported files:

- Shapes a browser wouldn't show (hidden, fully transparent, or with no fill and no stroke) are left out.
- Links to anything outside the file (images, fonts, other files) are removed, so nothing is fetched. That includes
  URLs hidden in CSS custom properties: a custom property holding a string, and `var()` inside `image-set()`,
  `image()` or `cross-fade()`, are removed; custom properties holding colors or lengths keep working. Embedded
  (`data:`) content is kept only for raster images (PNG, JPEG, GIF, WebP, AVIF, BMP) and fonts.
- A file's CSS applies only to that file, as in an SVG viewer: parts are measured apart from the page, so the
  page's styles (or those of a site that embeds SnugCut) don't change them, and their rules can't reach the page.
  `:root` rules still apply to the part; rules that need an HTML page around the drawing, such as `body rect`,
  don't match.

## Test cuts

`fixtures/test-cuts/` has small pieces for dialing in the kerf and the fit before cutting a real job. Red `#ff0000`
is cut and blue `#0000ff` is score; set any black filled marks to engrave or turn them off. Cut each test from the
material and with the speed and power you will use, because the kerf changes with all three. Set "Edge margin" and
"Extra gap" as usual, and keep the pieces the way they are drawn: set **Rotation: None** (True shape), untick **Allow
90° rotation** (Bounding box), or press each piece's **Lock orientation** button in the parts list.

| File | Size | What it tells you |
|---|---|---|
| `kerf-test.svg` | 20 × 20 mm | Whether kerf compensation gives parts at their drawn size |
| `fingers-inplane-a.svg` + `fingers-inplane-b.svg` | 50 × 30 mm each | How a finger joint fits, independent of material thickness |
| `box-corner-a.svg` + `box-corner-b.svg` | 53 × 40 mm each | How a 90° box corner fits in 3 mm stock |
| `slot-gauge-3mm.svg` | 64 × 24 mm | Which slot width your 3 mm stock actually needs |

### Kerf test (`kerf-test.svg`)

1. Enter your kerf. To measure it, cut a square with **Compensate kerf on objects** off and no kerf offset in your
   cutter's software, then use "Measure it from a test cut" under Kerf.
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
   software is also offsetting. The blue score line and the black mark stay as drawn. So does the 0.06 mm pin hole
   with a kerf of 0.06 mm or more (most kerfs), because it's narrower than the kerf; the download then names it in a
   notice. With a finer kerf it's compensated like the other holes.

### Finger joint (`fingers-inplane-a.svg` + `fingers-inplane-b.svg`)

Cut both pieces on one plate, lay them flat and push A's three 6 mm fingers into B's gaps. The fit depends only on
the kerf, not on the material thickness.

- **Compensation off:** about two kerfs of play in total is expected: each finger comes out half a kerf narrower on
  each side, and each gap half a kerf wider.
- **Compensation on, too tight:** lower the kerf a little.
- **Compensation on, too loose:** raise it.

Fingers grow and gaps shrink by the same amount, so the fit changes twice as fast as the setting: 0.02 mm less kerf
makes the joint about 0.04 mm looser.

### Box corner (`box-corner-a.svg` + `box-corner-b.svg`, 3 mm stock)

Fingers 8 mm wide and 3 mm deep, the way a box side is joined. Fit the two pieces at 90°: A's fingers on segments 1,
3 and 5 fill B's gaps. With the right kerf the joint is snug and the faces are flush. If the fingers stick out or sit
short, the material isn't 3 mm: check it with the slot gauge. The finger depth is drawn for 3 mm; regenerate the pair
for other stock.

### Slot gauge (`slot-gauge-3mm.svg`)

Five open slots 2.8, 2.9, 3.0, 3.1 and 3.2 mm wide, marked by 1 to 5 score ticks under each slot. Push an offcut of
the same sheet into each one. The narrowest slot it still enters is the slot width to draw for this material and
machine, kerf included. Cut it with and without compensation to see how much the kerf changes the fit. With
compensation on and the right kerf, a sheet that measures 3.0 mm fits the 3.0 slot snugly.

## Accessibility

- **Keyboard**: every control can be reached with Tab and used from the keyboard; the drop zone opens the file picker
  with Enter or Space.
- **Display**: the light or dark theme follows the system setting, and the status animation stops when reduced
  motion is requested.
- **Screen readers**: the result of each run, confirmations and errors are announced. Warnings and errors also stay in
  the message list above the plates until dismissed, and confirmations stay on screen at least 20 s (Esc closes them).
  Field errors, the kerf compensation warning and the kerf measured from a test cut are announced once typing pauses.
- **Focus** stays in place when the parts list or the plates are redrawn, and open "Parts on this plate" lists stay
  open. Removing a part moves it to the next part, and Search more and Stop hand it to each other.
- **Plate previews** describe themselves ("Plate 1 of 2: 15 parts, 75% utilization") and have a "Parts on this plate" list
  with counts and rotations. The image is described by the same list whether it is open or closed.
- **Invalid entries** are marked (`aria-invalid`) with a message under the field that says what's wrong and which
  value is still in use. The kerf field and the "Compensate kerf on objects" checkbox are also described by their
  hints.
- **Windows high-contrast (forced colors)**: pressed toggles keep a visible state, the lock icon is open or closed to
  match, the holes icon shows an empty or a filled hole, and part thumbnails and plate previews keep their tan plate
  behind the parts' own colors, so they stay visible in dark themes.
- **Contrast**: text meets WCAG AA in both themes. The borders of fields, icon buttons and the mode and unit toggles,
  the plate edge, the "no holes" icon and the guide lines on the plate previews are at least 3:1. Text buttons have
  faint borders and are recognized by their labels.
- **Structure and names**: headings for the panels, results and each plate; a main landmark; quantity fields have a
  visible "Qty" label, and every button has its own name ("Lock orientation of star.svg", "Download SVG, plate 1 of 2").
  Icons inside buttons are hidden from screen readers.
- **Zoom and narrow screens**: part names wrap instead of being cut off, and below 480 px each part gets two rows
  (name, then thumbnail, Qty and buttons), so nothing is lost at 320 px, 400% zoom or with larger text spacing.
- **Known gaps**: none open. The findings of the 1.0.0-beta review (#93–#105) and the 1.2.0-beta review (#155–#157,
  #166–#169, #176, #178) are fixed, as is #204. Target size (#177) isn't required at WCAG 2.1 AA: the mm / in buttons
  are 22 px tall. Report problems as a GitHub issue.

**Target:** WCAG 2.1 level AA, plus the Revised Section 508 requirements that WCAG doesn't cover: accessibility
documentation (602, this section) and keeping information visible with forced colors (302.2, #98, #157). The reviews'
findings are fixed, but conformance hasn't yet been confirmed with screen readers (VoiceOver, NVDA) or a full audit.
Section 508 points to WCAG 2.0 AA for web content, so meeting WCAG 2.1 AA covers it and adds a few newer criteria
(status messages, reflow, text spacing, non-text contrast, label in name). As web content that meets WCAG 2.0 AA,
SnugCut falls under the 501.1 exception, so the software provisions in 502 and 503 don't apply separately. The
authoring-tool provisions (504) are treated as not applicable: the SVG and DXF files SnugCut writes are cutting paths
for machines in fixed formats, not documents for people to read. The two standards don't conflict anywhere in
SnugCut; the details are in #106 and #181.

## Files

| Path                 | What                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `snugcut.html`       | the app in one file (HTML, CSS and inline JavaScript), **generated** by `tools/build.py` |
| `lib/snugcut.js`     | the library: import, outlines, nesting, kerf compensation, SVG/DXF export (ES module, no UI) |
| `app/`               | the app split up: `index.html`, `snugcut.css`, `app.js` (ES module using the library), `strings-en.js` (the English text of the app's messages, by key) |
| `tools/build.py`     | builds `snugcut.html` from `app/` and `lib/` (Python 3, no dependencies); `--check` tests it is current |
| `qa/`                | export QA workbooks, one Word file per cutter app (LightBurn, Bambu Suite, xTool Studio, Silhouette Studio, Creality Print, Cricut Design Space): setup, every test, a results table and boxes for screenshots. Testers fill one in and attach it to that app's QA issue |
| `tools/qa_workbooks.py` | generates `qa/*.docx`; the tests and the release under test are defined in it (Python 3, no dependencies); `--check` tests they are current |
| `CHANGELOG.md`       | what changed in each version                                                  |
| `CLAUDE.md`          | rules for AI-assisted work in this repo (Claude Code)                         |
| `RELEASING.md`       | release procedure: efficiency review, release branch, blind review, finishing |
| `fixtures/`          | Files for manual testing, by topic: `geometry/`, `css/`, `makeit/`, `security/`, `dxf/`, `nesting/`, `test-cuts/` (see `fixtures/README.md`) |

Like the original reference apps, the page loads two libraries by script tag, `clipper-lib@6.4.2` (polygon clipping) and
`jszip@3.10.1` (zip download), plus Google Fonts. They come from public CDNs (cdn.jsdelivr.net, cdnjs.cloudflare.com,
fonts.googleapis.com, fonts.gstatic.com) **each time the page loads**, unless the browser has them cached. Those
requests show the CDNs your IP address and that the page was opened; your files never leave the browser. Without
clipper-lib the page can't nest and says so; without jszip only "Download all (.zip)" is missing, and each plate can
still be downloaded on its own; without the fonts the page falls back to system fonts.

A Content-Security-Policy allows only those URLs, so an imported SVG can't make the browser load anything else, and it
allows the page's own script only by its hash, so injected inline scripts and handlers don't run. Both library script
tags carry a Subresource Integrity hash, so the browser refuses a library file whose contents have changed.

The search runs in Web Workers built in the page (a `blob:` URL, the only kind the CSP's `worker-src` allows). The
workers need their own copy of clipper-lib: the page fetches the same URL with the same integrity hash (`connect-src`
allows that one URL), which the browser serves from its cache. Each worker uses memory for its own cache of part
pairs: on 120 mixed parts, four took about 300 MB more than one, which is why the pool is off by default. If no worker can be started (an older browser, or a
page embedding SnugCut with a stricter CSP), the search runs on the page itself, as before.

The script tags and the CSP are kept in `app/index.html`; don't edit them in `snugcut.html`, which is generated. To
bump a library version, change its URL in the script tag and in the CSP (clipper-lib's in both `script-src` and
`connect-src`), set its `integrity` to `sha384-` plus the
output of `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`, and run `python3 tools/build.py`. The
build copies the tags and the CSP into `snugcut.html` and writes in the hash of its inline script (`app/index.html`
allows its own files with `'self'` instead).

## Library messages

`lib/snugcut.js` words every message it shows a person (import errors and notes, export notes) through a code and its
values, so a caller can supply its own wording. `setMessages(fn)` installs it: `fn(code, vars, english)` returns the
text, or anything other than a string to keep the English. Without it, the library uses the English in `MESSAGES`. An
error the library throws keeps the worded text as `.message` and also carries `.code` and `.vars`. Every message has a
`name` (the file or part name) unless noted. The app words them from its string table (`lib.<code>` in
`app/strings-en.js`), with the limits formatted for the browser's locale.

| Code | Values | When |
| --- | --- | --- |
| `dxf.binary` | | an import is a binary DXF |
| `dxf.unreadable` | | an import isn't a readable DXF |
| `dxf.noUnits` | `units` (`"mm"` or `"in"`) | a DXF doesn't declare its units (note) |
| `dxf.tooManyItems` | `limit` | blocks and arrays expand past the item limit |
| `dxf.tooManyPoints` | `limit` | blocks and arrays draw past the point limit |
| `dxf.splineDegree` | `degree` | a spline's degree is outside 1 to 11 |
| `dxf.hiddenLeftOut` | `count` | items on hidden layers were left out (note) |
| `dxf.skipped` | `skipped` (`[entity type, count]` pairs) | unsupported entities were skipped (note) |
| `dxf.nothingToCut` | `hidden` (count on hidden layers) | a DXF has nothing to cut |
| `svg.unreadable` | | an import isn't a readable SVG |
| `svg.tooManyCopies` | `limit` | `<use>` copies past the limit |
| `svg.nothingVisible` | | an SVG has no visible shapes |
| `svg.nothingToCut` | | an SVG has no cuttable shapes |
| `svg.noClosedOutline` | | an SVG has no closed outline |
| `kerf.holeTooNarrow` | | a hole is narrower than the kerf (export note) |
| `kerf.markup` | | a part's kerf can't be compensated (export note) |
| `dxfOut.nothing` | | a part has nothing to write to DXF (export note) |
| `dxfOut.clipping`, `dxfOut.text`, `dxfOut.images`, `dxfOut.use`, `dxfOut.paint`, `dxfOut.unreadable` | | that part of a part isn't in the DXF (export note) |
| `dxfOut.element` | `tag` | `<tag>` elements of a part aren't in the DXF (export note) |
| `dxfOut.fills` | none | filled areas are written as outlines (export note) |

Exported files themselves (`.` decimals, the `SnugCut v…` and kerf-compensation markers) never change with the wording.

## Workflow

`app/` and `lib/` are the source; `snugcut.html` is built from them, so it stays a single file you can double-click.
After editing the sources, run:

```bash
python3 tools/build.py
```

and commit the sources and `snugcut.html` together. The split app (`app/index.html`) uses ES modules, so it only runs
when served over HTTP (for example `python3 -m http.server`, then open `/app/`), not from `file://`.

git-flow: `main` + `develop`; `feature/` and `bugfix/` branches off `develop` with PRs into `develop`; fixes during a
release go on `bugfix/` branches with PRs into the `release/` branch. Versions are
`major.minor.iterative`, optionally with a pre-release suffix such as `-beta`, shown in the page footer and in
[CHANGELOG.md](CHANGELOG.md): major, minor and the suffix change only on request; the iterative number is bumped with
every change, and a suffix stays on until it is dropped (1.1.0-beta, 1.1.1-beta, …). Once dropped, a suffix comes
back only for a major rewrite of what the app does or how it works. The release steps (an efficiency review before cutting the
release branch, a blind review after) are in [RELEASING.md](RELEASING.md).

## License

Copyright (C) 2026 Guy Heckman.

SnugCut is free software under the [GNU Affero General Public License](LICENSE), version 3 or (at your option)
any later version (AGPL-3.0-or-later). You may use it
for anything, including commercial work such as cutting parts you sell, and you may copy, modify and share it. If you
distribute a modified version, or let people use one over a network (for example as part of a hosted service), you
must make its complete source code available to them under the same license.

The libraries it loads keep their own licenses: clipper-lib (Boost Software License 1.0), JSZip (MIT or GPLv3) and the
Google Fonts (SIL Open Font License).
