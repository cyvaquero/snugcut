#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Guy Heckman. Licensed under the GNU Affero General Public License v3.0 or later (see LICENSE).
"""The fixture regression (RELEASING.md): export every fixture and the sample nests from two builds of snugcut.html in
headless Chrome, and compare them byte for byte.

    python3 tools/regression.py                 develop's snugcut.html against the one in the working tree
    python3 tools/regression.py BASE [NEW]      each a file or a git ref (its snugcut.html); NEW defaults to the tree's

Options are listed by --help.

It also runs the export QA workbooks' tests (tools/qa_workbooks.py) on NEW only, each with its own settings and
fixture files, and checks the measured sizes, colors, closed or open shapes, notices and DXF layers against the
expected results stored beside each test. A mismatch is reported as "workbook test N: expected ..., got ...".
On NEW it also fails a fixture that errors without being a listed refusal (the huge-coordinate and item-cap files must
be refused), and checks the stated values of the large circle, the opposite-direction overlap, the rotated circle and
ellipse, the CDATA sections and the many ids, because two builds that fail alike would otherwise compare equal.
Last it loads NEW's snugcut.html (with its Content-Security-Policy and the libraries from their CDN URLs, integrity hashes
included) and app/index.html (as ES modules), each over HTTP from a local server, and fails on a console error, an uncaught
exception, a blocked request, plates that are not drawn, or a search worker that did not start (a wrong script hash or a
connect-src or worker-src that blocks the worker would otherwise pass, since the runs above remove the CSP).

Exit status: 0 when every entry matches (with --allow-diff: when nothing but entries differ); 1 when an entry differs,
a nest failed, the worker's nests differ from the page's, a workbook test or a fixture check doesn't match its expected result, or a page load check reports a problem; 2 when
a build gives no results (Chrome missing, a timeout, or the page failed before finishing).
Python 3 standard library only.
"""
import argparse, base64, functools, glob, http.server, json, math, os, pathlib, re, shutil, socket, struct, subprocess, sys, tempfile, threading, time, urllib.request

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
        r.size = [p.wMM, p.hMM, p.areaMM].map(v => Math.round(v * 1e6) / 1e6); r.outers = (p.outers || []).length;   // the outline, which the exports don't show (#484)
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
  // 3. the QA workbooks' tests (tools/qa_workbooks.py), NEW only (null for BASE): each test's settings and
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
  // UTF-8 to base64: TextEncoder, then the bytes as a binary string in chunks (one big apply would overflow the stack)
  const bytes = new TextEncoder().encode(JSON.stringify(out));
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  console.log("OUT:" + btoa(bin) + ":END");
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
    # "<" as \u003c, so a fixture holding </script> or <!-- can't end the script or swallow the page; both placeholders
    # are filled in one pass, so fixture text that contains the other placeholder isn't substituted again
    blobs = {"__CASES__": json.dumps(cases()).replace("<", "\\u003c"), "__QA__": json.dumps(qa).replace("<", "\\u003c")}
    test = re.sub("__CASES__|__QA__", lambda m: blobs[m.group()], TEST)
    html = html.replace(tail[0], "renderParts();\n" + test, 1)
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

