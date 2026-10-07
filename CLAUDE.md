# SnugCut

Client-side SVG/DXF nesting for laser, vinyl, CNC and plasma cutting (true shape + bounding box), shipped as **one
self-contained HTML file with inline JavaScript** (`snugcut.html`), like the original reference apps it replaced.
The SVG export format is verified in WeCreat MakeIT and must stay exactly as is.

## Layout

- `lib/snugcut.js`: the library (import, outlines, nesting, kerf compensation, SVG/DXF export), no UI. ES module.
- `app/index.html`, `app/snugcut.css`, `app/app.js`: the app split into page, styles and UI code. `app.js` is an ES
  module that imports the library. Served over HTTP only: `file://` (modules don't load) and Node are out of scope.
- `snugcut.html`: **generated** from `app/` and `lib/` by `python3 tools/build.py`. Never edit it by hand. Edit the
  sources, run the script, and commit the sources and the regenerated `snugcut.html` together;
  `python3 tools/build.py --check` fails when it is out of date.

## Rules

- **No Node app**: no npm, package.json, TypeScript or bundler. The only build step is `tools/build.py` (Python 3,
  standard library only), which inlines `app/` and `lib/` into `snugcut.html`; keep it small and dependency-free.
  Libraries come in by `<script>` tag, as in the original reference apps (clipper-lib 6.4.2, jszip 3.10.1), with
  Subresource Integrity.
- **CSP**: `app/index.html` carries its own Content-Security-Policy `<meta>`, as strict as `snugcut.html`'s plus
  `'self'` for its own module and stylesheet. Any new or changed library/CDN URL goes into both: edit the CSP in
  `app/index.html`, and the build writes it into `snugcut.html` (minus `'self'`). Otherwise the browser blocks it.
- **Exports must not change by accident**: a structural or refactoring change must leave SVG and DXF exports from
  `snugcut.html` byte-identical. Run the fixture regression (every fixture, SVG and DXF, compensation off and on) and
  report it.
- **Git-flow**: `main` + `develop`; `feature/` and `bugfix/` branches off `develop`, PRs into `develop`. Fixes during a
  release go on `bugfix/` branches with PRs into the `release/` branch.
- **Versioning** `#.#.#` (major.minor.iterative), kept in the page footer (`app/index.html`, built into `snugcut.html`) and `CHANGELOG.md`:
  - major: only bumped when the user explicitly says so; zeroes minor and iterative.
  - minor: only bumped when the user explicitly says so; keeps major, zeroes iterative.
  - iterative: bump automatically with every change (once per change, not per commit: follow-up commits on an unmerged
    PR keep its version).
  - pre-release suffix: a `-beta` (or similar) suffix follows the number only when the user asks for it. It stays on
    every later version, and the iterative number keeps bumping (1.1.0-beta → 1.1.1-beta…), until the user says to
    drop it.
- **Releases** follow [RELEASING.md](RELEASING.md). A `release/*` branch is cut only when the user says so, never
  automatically. Before cutting it, ask whether to run a code efficiency review and optimisation first. After cutting
  it, run the blind review prompt in that file.
- All internal lengths are mm.
- Sandboxed sessions may not be able to read `~/.gitconfig`: run git with `GIT_CONFIG_GLOBAL` set to a file holding only
  the gh credential helper. The commit identity lives in this clone's `.git/config` (GitHub no-reply address).
