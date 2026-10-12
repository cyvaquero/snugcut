#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Guy Heckman. Licensed under the GNU Affero General Public License v3.0 or later (see LICENSE).
"""The fixture regression (RELEASING.md): export every fixture and the sample nests from two builds of snugcut.html in
headless Chrome, and compare them byte for byte.

    python3 tools/regression.py                 develop's snugcut.html against the one in the working tree
    python3 tools/regression.py BASE [NEW]      each a file or a git ref (its snugcut.html); NEW defaults to the tree's

Options:
    --chrome PATH   the Chrome or Chromium binary (default: $CHROME, then the usual install locations)
    --libs DIR      load clipper.js and jszip.min.js from DIR instead of the CDN, to run offline. The search worker
                    can't load from a file, so the nests then run on the page only.
    --json FILE     also write NEW's raw results to FILE
    --allow-diff    entries that differ between the builds are listed but don't fail the run (a change meant to alter
                    exports); nest failures, worker-vs-page differences and workbook mismatches still do
    --no-sandbox    start Chrome with --no-sandbox, for CI runners whose Chrome can't create its sandbox

It also runs the export QA workbooks' tests (tools/qa_workbooks.py) on NEW only, each with its own settings and
fixture files, and checks the measured sizes, colors, closed or open shapes, notices and DXF layers against the
expected results stored beside each test. A mismatch is reported as "workbook test N: expected ..., got ...".

Exit status: 0 when every entry matches (with --allow-diff: when nothing but entries differ); 1 when an entry differs,
a nest failed, the worker's nests differ from the page's, or a workbook test doesn't match its expected result; 2 when
a build gives no results (Chrome missing, a timeout, or the page failed before finishing).
Python 3 standard library only.
"""
import base64, glob, json, os, pathlib, re, shutil, subprocess, sys, tempfile, threading, time

sys.dont_write_bytecode = True   # importing qa_workbooks would otherwise leave tools/__pycache__ in the tree
import qa_workbooks   # the export QA workbooks' tests and their machine-checkable expected results (same folder)

ROOT = pathlib.Path(__file__).resolve().parent.parent
TIMEOUT = 120   # seconds per build; a run takes a few

