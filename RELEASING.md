# Releasing SnugCut

Releases follow git-flow: a `release/<version>` branch is cut from `develop`, fixed up, then merged into `main`
(tagged) and back into `develop`. Version numbers follow the rule in [CLAUDE.md](CLAUDE.md) and the README.

## 1. Before cutting the release branch: efficiency review

Ask the maintainer whether to run a **code efficiency review and optimization** of `lib/snugcut.js` and `app/` first. Don't start
one unasked. If the answer is yes:

- Work on a `feature/` branch off `develop`.
- Look at the hot paths: the nesting and layout search, curve sampling, Clipper offsets, building the export, redraws
  and DOM work, and anything parsed or computed more than once.
- Measure before and after on the files in `fixtures/` (import time, search speed, layouts tried in a fixed time).
- Exports must stay **byte-for-byte identical**: run the full [fixture regression](#fixture-regression) (every fixture, SVG and DXF,
  compensation off and on), as CLAUDE.md requires. The SVG format is verified in WeCreat MakeIT.
- File each finding as a GitHub issue (see section 3 for the format), then merge into `develop` before cutting the
  release branch.

## 2. Cut the release branch (only when the maintainer says so)

The release branch is cut only on the maintainer's instruction, never automatically. Step 1 finishing (or being
declined) is not a reason to cut it; wait to be told, including which version to release.

- Branch `release/<version>` off an up-to-date `develop` and push it.
- Don't bump the version or touch `CHANGELOG.md` at the cut: the release branch keeps develop's iterative number, and
  the bump to `<version>` and the CHANGELOG consolidation happen when the release is finished (section 4).

## 3. After cutting: blind review

Run the blind review below on the release branch unless the maintainer says to hold off, and whenever the maintainer
asks for a review. Every verified finding becomes a GitHub issue.

<details>
<summary>Blind review prompt (paste into Claude Code on the release branch)</summary>

Run a full blind review of this repo (SnugCut: `lib/snugcut.js`, `app/` (including the string table `app/strings-en.js`), the generated `snugcut.html`, `tools/build.py`, `tools/qa_workbooks.py` and the QA workbooks it generates in `qa/`, docs and fixtures) on the current branch, then open GitHub issues for every verified finding.

