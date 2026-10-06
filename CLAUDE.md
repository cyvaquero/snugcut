# SnugCut

Client-side SVG/DXF nesting for laser, vinyl, CNC and plasma cutting (true shape + bounding box) as **one self-contained HTML file with inline
JavaScript**, like the original reference apps it replaced.
The SVG export format is verified in WeCreat MakeIT and must stay exactly as is.

## Rules

- **No Node app**: no npm, package.json, TypeScript, bundler or build step. Libraries come in by `<script>` tag, as in
  the original reference apps (clipper-lib 6.4.2, jszip). Any new or changed library/CDN URL must also be added to the
  Content-Security-Policy `<meta>` in `snugcut.html`, or the browser will block it.
- **Git-flow**: `main` + `develop`; feature branches off `develop`; PRs into `develop`.
- **Versioning** `#.#.#` (major.minor.iterative), kept in the page footer of `snugcut.html` and `CHANGELOG.md`:
  - major: only bumped when the user explicitly says so; zeroes minor and iterative.
  - minor: only bumped when the user explicitly says so; keeps major, zeroes iterative.
  - iterative: bump automatically with every change.
- All internal lengths are mm.
- Sandboxed sessions may not be able to read `~/.gitconfig`: run git with `GIT_CONFIG_GLOBAL` set to a file holding only
  the gh credential helper. The commit identity lives in this clone's `.git/config` (GitHub no-reply address).
