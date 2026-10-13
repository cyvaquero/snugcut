# SnugCut

Client-side SVG/DXF nesting for laser, vinyl, CNC and plasma cutting (true shape + bounding box), shipped as **one
self-contained HTML file with inline JavaScript** (`snugcut.html`), like the original reference apps it replaced.
The SVG export format is verified in WeCreat MakeIT and must stay exactly as is.

## Layout

- `lib/snugcut.js`: the library (import, outlines, nesting, kerf compensation, SVG/DXF export), no UI. ES module.
- `app/index.html`, `app/snugcut.css`, `app/app.js`: the app split into page, styles and UI code. `app.js` is an ES
  module that imports the library. Served over HTTP only: `file://` (modules don't load) and Node are out of scope.
- `app/strings-en.js`: the text of every message `app.js` shows, by key (`t("key", {values})`), in whole sentences with
  `{name}` and `{n, plural, …}` placeholders; the page's own text stays in `index.html`, marked with `data-t` keys.
  New UI text goes there, never inline. The build fails on a key that is used but missing, or defined but unused.
- `snugcut.html`: **generated** from `app/` and `lib/` by `python3 tools/build.py`. Never edit it by hand. Edit the
  sources, run the script, and commit the sources and the regenerated `snugcut.html` together;
  `python3 tools/build.py --check` fails when it is out of date.

## Rules

- **No Node app**: no npm, package.json, TypeScript or bundler. The only build step is `tools/build.py` (Python 3,
  standard library only), which inlines `app/` and `lib/` into `snugcut.html`. Don't add tooling, dependencies or build
  steps without asking. Libraries come in by `<script>` tag (clipper-lib 6.4.2, jszip 3.10.1) with Subresource
  Integrity.
- **CSP**: `app/index.html` carries its own Content-Security-Policy `<meta>`, as strict as `snugcut.html`'s plus
  `'self'` for its own module and stylesheet. Any new or changed library/CDN URL goes into both: edit the CSP in
  `app/index.html`, and the build writes it into `snugcut.html` (minus `'self'`). clipper-lib's URL is also in
  `connect-src`: the search worker (`worker-src blob:`) fetches it with the script tag's integrity hash.
  `script-src` never allows `'unsafe-inline'`: the build puts the sha256 hash of `snugcut.html`'s one inline script into
  its `script-src` on every run. Never add inline `on…=` handlers or `javascript:` URLs; attach handlers in `app.js`.
- **Exports must not change by accident**: a structural or refactoring change must leave SVG and DXF exports from
  `snugcut.html` byte-identical. Run the [fixture regression](RELEASING.md#fixture-regression) (`python3 tools/regression.py`)
  and report it; CI runs it too. A change meant to alter exports adds a PR body line `Export changes: …` (entries, why).
- **Verify before claiming a fix works**: run the real code (a headless browser or scripts kept outside the repo) and
  compare before and after; say what was verified and what wasn't.
- **Git-flow**: `main` + `develop`, and only `feature/`, `bugfix/`, `release/`, `hotfix/` and `support/` branches, one
  change per branch and PR.
  - `feature/` and `bugfix/` branch off `develop`, with PRs into `develop`. Fixes during a release go on `bugfix/`
    branches with PRs into the `release/` branch. `hotfix/` branches off `main`; once merged and tagged, `main` is
    merged back into `develop`.
  - Merging PRs, enabling auto-merge, force-pushing, rewriting history, deleting branches or tags and changing repo
    settings need the maintainer's explicit approval in the same conversation. After an approved merge, delete the
    branch locally and on origin.
  - The GitHub default branch is `main`, so only PRs into `main` close issues automatically. Close the others by hand
    with "Fixed in #PR (X.Y.Z)".
- **Versioning** `major.minor.iterative`, kept in the page footer (`app/index.html`, built into `snugcut.html`) and
  `CHANGELOG.md`:
  - major and minor change only when the user explicitly says so; major zeroes minor and iterative, minor zeroes
    iterative. The bump to `X.Y.0` happens only when a release is finished, on the release branch just before it
    merges into `main` ([RELEASING.md](RELEASING.md) section 4); cutting the branch doesn't bump.
  - iterative: bumped automatically once per change, not per commit; follow-up commits on an unmerged PR keep its
    version and update its CHANGELOG entry.
  - hotfixes are numbered `X.Y.Z.H` (H counts the hotfixes on release X.Y.Z and is omitted while zero, as in
    `1.4.0.1-beta`). A hotfix bumps only H, has its own CHANGELOG section and tag, and develop keeps its own version
    when the hotfix merges back.
  - a `-beta` (or similar) suffix follows the number only when the user asks for it. It stays on every later version,
    and the iterative number keeps bumping (1.1.0-beta → 1.1.1-beta…), until the user says to drop it. Once dropped,
    it comes back only for a major rewrite of what the app does or how it works.
  - every change gets a `CHANGELOG.md` entry saying what changed for the user, with its issue numbers.
- **Releases** follow [RELEASING.md](RELEASING.md). Cut a `release/*` branch only when the user says so and names the
  version; before cutting, ask whether to run a code efficiency review and optimization; after cutting, run the blind
  review prompt in that file. Finishing (merge into `main`, tag `<version>` with no `v` prefix, merge back into
  `develop`) needs the maintainer's approval. A major or minor release also consolidates `CHANGELOG.md`, as
  [RELEASING.md](RELEASING.md#changelog-consolidation-at-release) describes.
- **Findings become issues**: every code-review, bug, security, documentation, accessibility and best-practice finding
  is filed as a GitHub issue before it is reported, in the format of section 3 of [RELEASING.md](RELEASING.md); a
  best-practice finding is never above `severity:medium`. Check `gh issue list --state all` for duplicates first.
  Parked issues get the `deferred` label.
- **QA and hardware**: the maintainer tests physical cuts on a WeCreat Vision Pro (MakeIT) and a Silhouette Cameo 4
  only; anything else can be checked in software only. The export QA issues, one per cutter app (LightBurn, Bambu
  Suite, xTool Studio, Silhouette Studio, Creality Print, Cricut Design Space), are owned by named testers: never
  label them `deferred` or `help wanted`. Each issue links its Word workbook in `qa/`, generated by
  `python3 tools/qa_workbooks.py` (`--check` fails when one is out of date): edit the tests and `VERSION` there,
  never the `.docx` files. A test's expected result is also checked by the fixture regression. At release prep, set
  `VERSION` to the release and regenerate; after the tag, update the issues' bodies ([RELEASING.md](RELEASING.md) §4).
- **No stored or uploaded user data**: everything stays in the browser. Don't add features that keep or send the user's
  information (presets, history, recent files, accounts, sync, analytics). Remembering the last-used settings in
  `localStorage` (`snugcut.settings`, validated on load) is the one exception.
- **Units**: all internal lengths are mm, and mm is the default unit in every locale; inches only by the user's choice.
- **License**: AGPL-3.0-or-later, copyright Guy Heckman (`LICENSE`). Every source file starts with the SPDX identifier
  and copyright notice (`// SPDX-License-Identifier: AGPL-3.0-or-later`, or an HTML comment in `app/index.html`). A new
  library must have a license compatible with the AGPL and be listed in the README's License section.
- **American English** in all text: UI, docs, CHANGELOG, code comments, fixture names and comments (color, behavior,
  recognize, millimeters, …). HTML/ARIA names keep their spec spelling (`aria-labelledby`).
- **Git identity**: commit as the GitHub no-reply address only, never a personal email (the repo is public). The
  identity lives in this clone's `.git/config`. Sandboxed sessions may not be able to read `~/.gitconfig`: run git with
  `GIT_CONFIG_GLOBAL` set to a file holding only the gh credential helper.