# Runs in the page in place of its startup run(): the page is one script, so it calls the library and app directly.
# __bump keeps older builds (before invalidateGeometry) working as baselines.
TEST = r"""
const __bump = () => { if (typeof invalidateGeometry === "function") invalidateGeometry(); else geoVer++; };
(async () => {
  const out = {single:[], nests:[], worker:false};
  // 1. every fixture alone, compensation off then on: parsed as an import does, at (10, 10) mm on a plate of its size
  for (const comp of [false, true]) {
    S.comp = comp; __bump();
    for (const [n, t0] of __CASES__) {
      const r = {n, comp};
      try {
        const dx = /\.dxf$/i.test(n), t = dx ? dxfToSVG(t0, n).svg : t0;
        const p = parseSVG(t, n); p.fromDXF = dx;
        const x = 10, y = 10, w = p.wMM, h = p.hMM;
        const pl = {area:w*h, items:[{part:p, x, y, ang:0, rx:p.bbox.x, ry:p.bbox.y, env:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]]}]};
        const notes = new Set();
        r.svg = plateSVG(pl, {notes}); const d = plateDXF(pl); r.dxf = d.dxf; r.notes = [...notes, ...d.notes];
      } catch(e) { r.err = String(e && e.message || e); }
      out.single.push(r);
    }
  }
  // 2. whole nests of the sample parts, the starting packs with no search (run(0, true): True shape packs both sorted
  // orders and keeps the better, Bounding box runs its MaxRects packing, then its swap search: seeded, and run for a fixed
  // amount of packing work rather than a time, so the layout doesn't depend on speed), every plate exported with the app's plateFile. A failed run is
  // recorded, not fatal, so the rest still runs and the failure shows in the report
  const dump = async (label, where) => {
    try { await run(0, true); } catch(e) { out.nests.push({label, where, err:String(e && e.message || e)}); return; }
    out.nests.push({label, where, files:layout.plates.map(pl => { const ns = new Set(); return [plateFile(pl, ns), [...ns]]; })});
  };
  const nests = async where => {
    S.mode = "shape"; S.comp = false; S.format = "svg"; __bump(); await dump("true shape svg", where);
    S.format = "dxf"; await dump("true shape dxf", where);
    S.comp = true; __bump(); S.format = "svg"; await dump("true shape svg comp", where);
    S.format = "dxf"; await dump("true shape dxf comp", where);
    S.mode = "bbox"; S.comp = false; S.format = "svg"; __bump(); await dump("bounding box svg", where);
    S.format = "dxf"; await dump("bounding box dxf", where);
  };
  out.worker = typeof getWorkers === "function" && !!(await getWorkers());
  await nests(out.worker ? "worker" : "page");
  if (out.worker) { broken = true; await nests("page"); }   // the same nests searched on the page
  // 3. the QA workbooks' tests (tools/qa_workbooks.py), NEW only (__QA__ is null for BASE): each test's settings and
  // files as a tester sets them, nested without search, the first plate exported with plateFile and measured as a tester
  // would. It replaces the page's parts, so it runs last
  if (__QA__) {
    const meas = svgText => {
      const box = document.createElement("div"); box.style.cssText = "position:absolute;left:0;top:0"; document.body.appendChild(box);
      box.innerHTML = svgText; const sv = box.querySelector("svg");
      const vb = sv.viewBox.baseVal; sv.setAttribute("width", vb.width); sv.setAttribute("height", vb.height);
      const hex = c => { const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(c); return m ? [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, "0")).join("") : null; };
      const paint = c => /^url\(/.test(c) ? "gradient" : hex(c);
      const shapes = [], texts = [];
      for (const el of sv.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")) {
        let b; try { b = el.getBBox(); } catch(e) { continue; }
        const inv = sv.getCTM().inverse(), M = inv.multiply(el.getCTM());
        const pts = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y]) => [M.a*x+M.c*y+M.e, M.b*x+M.d*y+M.f]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), cs = getComputedStyle(el), tag = el.tagName;
        const stroke = paint(cs.stroke), fill = paint(cs.fill);
        if (tag === "text") { texts.push([el.textContent.trim(), fill || stroke]); continue; }   // sizes depend on fonts
        const d = el.getAttribute("d") || "";
        shapes.push({w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), stroke, fill,
          closed: tag === "path" ? /[Zz]\s*$/.test(d) : ["rect", "circle", "ellipse", "polygon"].includes(tag),
          dash: cs.strokeDasharray !== "none", sub: tag === "path" ? (d.match(/[Mm]/g) || []).length : 1});
      }
      box.remove(); return {shapes, texts};
    };
    const saved = Object.assign({}, S); out.qa = {};
    for (const [n, files, set] of __QA__) {
      const r = out.qa[n] = {};
      try {
        Object.assign(S, {mode:"shape", plateW:300, plateH:300, kerf:0.1, comp:false, format:"svg", outline:false, rotStep:0}, set);
        __bump(); removeParts(() => true); $("notices").innerHTML = "";
        await addFiles(files.map(([f, t]) => new File([t], f.split("/").pop())));
        clearTimeout(tmr);
        await run(0, true);
        r.notices = [...$("notices").children].map(m => m.dataset.text);
        r.plates = layout.plates.length;
        const notes = new Set(), f = plateFile(layout.plates[0], notes); r.exportNotes = [...notes];
        let svg = f;
        if (S.format !== "svg") {   // DXF: the layer names, then read back in as an import would
          r.layers = [...new Set([...f.matchAll(/\n\s*8\r?\n([^\r\n]+)/g)].map(m => m[1].trim()))];
          svg = dxfToSVG(f, "plate.dxf").svg;
        }
        Object.assign(r, meas(svg));
      } catch(e) { r.err = String(e && e.message || e); }
    }
    Object.assign(S, saved); __bump();
  }
  console.log("OUT:" + btoa(unescape(encodeURIComponent(JSON.stringify(out)))) + ":END");
})();
})();
"""
CDN = {"clipper.js": "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js",
       "jszip.min.js": "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"}

def fail(code, msg):
    print(f"regression.py: {msg}", file=sys.stderr)
    sys.exit(code)

def find_chrome(given):
    for c in [given, os.environ.get("CHROME"),
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]:
        if c and pathlib.Path(c).is_file(): return c
    for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]:
        if shutil.which(name): return shutil.which(name)
    fail(2, "no Chrome or Chromium found: pass --chrome PATH or set CHROME")

