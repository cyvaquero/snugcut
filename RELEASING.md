# Releasing SnugCut

Releases follow git-flow: a `release/<version>` branch is cut from `develop`, fixed up, then merged into `main`
(tagged) and back into `develop`. Version numbers follow the rule in [CLAUDE.md](CLAUDE.md) and the README.

## 1. Before cutting the release branch: efficiency review

Ask the maintainer whether to run a **code efficiency review and optimisation** of `snugcut.html` first. Don't start
one unasked. If the answer is yes:

- Work on a `feature/` branch off `develop`.
- Look at the hot paths: the nesting and layout search, curve sampling, Clipper offsets, building the export, redraws
  and DOM work, and anything parsed or computed more than once.
- Measure before and after on the files in `fixtures/` (import time, search speed, layouts tried in a fixed time).
- The SVG export must stay **byte-for-byte identical**: its format is verified in WeCreat MakeIT.
- File each finding as a GitHub issue (see section 3 for the format), then merge into `develop` before cutting the
  release branch.

## 2. Cut the release branch

- Branch `release/<version>` off an up-to-date `develop`.
- Set the version in the page footer (`snugcut.html`) and add a `CHANGELOG.md` entry. Major and minor versions change
  only when the maintainer asks.
- Push the branch.

## 3. After cutting: blind review

Run the blind review below on the release branch. Every verified finding becomes a GitHub issue.

<details>
<summary>Blind review prompt (paste into Claude Code on the release branch)</summary>

Run a full blind review of this repo (SnugCut, `snugcut.html` + docs + fixtures) on the current branch, then open GitHub issues for every verified finding.

#### 1. Reviews: blind subagents, run in parallel
Launch 4 independent subagents in ONE message, in the background. Every subagent:
- is strictly READ-ONLY on the repo (no edits, commits, branches or pushes) and puts scratch files in its own folder under the scratchpad;
- is BLIND: it must not read git history/log/diffs, GitHub issues or PRs (no `gh`), CHANGELOG history of prior fixes, or anything under ~/.claude. It judges the code as it is now;
- reads ALL of snugcut.html and verifies findings concretely where it can: run the real functions in headless Chrome (file:// via CDP; use a scratch copy with local or stubbed libs if needed) or a node script, otherwise trace with specific inputs;
- reports each finding with: one-line title (the defect), severity (critical/high/medium/low/info), category, location (function + line numbers), concrete repro (minimal SVG/DXF snippet where relevant, expected vs actual), root cause, proposed fix, and status (CONFIRMED by running / CONFIRMED by trace / PLAUSIBLE), most severe first. It drops style nits and speculation, groups instances with one root cause, and ends with a short list of what it checked that held up.

The four reviewers:
1. **Code correctness**: wrong output, crashes, lost parts, units/scale, overlaps in nesting, export geometry, DXF import/export, kerf/gap/margin maths, rotation, UI state/race bugs, edge cases. The SVG export format is verified in WeCreat MakeIT and must not change, but wrong values inside it are in scope.
2. **Documentation**: check every claim in README.md, CHANGELOG.md, CLAUDE.md, fixtures/**/README.md and the UI text in snugcut.html (labels, hints, messages, footer) against the code: features, defaults, formats, limits, fixtures referenced vs present, version consistency (footer vs top CHANGELOG entry), stale names and links, contradictions, undocumented features, spelling consistency (the project uses British spelling).
3. **Security**: threat model is malicious SVG/DXF files, malicious file names, and CDN supply chain. Cover XSS through imported markup, external references and exfiltration, what exported files carry downstream, CSP strength, SRI (fetch the CDN files and compute sha384), DoS from crafted files, filename injection, eval, localStorage, prototype pollution. Give a CWE id for each finding, and a CVE where a library version has one (else "none applicable"). Don't report issues the CSP or sanitiser already blocks unless the defence is incomplete.
4. **Accessibility**: WCAG 2.1 A/AA and Revised Section 508 (E205/E207, Chapter 3 302 FPCs, Chapter 5 502/503, Chapter 6 602). Say which 508 provisions apply and why. Test the accessibility tree, keyboard and focus, live regions, contrast in BOTH themes (computed from the CSS variables, including non-text contrast), reflow at 320 px, text spacing, target size, reduced motion, forced colours, text alternatives for previews, a keyboard alternative to drag-and-drop, timing, labels and errors. Map each finding to both standards (WCAG SC + level, and 508 provision or "not required by 508"). Add a section "Where WCAG 2.1 and Section 508 differ or conflict" that separates WCAG-2.1-only criteria, 508-only provisions, genuine conflicts and scope differences, without inventing conflicts.

#### 2. Verify and deduplicate (you, not a subagent)
- Check every finding against the code yourself (grep/sed the cited lines) before filing. Drop or correct anything that doesn't hold, and say what you dropped and why.
- List all existing issues (`gh issue list --state all --limit 200`) and skip or cross-reference duplicates.
- Merge findings that describe the same defect across reviewers into one issue. Group trivially related doc gaps only when they share one fix.

#### 3. Open the issues
Match the format of the existing review issues (read #17 and #46 first). Each body contains:
- `**Severity:** LEVEL.` and one or two sentences on the user impact
- `**CVE:** …` and `**CWE:** …` (or "none applicable" / "none (correctness)")
- "Found in the blind <kind> review of `<branch>` (v<footer version>, `snugcut.html` at <short sha>)." plus the verification status
- `## Repro`, `## Root cause` (or `## Evidence` for docs), `## Fix`, and `## Acceptance` where useful, with line numbers
- for accessibility: the WCAG SC + level and the 508 provision on their own line

Labels: a type (`bug`, `documentation`, `enhancement`; security findings get `bug,security`; accessibility findings get `accessibility`) + `code-review` + one of `severity:critical|high|medium|low|info` (no severity label on enhancements). Write the bodies to scratch files with a TSV manifest (id, title, labels), create the issues in severity order with `gh issue create --body-file`, and fill in cross-references between new issues (`#NN`) once their numbers exist.

#### 4. Report
Summarise by severity with links to every new issue, call out the release blockers, list merged and dropped findings, and list any decisions that need the maintainer. If the WCAG/508 differences matter beyond single findings, open one `accessibility` + `documentation` issue summarising them.

</details>

## 4. Fix, then finish the release

- Fix release blockers on `bugfix/` branches, with PRs into the release branch. Bump the iterative version with each
  fix.
- Finishing the release needs the maintainer's explicit approval:
  - merge the release branch into `main` and tag it `v<version>`;
  - merge it back into `develop`;
  - delete the release branch, locally and on origin.
- Issues aren't closed automatically by PRs into branches other than `main`, so close them by hand with a pointer to
  the PR and version.
