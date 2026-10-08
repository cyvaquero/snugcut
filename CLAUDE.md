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
  `script-src` never allows `'unsafe-inline'`: the build puts the sha256 hash of `snugcut.html`'s one inline script into
  its `script-src` on every run, so injected inline handlers can't run. Never add inline `on…=` handlers or
  `javascript:` URLs; attach handlers in `app.js`.
- **Exports must not change by accident**: a structural or refactoring change must leave SVG and DXF exports from
  `snugcut.html` byte-identical. Run the fixture regression (every fixture, SVG and DXF, compensation off and on) and
  report it.
- **Git-flow**: `main` + `develop`, and only `feature/`, `bugfix/`, `release/`, `hotfix/` and `support/` branches, one
  change per branch and PR.
  - `feature/` and `bugfix/` branch off `develop`, with PRs into `develop`. Fixes during a release go on `bugfix/`
    branches with PRs into the `release/` branch. `hotfix/` branches off `main`; once merged and tagged, `main` is
    merged back into `develop`.
  - Merging PRs, enabling auto-merge, force-pushing, rewriting history, deleting branches or tags and changing repo
    settings need the maintainer's explicit approval in the same conversation. After an approved merge, delete the
    branch locally and on origin.
  - The GitHub default branch is `main`, so only PRs into `main` close issues automatically. Close the others by hand
    with "Fixed in #PR (vX.Y.Z)".
- **Versioning** `#.#.#` (major.minor.iterative), kept in the page footer (`app/index.html`, built into `snugcut.html`) and `CHANGELOG.md`:
  - major: only bumped when the user explicitly says so; zeroes minor and iterative.
  - minor: only bumped when the user explicitly says so; keeps major, zeroes iterative.
  - iterative: bump automatically with every change (once per change, not per commit: follow-up commits on an unmerged
    PR keep its version).
  - pre-release suffix: a `-beta` (or similar) suffix follows the number only when the user asks for it. It stays on
    every later version, and the iterative number keeps bumping (1.1.0-beta → 1.1.1-beta…), until the user says to
    drop it. Once dropped, a suffix comes back only for a major rewrite of what the app does or how it works.
  - every change gets a `CHANGELOG.md` entry saying what changed for the user, with its issue numbers.
- **Releases** follow [RELEASING.md](RELEASING.md). A `release/*` branch is cut only when the user says so, never
  automatically, and the maintainer names the version. Before cutting it, ask whether to run a code efficiency review
  and optimization first. After cutting it, run the blind review prompt in that file. Finishing a release (merge into
  `main`, tag `v<version>`, merge back into `develop`) needs the maintainer's approval.
- **Findings become issues**: every code-review, bug, security, documentation and accessibility finding is filed as a
  GitHub issue before it is reported, in the format of section 3 of [RELEASING.md](RELEASING.md) (plain title; a type
  label, `code-review` when it came from a review, and one `severity:*` label; Severity, CVE and CWE lines; Repro, Root
  cause, Fix and Acceptance). Check `gh issue list --state all` for duplicates first. Parked issues get the `deferred`
  label.
- **QA and hardware**: the maintainer tests physical cuts on a WeCreat Vision Pro (MakeIT) and a Silhouette Cameo 4
  only; anything else can be checked in software only. The export QA issues (LightBurn #49, Bambu Suite #50, xTool
  Studio #51, Silhouette Studio #52, Creality Print #132, Cricut Design Space #133) are owned by named testers: never
  label them `deferred` or `help wanted`.
- **No stored or uploaded user data**: everything stays in the browser. Don't add features that keep or send the user's
  information (presets, history, recent files, accounts, sync, analytics). Remembering the last-used settings in
  `localStorage` (`snugcut.settings`, validated on load) is the one exception.
- **Units**: all internal lengths are mm, and mm is the default unit in every locale; inches only by the user's choice.
- **License**: AGPL-3.0-or-later, copyright Guy Heckman (`LICENSE`). Every source file starts with the SPDX identifier
  and copyright notice (`// SPDX-License-Identifier: AGPL-3.0-or-later`, or an HTML comment in `app/index.html`); add
  it to new source files. A new library must have a license compatible with the AGPL and be listed in the README's
  License section.
- **American English** in all text: UI, docs, CHANGELOG, code comments, fixture names and comments (color, behavior,
  recognize, millimeters, …). HTML/ARIA names keep their spec spelling (`aria-labelledby`).
- **Git identity**: commit as the GitHub no-reply address only, never a personal email (the repo is public). The
  identity lives in this clone's `.git/config`. Sandboxed sessions may not be able to read `~/.gitconfig`: run git with
  `GIT_CONFIG_GLOBAL` set to a file holding only the gh credential helper.