# The page as a visitor gets it (#520): snugcut.html with its own Content-Security-Policy and the libraries from their CDN
# URLs with their integrity hashes, and app/index.html with its modules, both over HTTP. The test run above removes the CSP
# and replaces the startup, so a wrong script hash, a connect-src or worker-src that blocks the search worker, or an app
# that fails to load as modules would pass it. Each page must draw its plates with the search worker running and report no
# console error, uncaught exception or blocked request. Chrome is driven over its DevTools protocol, with a small
# WebSocket client (the standard library has none).
class Cdp:
    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        self.s = socket.create_connection((m.group(1), int(m.group(2))), timeout=30)
        self.s.sendall((f"GET {m.group(3)} HTTP/1.1\r\nHost: {m.group(1)}:{m.group(2)}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        self.buf = b""
        while b"\r\n\r\n" not in self.buf: self.buf += self.s.recv(4096)
        self.buf = self.buf.split(b"\r\n\r\n", 1)[1]
        self.n = 0

    def _read(self, n):
        while len(self.buf) < n: self.buf += self.s.recv(65536)
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        # the next message (continuation frames joined); raises socket.timeout when none arrives in time
        data = b""
        while True:
            b0, b1 = self._read(2); n = b1 & 127
            if n == 126: n = struct.unpack(">H", self._read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self._read(8))[0]
            data += self._read(n)
            if b0 & 0x80: return json.loads(data.decode("utf-8"))

    def send(self, method, **params):
        self.n += 1
        raw = json.dumps({"id": self.n, "method": method, "params": params}).encode()
        size = bytes([0x80 | len(raw)]) if len(raw) < 126 else bytes([0x80 | 126]) + struct.pack(">H", len(raw)) if len(raw) < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", len(raw))
        mask = os.urandom(4)
        self.s.sendall(bytes([0x81]) + size + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(raw)))
        return self.n

def problem_of(msg):
    # a console error, uncaught exception or blocked/failed request in a DevTools event, as text; None for anything else
    p, kind = msg.get("params", {}), msg.get("method")
    if kind == "Runtime.exceptionThrown":
        d = p["exceptionDetails"]; return "exception: " + (d.get("exception", {}).get("description") or d["text"])[:200]
    if kind == "Runtime.consoleAPICalled" and p["type"] in ("error", "assert"):
        return "console." + p["type"] + ": " + " ".join(str(a.get("value", a.get("description", ""))) for a in p["args"])[:200]
    if kind == "Log.entryAdded" and p["entry"]["level"] == "error" and not p["entry"].get("url", "").endswith("/favicon.ico"):
        return "browser: " + p["entry"]["text"][:200] + (" " + p["entry"]["url"] if p["entry"].get("url") else "")
    return None

def visit(chrome, base_url, page, scratch, sandbox):
    # open base_url/page in a fresh Chrome; returns the problems found (an empty list when the page drew its plates, the
    # search worker started, and nothing was reported)
    prof = scratch / ("load-" + re.sub(r"\W", "_", page))
    p = subprocess.Popen([chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check"] + ([] if sandbox else ["--no-sandbox"])
                         + [f"--user-data-dir={prof}", "--remote-debugging-port=0", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    problems = []
    try:
        port_file, end = prof / "DevToolsActivePort", time.time() + 30
        while time.time() < end and not (port_file.exists() and port_file.read_text().count("\n") >= 1): time.sleep(0.1)
        if not port_file.exists(): return ["Chrome did not start"]
        port = int(port_file.read_text().split()[0])
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=10))
        c = Cdp(next(t for t in tabs if t["type"] == "page")["webSocketDebuggerUrl"])
        for method in ("Runtime.enable", "Log.enable", "Page.enable"): c.send(method)
        c.send("Page.navigate", url=f"{base_url}/{page}")
        # drawn: plates on the page and the first search finished (the pulsing dot is off); a fatal notice is a failure
        probe = "[document.querySelectorAll('.plate').length, !!document.querySelector('.dot.on'), !!document.querySelector('.fatal')]"
        asked, state, end = None, None, time.time() + 60
        c.s.settimeout(0.5)
        while time.time() < end:
            if asked is None: asked = c.send("Runtime.evaluate", expression=probe, returnByValue=True)
            try: msg = c.recv()
            except socket.timeout: asked = None; continue
            problems.extend(filter(None, [problem_of(msg)]))
            if msg.get("id") == asked:
                state = msg["result"].get("result", {}).get("value")
                if state and state[0] and not state[1] or state and state[2]: break
                time.sleep(0.5); asked = None
        c.s.settimeout(0.5)
        try:   # what the page reported while it settled
            while True: problems.extend(filter(None, [problem_of(c.recv())]))
        except socket.timeout: pass
        if not state or not state[0] or state[1] or state[2]:
            problems.append("did not draw its plates (state " + json.dumps(state) + ")")
        workers = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=10)) if t["type"] == "worker"]
        if not workers: problems.append("the search worker did not start")
    finally:
        p.kill(); p.wait()
    return list(dict.fromkeys(problems))

