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
- Exports must stay **byte-for-byte identical**: run the full fixture regression (every fixture, SVG and DXF,
  compensation off and on), as CLAUDE.md requires. The SVG format is verified in WeCreat MakeIT.
- File each finding as a GitHub issue (see section 3 for the format), then merge into `develop` before cutting the
  release branch.

## 2. Cut the release branch (only when the maintainer says so)

The release branch is cut only on the maintainer's instruction, never automatically. Step 1 finishing (or being
declined) is not a reason to cut it; wait to be told, including which version to release.

- Branch `release/<version>` off an up-to-date `develop`.
- Set the version in the page footer (`app/index.html`), run `python3 tools/build.py`, and add a `CHANGELOG.md` entry. Major and minor versions change
  only when the maintainer asks.
- For a major or minor version, consolidate `CHANGELOG.md`: squash the iterative entries the release covers (and backfill
  earlier unconsolidated ranges) as described in [CLAUDE.md](CLAUDE.md#changelog-consolidation-at-release).
- Push the branch.

## 3. After cutting: blind review

Run the blind review below on the release branch unless the maintainer says to hold off, and whenever the maintainer
asks for a review. Every verified finding becomes a GitHub issue.

<details>
<summary>Blind review prompt (paste into Claude Code on the release branch)</summary>

Run a full blind review of this repo (SnugCut: `lib/snugcut.js`, `app/`, the generated `snugcut.html`, `tools/build.py`, docs and fixtures) on the current branch, then open GitHub issues for every verified finding.

#### 1. Reviews: blind subagents, run in parallel
Launch 5 independent subagents in ONE message, in the background. Give each the project context (stack, entry points, the verified SVG export format, the "must not change" rules, American English) and nothing about known issues. Every subagent:
- is strictly READ-ONLY on the repo (no edits, commits, branches or pushes) and puts scratch files in its own folder under the scratchpad;
- is BLIND: it must not read git history/log/diffs, GitHub issues or PRs (no `gh`), CHANGELOG history of prior fixes, or anything under ~/.claude. It judges the code as it is now;
- reads ALL of lib/snugcut.js and app/ (and checks that snugcut.html is current with `python3 tools/build.py --check`) and verifies findings concretely where it can: run the real functions in headless Chrome (file:// via CDP; use a scratch copy with local or stubbed libs if needed) or a node script, otherwise trace with specific inputs;
- reports each finding with: one-line title (the defect), severity (critical/high/medium/low/info), category, location (function + line numbers), concrete repro (minimal SVG/DXF snippet where relevant, expected vs actual), root cause, proposed fix, and status (CONFIRMED by running / CONFIRMED by trace / PLAUSIBLE), most severe first. It drops style nits and speculation, groups instances with one root cause, and ends with a short list of what it checked that held up.

The five reviewers:
1. **Code correctness**: wrong output, crashes, lost parts, units/scale, overlaps in nesting, export geometry, DXF import/export, kerf/gap/margin math, rotation, UI state/race bugs, edge cases. The SVG export format is verified in WeCreat MakeIT and must not change, but wrong values inside it are in scope.
2. **Documentation**: check every claim in README.md, CHANGELOG.md, CLAUDE.md, fixtures/**/README.md and the UI text in app/index.html and app/app.js (labels, hints, messages, footer) against the code: features, defaults, formats, limits, fixtures referenced vs present, version consistency (footer vs top CHANGELOG entry), stale names and links, contradictions, undocumented features, spelling consistency (the project uses American English; any British spelling is a finding).
3. **Security**: threat model is malicious SVG/DXF files, malicious file names, and CDN supply chain. Cover XSS through imported markup, external references and exfiltration, what exported files carry downstream, CSP strength, SRI (fetch the CDN files and compute sha384), DoS from crafted files, filename injection, eval, localStorage, prototype pollution. Give a CWE id for each finding, and a CVE where a library version has one (else "none applicable"). Don't report what the CSP or sanitizer fully blocks; name the defense instead.
4. **Accessibility**: WCAG 2.1 A/AA and Revised Section 508 (E205/E207, Chapter 3 302 FPCs, Chapter 5 502/503 including the 501.1 web-app exception, Chapter 6 602). Say which 508 provisions apply and why. Test the accessibility tree, keyboard and focus, live regions, contrast in BOTH themes (computed from the CSS variables, including non-text contrast), reflow at 320 px, text spacing, target size, reduced motion, forced colors, text alternatives for previews, a keyboard alternative to drag-and-drop, timing, labels and errors, and the accessibility documentation. Map each finding to both standards (WCAG SC + level, and 508 provision or "not required by 508"). Add a section "Where WCAG 2.1 and Section 508 differ or conflict" that separates WCAG-2.1-only criteria, 508-only provisions, genuine conflicts and scope differences, without inventing conflicts.
5. **Best practices**: code that works but departs from established practice for its stack and tools (web platform, JavaScript, CSS, Python), where the gap carries a concrete risk (a future bug, a maintenance trap, an API that will break). Every finding is `severity:info`. Look at:
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
- Best-practice findings stay at `severity:info`: calibration never raises them. If another reviewer found the same root cause, merge into that finding and keep its severity.

#### 3. Open the issues
Match the format of the existing review issues (read #17 and #46 first). Each body contains:
- `**Severity:** LEVEL.` and one or two sentences on the user impact
- `**CVE:** …` and `**CWE:** …` (or "none applicable" / "none (correctness)")
- "Found in the blind <kind> review of `<branch>` (v<footer version>, `snugcut.html` at <short sha>)." plus the verification status
- `## Repro`, `## Root cause` (or `## Evidence` for docs), `## Fix`, and `## Acceptance` where useful, with line numbers
- for accessibility: the WCAG SC + level and the 508 provision on their own line

Labels: a type (`bug`, `documentation`, `enhancement`; security findings get `bug,security`; accessibility findings get `accessibility`; best-practice findings get `best-practice` as their type) + `code-review` + one of `severity:critical|high|medium|low|info` (no severity label on enhancements; best-practice findings are always `severity:info`). Write the bodies to scratch files with quoted heredocs (`<<'EOF'`), so `$(…)` and backticks in code samples never run, and keep a TSV manifest (id, title, labels). Create the issues from the repo directory in severity order with `gh issue create --body-file <absolute path>`. Use placeholders for links between new issues, then fill them in with `gh issue edit` once their numbers exist.

#### 4. Report
Summarize by severity with a `#NN:Exact title` link to every new issue, call out the release blockers, list merged and dropped findings, and list any decisions that need the maintainer. If the WCAG/508 differences matter beyond single findings, open one `accessibility,documentation,code-review,severity:info` issue summarizing them.

</details>

## 4. Fix, then finish the release

- Fix release blockers on `bugfix/` branches, with PRs into the release branch. Bump the iterative version with each
  fix.
- Finishing the release needs the maintainer's explicit approval:
  - merge the release branch into `main` and tag it `<version>` (no `v` prefix);
  - merge it back into `develop`;
  - delete the release branch, locally and on origin.
- Issues aren't closed automatically by PRs into branches other than `main`, so close them by hand with
  "Fixed in #PR (X.Y.Z)".
- If export QA issues are still open (#49–#52, #132, #133), move them to the new release: set `VERSION` in
  `tools/qa_workbooks.py`, check each test's expected sizes, colors, layers and notices against the release, run
  `python3 tools/qa_workbooks.py`, and update the version in each issue (on a `feature/` branch after the release is
  tagged).