#### 1. Reviews: blind subagents, run in parallel
Launch 5 independent subagents in ONE message, in the background. Give each the project context (stack, entry points, the verified SVG export format, the "must not change" rules, American English) and nothing about known issues. Every subagent:
- is strictly READ-ONLY on the repo (no edits, commits, branches or pushes) and puts scratch files in its own folder under the scratchpad;
- is BLIND: it must not read git history/log/diffs, GitHub issues or PRs (no `gh`), CHANGELOG history of prior fixes, or anything under ~/.claude. It judges the code as it is now;
- reads ALL of lib/snugcut.js and app/ (and checks that snugcut.html and the QA workbooks are current with `python3 tools/build.py --check` and `python3 tools/qa_workbooks.py --check`) and verifies findings concretely where it can: run the real functions in headless Chrome (file:// via CDP; use a scratch copy with local or stubbed libs if needed) or a node script, otherwise trace with specific inputs;
- reports each finding with: one-line title (the defect), severity (critical/high/medium/low/info), category, location (function + line numbers), concrete repro (minimal SVG/DXF snippet where relevant, expected vs actual), root cause, proposed fix, and status (CONFIRMED by running / CONFIRMED by trace / PLAUSIBLE), most severe first. It drops style nits and speculation, groups instances with one root cause, and ends with a short list of what it checked that held up.

The five reviewers:
1. **Code correctness**: wrong output, crashes, lost parts, units/scale, overlaps in nesting, export geometry, DXF import/export, kerf/gap/margin math, rotation, UI state/race bugs, edge cases. The SVG export format is verified in WeCreat MakeIT and must not change, but wrong values inside it are in scope.
2. **Documentation**: check every claim in README.md, CHANGELOG.md, CLAUDE.md, RELEASING.md, fixtures/README.md, the UI text (the page text in app/index.html and every message in app/strings-en.js: labels, hints, messages, footer) and the QA workbook tests in tools/qa_workbooks.py (steps and expected results) against the code: features, defaults, formats, limits, fixtures referenced vs present, version consistency (footer vs top CHANGELOG entry), stale names and links, contradictions, undocumented features, spelling consistency (the project uses American English; any British spelling is a finding).
3. **Security**: threat model is malicious SVG/DXF files, malicious file names, and CDN supply chain. Cover XSS through imported markup, external references and exfiltration, what exported files carry downstream, CSP strength, SRI (fetch the CDN files and compute sha384), DoS from crafted files, filename injection, eval, localStorage, prototype pollution. Give a CWE id for each finding, and a CVE where a library version has one (else "none applicable"). Don't report what the CSP or sanitizer fully blocks; name the defense instead.
4. **Accessibility**: WCAG 2.1 A/AA and Revised Section 508 (E205/E207, Chapter 3 302 FPCs, Chapter 5 502/503 including the 501.1 web-app exception, Chapter 6 602). Say which 508 provisions apply and why. Test the accessibility tree, keyboard and focus, live regions, contrast in BOTH themes (computed from the CSS variables, including non-text contrast), reflow at 320 px, text spacing, target size, reduced motion, forced colors, text alternatives for previews, a keyboard alternative to drag-and-drop, timing, labels and errors, and the accessibility documentation. Map each finding to both standards (WCAG SC + level, and 508 provision or "not required by 508"). Add a section "Where WCAG 2.1 and Section 508 differ or conflict" that separates WCAG-2.1-only criteria, 508-only provisions, genuine conflicts and scope differences, without inventing conflicts.
5. **Best practices**: code that works but departs from established practice for its stack and tools (web platform, JavaScript, CSS, Python), where the gap carries a concrete risk (a future bug, a maintenance trap, an API that will break). Severity by risk, never above `severity:medium`: **medium** when it will break builds or operations (a deprecated API with an announced removal, unpinned library versions, unsafe script defaults); **low** for maintainability and testability gaps; **info** for convention only. Look at:
   - idiomatic use of the language and platform APIs: deprecated, superseded or non-standard APIs (against the browser minimums in the README), and built-ins that were reimplemented;
   - project structure and module boundaries: DOM or UI code in `lib/`, page globals reached from the worker code, `snugcut.html` and `app/` behaving differently;
   - maintainability: the same rule implemented twice (with different results now or likely later), limits and constants defined in more than one place, dead code, misleading names or comments that contradict the code;
   - consistency with the repo's own rules in CLAUDE.md and RELEASING.md: SPDX header on every source file, every UI string through `app/strings-en.js` or `data-t`, no inline handlers or `javascript:` URLs, lengths in mm internally, settings validated on load, `tools/*.py` standard-library only and small;
   - build and dependency hygiene: pinned library versions with SRI, a reproducible `build.py` and `qa_workbooks.py` output and `--check`;
   - testability: what the fixtures and checks don't cover;
   - error handling and operational defaults: swallowed errors, unhandled promise rejections, workers, object URLs, listeners and timers not released, safe failure modes and clear error messages;
   - HTML and CSS hygiene: valid markup, unique ids, colors through the CSS variables.

   Cite the source of each practice: official docs (MDN, the specs, the Python docs), the tool's own guidance, or the repo's rules. No formatting or naming-taste nits that a formatter or a preference would settle. Anything that causes wrong output, a vulnerability or an accessibility failure belongs to reviewers 1–4, not here.

#### 2. Verify and deduplicate (you, not a subagent)
- Check every finding against the code yourself (grep/sed the cited lines) before filing. Drop or correct anything that doesn't hold, and say what you dropped and why.
- List all existing issues (`gh issue list --state all --limit 300`) and skip or cross-reference duplicates. The list includes `deferred` issues: match against them too, so parked work isn't filed again as new.
- Merge findings that describe the same defect across reviewers into one issue. Group trivially related doc gaps only when they share one fix.
- Calibrate severity across reviewers: wrong output reaching users or other systems (exports, cutters) ranks above cosmetic issues.
- Best-practice findings are calibrated with the others but never go above `severity:medium`; anything worse belongs to reviewers 1–4. If another reviewer found the same root cause, merge into that finding and keep its severity.

#### 3. Open the issues
Match the format of the existing review issues (read #17 and #46 first). Each body contains:
- `**Severity:** LEVEL.` and one or two sentences on the user impact
- `**CVE:** …` and `**CWE:** …` (or "none applicable" / "none (correctness)")
- "Found in the blind <kind> review of `<branch>` (v<footer version>, `snugcut.html` at <short sha>)." plus the verification status
- `## Repro`, `## Root cause` (or `## Evidence` for docs), `## Fix`, and `## Acceptance` where useful, with line numbers
- for accessibility: the WCAG SC + level and the 508 provision on their own line
- the footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

Labels: a type (`bug`, `documentation`, `enhancement`; security findings get `bug,security`; accessibility findings get `accessibility`; best-practice findings get `best-practice` as their type) + `code-review` + one of `severity:critical|high|medium|low|info` (no severity label on enhancements; best-practice findings never above `severity:medium`). Write the bodies to scratch files with quoted heredocs (`<<'EOF'`), so `$(…)` and backticks in code samples never run, and keep a TSV manifest (id, title, labels). Create the issues from the repo directory in severity order with `gh issue create --body-file <absolute path>`. Use placeholders for links between new issues, then fill them in with `gh issue edit` once their numbers exist.

#### 4. Report
Summarize by severity with a `#NN:Exact title` link to every new issue, call out the release blockers, list merged and dropped findings, and list any decisions that need the maintainer. If the WCAG/508 differences matter beyond single findings, open one `accessibility,documentation,code-review,severity:info` issue summarizing them.

</details>

## 4. Fix, then finish the release

- Fix release blockers on `bugfix/` branches, with PRs into the release branch. Bump the iterative version with each
  fix.
- Finishing the release needs the maintainer's explicit approval:
  - on the release branch, set `<version>` (`X.Y.0` for a major or minor release) in the page footer
    (`app/index.html`), run `python3 tools/build.py`, and add its `CHANGELOG.md` section. For a major or minor version,
    consolidate `CHANGELOG.md` in the same commit: squash the iterative entries the release covers (and backfill earlier
    unconsolidated ranges) as described in [CHANGELOG consolidation at release](#changelog-consolidation-at-release). Major and minor
    versions change only when the maintainer asks;
  - merge the release branch into `main` and tag it `<version>` (no `v` prefix);
  - merge it back into `develop`;
  - delete the release branch, locally and on origin.
- Issues aren't closed automatically by PRs into branches other than `main`, so close them by hand with
  "Fixed in #PR (X.Y.Z)".
- When the UI the README's screenshots show has changed, retake them (at release prep, or in the change itself). Open the
  release's `snugcut.html` over the sample parts at default settings in a current Chrome, wait for the search to
  finish, and capture each control and the whole page (light and dark for the whole-page pair) as WebP into `images/`,
  under the same names. The images aren't part of `snugcut.html`; `tools/build.py` and the regression don't read them.
- If export QA issues are still open (#49–#52, #132, #133), move them to the new release:
  - at release prep (the maintainer says to prep it), on the prep `bugfix/` branch into `release/<version>`, set
    `VERSION` in `tools/qa_workbooks.py` to `<version>` and run `python3 tools/qa_workbooks.py`. The workbooks link the
    tag's source zip, whose URL is known before the tag exists. The [fixture regression](#fixture-regression) checks
    each workbook test's expected sizes, colors, layers and notices against the build, so it fails, naming the test,
    when one no longer matches;
  - after the tag is pushed at the finish, for each open QA issue run
    `python3 tools/qa_workbooks.py --issue N > body.md` (outside the repo) and `gh issue edit N --body-file body.md`.
    The body comes from the same `APPS` and `VERSION` as the workbook. No separate branch or version bump is needed.

## CHANGELOG consolidation at release

When a release bumps the major or minor version, squash the iterative entries
it covers into that version's section. This happens with the `X.Y.0` bump at
the merge into `main`, not at the cut. The individual `x.y.N` headings are
removed from the file; git history keeps them.

Scope:
- The squash covers every iterative entry from the previous major or minor
  heading down to (not including) this one.
- A bump with no feature content of its own still consolidates the range below
  it. "Same features as <previous>" is not a reason to skip it.
- Never touch a section at or below an already-consolidated heading.

Backfill:
- Before consolidating the current release, walk the file for earlier major or
  minor headings whose range still has loose `x.y.N` entries under it. Squash
  each, same rules, oldest first.
- A heading is already consolidated when no `x.y.N` headings remain between it
  and the next major or minor heading below. Don't re-process those.
- Report what you backfilled, separately from the current release.

How to squash:
- Group under Keep a Changelog headings in this order: Added, Changed,
  Deprecated, Removed, Fixed, Security. Omit empty groups.
- One bullet per user-visible outcome, not per iterative entry or per PR.
  Several entries that moved one feature forward collapse into the single
  sentence describing where it landed.
- Carry every issue number forward. A merged bullet cites all of them:
  `(#12, #19, #23)`. Losing a reference is a defect.
- Write the end state, not the journey. An add-then-fix pair inside the range
  becomes the end state alone, since no user saw the intermediate.
- Every security entry in the range gets a bullet. Security is not subject to
  the merging and dropping rules above — under-reporting hardening in a public
  repo is a defect.
- Drop entries with no user-facing effect (test fixtures with no app change,
  internal reorganization, docs-only corrections) unless they changed behavior,
  defaults, or output.
- Preserve the exact wording of any entry that already reads as a release-level
  statement rather than rewriting it for style.
- Keep measured figures (timings, percentages, dimensions) where the entry gave
  them; they're the evidence the change was verified.

Constraints:
- Do not renumber, re-date, or reorder released sections.
- Do not invent entries. If a referenced issue number has no matching iterative
  entry, stop and ask rather than reconstructing from the diff.
- Report per range: range covered, entries in, bullets out, and anything
  dropped with the reason.

## Fixture regression

CLAUDE.md requires a structural or refactoring change to leave every export from `snugcut.html` byte-identical, and
section 1 above requires the same of an optimization. `tools/regression.py` checks it: it runs two builds of
`snugcut.html` in headless Chrome and compares their exports.

```sh
python3 tools/build.py                       # the candidate: snugcut.html built from the change
python3 tools/regression.py                  # develop's snugcut.html against the working tree's
python3 tools/regression.py main             # against another branch, tag or commit
python3 tools/regression.py OLD.html NEW.html
```

It needs Python 3.7 or newer (the tools are standard library only; checked by reading them and parsing them for 3.7, and run on a current Python) and Chrome or Chromium (`--chrome PATH` or `$CHROME` if it isn't in the usual place) and network access for the
two libraries from their CDN; `--libs DIR` loads `clipper.js` and `jszip.min.js` from a folder instead, but the search
worker can't start from a file, so the nests then run on the page only (the page loads below still use the CDN). `--json FILE` keeps the new build's raw
results. Exit status 0 means byte-identical; 1, a difference or a failure (listed); 2, no results from a build or an
option it doesn't know (`--help` lists them).
`--allow-diff` lists differing entries without failing on them (nest failures, worker-vs-page differences and workbook
mismatches still fail), and `--no-sandbox` starts Chrome without its sandbox, for CI runners.

**In CI**, `.github/workflows/regression.yml` runs it on every pull request (against the base branch) and every push to
`main` or `develop` (against the previous commit), on `ubuntu-latest`'s Chrome. It downloads the two libraries from the
URLs in `app/index.html` and fails if their sha384 differs from the page's integrity hashes, then runs the regression
without `--libs`, so the search worker runs as for a visitor. A page script error therefore fails the check, as does any
difference from the base, and the page loads below. A pull request that is
meant to alter exports has a line starting `Export changes:` in its body (the entries that change and why); the job then
passes `--allow-diff`, and the differences are listed in its log. Editing the pull request's title or body runs the
check again with the new body; re-running a finished job doesn't, since it reuses the old one. On a push it always does.
A newer run for the same pull request cancels the one still running, so an edit right after a push leaves one result;
pushes to `main` and `develop` always finish.

**What it does to each build** (the same to both, in a temporary folder): replaces the page's startup `run(…)` (the
last statement of its script, after `renderParts()`) with its test, which calls the library and app functions directly,
since the page is one script; removes the Content-Security-Policy `<meta>` (the test changes the inline script's hash)
and the Google Fonts `<link>`; and opens it in a fresh browser profile, so no saved `snugcut.settings` changes the
defaults. The test prints its results as one JSON string to the console.

**What is exported**, with the default settings otherwise:
1. Every fixture alone. For each `.svg` and `.dxf` file under `fixtures/` (all folders), with **Compensate kerf on
   objects** off and then on:
   - parse it the way an import does (`dxfToSVG` first for DXF, then `parseSVG`);
   - place it alone, unrotated, at (10, 10) mm on a plate of its own size;
   - export it with `plateSVG` and with `plateDXF`.

   It keeps the SVG text, the DXF text and the export notices, plus the part's width, height and outline area (mm,
   rounded to 1e-6) and its number of outer contours, which the exports don't show, or the error message if any step
   fails. A failure has to match too.
2. Whole nests of the sample parts the page opens with. The starting packs, no search (`run(0, true)`: True shape packs
   both sorted orders and keeps the better, Bounding box runs its MaxRects packing and then its swap search, seeded and
   run for a fixed amount of packing work), every plate exported with the app's own `plateFile`, keeping each file and its notices,
   six times:
   - True shape: SVG, then DXF, with compensation off;
   - True shape: SVG, then DXF, with compensation on;
   - Bounding box: SVG, then DXF, with compensation off.

   The cached geometry is invalidated each time compensation or the mode changes. The six run in the search worker,
   then again on the page; the two sets must match. A nest whose run fails is reported as a failure, even when it
   fails the same way in both builds.

**Comparing**: the two result lists must match entry by entry and byte for byte. Only two things are normalized:
- the version number in the export comment (`SnugCut v1.3.39-beta` and the like), which every version bump changes;
- the per-import id prefix (`p<number>_`) that `parseSVG` adds to ids in the markup. It counts imports in the session,
  so it shifts when the number of sample parts changes.

**Workbook tests** (new build only): the export QA workbooks in `qa/` come from the tests in `tools/qa_workbooks.py`,
and each test that runs SnugCut (all but test 4) carries a machine-checkable form of its Expected text beside it. For
each, the regression sets the test's settings (the Setup's defaults plus the test's own, such as kerf and **Export
format**), adds its fixture files, nests with no search, exports the first plate with `plateFile`, and measures it as a
tester would, reading a DXF export back in. It compares the non-text shapes (size to 0.02 mm, stroke and fill color,
closed or open, subpaths, dashes), the text content and colors, the notices after adding the files, the export notes
and the DXF layer names. Text sizes aren't compared, since they depend on installed fonts. A mismatch is reported as
`workbook test N: expected …, got …` and fails the run. A change that alters what testers see therefore fails its own
pull request, and that pull request updates the test's text and its check together.

**Page loads** (new build only): the runs above remove the Content-Security-Policy and replace the page's startup, so
they can't catch a wrong script hash, a `connect-src` or `worker-src` that blocks the search worker, or an app that
fails to load as modules. The regression therefore also serves a copy of `snugcut.html`, `app/` and `lib/` from a local
HTTP server and opens `snugcut.html` (with its CSP and the libraries from their CDN URLs, integrity hashes included) and
`app/index.html` in a fresh Chrome each, driven over the DevTools protocol by a small WebSocket client in `regression.py`.
Each page must draw its plates with the search worker started and report no console error, uncaught exception or blocked
request; otherwise the run fails with `page loads: …` and the problem. It needs the CDN, like the runs above.

**Library messages** (new build only): each library message is written twice, in `lib/snugcut.js` (English) and in
`app/strings-en.js` (the app's words), and the build checks only that the keys match. The regression makes every message
from sample values (`MESSAGE_SAMPLES` in `tools/regression.py`, one per plural or select case) both ways and fails, naming
the code, when the texts differ, when a library message has no sample, or when a sample names a code the library doesn't
have. A new library message therefore gets a sample there.

**Fixture checks** (new build only): two builds that fail alike compare equal, so the new build is also checked on its
own. A fixture that errors fails the run unless it is one of the listed refusals (the huge-coordinate files and the
item-cap DXF), and each of those must be refused with its message. The stated values of the large circle (the curve
within 0.01 mm of the true circle), the opposite-direction overlap (the union's area and two outlines), the rotated
circle and ellipse (their true size, to 0.02 mm), the CDATA sections (escaped text, the CSS rect outlined) and the many
ids (each prefixed, every reference landing on one) are checked, with kerf compensation off. A mismatch is reported as
`fixtures/…: expected …` and fails the run; `--allow-diff` doesn't excuse it. A new fixture with a stated value gets its
check in `check_fixtures()` in `tools/regression.py`.

It reports the number of entries compared in each list and names any that differ. A change that is meant to alter
exports says in its PR which entries changed and why. All other entries must still match.
