# Changelog

Format `major.minor.iterative`, with an optional pre-release suffix such as `-beta`. Major, minor and the suffix change
only on request; the iterative number increments with every change. Once the suffix is dropped, it comes back only for
a major rewrite of what the app does or how it works.

## 1.1.23-beta

- The guide lines on the plate previews reach 3:1 against the tan plate in both themes (#105). Part outlines use
  `#2d55f0` at full opacity (4.0:1 light, 3.5:1 dark; was 2.5:1 and 1.5:1), and the edge-margin line uses `#7a6644`
  (3.9:1 and 3.4:1; was 1.6:1 and 2.1:1). They are new `--guide` and `--guide-margin` colors.
- README Accessibility section: no known gaps left from the 1.0.0-beta review. It says conformance still needs
  confirming with real screen readers or an audit.

## 1.1.22-beta

- Part names in the parts list are never cut off (#100). They wrap instead of ending in "…", which hid the rest of the
  name from keyboard and touch users even on desktop. Below 480 px each part gets two rows: the name across the full
  width, then the thumbnail, Qty and buttons. Measured at 320 px and with the WCAG text-spacing override: every name
  fully shown, no horizontal scrolling. README updated.

## 1.1.21-beta

- Parts list and plates (#103):
  - each quantity field has a visible "Qty" label, and its accessible name is "Qty <file name>";
  - lock buttons are named per part ("Lock orientation of star-ornament.svg");
  - plate download buttons are named per plate ("Download SVG, plate 1 of 2"), so every button's name is unique.
- README updated (#102 and #103 off the known gaps).

## 1.1.20-beta

- Page structure (#102):
  - the units switch and the "Sample parts" badge sit next to their panel headings instead of inside them, so the
    headings read "Plate & cutting" and "Parts";
  - the results column is a `<main>` landmark with a (visually hidden) "Results" heading;
  - each plate's title is an `<h3>` that also names its plate.
- Empty message lists no longer add space above the plates.

## 1.1.19-beta

- The drop zone's accessible name is its visible text, "Drop SVG or DXF files here or browse", instead of a different
  `aria-label` ("Add SVG or DXF files"). Speech-input users can say "click browse" (#101).

## 1.1.18-beta

- Fields, selects, icon buttons, the drop zone and the toggle groups have borders at least 3:1 against their
  backgrounds in both themes (#99): a new `--field` color (light `#7e8b99`, dark `#5d6b7b`). Measured 3.01–3.48:1;
  it was 1.3–1.4:1 with `--line`, which stays for dividers. README updated.

## 1.1.17-beta

- In Windows high-contrast (forced colors) mode, the pressed state of the mode and unit toggles and the orientation
  lock is now visible: pressed toggles use the system highlight color, and a locked part's button gets a highlight
  outline (#98). The lock icon also shows an open shackle when unlocked, so its state never depends on color alone.
  README updated.

## 1.1.16-beta

- Invalid entries are no longer ignored, truncated or misreported silently (#97). The field is marked
  `aria-invalid` and a message under it (its description) says what's wrong and which value is still in use:
  - "Plate width must be more than 0; still using 300 mm." (a plate size of 0 is refused, instead of being reported
    as a margin problem);
  - "Kerf can't be negative …", "Enter a number …";
  - quantities must be whole numbers: 2.5 or -3 get "Enter a whole number, 0 or more; still using 8." instead of
    becoming 2 or being ignored;
  - kerf calculator: "Measured must be smaller than designed: the cut takes material away.", and both values must be
    more than 0.
- The message goes as soon as the value is valid, or when the units are switched. README updated.

## 1.1.15-beta

- Plate previews have a text alternative (#96): the image is described as "Plate 1 of 2: 15 parts, 75% fill" and points
  (`aria-describedby`) to a new "Parts on this plate" list under each plate, grouped by file with counts and rotations
  ("l-bracket.svg × 2 (2 rotated 180°)"). README updated.

## 1.1.14-beta

- Keyboard focus is no longer dropped to the page (#95):
  - removing a part moves focus to the next part's quantity (or the previous one, or the drop zone);
  - when the parts list or the plates are redrawn, focus goes back to the same control (same part, same plate's Download
    button);
  - Search 30 s more and Stop hand focus to each other;
  - buttons that are only temporarily unavailable (downloads while the layout is out of date, Search more while
    searching) use `aria-disabled`, so they keep focus.
- README Accessibility section: screen-reader announcements, the message list and focus handling described; #93, #94
  and #95 removed from the known gaps.

## 1.1.13-beta

- Messages no longer vanish after 3.5 s (#94):
  - warnings and errors (import problems, notices from downloads such as the kerf-compensation warning, nesting
    errors) appear as separate items in a message list above the plates and stay until dismissed. Each has a Dismiss
    button, errors are marked, and the same message isn't added twice;
  - the toast is only for short confirmations ("Saved plate-01-of-02.svg", "Kerf updated"). It stays at least 20 s
    (longer for long text), stays while the pointer is over it, and Esc closes it.

## 1.1.12-beta

- Screen readers now hear what happens (#93). Two visually hidden live regions (polite and alert) are always in the
  page:
  - each run ends with one summary ("Nesting finished: 2 plates, 53% average fill, 32 of 32 parts placed.", files left
    out, or "out of date" after Stop). Progress ticks aren't announced;
  - every toast message is announced, and errors (wrong file type, nesting stopped after an error) go to the alert
    region;
  - the "geometry library didn't load" box has `role="alert"`.

## 1.1.11-beta

- README, Accessibility: the target is WCAG 2.1 AA plus Section 508's documentation (602) and forced-colors (302.2)
  requirements. It also explains how the two standards relate: 508 points to WCAG 2.0 AA, 2.1 adds a few criteria,
  and nothing conflicts. It says the target isn't met yet (#106).

## 1.1.10-beta

- README: a new Accessibility section covers keyboard use, the light/dark theme and reduced motion, and lists the known
  gaps with their issues. The four test-cut sub-headings (Kerf test, Finger joint, Box corner, Slot gauge) are real
  `###` headings instead of bold text (#104).

## 1.1.9-beta

- README: the libraries and fonts come from four public CDNs on every page load (unless cached), which shows them your
  IP address; your files never leave the browser. It also says what still works without each one: no nesting without
  clipper-lib, no zip download without jszip, system fonts without Google Fonts. The jszip version is given in the
  README and `CLAUDE.md` (#89).

## 1.1.8-beta

- README: a Settings section covering every setting (mode, units, plate and spacing values, compensation,
  rotation, outline precision, unitless SVG scale, plate outline, file prefix and names, export format), the
  quantity and orientation lock in the parts list, sample parts, settings kept in the browser, and what happens to
  imported files (hidden shapes and outside links left out; no nesting inside holes yet). It also gives the browsers
  needed, and the Files table lists `CHANGELOG.md` and `CLAUDE.md` (#88).

## 1.1.7-beta

- The project uses **American English**. #87 had it backwards: "neighboring" was right, and the British spellings
  were the defect. Swept the whole project: color(s), recolor, behavior, gray, labeled, neighbors, recognized,
  organized, optimization, millimeters, dialing, defense, sanitizer, summarize. That covers UI messages, the README,
  the CHANGELOG, `CLAUDE.md`, `RELEASING.md`, code comments and fixture comments (#87).
- Fixtures renamed: `dxf/dxf-same-color-layers.dxf` and `makeit/makeit-id-colors.svg`.
- `CLAUDE.md` states the rule. The blind-review prompt in `RELEASING.md` now treats British spellings as findings.
  `aria-labelledby` keeps its spec spelling.

## 1.1.6-beta

- Outline precision options are labeled "Standard (0.25 mm)" and "Fine (0.1 mm)" instead of "±0.25 mm" / "±0.1 mm":
  very complex outlines are simplified further (always outward), so the figure isn't a guaranteed tolerance. The README
  now explains the setting: it changes only the nesting spacing, never the cut paths (#86).

## 1.1.5-beta

- README, kerf test: the 0.06 mm pin hole stays as drawn (with a notice) only when the kerf is 0.06 mm or more; with
  a finer kerf it is compensated like the other holes. The guide said it was narrower than any kerf (#82).

## 1.1.4-beta

- README, test cuts: "set Rotation: None" only works in True shape mode. The guide now also says to untick "Allow
  90° rotation" in Bounding box mode, or to use each piece's Lock orientation button (#81).

## 1.1.3-beta

- DXF import: entities on frozen, off or non-plotting layers or the Defpoints layer were left out silently, although
  the README promised a notice. The import now names them ("left out 3 items on frozen, off, non-plotting or Defpoints
  layers"). The README also says that paper space and invisible entities are left out without a notice (#80).

## 1.1.2-beta

- Versioning: the scheme now covers a pre-release suffix such as `-beta`. It is added and dropped only on request,
  stays on later versions, and the iterative number keeps bumping (1.1.0-beta → 1.1.1-beta). Once dropped, it comes
  back only for a major rewrite. Described in `CLAUDE.md`,
  the README and the CHANGELOG preamble; the 1.0.0-beta entry now says "first beta release", not "release candidate"
  (#79).

## 1.1.1-beta

- README, finger-joint test cut: without compensation the joint has about **two** kerfs of play in total, not one
  (fingers come out a kerf narrower and gaps a kerf wider) (#69).

## 1.1.0-beta

- Release for integration in other projects. Minor version bumped to 1.1 on request; iterative reset to 0.
- Same features as 1.0.11-beta: the library (`lib/snugcut.js`) and app (`app/`) as ES modules, with `snugcut.html`
  generated from them by `tools/build.py`.

## 1.0.11-beta

- The source is split into a library and an app, and `snugcut.html` is generated from them:
  - `lib/snugcut.js`: the library (SVG/DXF import, outlines, nesting, kerf compensation, SVG/DXF export), no UI;
  - `app/index.html`, `app/snugcut.css`, `app/app.js`: the app, with `app.js` importing the library. All are ES
    modules; the split app runs when served over HTTP, not from `file://`.
  - `tools/build.py` (Python 3, standard library only) inlines them into `snugcut.html`, which stays one file you can
    double-click. `--check` reports when it is out of date.
- `app/index.html` has its own Content-Security-Policy, as strict as `snugcut.html`'s plus `'self'` for its module and
  stylesheet; the build writes it into `snugcut.html` without `'self'`.
- No change in behavior: SVG and DXF exports from `snugcut.html` are byte-identical to 1.0.10-beta for every fixture
  (compensation off and on) and for full nests of the sample parts.
- `CLAUDE.md`, README and `RELEASING.md` describe the new layout; `CLAUDE.md`'s "no build step" rule now allows
  `tools/build.py`.

## 1.0.10-beta

- Shorter wording for the warning to turn off kerf offset in the cutter's software, in the README and in the app's
  kerf-compensation notice, which now match.

## 1.0.9-beta

- Docs brought up to date for the release:
  - README: out-of-date plates are dimmed and can't be downloaded (#67); how SVG sizes and a `viewBox` with another
    aspect ratio are scaled (#65); nesting doesn't add the compensation allowance around parts exported as drawn
    (#68); the jszip version.
  - README and `CLAUDE.md`: git-flow wording covers `bugfix/` branches and fixes during a release.

## 1.0.8-beta

- The two CDN libraries (clipper-lib 6.4.2, jszip 3.10.1) load with Subresource Integrity (`integrity="sha384-…"`,
  `crossorigin="anonymous"`), so a changed or tampered CDN file is blocked instead of run (#70). A blocked clipper-lib
  shows the existing "geometry library didn't load" message; a blocked jszip only hides the zip download.
- README: how to recompute the hashes when a library version changes.

## 1.0.7-beta

- Parts kept as original markup (text, images, effects) were kerf-compensated in DXF exports but not in SVG. Both
  formats now export them as drawn, with the same notice, as the README says (#68).
- With compensation on, nesting no longer reserves a compensation allowance around those parts, since they aren't
  compensated: they get exactly the set spacing.

## 1.0.6-beta

- Clicking **Stop** before the first layout after a change was ready threw an error, left the status stuck at
  "Nesting…", and made "Search 30 s more" fail. It now says the plates shown are out of date, and "Search 30 s more"
  starts a fresh search (#67).
- After changing parts, quantities, rotation locks, kerf, compensation, plate size or any other nesting setting, the
  previous plates could still be downloaded until the new layout appeared. They are now dimmed and their download
  buttons disabled until a new layout replaces them.
- A change also drops the previous search, so "Search 30 s more" can't continue it with the old parts.

## 1.0.5-beta

- DXF export of parts imported from DXF keeps one output layer per source layer, as the export header promises, even
  when layers share a color (e.g. CUT and SCORE both color 7). Open lines are no longer joined across layers (#66).
- The DXF LAYER table no longer lists layer `0` twice when the source uses it, and its count matches its records.
- SVG export is unchanged: DXF-imported parts still export with one path per line style.
- Fixture: `dxf/dxf-same-color-layers.dxf`.

## 1.0.4-beta

- An SVG whose `viewBox` has a different aspect ratio from its `width`/`height` is no longer stretched (#65). Before,
  x and y were scaled separately, so a circle was cut as an ellipse. Scaling now follows `preserveAspectRatio` as
  viewers do:
  - `meet` (the default, also used for an invalid value) fits the drawing in the box;
  - `slice` fills the box;
  - only `none` stretches.
- Shapes are never cropped to the box, whatever the value: SnugCut always cuts whole shapes.
- Fixtures: `geometry/viewbox-aspect-meet.svg`, `viewbox-aspect-none.svg`, `viewbox-aspect-slice.svg`.

## 1.0.3-beta

- New `RELEASING.md` with the release procedure:
  - ask about an efficiency review and optimization before cutting a release branch;
  - cut the branch and bump the version, only when the maintainer says so;
  - run the blind review (correctness, documentation, security, accessibility) and file the findings as issues;
  - fix on `bugfix/` branches, then finish the release only with the maintainer's approval.
- Linked from the README and `CLAUDE.md`.

## 1.0.2-beta

- Fill, stroke, stroke width, font size, `style` and the other presentation attributes set on the root `<svg>` now
  count when a part is measured and flattened (#64). Before, they were only applied to the thumbnail and to parts
  exported as drawn:
  - red outlines set on the root exported as black filled areas, and skipped kerf compensation;
  - a file whose only stroke was on the root was rejected as having no visible shapes;
  - text sized on the root was measured at 16 px, then exported at its real size and ran into its neighbors.
- Files without presentation attributes on the root export exactly as before.
- Fixtures: `geometry/root-attrs-stroke.svg`, `root-attrs-stroke-only.svg`, `root-attrs-font-size.svg`.

## 1.0.1-beta

- Class names in a file without a `<style>` block no longer pick up the app's own CSS while the part is measured
  (#63). A shape with `class="icon"` was measured as 28 × 28 mm (`dot` 8 × 8, `bar` 5 high), so nested copies
  overlapped on the plate; `note`, `hint` and `icon` turned `currentColor` into the UI gray `#93a0ae`.
- The class names are prefixed only while measuring; the exported markup keeps them as drawn.
- Fixture: `css/ui-class-names.svg`.

## 1.0.0-beta

- First beta release. Major version bumped to 1 on request; minor and iterative reset to 0.
- Same features as 0.1.33. The footer, the export comment (`<!-- SnugCut v1.0.0-beta -->`) and the DXF `999` marker
  carry the new version.

## 0.1.33

- Renamed **Plate Nester → SnugCut**.
  - The app file is now `snugcut.html` (was `plate-nester.html`).
  - Page title, header, docs, `.gitignore`, the export comment (`<!-- SnugCut v… -->`) and the DXF `999` marker all
    use the new name.
  - The footer changelog link points to `github.com/cyvaquero/snugcut`; the GitHub repo is renamed to match, and
    GitHub redirects the old URLs.
  - Settings move from the `platenester.settings` key to `snugcut.settings`. Saved settings (kerf, prefix, format, …)
    carry over on first load, and the old key is removed.
  - Files compensated by Plate Nester are still recognized, because the marker check doesn't depend on the name.
  - Entries below keep the old name, as historical record.

## 0.1.32

- Shapes a browser wouldn't show are no longer measured, nested or cut (#17). Before, only `display:none` counted as
  hidden. Shapes with `visibility:hidden`, `opacity:0` (on the shape or a parent group), or no fill and no stroke
  made the part bigger, and in the flattened SVG and the DXF the `visibility:hidden` ones became **visible cuts**.
  - `dropHidden` removes them once, at import, before measuring. They are drawable elements outside
    `defs`/`clipPath`/`mask`/`marker`/`pattern`/`symbol` with: `display:none` on the shape or a parent; visibility
    other than `visible` (a `visibility="visible"` child of a hidden group still counts); opacity 0 on the shape or
    a parent; or no visible fill and no visible stroke.
  - The part's size, nesting outline, preview, thumbnail, SVG and DXF export, and parts kept as original markup all
    agree.
  - A notice names the files that had hidden shapes and how many were left out.
  - The measuring element is now hidden with `opacity:0` instead of `visibility:hidden`. Every part inherited that
    `visibility:hidden`, so a shape's own visibility couldn't be read.
  - New fixture `fixtures/geometry/hidden-shapes.svg`. It used to measure 190 × 140 mm with 7 outer contours; it now
    measures 40 × 30 mm with 1, and exports only the frame and the small square.
  - Other fixtures: SVG and DXF exports, nesting outlines and the sample layout are unchanged. `hidden-group.svg`
    only loses its `display:none` shapes from its internal markup.

## 0.1.31

- Test-cut fixtures for kerf and fit (red = cut, blue = score):
  - `fingers-inplane-a.svg` and `fingers-inplane-b.svg`: an in-plane finger joint (three 6 mm fingers into two). The
    fit depends only on the kerf, not on material thickness: snug with the right kerf and compensation, loose by
    about a kerf without.
  - `box-corner-a.svg` and `box-corner-b.svg`: a 90° box corner for 3 mm stock (8 mm fingers, 3 mm deep).
  - `slot-gauge-3mm.svg`: open slots 2.8 / 2.9 / 3.0 / 3.1 / 3.2 mm wide, marked by 1–5 score ticks, to check
    material thickness and fit as cut.
  - No app changes.
- `fixtures/` is organized into subfolders: `geometry/`, `css/`, `makeit/`, `security/`, `dxf/` and `test-cuts/`,
  described in `fixtures/README.md`. File names are unchanged, so paths in older entries and issues refer to
  `fixtures/<folder>/<name>`.
- README: a new **Test cuts** section. For each piece in `fixtures/test-cuts/`: how to cut it, what to measure, and
  how to adjust the kerf from the result.

## 0.1.30

- Optional kerf compensation (#36): **Compensate kerf on objects** under Kerf, off by default. With it off, SVG and
  DXF exports are byte-for-byte unchanged.
  - Every closed, unfilled cut path moves by half the kerf (`kerfPaths`): outward for outlines (even nesting depth)
    and inward for holes (odd), with round outer corners (clipper offset, within 0.002 mm). Drawn direction and
    start point are kept. Applies to the preview, the SVG export and the DXF export.
  - Filled areas, open lines, parts kept as original markup, and holes narrower than the kerf stay as drawn; the
    last two get a notice.
  - Nesting: the true-shape envelope and the bounding-box sizes grow by the half kerf. Compensated parts keep the
    full kerf + gap apart and stay inside the edge margin (checked: 60 parts, kerf 0.5 + gap 0.5 → ≥ 1.0 mm apart,
    exactly 3.0 mm from the edge, in both modes).
  - Double-compensation safeguards:
    - While the option is on, a warning in the panel says to turn off kerf offset in the cutter's software and
      explains the consequences (a full kerf too big or too small).
    - Every download repeats the reminder.
    - Compensated files carry a marker (SVG comment, DXF `999` comment). Such a file added again is recognized
      and not compensated a second time.
  - Acceptance check with kerf 0.1: 20 mm square → 20.1, 10 mm square hole → 9.9, Ø6 hole → Ø5.9 (radius within
    0.002 mm). The score line and the filled mark are unchanged. New fixture `fixtures/kerf-test.svg`.

## 0.1.29

- Much faster import of large DXF files and long SVG paths. A 300 × 200 mm DXF panel with 400 holes and 60 slots
  took 46 s to add; it now takes 0.14 s. The fixtures load in 1–5 ms instead of 36–1,600 ms.
  - Outline points for nesting (`extractRings`) are now computed straight from the path data: lines at their ends,
    curves every ~0.1 mm. Before, they came from the browser's `getPointAtLength`, which walks the whole path on
    every call. The old sampling is kept only as a fallback for path data that can't be parsed.
  - Subpaths are now read exactly. Before, they were guessed from jumps between samples, and each path was capped
    at 6,000 samples in total, which also blurred small holes in long paths.
  - The DXF reader writes one `<path>` per entity instead of one per layer and color.
  - Nesting outlines are unchanged within 0.03 % for all fixtures (circles slightly more accurate), and the sample
    layout is the same. Outlines drawn as separate DXF LINEs now get the 0.05 mm allowance that separate SVG
    `<line>`s always had. SVG and DXF-part exports are byte-for-byte unchanged.

## 0.1.28

- DXF export (#32): new **Export format** setting (SVG / DXF (R12, mm)) next to the file prefix, used by the per-plate
  download buttons ("Download DXF") and the zip. SVG stays the default and is byte-for-byte unchanged.
  - Hand-written DXF R12 writer (`plateDXF`): ASCII, `$INSUNITS` mm, origin bottom-left, a LAYER table, and LINE
    or POLYLINE/VERTEX entities.
  - The same cut paths as the SVG export, in the same order: rows of parts, inner cuts first, joined outlines. The
    grouping and ordering moved into `cutGroups`, which both exports share.
  - Circular arcs become polyline bulges, so circles and rounded corners stay true arcs; ellipses, splines and other
    curves are flattened to within 0.01 mm.
  - One layer per color, named by its hex value, with the nearest ACI color. Parts imported from DXF keep their
    source layer names. "Plate outline in export" adds a `PLATE` layer.
  - Parts kept as original markup in SVG (text, images, `<use>`, clipping, gradients) are written from the shapes
    that can be: a second, loose `extractFlat` pass at import. A notice names what was left out (text, images, …),
    and filled shapes are written as outlines.
  - Checked with ezdxf on all 23 fixtures: every file loads and audits clean. Geometry matches the SVG export within
    0.05 mm (sampling resolution), and the cut order is the same.

## 0.1.27

- The version in the page footer is followed by a "(changelog)" link to this file on GitHub (`develop`), opening at
  the section for that version.

## 0.1.26

- DXF import (#31), with our own reader in the page (no new library, CSP unchanged). Each ASCII DXF is converted to
  an SVG part in mm and then handled like any SVG file, so nesting, cut order, outline joining and the export format
  are unchanged.
  - Entities: LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE and POLYLINE (bulges → arcs), SPLINE (control points and knots,
    rational too; fit-point-only splines as a smooth cubic through the points), and INSERT (base point, scale,
    rotation, mirroring, MINSERT arrays, nested blocks, BYBLOCK color and layer 0 inheritance).
  - 2D entities with extrusion (0,0,−1) are mirrored as in CAD.
  - Units from `$INSUNITS`; files without units are read as mm, with a notice. Model space only; paper space,
    invisible entities, and frozen, off, non-plotting and Defpoints layers are skipped.
  - Colors: AutoCAD Color Index (7 → black) or true color, BYLAYER/BYBLOCK resolved, one `<g>` per DXF layer.
  - Text, hatches, dimensions, points, meshes and other non-outline entities are skipped, with a notice listing
    them. Binary DXF and unreadable files get a clear message.
  - Checked against ezdxf's extents and renderer: identical sizes and matching shapes for all fixtures; a rational
    quarter circle is within 0.0001 mm. SVG imports are byte-for-byte unchanged.
  - New fixtures `fixtures/dxf-mm-bracket.dxf`, `dxf-inch-plate.dxf`, `dxf-blocks.dxf`, `dxf-r12-unitless.dxf`.

## 0.1.25

- Output file prefix (#28): a new setting under Plate & cutting. With a prefix such as `bracket-3mm`, downloads are
  named `bracket-3mm-plate-01-of-03.svg` and `bracket-3mm-plates.zip`, and the plate files inside the zip get the same
  names. The prefix is made safe for file names (`/ \ : * ? " < > |`, control characters and leading/trailing dots are
  removed, whitespace is collapsed, 60 characters at most), saved with the other settings, and previewed under the
  field. Empty keeps the current names. The SVG content is unchanged.

## 0.1.24

- New MakeIT test file for #13, `fixtures/makeit-id-colors.svg`: ids that read as hex colors (`f00`, `ff0000`)
  used in both selectors and color values, a rule elsewhere using `#f00`, a red control and a black reference.
  Every square is drawn black, and red means the color survived id prefixing. Checked in headless Chrome: 0.1.16
  turns cases 1–3 black, the current build turns them red. No app changes.

## 0.1.23

- `<line>` elements export with `fill="none"` instead of the default `fill="#000000"` (#46). MakeIT took that fill
  color, so lines landed on the black layer whatever their stroke color. Lines can now also be chained with the
  other open segments of the same style, so CAD outlines drawn as separate `<line>`s become one closed path. Files
  without `<line>` export unchanged. New fixture `fixtures/cad-lines.svg`.

## 0.1.22

- `currentColor` in imported SVGs exports as black again, as in a standalone SVG, instead of the app's theme text
  color (#44; `#e4e9ef` in dark mode, `#16202b` in light). The hidden element that parts are measured in now
  starts from `all:initial` with black text and a light color scheme, so imported parts no longer inherit the
  page's color or fonts. A `color` set in the file still applies. Files without `currentColor` export unchanged.
  New fixture `fixtures/current-color.svg`.

## 0.1.21

- Parts kept as original markup no longer carry their `<style>` block into the plate (#38, #42). MakeIT 3.06
  ignores class, universal and descendant selectors but applies element-type rules (`rect {…}`) to the whole plate,
  so a part styled by `.cls-1` rules imported with the wrong colors and layers, and one file's `rect {…}` could
  recolor another file's parts. On import (`inlineSheets`), the computed value of every property the rules declare
  is written onto the elements they match, as presentation attributes where possible (colors as hex, lengths
  without `px`). Then the rules are removed; only `@font-face`/`@keyframes` are kept. Rules on the root reach its
  children. Rendering is unchanged, checked element by element against 0.1.20. Flattened parts and files without
  `<style>` export unchanged. New fixtures `fixtures/selector-leak-a.svg` and `fixtures/selector-leak-b.svg`.

## 0.1.20

- New MakeIT CSS support test files for #38: `fixtures/makeit-css-support.svg` (class, element-type, descendant,
  child and `:where()` selectors, `style` attribute, inline style beating a rule, plus a black reference square) and
  `fixtures/makeit-css-universal.svg` (`*` selector, kept separate because it would restyle everything). Every test
  square is drawn black, and red means the CSS was applied; in a browser all test squares are red. No app changes.

## 0.1.19

- The flattened export keeps `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray` and
  `stroke-dashoffset` (#14), with dash lengths scaled like the stroke width. They are written only when a shape
  uses a non-default value, and paths that differ in them are no longer merged or chained together. Files that
  don't use them export unchanged. New fixture `fixtures/stroke-styles.svg`.

## 0.1.18

- CSS class rules from one SVG no longer restyle other files' parts on an exported plate (#12). For files with a
  `<style>` block, class names get the file's prefix, like ids already did: in `class` attributes and in `.class`
  selectors (`.cut` becomes `.p3_cut`). Flattened parts and files without `<style>` export unchanged.
  Element and universal selectors (`rect {…}`, `* {…}`) can still leak between files: tracked in #38.
  New fixtures `fixtures/class-clash-a.svg` and `fixtures/class-clash-b.svg`.

## 0.1.17

- Ids that read as hex colors (`fff`, `cafe`, `bad`, …) no longer corrupt colors in `<style>` (#13). Id prefixing
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
  bullets. The kerf field is labeled "Kerf" instead of "Laser kerf", and its hint says "the cut" rather than "the beam". README and CLAUDE.md reworded to match.

## 0.1.13

- Removed `reference/` (the original true-shape and bounding-box apps). `plate-nester.html` is now the only
  source of truth; the originals stay in git history.

## 0.1.12

- Fragmented outlines are joined on export (#27): open subpaths of the same line style whose ends meet (within
  0.01 mm) are chained into continuous paths, reversing pieces where needed, and closed with `Z` when they loop back.
  CAD/DXF-style sources that store every segment separately no longer cut one segment at a time, and their holes are
  now recognized for inside-first ordering (#25). Objects, ids and geometry are unchanged.

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