def load_check(chrome, html, scratch, sandbox):
    # serves a copy of NEW's snugcut.html, app/ and lib/ over HTTP from a folder of its own, and visits snugcut.html and app/index.html
    site = scratch / "site"
    shutil.copytree(ROOT / "app", site / "app"); shutil.copytree(ROOT / "lib", site / "lib")
    (site / "snugcut.html").write_text(html, encoding="utf-8")
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        return [f"{page}: {x}" for page in ("snugcut.html", "app/index.html") for x in visit(chrome, f"http://127.0.0.1:{srv.server_address[1]}", page, scratch, sandbox)]
    finally:
        srv.shutdown(); srv.server_close()

TOL = 0.02   # mm, for a measured shape's size

def describe(s):
    return (f"{s['w']:g}x{s['h']:g}" + (f" stroke #{s['stroke']}" if s["stroke"] else "") + (f" fill {s['fill']}" if s["fill"] else "")
            + (" closed" if s["closed"] else " open") + (" dashed" if s["dash"] else "") + (f" {s['sub']} subpaths" if s["sub"] != 1 else ""))

def check_qa(got):
    # compare the workbook tests' measured results with their expectations in tools/qa_workbooks.py; returns the mismatches
    bad = []
    for n, c in sorted(qa_checks().items()):
        r = got.get(str(n))
        mismatch = lambda what: bad.append(f"workbook test {n}: {what}")
        if r is None: mismatch("expected a result, got none"); continue
        if "err" in r: mismatch(f"expected an export, got the error: {r['err']}"); continue
        if r["plates"] != 1: mismatch(f"expected 1 plate, got {r['plates']}")
        for label, want, have in (("notice", c["notices"], r["notices"]), ("export note", c["export_notes"], r["exportNotes"])):
            left = list(have)
            for w in want:
                hit = next((h for h in left if w in h), None)
                if hit is None: mismatch(f"expected {label} containing \"{w}\", got {have or 'none'}")
                else: left.remove(hit)
            for h in left: mismatch(f"expected no other {label}, got \"{h}\"")
        for lay in c["layers"]:
            if lay.upper() not in [x.upper() for x in r.get("layers", [])]:
                mismatch(f"expected DXF layer {lay}, got {r.get('layers') or 'none'}")
        for text, color in c["texts"]:
            if [text, color] not in r["texts"]: mismatch(f"expected text \"{text}\" in #{color}, got {r['texts'] or 'none'}")
        left = list(r["shapes"])
        for e in c["shapes"]:
            for _ in range(e["n"]):
                hit = next((s for s in left if abs(s["w"] - e["w"]) <= TOL and abs(s["h"] - e["h"]) <= TOL and all(
                    s[k] == e[k] for k in ("stroke", "fill", "closed", "dash", "sub"))), None)
                if hit is None: mismatch(f"expected shape {describe(e)}, got none like it")
                else: left.remove(hit)
        for s in left: mismatch(f"expected no other shape, got {describe(s)}")
    return bad

# Fixtures a build must refuse, with a phrase of its message (the "too large" limits and the item cap, #458): any other
# fixture that errors fails the run, even when both builds fail alike, and these must error
REFUSED = {"fixtures/security/dxf-insert-array.dxf": "expands to more than",
           **{"fixtures/security/" + f: "coordinates beyond" for f in (
               "huge-dxf-bulge.dxf", "huge-dxf-circle.dxf", "huge-dxf-lines.dxf", "huge-dxf-polyline.dxf", "huge-svg-arc.svg", "huge-svg-coords.svg")}}

