# Changelog

Format `major.minor.iterative`, with an optional pre-release suffix such as `-beta`. Major, minor and the suffix change
only on request; the iterative number increments with every change. Once the suffix is dropped, it comes back only for
a major rewrite of what the app does or how it works.

## 1.3.19-beta

- A failed download says so: "The download failed: …" appears as an error notice, for **Download all** and for single
  plates (#287). Before, a failure in building the zip or a plate file did nothing visible.

## 1.3.18-beta

- The Kerf, Designed and Measured fields in the blue kerf box have borders at least 3:1 against the box (#273):
  4.78:1 in the light theme and 5.50:1 in the dark, up from 2.88:1 and 2.69:1.

## 1.3.17-beta

- In Windows high contrast (forced colors), a pressed **Lock** or **Nest parts inside the holes** button shows the
  keyboard focus ring (#266). Its pressed state used the same outline as the focus ring, so focused and unfocused
  looked the same. A pressed button is now filled in the highlight color, as the pressed Nesting mode and Units
  toggles are, and the focus ring shows around it in the system text color.

## 1.3.16-beta

- With the worker pool on, a starting layout that Stop (or the time limit) cuts short is packed by "Search 30 s
  more", as with one worker (#270). It used to be dropped, so Search more went straight to random tries and could
  miss a better starting layout.

## 1.3.15-beta

- Markers on a path (arrowheads, dots set with `marker-start`, `marker-mid` or `marker-end`) are no longer lost
  (#281). The export left them out with no notice, and nesting gave them no room. A part with markers is now kept as
  original markup, so the SVG export draws them; nesting reserves room for each marker up to its full size around the
  point it sits on, in both modes; and the DXF export names them in its notes (`dxfOut.markers`).

## 1.3.14-beta

- SVG files saved in an encoding other than UTF-8 are read as their XML declaration says (#269): text in a Latin-1
  or Windows-1252 file came in as `Gr��e` and was engraved that way; it now reads `Größe` and `5€`. Files with a
  byte-order mark, or no declaration, are read as before.

## 1.3.13-beta

- A shape inside a group with `opacity` (or in a file with `opacity` on its root) keeps that opacity in the export,
  as the thumbnail already showed (#267). `<g opacity="0.3">` around a blue rect exported it fully opaque; nested
  opacities multiply, as in a browser.

## 1.3.12-beta

- DXF layer names are matched without regard to case, as in CAD (#268). An entity on `HIDDEN` whose layer table
  entry is `Hidden` (frozen) was cut, in black, with no "left out" notice; now it is left out with the notice, and an
  entity on `ENGRAVE` takes the color of layer `Engrave` instead of black.

## 1.3.11-beta

- **Security:** crafted outlines no longer freeze the page (#271). A 160 KB SVG zigzag of 20,000 teeth froze the tab
  for 94 s after it was added; the page now blocks for at most 255 ms. A thin outline that the nesting simplifies to a
  line was grown by the spacing point by point: it now keeps a simplified copy within the same tolerance. Lines that
  cross each other more than 10,000 times, or open zigzags with thousands of turns, would take Clipper seconds to
  minutes to trace (a DXF spline crossing itself took 22 s at 2,000 control points): such a part is nested by the
  shape around all of it, with a notice, and exported as drawn. A file whose curves would be sampled into more than
  2,000,000 points is refused with a message (`svg.tooManyPoints`). Ordinary files measure and nest exactly as before.

## 1.3.10-beta

- **Security:** a crafted SVG with a long run of `--name:` text in a style sheet or an attribute no longer freezes the
  page while it is added (#272). The check for CSS custom properties holding a string backtracked quadratically: a
  300 KB file took 8.7 s, and 1 MB would take about 95 s. It now checks one declaration at a time, with the same
  results: that file is added in 14 ms.

## 1.3.9-beta

- The blind review's **Best practices** reviewer covers project structure, build and dependency hygiene, testability
  and operational defaults too, and cites a source for each practice (#306). Its findings stay at info severity, and
  one that shares a root cause with another reviewer's finding is merged into it. No change to the app.

## 1.3.8-beta

- The release blind review gains a fifth blind reviewer, **Best practices** (#282), launched with the other four. It
  checks how the code is written (deprecated APIs, error handling and cleanup, duplicated rules, dead code, the repo's
  own conventions) and files every finding as `best-practice`, `code-review`, `severity:info`. No change to the app.

## 1.3.0-beta

Release of 1.2.1-beta through 1.2.40-beta, with the fixes from the release review (1.3.1-beta through 1.3.7-beta).

### Added

- The layout search runs in a background worker, so the page no longer stutters while it searches (#4). On 120 mixed
  parts the page had up to 56 ms long tasks (260 ms in all) during a 4 s search; now there are none, and the search
  tries about 12–14% more layouts in the same time (120 parts at 15° steps finish in 8.3 s instead of 9.5 s). Layouts
  and exports are exactly the ones the page would make itself, and where a worker can't start the search runs on the
  page as before. The page's security policy allows a worker built in the page (`worker-src blob:`) and fetching
  clipper-lib's own URL with its integrity hash (`connect-src`).
- **Worker pool** setting (True shape), in its own box above Plate & cutting: Off by default (one worker), or 2, 3 or
  4 workers, each trying its own orders (#4, #253, #255). With 4 workers the sample parts get 982 layouts tried in
  8 s instead of 236, and 120 mixed parts 90 in 15 s instead of 23, with better best layouts. A pool never ends with
  a worse layout than one worker would after the same tries; "Layouts tried" counts all workers, and "Search 30 s
  more" continues each of them. The box always warns that each extra worker uses more memory (about 100 MB on a job
  of 120 parts), so on a lower-spec computer the pool should stay off; choosing fewer workers frees their memory.
  The choice is kept with the other settings.
- The app's messages come from a string table (`app/strings-en.js`), in whole sentences with placeholders and plural
  forms, and the page's own text is marked with keys, ready for translations; `tools/build.py` stops on a message key
  that is used but missing, defined but unused, or a page key used twice (#128, #129). The library's import and
  export messages have codes and values, so a program using `lib/snugcut.js` can word them itself (`setMessages`);
  errors carry `.code` and `.vars`, and the README lists the 25 codes. The English text is unchanged.
- The export QA issues each link a Word workbook in `qa/`, generated by `tools/qa_workbooks.py`: the setup, the app's
  notes and all 22 tests with their steps and expected results, a results table and screenshot boxes per test, and a
  results summary (#49, #50, #51, #52, #132, #133).

### Changed

- SnugCut is licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later) (#196):
  `LICENSE` holds the license text, the sources carry SPDX identifiers and a copyright notice, the README has a
  License section (including the libraries' own licenses), and the footer links to the license.
- Faster True-shape search, with identical layouts and exports (#257): a copy of a part no longer reruns a plate's
  placement check where an identical copy already found no room. With one worker the sample parts get 320 layouts
  tried in 8 s instead of 239, and 120 mixed parts 34 in 15 s instead of 25; their first layout comes in 739 ms
  instead of 920 ms, and at 15° steps in 7.0 s instead of 8.3 s.
- Numbers on screen follow the browser's locale: sizes, the kerf, fill and efficiency percentages, the search time
  and the library's size limits in import errors read `68,4 × 65,4 mm`, `54 %` and `250.000` in German, for example
  (#128). English is unchanged, and exports always use `.`.
- Parts are measured in a shadow tree, apart from the page (#239, #261). When SnugCut runs inside another site, that
  site's CSS no longer changes parts (a shape inside a link exported in the site's link color, and one with a `hidden`
  attribute was left out), and a part's own CSS can't match the page's elements. `:root` rules in a part still apply;
  a rule that only matched because of the page around the drawing, such as `body rect`, no longer does, as in an SVG
  viewer. `<use>` copies still nest by the shapes they copy.
- Documentation and project rules: `CLAUDE.md` follows the maintainer's working rules and says how to consolidate the
  CHANGELOG at a release; `RELEASING.md`'s blind review follows the current procedure; the README's accessibility
  section matches the app, including how Section 508's 501.1 exception and 504 apply; fixture comments give the sizes
  the app measures (#169, #175, #181, #199, #200, #201).

### Fixed

- A part nested in a hole is always recognized as in it, so it is cut before the part around it, also next to an
  island such as the disc left in a frame's window (#259). On 10 mixed fixtures with Compensate kerf on, 2 of 15
  nested parts were misplaced in the cut order before the fix and none after.
- Lengths given as percentages in an SVG (`width="100%"`, `r="20%"`, `x="50%"` on a `<use>` …) resolve against the
  file's own viewport, so parts import at their real size (#260): a 100 × 50 mm rect drawn as `width="100%"
  height="100%"` came in as 10 × 10 mm. The outline, the thumbnail and the export agree.
- Rounded corners set with CSS (`rx`/`ry` in a style sheet or `style` attribute) are exported rounded, matching the
  outline used for nesting (#263); a 100 × 50 mm rect with `rx:20px` was cut square, its corners up to 5.9 mm past
  the spacing kept around it.
- A path that goes on drawing after closing (`… Z L0 10`) is cut as drawn (#264): the DXF no longer cuts a side that
  was never drawn, and Compensate kerf applies to the closed shape.
- A part that only contains an unused `<filter>` (common in Inkscape files) or a `<view>` is exported as cut paths,
  so Compensate kerf applies to it (#265).
- DXF splines follow their curve within 0.005 mm, however large (#262): a 300 mm one-span curve (how Inkscape writes
  each Bézier segment) was off by up to 0.88 mm and now comes out within 0.0035 mm.
- A `<line>` whose coordinates carry units or percentages (`x2="60mm"`) nests by its full length, so other parts are
  no longer placed across it (#163).
- Drawings far from their origin (site, GIS or CAD world coordinates) are read and placed exactly: at 5,000,000 units
  out, parts kept the full edge margin in Bounding box mode instead of sitting 0.2 mm into it, shapes other than paths
  were no longer 0.2 mm off, and parts kept as original markup no longer moved by up to 1 mm (#164, #213, #214, #217).
- **Area minimum** leaves out the holes that other parts may nest in, so it no longer shows more plates than the
  layout uses (#165).
- The search's time limit covers its starting layouts (#234): 120 mixed parts at 15° steps searched for 17.8 s (21.0 s
  with parts in holes) on a 4 s limit and now stop at 9.2 s and 13.4 s, with the same best layouts. The status never
  shows more time used than the total.
- Length fields and the kerf calculator accept `,` as well as `.` as the decimal point; in Chrome `0,2` was read as
  2 mm, with no error (#229).
- The search status says "1 layout tried", not "1 layouts tried" (#236).
- An invalid quantity you haven't corrected yet stays in its field, with its error, when another setting changes or
  the units switch (#240).
- Screen readers: field errors, the kerf compensation warning and the kerf from a test cut are announced once when
  typing pauses; the kerf hints are read when the field or checkbox gets focus; each plate image keeps its list of
  parts as its description while "Parts on this plate" is closed; icons inside buttons are hidden; the efficiency
  rating reads "5 out of 10"; the sample layout at page load is no longer announced; and links that open a new tab
  say so, with a ↗ arrow on screen (#166, #168, #178, #204, #241, #242).
- Contrast: the plate's edge in the previews is 4.14:1 against the card in the light theme (was 2.32:1), and the
  slashed "no holes" stand-in 3.6:1 light and 4.1:1 dark (was about 2:1) (#167, #176).

### Security

- An uploaded SVG can no longer make the page fetch outside URLs, or put them into the exported plate, by keeping
  them in CSS custom properties (#238). A custom property holding a string, and `var()` inside `image-set()`,
  `image()` or `cross-fade()`, are removed like other outside links (including escaped names and `@property` initial
  values), and the computed values written into exports are checked again. New fixture: `security/css-var-urls.svg`.
- Exported plates no longer carry markup that turns live when other software reads the SVG as HTML: elements that
  aren't SVG (`img`, `iframe`, case variants such as `FOREIGNOBJECT`), elements inside `<desc>` and `<title>`, and
  links written in capitals (`HREF`) are removed on import, and the import notice says so (#161).
- SVG files that repeat shapes through nested linked copies (`<use>`) load much faster (a 1 KB file went from 6.1 s
  to 0.4 s), and a file whose copies would make more than 100,000 elements is refused with a message instead of
  freezing the page (#158).
- A DXF with a spline of a degree CAD programs don't write (above 11) is refused with a message instead of freezing
  the page: a crafted 208 KB file took 98 s and is now refused in 3 ms (#159).
- A DXF whose blocks and arrays would draw more than 2,000,000 points is refused with a message instead of freezing
  the page or running out of memory: a 39 KB block array that took 10 s is now refused in 0.2 s (#160).
- SVG files with many unterminated CSS comments load at normal speed: a 235 KB file that took 2.5 s now takes 3 ms
  (#162).
- Kerf compensation is skipped only for files SnugCut itself exported with compensation built in; the marker text
  anywhere else in a file no longer stops a part from being compensated (#179).

## 1.2.0-beta

Release of 1.1.1-beta through 1.1.59-beta.

### Added

- **Parts inside holes** (True shape, #3): a per-part **Nest parts inside the holes** button, off by default because
  SnugCut can't tell a closed cut from a closed score outline. Turned on, smaller parts go into its holes with the
  usual spacing to the hole's edge and to anything drawn inside it, and each nested part is cut, whole, before the
  part around it (#151). Four 100 mm rings with 60 mm holes and four 40 mm discs fit one 210 × 210 mm plate instead
  of two. Parts without holes show a dimmed, slashed stand-in where the button sits, so every row lines up; it can't be
  clicked or focused and screen readers skip it (#141). New fixtures in `fixtures/nesting/`.
- **Utilization** and an **Efficiency** rating from 1 to 10, from the parts' real material, with the last plate's
  offcut (#130, #137, #138). Utilization is the share of the plate covered by the parts' outlines minus their holes,
  in both modes: a hole counts as empty until a part is nested in it (#3). Efficiency divides the parts' real material
  by the material the job uses up, counting the last plate only up to one straight cut past its parts; the last
  plate's card shows that offcut when it is at least 10 mm across. Four rings with 60 mm holes and four 40 mm discs
  on a 210 × 210 mm plate rate 5/10 (47%) with the rings' holes off and 6/10 (58%) with them on. Bounding box mode
  no longer reports its whole rectangles as filled: the sample parts showed 85% while they really cover 53% (#130).
- **DXF files without units** get a **Drawn in** menu (mm / inches) (#90): such files are read as inches when their
  `$MEASUREMENT` header says imperial, otherwise as mm, and switching reads the file again in the chosen units,
  keeping the part's place, quantity and lock.
- Plate previews have a text alternative ("Plate 1 of 2: 15 parts, …") that points to a new "Parts on this plate"
  list under each plate, grouped by file with counts and rotations (#96).
- Screen readers hear what happens (#93): each run ends with one summary, every short message is announced, and
  errors go to an alert region. Warnings and errors stay in a message list above the plates until dismissed instead
  of vanishing after 3.5 s; the toast is only for short confirmations, stays at least 20 s, and Esc closes it (#94).
- The header links to the project and the issue tracker (#150).
- README: Settings and Accessibility sections, what the libraries and fonts load from, and the Area minimum stat,
  offcut threshold and kept-markup parts explained (#88, #104, #106, #170, #173).

### Changed

- **Rounded rectangles and `<use>` copies** nest by their real outlines (#15): a 100 × 60 mm rect with 25 mm corners
  nests as 5,432 mm² instead of 5,968 mm²; two L brackets, one placed by a rotated `<use>`, as 928 mm² instead of
  1,528.
- **Faster search**, no freezes during a search, and big line drawings join quickly (#145, #147, #148, #154). On 112
  mixed parts a warm pass takes 3.4 s instead of 9.6 s; a cold pack of every fixture 530 ms instead of 724 ms; the
  longest freeze during a search 69 ms instead of 1.2 s; 30,000 shuffled DXF lines join in 85 ms instead of 3.5 s.
  Layouts and exports are identical.
- Outline precision options are labeled "Standard (0.25 mm)" and "Fine (0.1 mm)" instead of "±0.25 mm" / "±0.1 mm",
  since very complex outlines are simplified further (#86).
- The project uses **American English** everywhere, including UI messages and fixture names (#87).
- Versioning covers a pre-release suffix such as `-beta`, added and dropped only on request (#79).
- In inches the kerf field suggests "e.g. 0.004" instead of "e.g. 0.10" (#172), and the kerf calculator's hint says
  to cut the test square with compensation off (#171). The compensation notice says "text, images, linked copies or
  effects" (#170).
- Page structure: the units switch and the "Sample parts" badge sit next to their panel headings, the results column
  is a `<main>` landmark with a "Results" heading, and each plate's title is an `<h3>` (#102). Each quantity field has
  a visible "Qty" label, and lock and download buttons are named per part and per plate (#103). The drop zone's
  accessible name is its visible text (#101).
- Part names in the parts list wrap instead of being cut off; below 480 px each part gets two rows (#100). The holes,
  lock and remove buttons line up with the quantity input (#143).
- README and guides: the test-cut instructions, the finger-joint play, the pin-hole and the hidden-layer notices are
  described as the app works, and the efficiency review requires the full fixture regression (#69, #80, #81, #82,
  #174).

### Fixed

- Fixes from the release review: no single-plate downloads while a search can replace the layout (#153); visible
  focus on the mode and units toggles (#155); plate redraws keep focus and open part lists (#156); previews and
  thumbnails stay visible in forced colors (#157).
- Keyboard focus is no longer dropped to the page when a part is removed or the lists are redrawn, Search 30 s more
  and Stop hand focus to each other, and temporarily unavailable buttons keep focus (#95).
- Invalid entries are marked and explained under the field, with the value still in use, instead of being ignored,
  truncated or misreported; quantities must be whole numbers (#97).
- In forced colors the pressed state of the mode and unit toggles and the orientation lock is visible, and the lock
  icon shows an open shackle when unlocked (#98). Field borders are at least 3:1 in both themes (#99), and the
  preview guide lines 3:1 against the plate (#105).
- True shape: cuts no longer reach into the edge margin (#72): a 78 mm circle's cut ended 0.11 mm inside it. The
  margin is checked against the real cut outline, so True-shape layouts can differ from before.
- An SVG with an absolute `width`/`height` but no `viewBox` is no longer scaled by the Unitless SVG scale setting:
  a `width="100mm"` file holding a 100-unit square measures 26.46 mm at any setting (#73).
- Parts kept as original markup are exported at their exact size: a 100 mm part with a 1200 px/in viewBox came out
  100.16 mm (#74).
- "Search 30 s more" can't continue an old search once the margins leave no usable area (#71); every other settings
  change already dropped it (#67).
- The "too big" mark shows as soon as a part is added (#16). Plate cards say "1 part" (#83). "Set a quantity above
  zero" appears only when no part has a quantity (#84).
- The DXF "nothing to cut" error lists ellipses and says how many items sit on hidden layers (#85), and items on
  frozen, off, non-plotting or Defpoints layers are named in a notice instead of left out silently (#80).

### Security

- An SVG path with a number right after Z (`…Z 5 5`) no longer hangs the page (#152).
- Saved settings are checked before use, so a planted value can't reach the page's markup or stall the nesting, and
  the script policy has no `'unsafe-inline'`: the build puts the hash of `snugcut.html`'s one inline script into its
  CSP (#75).
- Ids containing `$` sequences no longer corrupt parts kept as original markup (#76).
- Crafted DXF files can no longer hang the page: huge ARC and ELLIPSE angles are reduced with a modulo, and block
  arrays past 250,000 items are refused (#77).
- Embedded `data:` content is kept only for raster images and fonts; a `data:` SVG could carry outside links or active
  content into exported files (#78).
- README: the libraries and fonts come from four public CDNs on every page load, which shows them your IP address;
  your files never leave the browser (#89). The header says "your files are never uploaded" instead of "nothing is
  uploaded" (#180).

## 1.1.0-beta

- Release for integration in other projects. Minor version bumped to 1.1 on request; iterative reset to 0.

### Changed

- The source is split into a library (`lib/snugcut.js`: SVG/DXF import, outlines, nesting, kerf compensation, SVG/DXF
  export, no UI) and an app (`app/`), both ES modules, and `snugcut.html` is generated from them by `tools/build.py`;
  it stays one file you can double-click. No change in behavior: SVG and DXF exports are byte-identical to 1.0.10-beta
  for every fixture (compensation off and on) and for full nests of the sample parts.
- Shorter wording for the warning to turn off kerf offset in the cutter's software, in the README and in the app's
  kerf-compensation notice, which now match.

### Fixed

- Class names in a file without a `<style>` block no longer pick up the app's own CSS while the part is measured: a
  shape with `class="icon"` was measured as 28 × 28 mm (#63).
- Fill, stroke, stroke width, font size, `style` and the other presentation attributes set on the root `<svg>` count
  when a part is measured and flattened (#64).
- An SVG whose `viewBox` has a different aspect ratio from its `width`/`height` is no longer stretched; scaling
  follows `preserveAspectRatio` as viewers do, and shapes are never cropped (#65).
- DXF export of parts imported from DXF keeps one output layer per source layer when layers share a color, and the
  LAYER table lists layer `0` once (#66).
- Clicking **Stop** before the first layout no longer throws an error; after any change the previous plates are
  dimmed and can't be downloaded until a new layout replaces them (#67).
- Parts kept as original markup are exported as drawn in both SVG and DXF, with the same notice, and nesting gives
  them exactly the set spacing (#68).

### Security

- The two CDN libraries (clipper-lib 6.4.2, jszip 3.10.1) load with Subresource Integrity, so a changed or tampered
  CDN file is blocked instead of run (#70).

## 1.0.0-beta

- First beta release. Major version bumped to 1 on request; minor and iterative reset to 0.

### Added

- One self-contained page with both nesting modes, **True shape** and **Bounding box**: rotation and outline
  precision for True shape, 90° rotation for Bounding box, "Search 30 s more" and Stop, sample parts, settings kept
  in the browser, mm/in switch, a kerf test-cut helper, and downloads of one SVG per plate or a zip.
- Cut order in exported plates (#25): parts row by row, and within each part inner cuts (holes, slots, engraving)
  before the outline that contains them. Fragmented outlines are joined on export (#27).
- DXF import (#31): LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE and POLYLINE, SPLINE and INSERT (blocks, arrays,
  mirroring), units from `$INSUNITS`, model space only, hidden layers skipped, and a notice for skipped entities.
  Checked against ezdxf: identical sizes for all fixtures, a rational quarter circle within 0.0001 mm.
- DXF export (#32): a DXF R12 writer in mm with the same cut paths and order as the SVG export, arcs as bulges, one
  layer per color or per source layer. Checked with ezdxf on all 23 fixtures: every file loads and audits clean.
- Optional kerf compensation, **Compensate kerf on objects** (#36): closed cut paths move by half the kerf (outward
  for outlines, inward for holes), nesting keeps the full kerf + gap apart, and compensated files carry a marker so
  they aren't compensated twice. With kerf 0.1: 20 mm square → 20.1, 10 mm hole → 9.9, Ø6 hole → Ø5.9.
- Output file prefix (#28) for download names.
- Exported plates carry the app version as a comment, and the footer's version links to this changelog.
- README: a **Test cuts** section for the kerf and fit pieces in `fixtures/test-cuts/`.

### Changed

- Renamed **Plate Nester → SnugCut**: `snugcut.html`, and settings move to `snugcut.settings`, carried over on first
  load. Files compensated by Plate Nester are still recognized.
- Much faster import of large DXF files and long SVG paths: a 300 × 200 mm DXF panel with 400 holes and 60 slots took
  46 s to add and now takes 0.14 s.
- The page describes laser, vinyl, CNC and plasma cutting, and the kerf field is labeled "Kerf".

### Fixed

- Shapes a browser wouldn't show (`visibility:hidden`, `opacity:0`, no fill and no stroke) are no longer measured,
  nested or cut, and a notice names the files that had them (#17).
- The flattened export keeps line caps, joins, miter limits and dashes (#14).
- CSS class rules and ids from one SVG no longer restyle other files' parts or corrupt colors on an exported plate
  (#12, #13), and parts kept as original markup no longer carry their `<style>` block into the plate, where MakeIT
  applied element rules to the whole plate (#38, #42).
- `currentColor` exports as black, not the app's theme color (#44), and `<line>` elements export with `fill="none"`,
  so MakeIT puts them on their stroke color's layer (#46).
- The page declares UTF-8, hidden shapes no longer shape the outline, and parts kept as original markup placed more
  than once get their own ids.

### Security

- Imported SVGs can't make the browser fetch anything from outside the file: external links, `@import` and `url()`
  references are removed, as are HTML, MathML and animation elements, with a notice (#10).
- Content-Security-Policy as a `<meta>` tag: scripts only inline and the two pinned library URLs, nothing else
  fetched (#11).