def source(spec):
    # a build: a file path, or a git ref whose snugcut.html is used
    if pathlib.Path(spec).is_file(): return pathlib.Path(spec).read_text(encoding="utf-8"), spec
    r = subprocess.run(["git", "show", f"{spec}:snugcut.html"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if r.returncode: fail(2, f"{spec} is neither a file nor a git ref with a snugcut.html")
    return r.stdout, f"{spec}:snugcut.html"

def cases():
    files = sorted(glob.glob(str(ROOT / "fixtures/**/*.svg"), recursive=True) + glob.glob(str(ROOT / "fixtures/**/*.dxf"), recursive=True))
    return [[pathlib.Path(f).relative_to(ROOT).as_posix(), pathlib.Path(f).read_text(encoding="utf-8")] for f in files]

def qa_cases():
    # the workbook tests that run SnugCut: [number, [[fixture path, text]…], settings]
    return [[n, [[f, (ROOT / "fixtures" / f).read_text(encoding="utf-8")] for f in c["files"]], c["set"]]
            for n, c in qa_checks().items()]

def qa_checks():
    return {t[0]: t[6] for _, _, tests in qa_workbooks.TESTS for t in tests if t[6]}

def prepare(html, label, libs, qa=None):
    # the test in place of the startup run(); no CSP (the test changes the inline script's hash) and no web fonts
    tail = re.findall(r"renderParts\(\);\nrun\(\w+, true, true\);[^\n]*\n\}\)\(\);\n", html)
    if len(tail) != 1: fail(2, f"{label}: can't find the page's startup run() to replace")
    html = html.replace(tail[0], "renderParts();\n" + TEST.replace("__CASES__", json.dumps(cases())).replace("__QA__", json.dumps(qa)), 1)
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', "", html)
    html = re.sub(r'<link[^>]*fonts\.googleapis[^>]*>', "", html)
    if libs:
        for name, url in CDN.items(): html = html.replace(url, (pathlib.Path(libs).resolve() / name).as_uri())
        html = re.sub(r' integrity="[^"]*" crossorigin="anonymous"', "", html)
    return html

def run_build(chrome, html, label, tag, scratch, libs, qa=None, sandbox=True):
    # one build in a fresh profile; its results come back as one console line
    page = scratch / f"build{tag}.html"; page.write_text(prepare(html, label, libs, qa), encoding="utf-8")
    log, prof = page.with_suffix(".log"), scratch / (page.stem + "-profile")
    with open(log, "wb") as err:
        p = subprocess.Popen([chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check"]
                             + ([] if sandbox else ["--no-sandbox"])
                             + [f"--user-data-dir={prof}", "--enable-logging=stderr", "--v=0", page.as_uri()],
                             stdout=subprocess.DEVNULL, stderr=err)
        try:
            end = time.time() + TIMEOUT
            while time.time() < end and p.poll() is None:
                # only a complete payload (closed by :END) is decoded; a line half-written is read on the next poll (#470)
                m = re.search(rb"OUT:([A-Za-z0-9+/=]+):END", log.read_bytes())
                if m:
                    try: return json.loads(base64.b64decode(m.group(1)).decode("utf-8"))
                    except ValueError: pass   # binascii.Error, UnicodeDecodeError and JSONDecodeError are all ValueErrors
                time.sleep(0.5)
        finally:
            p.kill(); p.wait()
    text = log.read_text(encoding="utf-8", errors="replace")
    errors = [l for l in text.splitlines() if "CONSOLE" in l and ("Uncaught" in l or "rror" in l)][:5]
    fail(2, f"{label}: no results within {TIMEOUT} s, or Chrome exited first" + "".join("\n  " + e[:300] for e in errors))

TOL = 0.02   # mm, for a measured shape's size

def describe(s):
    return (f"{s['w']:g}x{s['h']:g}" + (f" stroke #{s['stroke']}" if s["stroke"] else "") + (f" fill {s['fill']}" if s["fill"] else "")
            + (" closed" if s["closed"] else " open") + (" dashed" if s["dash"] else "") + (f" {s['sub']} subpaths" if s["sub"] != 1 else ""))

def check_qa(got):
    # compare the workbook tests' measured results with their expectations in tools/qa_workbooks.py; returns the mismatches
    bad = []
    for n, c in sorted(qa_checks().items()):
        r = got.get(str(n))
        fail = lambda what: bad.append(f"workbook test {n}: {what}")
        if r is None: fail("expected a result, got none"); continue
        if "err" in r: fail(f"expected an export, got the error: {r['err']}"); continue
        if r["plates"] != 1: fail(f"expected 1 plate, got {r['plates']}")
        for label, want, have in (("notice", c["notices"], r["notices"]), ("export note", c["export_notes"], r["exportNotes"])):
            left = list(have)
            for w in want:
                hit = next((h for h in left if w in h), None)
                if hit is None: fail(f"expected {label} containing \"{w}\", got {have or 'none'}")
                else: left.remove(hit)
            for h in left: fail(f"expected no other {label}, got \"{h}\"")
        for lay in c["layers"]:
            if lay.upper() not in [x.upper() for x in r.get("layers", [])]:
                fail(f"expected DXF layer {lay}, got {r.get('layers') or 'none'}")
        for text, color in c["texts"]:
            if [text, color] not in r["texts"]: fail(f"expected text \"{text}\" in #{color}, got {r['texts'] or 'none'}")
        left = list(r["shapes"])
        for e in c["shapes"]:
            for _ in range(e["n"]):
                hit = next((s for s in left if abs(s["w"] - e["w"]) <= TOL and abs(s["h"] - e["h"]) <= TOL and all(
                    s[k] == e[k] for k in ("stroke", "fill", "closed", "dash", "sub"))), None)
                if hit is None: fail(f"expected shape {describe(e)}, got none like it")
                else: left.remove(hit)
        for s in left: fail(f"expected no other shape, got {describe(s)}")
    return bad

NORM = [(re.compile(r"SnugCut v[0-9][0-9.]*(?:-[a-z]+)?"), "SnugCut v"),   # the version in the export comment
        (re.compile(r"\bp\d+_"), "p_")]                                    # parseSVG's per-import id prefix
def norm(v):
    s = json.dumps(v, ensure_ascii=False)
    for rx, to in NORM: s = rx.sub(to, s)
    return s

def main():
    args, opts, flags = [], {"--chrome": None, "--libs": None, "--json": None}, set()
    it = iter(sys.argv[1:])
    for a in it:
        if a in opts: opts[a] = next(it, None)
        elif a in ("--allow-diff", "--no-sandbox"): flags.add(a)
        elif a in ("-h", "--help"): print(__doc__); return
        else: args.append(a)
    if len(args) > 2: fail(2, "at most two builds: BASE [NEW]")
    base, new = (args + [None, None])[:2]
    chrome = find_chrome(opts["--chrome"])
    builds = [source(base or "develop"), source(new or str(ROOT / "snugcut.html"))]
    with tempfile.TemporaryDirectory(prefix="snugcut-regression-") as tmp:
        res = [None, None]
        def go(i): res[i] = run_build(chrome, builds[i][0], builds[i][1], i, pathlib.Path(tmp), opts["--libs"], qa_cases() if i == 1 else None, "--no-sandbox" not in flags)
        ts = [threading.Thread(target=go, args=(i,)) for i in range(2)]
        [t.start() for t in ts]; [t.join() for t in ts]
        if None in res: sys.exit(2)    # the thread already reported why
    a, b = res
    if opts["--json"]: pathlib.Path(opts["--json"]).write_text(json.dumps(b, indent=1, ensure_ascii=False), encoding="utf-8")
    bad = differs = False
    print(f"base: {builds[0][1]}\nnew:  {builds[1][1]}")
    for key in ("single", "nests"):
        if len(a[key]) != len(b[key]): print(f"{key}: {len(a[key])} vs {len(b[key])} entries, can't compare"); bad = True; continue
        diff = [i for i in range(len(a[key])) if norm(a[key][i]) != norm(b[key][i])]
        name = lambda e: e.get("n", e.get("label")) + (" comp" if e.get("comp") else "") + (f" ({e['where']})" if "where" in e else "")
        print(f"{key}: {len(a[key])} compared, {len(diff)} differ" + "".join(f"\n  {i}: {name(b[key][i])}" for i in diff))
        differs |= bool(diff); bad |= bool(diff) and "--allow-diff" not in flags
    for side, r in (("base", a), ("new", b)):
        errs = [f"{n['label']} ({n.get('where', '')}): {n['err']}" for n in r["nests"] if "err" in n]
        if errs: print(f"{side}: nests failed:" + "".join("\n  " + e for e in errs)); bad = True
        if r.get("worker"):
            w = {n["label"]: norm(n).replace('"where": "worker"', "") for n in r["nests"] if n.get("where") == "worker"}
            pg = {n["label"]: norm(n).replace('"where": "page"', "") for n in r["nests"] if n.get("where") == "page"}
            off = [k for k in w if w[k] != pg.get(k)]
            if off: print(f"{side}: worker and page nests differ: {', '.join(off)}"); bad = True
        else:
            print(f"{side}: the search worker didn't run, so the nests ran on the page only")
    qa = check_qa(b.get("qa") or {})
    print(f"workbook tests: {len(qa_checks())} checked, {len(qa)} mismatches" + "".join("\n  " + m for m in qa))
    bad |= bool(qa)
    print("FAIL" if bad else "OK: " + ("exports differ as allowed" if differs else "byte-identical") + ", workbook tests match")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