def bezier_points(d):
    # points along every cubic of a path "M x y C … Z" (as plateSVG writes it), 20 per segment
    nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?(?:e-?\d+)?", d)]
    pts, (x0, y0), i = [], nums[:2], 2
    while i + 6 <= len(nums):
        (x1, y1, x2, y2, x3, y3), t = nums[i:i + 6], None
        for k in range(21):
            t = k / 20; u = 1 - t
            pts.append((u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3, u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3))
        x0, y0, i = x3, y3, i + 6
    return pts

def check_fixtures(got):
    # absolute checks of the new fixtures' stated values on NEW (comp off), as check_qa does for the workbook tests; returns the
    # mismatches. Two builds that fail alike compare equal, so a regression that lands would become the next baseline
    bad, byname = [], {}
    for r in got["single"]:
        if not r.get("comp"): byname[r["n"]] = r
        if "err" in r and r["n"] not in REFUSED: bad.append(f"{r['n']}{' comp' if r['comp'] else ''}: unexpected error: {r['err']}")
    for n, phrase in REFUSED.items():
        r = byname.get(n)
        if r is None: bad.append(f"{n}: expected a result, got none")
        elif "err" not in r: bad.append(f"{n}: expected a refusal containing \"{phrase}\", it was accepted")
        elif phrase not in r["err"]: bad.append(f"{n}: expected a refusal containing \"{phrase}\", got: {r['err']}")
    def need(n, what, ok):
        r = byname.get(f"fixtures/{n}")
        if r is None: bad.append(f"fixtures/{n}: expected a result, got none")
        elif "err" not in r and not ok(r): bad.append(f"fixtures/{n}: {what}")
    def circle(r):   # a circle of 500 mm radius: the curve within 0.01 mm of it (the center is the middle of the points' box)
        m = re.search(r' d="([^"]+)"', r["svg"]); pts = bezier_points(m.group(1)) if m else []
        if not pts: return False
        cx, cy = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2, (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
        return max(abs(math.hypot(x - cx, y - cy) - 500) for x, y in pts) <= 0.01
    need("geometry/large-circle.svg", "the exported curve is more than 0.01 mm from the 500 mm circle", circle)
    # the square (40 x 40) plus the half of the r 15 circle outside it, and two overlapping r 15 circles 15 mm apart
    union = 1600 + math.pi * 225 / 2 + 2 * math.pi * 225 - (450 * math.acos(0.5) - 7.5 * math.sqrt(675))
    need("geometry/overlap-opposite.svg", f"expected the union's area {union:.1f} mm2 in 2 outlines", lambda r: r["outers"] == 2 and abs(r["size"][2] - union) <= 1)
    # a circle of r 10 at (20, 20) and an ellipse rx 30, ry 10 turned 30 degrees at (50, 70): the box of both
    w, h = 50 + math.sqrt(900 * 0.75 + 100 * 0.25) - 10, 70 + math.sqrt(900 * 0.25 + 100 * 0.75) - 10
    need("geometry/rotated-circle-ellipse.svg", f"expected the size {w:.3f} x {h:.3f} mm", lambda r: abs(r["size"][0] - w) <= TOL and abs(r["size"][1] - h) <= TOL)
    need("security/cdata.svg", "expected the markup in <text> as escaped text, and the CSS rect outlined in red",
         lambda r: "<img" not in r["svg"] and "&lt;/text&gt;&lt;img src=x onerror=alert(1)&gt;" in r["svg"] and 'stroke="#ff0000"' in r["svg"])
    def ids(r):   # every id is the part's own or prefixed with it, 300 or more of them, and every reference lands on one
        svg = r["svg"]; found = re.findall(r'\sid="([^"]*)"', svg); top = found[0] if found else ""
        refs = re.findall(r'url\(#([^)]*)\)|href="#([^"]*)"', svg)
        return len(found) >= 300 and all(i == top or i.startswith(top + "_") for i in found) and all((a or b) in found for a, b in refs) and bool(refs)
    need("geometry/many-ids.svg", "expected 300 or more ids, each prefixed, and every reference to one of them", ids)
    return bad

NORM = [(re.compile(r"SnugCut v[0-9][0-9.]*(?:-[a-z]+)?"), "SnugCut v"),   # the version in the export comment
        (re.compile(r"\bp\d+_"), "p_")]                                    # parseSVG's per-import id prefix
def norm(v):
    s = json.dumps(v, ensure_ascii=False)
    for rx, to in NORM: s = rx.sub(to, s)
    return s

def options():
    ap = argparse.ArgumentParser(prog="regression.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, allow_abbrev=False)
    ap.add_argument("builds", nargs="*", metavar="BASE [NEW]", help="each a file or a git ref (its snugcut.html); BASE defaults to develop, NEW to the working tree's")
    ap.add_argument("--chrome", metavar="PATH", help="the Chrome or Chromium binary (default: $CHROME, then the usual install locations)")
    ap.add_argument("--libs", metavar="DIR", help="load clipper.js and jszip.min.js from DIR instead of the CDN, to run offline; the search worker "
                    "can't load from a file, so the nests then run on the page only; the page loads need the CDN and run regardless")
    ap.add_argument("--json", metavar="FILE", help="also write NEW's raw results to FILE")
    ap.add_argument("--allow-diff", action="store_true", help="entries that differ between the builds are listed but don't fail the run (a change meant "
                    "to alter exports); errors, nest failures, worker-vs-page differences and workbook mismatches still do")
    ap.add_argument("--no-sandbox", action="store_true", help="start Chrome with --no-sandbox, for CI runners whose Chrome can't create its sandbox")
    return ap.parse_args()   # a mistyped option or a missing value ends the run with status 2

def main():
    o = options()
    if len(o.builds) > 2: fail(2, "at most two builds: BASE [NEW]")
    base, new = (o.builds + [None, None])[:2]
    opts, flags = {"--libs": o.libs, "--json": o.json}, {f for f, on in (("--allow-diff", o.allow_diff), ("--no-sandbox", o.no_sandbox)) if on}
    chrome = find_chrome(o.chrome)
    builds = [source(base or "develop"), source(new or str(ROOT / "snugcut.html"))]
    tmp = tempfile.mkdtemp(prefix="snugcut-regression-")
    try:
        res = [None, None]
        def go(i): res[i] = run_build(chrome, builds[i][0], builds[i][1], i, pathlib.Path(tmp), opts["--libs"], qa_cases() if i == 1 else None, "--no-sandbox" not in flags)
        ts = [threading.Thread(target=go, args=(i,)) for i in range(2)]
        [t.start() for t in ts]; [t.join() for t in ts]
        if None in res: sys.exit(2)    # the thread already reported why
    finally:
        shutil.rmtree(tmp, ignore_errors=True)   # Chrome's helper processes can still be writing to a profile after it is killed
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
    fx = check_fixtures(b)
    print(f"fixture checks: {len(REFUSED)} refusals and 5 values checked, {len(fx)} mismatches" + "".join("\n  " + m for m in fx))
    bad |= bool(fx)
    tmp = tempfile.mkdtemp(prefix="snugcut-load-")
    try: loads = load_check(chrome, builds[1][0], pathlib.Path(tmp), "--no-sandbox" not in flags)
    finally: shutil.rmtree(tmp, ignore_errors=True)
    print(f"page loads: snugcut.html with its CSP and app/index.html over HTTP, {len(loads)} problems" + "".join("\n  " + m for m in loads))
    bad |= bool(loads)
    print("FAIL" if bad else "OK: " + ("exports differ as allowed" if differs else "byte-identical") + ", workbook tests and fixture checks match")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
