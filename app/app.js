// SnugCut app: the page's UI (settings, parts list, plate previews, downloads) on top of lib/snugcut.js.
// snugcut.html is generated from this file, lib/ and the rest of app/ by tools/build.py: edit these, not snugcut.html.
import {ABORT, CL, IN, S, SVGNS, angleList, better, binFrame, computeRectLayout, dxfToSVG, efficiency, envelope, esc, hasHoles,
  fitsPlate, invalidateGeometry, isCurrent, kerfC, measureScale, mulberry, n4, newRun, pack, parseSVG, plateDXF,
  plateSVG, rectFits, score, setVersion, shape, toPlates} from "../lib/snugcut.js";

(() => {
const $ = id => document.getElementById(id);
setVersion($("appver").textContent);
$("changelog").href += "#" + $("appver").textContent.replace(/^v|\./g, "");   // GitHub's anchor for "## 0.1.27" is #0127
if (!CL) { $("plates").innerHTML = `<div class="fatal" role="alert">The geometry library didn't load, so shapes can't be nested. Reload the page to try again.</div>`; $("status").textContent = "Geometry engine unavailable"; return; }
try { loadSettings(JSON.parse(localStorage.getItem("snugcut.settings") || localStorage.getItem("platenester.settings") || "{}")); } catch(e) {}   // settings saved under the old name (Plate Nester) carry over
// saved settings are checked before use (#75): a value of the wrong type or outside what the page offers keeps its
// default, so a planted or stale value can't reach the page's markup or stall the nesting
function loadSettings(saved){
  if (!saved || typeof saved !== "object") return;
  const pick = (k, ok) => { if (Object.hasOwn(saved, k) && ok(saved[k])) S[k] = saved[k]; };
  const opts = id => [...$(id).options].map(o => +o.value), num = v => typeof v === "number" && isFinite(v);
  pick("mode", v => v === "shape" || v === "bbox"); pick("unit", v => v === "mm" || v === "in"); pick("format", v => v === "svg" || v === "dxf");
  for (const k of ["rotStep", "prec", "dpi"]) pick(k, v => opts(k).includes(v));
  for (const k of ["plateW", "plateH"]) pick(k, v => num(v) && v > 0 && v <= 100000);
  for (const k of ["kerf", "gap", "margin"]) pick(k, v => num(v) && v >= 0 && v <= 100000);
  for (const k of ["rotate", "outline", "comp"]) pick(k, v => typeof v === "boolean");
  pick("prefix", v => typeof v === "string" && v.length <= 200);
}
const save = () => { try { localStorage.setItem("snugcut.settings", JSON.stringify(S)); localStorage.removeItem("platenester.settings"); } catch(e) {} };

let parts = [];
let layout = null;               // {plates:[{area, items:[{part,x,y,ang,rx,ry,env}]}], oversize, minPlates, noArea, stale}

const toDisp = mm => S.unit === "in" ? mm / IN : mm;
const fromDisp = v => S.unit === "in" ? v * IN : v;
const fmt = (mm, d) => (+toDisp(mm).toFixed(d ?? (S.unit === "in" ? 3 : 1))).toString();
const LEN = ["plateW","plateH","kerf","gap","margin"];
const LEN_NAME = {plateW:"Plate width", plateH:"Plate height", kerf:"Kerf", gap:"Extra gap", margin:"Edge margin"};
// field errors (#97): the field gets aria-invalid and a message right after it (its description) saying what's wrong
// and which value is still in use; both go as soon as the value is valid
function fieldErr(input, msg){
  let e = document.getElementById(input.id + "-err");
  if (!msg) { if (e) { e.remove(); input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); } return; }
  if (!e) { e = document.createElement("p"); e.className = "ferr"; e.id = input.id + "-err"; const row = input.closest(".part"); row ? row.appendChild(e) : input.after(e); }
  e.textContent = msg; input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", e.id);
}
function fillInputs(){
  for (const k of LEN) {
    const dec = k === "kerf" ? (S.unit === "in" ? 4 : 3) : (S.unit === "in" ? 3 : 2);
    $(k).value = +toDisp(S[k]).toFixed(dec); fieldErr($(k));
    $(k).step = S.unit === "in" ? (k === "kerf" ? "0.001" : "0.125") : (k === "kerf" ? "0.01" : "1");
  }
  $("rotStep").value = String(S.rotStep); $("prec").value = String(S.prec); $("dpi").value = String(S.dpi); $("outline").checked = S.outline; $("rotate").checked = S.rotate; $("kerfComp").checked = !!S.comp; $("compWarn").hidden = !S.comp; $("prefix").value = S.prefix; $("format").value = S.format === "dxf" ? "dxf" : "svg"; prefixEx();
  document.body.dataset.mode = S.mode;
  $("m-shape").setAttribute("aria-pressed", S.mode === "shape"); $("m-bbox").setAttribute("aria-pressed", S.mode === "bbox");
  document.querySelectorAll(".u").forEach(e => e.textContent = S.unit);
  $("u-mm").setAttribute("aria-pressed", S.unit === "mm"); $("u-in").setAttribute("aria-pressed", S.unit === "in");
}
function setUnit(u){
  if (S.unit === u) return;
  const conv = v => isNaN(v) ? "" : +(u === "in" ? v / IN : v * IN).toFixed(4);
  $("kDesign").value = conv(parseFloat($("kDesign").value)); $("kMeasured").value = conv(parseFloat($("kMeasured").value));
  S.unit = u; save(); fillInputs(); kerfCalc(); renderParts(); renderLayout();
}
$("u-mm").onclick = () => setUnit("mm");
$("u-in").onclick = () => setUnit("in");
for (const k of LEN) $(k).addEventListener("input", () => {
  const v = parseFloat($(k).value), plate = k === "plateW" || k === "plateH";
  const bad = $(k).value.trim() === "" || isNaN(v) ? "Enter a number" : plate && v <= 0 ? `${LEN_NAME[k]} must be more than 0` : v < 0 ? `${LEN_NAME[k]} can't be negative` : "";
  fieldErr($(k), bad && `${bad}; still using ${fmt(S[k], k === "kerf" ? (S.unit === "in" ? 4 : 3) : undefined)} ${S.unit}.`);
  if (!bad) { S[k] = fromDisp(v); save(); if (k === "kerf" || k === "gap") invalidateGeometry(); restart(); }
});
$("rotStep").onchange = e => { S.rotStep = +e.target.value; save(); restart(); };
$("prec").onchange = e => { S.prec = +e.target.value; save(); invalidateGeometry(); restart(); };
$("outline").onchange = e => { S.outline = e.target.checked; save(); };
$("kerfComp").onchange = e => { S.comp = e.target.checked; $("compWarn").hidden = !S.comp; save(); invalidateGeometry(); restart(); };
$("prefix").oninput = e => { S.prefix = e.target.value; save(); prefixEx(); };
$("format").onchange = e => { S.format = e.target.value; save(); renderLayout(); prefixEx(); };
$("rotate").onchange = e => { S.rotate = e.target.checked; save(); restart(); };
const setMode = m => { if (S.mode === m) return; S.mode = m; save(); fillInputs(); restart(); };
$("m-shape").onclick = () => setMode("shape");
$("m-bbox").onclick = () => setMode("bbox");
$("dpi").onchange = e => { S.dpi = +e.target.value; save(); parts.forEach(measureScale); invalidateGeometry(); restart(); };

function filePrefix(){
  // the user's prefix made safe for file names on every OS (no path or reserved characters, no leading dots), plus "-"
  const p = String(S.prefix || "").replace(/[\/\\:*?"<>|\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim()
    .replace(/^[.\s]+/, "").replace(/[.\s]+$/, "").slice(0, 60).trim();
  return p ? p + "-" : "";
}
function prefixEx(){ const n = layout && layout.plates.length || 3; $("prefixEx").textContent = `${filePrefix()}plate-01-of-${String(n).padStart(2,"0")}.${ext()}`; }
const ext = () => S.format === "dxf" ? "dxf" : "svg";
function kerfCalc(){
  const d = parseFloat($("kDesign").value), m = parseFloat($("kMeasured").value);
  fieldErr($("kDesign"), !isNaN(d) && d <= 0 ? "Designed must be more than 0." : "");
  fieldErr($("kMeasured"), !isNaN(m) && m <= 0 ? "Measured must be more than 0." : !isNaN(d) && !isNaN(m) && m > d ? "Measured must be smaller than designed: the cut takes material away." : "");
  if (isNaN(d) || isNaN(m) || d <= 0 || m <= 0 || m > d) { $("kOut").textContent = "Kerf: –"; $("kUse").disabled = true; return null; }
  const k = fromDisp(d - m);
  $("kOut").textContent = `Kerf: ${fmt(k, S.unit === "in" ? 4 : 3)} ${S.unit}`; $("kUse").disabled = false; return k;
}
$("kDesign").oninput = kerfCalc; $("kMeasured").oninput = kerfCalc;
$("kUse").onclick = () => { const k = kerfCalc(); if (k != null) { S.kerf = k; save(); fillInputs(); invalidateGeometry(); restart(); toast("Kerf updated"); } };

/* ---------- search controller ---------- */
let search = null;   // {items, bestOrder, bestScore, tried, F}
async function run(ms, fresh){
  const token = newRun();
  if (S.mode === "bbox") { search = null; layout = computeRectLayout(parts); renderLayout(); setRunning(false); return; }
  const F = binFrame();
  $("status").innerHTML = `<span class="dot on"></span>Nesting…`;
  const plateA = S.plateW * S.plateH;
  setRunning(true);
  const t0 = performance.now();
  try {
    if (fresh || !search || !search.bestScore) {   // no finished pack yet (stopped during the first one): start over
      const items = [], oversize = [];
      if (F.mR <= F.mL || F.mB <= F.mT) { search = null; layout = {plates:[], oversize:[], minPlates:0, noArea:true}; renderLayout(); return; }   // no old search to continue (#71)
      for (const p of parts) {
        if (!p.qty) continue;
        if (!fitsPlate(p, F)) { oversize.push(p); continue; }
        const e = envelope(p);
        for (let k = 0; k < p.qty; k++) items.push({part:p, envArea:e.area});
      }
      const minPlates = items.length ? Math.ceil(items.reduce((s, it) => s + it.envArea, 0) / ((F.R - F.L) * (F.B - F.T)) - 1e-9) : 0;
      search = {items, oversize, minPlates, bestOrder:null, bestScore:null, tried:0, F, rnd:mulberry(7)};
      if (!items.length) { layout = {plates:[], oversize, minPlates:0}; renderLayout(); return; }
      const idx = items.map((_, i) => i);
      const keys = [it => it.envArea, it => { const s = shape(it.part, 0); return Math.max(s.maxX - s.minX, s.maxY - s.minY); }];
      for (const key of keys) {
        const order = [...idx].sort((a, b) => key(items[b]) - key(items[a]) || items[a].part.uid - items[b].part.uid);
        const bins = await pack(items, order, it => angleList(it.part), token, F);
        search.tried++;
        const sc = score(bins, plateA);
        if (!search.bestScore || better(sc, search.bestScore)) { search.bestOrder = order; search.bestScore = sc; layout = {plates:toPlates(bins), oversize, minPlates}; renderLayout(); }
        status(t0, ms, token);
      }
    }
    const {items, rnd} = search;
    if (items.length < 2) return;
    let cur = search.bestOrder, curScore = search.bestScore;
    while (performance.now() - t0 < ms) {
      if (search.bestScore[0] <= search.minPlates && search.bestScore[0] === 1) break;
      const o = cur.slice(), n = o.length;
      const moves = 1 + Math.floor(rnd() * 3);
      for (let m = 0; m < moves; m++) {
        const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
        if (rnd() < 0.5) [o[a], o[b]] = [o[b], o[a]]; else { const [x] = o.splice(a, 1); o.splice(b, 0, x); }
      }
      const bins = await pack(items, o, it => angleList(it.part), token, search.F);
      search.tried++;
      const sc = score(bins, plateA);
      if (!better(curScore, sc)) { cur = o; curScore = sc; }
      if (better(sc, search.bestScore)) { search.bestOrder = o; search.bestScore = sc; layout = {plates:toPlates(bins), oversize:search.oversize, minPlates:search.minPlates}; renderLayout(); }
      status(t0, ms, token);
    }
  } catch(e) {
    if (e !== ABORT) { console.error(e); notice("Nesting stopped after an error: " + (e.message || e), true); }
    else return;
  } finally {
    if (isCurrent(token)) setRunning(false);
  }
}
function status(t0, ms, token){
  if (!isCurrent(token)) return;
  const el = performance.now() - t0;
  $("status").innerHTML = `<span class="dot on"></span>Searching… ${(el/1000).toFixed(1)} of ${(ms/1000).toFixed(0)} s · ${search.tried} layouts tried`;
}
function setRunning(on){
  const f = document.activeElement;
  $("stop").hidden = !on; $("more").setAttribute("aria-disabled", on || !search || !search.items.length);
  if (!on) $("status").innerHTML = `<span class="dot"></span>${layout && layout.stale ? "Stopped before a new layout was ready. The plates shown are out of date." : search && search.tried ? `Best of ${search.tried} layouts tried.` : "Ready."}${layout && layout.plates.length && !layout.stale && search && search.bestScore && search.bestScore[0] > search.minPlates ? " A longer search may save a plate." : ""}`;
  if (!on) say(runSummary());
  if (on && f === $("more")) $("stop").focus(); else if (!on && f === $("stop")) $("more").focus();   // they hand focus to each other (#95)
}
// one sentence for screen readers when a run ends (#93)
function runSummary(){
  if (!layout) return "Ready.";
  if (layout.stale) return "Stopped before a new layout was ready. The plates shown are out of date.";
  if (layout.noArea) return "The edge margin leaves no usable area on the plate.";
  const n = layout.plates.length, placed = layout.plates.reduce((a, b) => a + b.items.length, 0);
  const want = parts.reduce((a, p) => a + p.qty, 0), fill = n ? Math.round(100 * layout.plates.reduce((a, b) => a + b.area, 0) / (S.plateW * S.plateH * n)) : 0;
  let t = n ? `Nesting finished: ${n} plate${n === 1 ? "" : "s"}, ${fill}% average utilization, ${placed} of ${want} parts placed.` : (want ? "Nesting finished: nothing could be placed." : "No parts to nest.");
  const E = n && efficiency(layout.plates);
  if (E) t += ` Efficiency ${E.rating} out of 10: the parts use ${Math.round(E.eff * 100)}% of the material the job takes up.`;
  if (layout.oversize.length) t += ` ${layout.oversize.length} file${layout.oversize.length === 1 ? " doesn't" : "s don't"} fit on the plate and ${layout.oversize.length === 1 ? "was" : "were"} left out.`;
  return t;
}
$("stop").onclick = () => { newRun(); setRunning(false); };
$("more").onclick = () => { if ($("more").getAttribute("aria-disabled") !== "true") run(30000, false); };
let tmr;
// a change to the parts or settings: the plates on screen no longer match, so they can't be downloaded until a new pack replaces them,
// and the old search can't be continued
function staleLayout(){ search = null; if (layout) { layout.stale = true; showStale(); } }
function restart(){ clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => { renderParts(); run(4000, true); }, 250); }

/* ---------- parts list ---------- */
const ICON_LOCK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`;
// open shackle when unlocked: the lock's state shows in its shape, not only its color (#98)
const ICON_UNLOCK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0"/></svg>`;
// a part's holes open to other parts (#3): an empty frame when off, a frame with a part inside when on
const ICON_HOLE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" stroke-dasharray="2 1.5"/></svg>`;
const ICON_HOLE_ON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><rect x="6" y="6" width="4" height="4" rx=".5" fill="currentColor"/></svg>`;
const ICON_X = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
function renderParts(){
  // the list is rebuilt: put focus back on the same control of the same part (#95)
  const box = $("parts"), fa = document.activeElement, fr = fa && box.contains(fa) ? fa.closest(".part") : null;
  const keep = fr ? {uid:fr.dataset.uid, sel:fa.matches("input") ? "input" : fa.matches("select") ? "select" : fa.matches(".lk") ? ".lk" : fa.matches(".hl") ? ".hl" : ".rm"} : null;
  box.innerHTML = "";
  const F = binFrame();
  for (const p of parts) {
    const row = document.createElement("div"); row.className = "part"; row.dataset.uid = p.uid;
    const ok = S.mode === "bbox" ? rectFits(p) : fitsPlate(p, F);
    row.innerHTML = `<img alt="" src="${p.thumb}"><div class="info"><div class="nm" id="nm-${p.uid}" title="${esc(p.name)}">${esc(p.name)}</div><div class="sz${ok?"":" bad"}">${fmt(p.wMM)} × ${fmt(p.hMM)} ${esc(S.unit)}${ok?"":" · too big"}</div>${p.dxf ? `<div class="du"><span id="dl-${p.uid}">Drawn in</span><select id="du-${p.uid}" aria-labelledby="dl-${p.uid} nm-${p.uid}"><option value="mm"${p.dxf.units === "mm" ? " selected" : ""}>mm</option><option value="in"${p.dxf.units === "in" ? " selected" : ""}>inches</option></select></div>` : ""}</div>
      <div class="qw"><span class="ql" id="ql-${p.uid}">Qty</span><input type="number" id="q-${p.uid}" min="0" step="1" value="${p.qty}" aria-labelledby="ql-${p.uid} nm-${p.uid}"></div>
      <div class="acts">${S.mode === "bbox" ? "" : hasHoles(p) ? `<button type="button" class="icon hl" aria-pressed="${!!p.useHoles}" title="Nest other parts inside this part's holes (only if every closed inner outline is cut, not scored)" aria-label="Nest parts inside the holes of ${esc(p.name)}">${p.useHoles ? ICON_HOLE_ON : ICON_HOLE}</button>` : `<span class="icon nohole" title="No holes to nest parts in" aria-hidden="true">${ICON_HOLE}</span>`}<button type="button" class="icon lk" aria-pressed="${p.lock}" title="Lock orientation (no rotation)" aria-label="Lock orientation of ${esc(p.name)}">${p.lock ? ICON_LOCK : ICON_UNLOCK}</button><button type="button" class="icon rm" title="Remove" aria-label="Remove ${esc(p.name)}">${ICON_X}</button></div>`;
    const q = row.querySelector("input");
    q.oninput = () => {
      const ok = /^\s*\d+\s*$/.test(q.value);   // whole numbers only: 2.5 or -3 are refused with a message, not truncated (#97)
      fieldErr(q, ok ? "" : `Enter a whole number, 0 or more; still using ${p.qty}.`);
      if (ok) { p.qty = parseInt(q.value, 10); updateCount(); clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 350); }
    };
    const du = row.querySelector(".du select");
    if (du) du.onchange = () => { const np = reunit(p, du.value); if (np) { say(`${np.name} read in ${du.value === "in" ? "inches" : "millimeters"}: ${fmt(np.wMM)} × ${fmt(np.hMM)} ${S.unit}.`); renderParts(); $("parts").querySelector(`.part[data-uid="${np.uid}"] select`).focus(); restart(); } };
    const lk = row.querySelector(".lk"), rm = row.querySelector(".rm"), hl = row.querySelector(".hl");
    if (hl) hl.onclick = () => { p.useHoles = !p.useHoles; hl.setAttribute("aria-pressed", p.useHoles); hl.innerHTML = p.useHoles ? ICON_HOLE_ON : ICON_HOLE; clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 250); };
    lk.onclick = () => { p.lock = !p.lock; lk.setAttribute("aria-pressed", p.lock); lk.innerHTML = p.lock ? ICON_LOCK : ICON_UNLOCK; clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 250); };
    rm.onclick = () => {   // focus moves to the next part's quantity (or the previous one, or the drop zone) (#95)
      const i = parts.indexOf(p), nb = parts[i + 1] || parts[i - 1];
      removeParts(x => x === p); renderParts();
      (nb ? $("parts").querySelector(`.part[data-uid="${nb.uid}"] input`) : drop).focus(); restart();
    };
    box.appendChild(row);
  }
  if (!parts.length) box.innerHTML = `<p class="note" style="margin:0">No parts yet. Add SVG or DXF files above.</p>`;
  $("sampleBadge").hidden = !parts.some(p => p.sample);
  updateCount();
  if (keep) { const r = box.querySelector(`.part[data-uid="${keep.uid}"]`); if (r) r.querySelector(keep.sel).focus(); }
}
function updateCount(){
  const n = parts.reduce((a, p) => a + p.qty, 0);
  $("partCount").textContent = `${parts.length} file${parts.length===1?"":"s"} · ${n} part${n===1?"":"s"}`;
}
// a DXF file that doesn't declare its units is read again in the units the user picks (#90); the part keeps its place,
// quantity and lock
function reunit(p, units){
  try {
    const np = parseSVG(dxfToSVG(p.dxf.text, p.name, {units}).svg, p.name);
    Object.assign(np, {fromDXF:true, qty:p.qty, lock:p.lock, useHoles:p.useHoles, precomp:p.precomp, dxf:{text:p.dxf.text, units}});
    parts[parts.indexOf(p)] = np; URL.revokeObjectURL(p.thumb); return np;
  } catch(e) { notice(e.message, true); return null; }
}
function removeParts(fn){ parts = parts.filter(p => { if (fn(p)) { URL.revokeObjectURL(p.thumb); return false; } return true; }); }

/* ---------- files ---------- */
const drop = $("drop"), file = $("file");
drop.onclick = () => file.click();
drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); };
file.onchange = () => { addFiles(file.files); file.value = ""; };
async function addFiles(list){
  const isDXF = f => /\.dxf$/i.test(f.name);
  const files = [...list].filter(f => /\.svg$/i.test(f.name) || f.type === "image/svg+xml" || isDXF(f));
  if (!files.length) { notice("Only .svg and .dxf files can be added.", true); return; }
  if (parts.some(p => p.sample)) removeParts(p => p.sample);
  const errs = [], notes = [];                                // errors: files that couldn't be added
  const stripped = [], hiddenIn = [];
  for (const f of files) { try {
    let text = await f.text();
    const pre = /kerf-compensated: [\d.]+ mm per side/.test(text);
    let dxf = null;
    if (isDXF(f)) { const r = dxfToSVG(text, f.name); if (r.units) dxf = {text, units:r.units}; text = r.svg; notes.push(...r.notes); }
    const p = parseSVG(text, f.name); p.fromDXF = isDXF(f); p.dxf = dxf; parts.push(p); if (p.stripped) stripped.push(p.name);
    if (p.hidden) hiddenIn.push(`${p.hidden} from ${p.name}`);
    if (pre) { p.precomp = true; notes.push(`${f.name} was downloaded from SnugCut with kerf compensation built in, so it won't be compensated again.`); }
  } catch(e) { errs.push(e.message); } }
  if (hiddenIn.length) notes.push(`Left out hidden shapes (not shown, so not cut): ${hiddenIn.join(", ")}.`);
  if (stripped.length) notes.push(`Removed links to outside files (web images, fonts or styles) from ${stripped.join(", ")}; only what's inside the file is used.`);
  errs.forEach(t => notice(t, true)); notes.forEach(t => notice(t));
  restart();
}
$("clear").onclick = () => { removeParts(() => true); restart(); };

let plateURLs = [];
function renderLayout(){
  // the plates are rebuilt on every better layout: put focus back on the same plate's Download button (#95)
  const fa = document.activeElement, fi = fa === $("dlAll") ? -1 : fa && $("plates").contains(fa) && fa.dataset.i != null ? +fa.dataset.i : null;
  try { drawLayout(); } finally { if (fi != null) refocusPlate(fi); }
}
function refocusPlate(i){
  const bs = $("plates").querySelectorAll(".plate .hd button");
  (i === -1 && !$("dlAll").hidden ? $("dlAll") : bs[Math.min(Math.max(i, 0), bs.length - 1)] || drop).focus();
}
function drawLayout(){
  plateURLs.forEach(u => URL.revokeObjectURL(u)); plateURLs = [];
  const box = $("plates"), msgs = $("msgs"); box.innerHTML = ""; msgs.innerHTML = "";
  const L = layout; if (!L) return;
  const plateA = S.plateW * S.plateH;
  const placed = L.plates.reduce((a, b) => a + b.items.length, 0);
  $("sPlates").textContent = L.plates.length || "–";
  $("sMin").textContent = L.minPlates || "–";
  $("sFill").textContent = L.plates.length ? Math.round(100 * L.plates.reduce((a, b) => a + b.area, 0) / (plateA * L.plates.length)) + "%" : "–";
  $("sParts").textContent = placed;
  // efficiency rating (#138): "6/10" read as "6 out of 10", with the percentage under it
  const E = efficiency(L.plates), cut = E && Math.min(E.offcut.w, E.offcut.h) >= 10 ? E.offcut : null;
  $("sEff").innerHTML = E ? `${E.rating}<span aria-hidden="true">/</span><span class="sr-only"> out of </span>10` : "–";
  $("sEffK").textContent = E ? `Efficiency · ${Math.round(E.eff * 100)}%` : "Efficiency";
  const msg = t => { const m = document.createElement("div"); m.className = "msg"; m.textContent = t; msgs.appendChild(m); };
  const bbox = S.mode === "bbox", canRot = bbox ? S.rotate : !!S.rotStep;
  for (const p of L.oversize) msg(`${p.name} (${fmt(p.wMM)} × ${fmt(p.hMM)} ${S.unit}) doesn't fit inside the plate's margins${!p.lock && canRot ? (bbox ? " in either orientation" : " at any allowed rotation") : ""}. It was left out.`);
  if (L.noArea) msg("The edge margin leaves no usable area on the plate.");
  // when nothing was placed, say why only if no message above already does (#84)
  if (!L.plates.length && !L.noArea && !L.oversize.length) box.innerHTML = `<p class="note">${!parts.length ? "Add SVG or DXF files to see them nested on plates." : !parts.some(p => p.qty) ? "Set a quantity above zero to place parts." : "No parts could be placed."}</p>`;
  L.plates.forEach((pl, i) => {
    const url = URL.createObjectURL(new Blob([plateSVG(pl, {preview:true})], {type:"image/svg+xml"})); plateURLs.push(url);
    const fill = Math.round(100 * pl.area / plateA);
    const env = pl.items.map(it => it.env.map(q => `<polygon points="${q.map(([x, y]) => `${n4(x)},${n4(y)}`).join(" ")}" fill="none" stroke="var(--guide)" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"><title>${esc(it.part.name)}${it.ang ? ` (rotated ${it.ang}°)` : ""}</title></polygon>`).join("")).join("");
    const mg = S.margin > 0 ? `<rect x="${n4(S.margin)}" y="${n4(S.margin)}" width="${n4(S.plateW-2*S.margin)}" height="${n4(S.plateH-2*S.margin)}" fill="none" stroke="var(--guide-margin)" stroke-width="1" stroke-dasharray="1 3" vector-effect="non-scaling-stroke"/>` : "";
    // text alternative (#96): the image says what's on the plate, and points to a list of the parts on it
    const alt = `Plate ${i+1} of ${L.plates.length}: ${pl.items.length} part${pl.items.length === 1 ? "" : "s"}, ${fill}% utilization`;
    const groups = new Map();
    for (const it of pl.items) {
      const g = groups.get(it.part) || {n:0, rot:new Map()}, a = ((Math.round(it.ang) % 360) + 360) % 360;
      g.n++; if (a) g.rot.set(a, (g.rot.get(a) || 0) + 1); groups.set(it.part, g);
    }
    const list = [...groups].map(([p, g]) => `<li>${esc(p.name)} × ${g.n}${g.rot.size ? ` (${[...g.rot].sort((a, b) => a[0] - b[0]).map(([a, n]) => `${n} rotated ${a}°`).join(", ")})` : ""}</li>`).join("");
    const card = document.createElement("article"); card.className = "plate"; card.setAttribute("aria-labelledby", `plate-${i}-h`);   // named by its heading (#102)
    card.innerHTML = `<div class="hd"><div><h3 class="t" id="plate-${i}-h">Plate ${i+1} of ${L.plates.length}</h3><div class="m">${pl.items.length} part${pl.items.length === 1 ? "" : "s"} · ${fill}% utilization · ${fmt(S.plateW)} × ${fmt(S.plateH)} ${esc(S.unit)}${cut && i === L.plates.length - 1 ? ` · offcut ${fmt(cut.w)} × ${fmt(cut.h)} ${esc(S.unit)}` : ""}</div></div><button type="button" data-i="${i}" class="btn small" aria-label="Download ${ext().toUpperCase()}, plate ${i+1} of ${L.plates.length}">Download ${ext().toUpperCase()}</button></div>
      <div class="sheet" style="aspect-ratio:${S.plateW}/${S.plateH}"><img alt="${alt}" aria-describedby="plist-${i}" src="${url}"><svg viewBox="0 0 ${n4(S.plateW)} ${n4(S.plateH)}" preserveAspectRatio="none" aria-hidden="true">${mg}${env}</svg></div>
      <div class="bar" aria-hidden="true"><i style="width:${fill}%"></i></div>
      <details class="plist"><summary>Parts on this plate</summary><ul id="plist-${i}">${list}</ul></details>`;
    card.querySelector("button").onclick = () => exportPlate(i);
    box.appendChild(card);
  });
  $("dlAll").hidden = !(L.plates.length > 1 && window.JSZip); prefixEx(); showStale();
}
function showStale(){
  const st = !!(layout && layout.stale);
  $("plates").classList.toggle("stale", st);
  $("plates").querySelectorAll(".plate .hd button").forEach(b => { b.setAttribute("aria-disabled", st); b.title = st ? "Out of date: wait for the new layout" : ""; });
  $("dlAll").setAttribute("aria-disabled", st);   // aria-disabled, not disabled: a focused button keeps focus (#95)
}
const fname = i => `${filePrefix()}plate-${String(i+1).padStart(2,"0")}-of-${String(layout.plates.length).padStart(2,"0")}.${ext()}`;
const zipName = () => filePrefix() ? `${filePrefix()}plates.zip` : "nested-plates.zip";
function download(data, filename, type){
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type}));
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function plateFile(pl, notes){
  if (kerfC()) notes.add(`Kerf compensation is built in (${fmt(S.kerf / 2, S.unit === "in" ? 4 : 3)} ${S.unit} per side): don't add a kerf offset in your cutter's software.`);
  if (ext() === "svg") return plateSVG(pl, {notes});
  const r = plateDXF(pl); r.notes.forEach(n => notes.add(n)); return r.dxf;
}
function exportPlate(i){
  if (!layout || layout.stale) return;
  const notes = new Set();
  download(plateFile(layout.plates[i], notes), fname(i), ext() === "dxf" ? "application/dxf" : "image/svg+xml");
  toast(`Saved ${fname(i)}`); notes.forEach(t => notice(t));
}
$("dlAll").onclick = async () => {
  if (!layout || layout.stale || !window.JSZip) return;
  const zip = new JSZip();
  const notes = new Set();
  layout.plates.forEach((pl, i) => zip.file(fname(i), plateFile(pl, notes)));
  download(await zip.generateAsync({type:"blob"}), zipName());
  toast(`Saved ${zipName()}`); notes.forEach(t => notice(t));
};

// short confirmations only ("Saved …", "Kerf updated"): on screen for at least 20 s, longer for long text, kept while
// the pointer is over it, and Esc closes it (#94). Warnings and errors go to notice() and stay until dismissed.
let toastT;
function toast(t){
  const el = $("toast"); el.textContent = t; el.hidden = false; say(t); clearTimeout(toastT);
  const wait = ms => { toastT = setTimeout(() => el.matches(":hover") ? wait(1000) : (el.hidden = true), ms); };
  wait(Math.max(20000, t.length * 100));
}
addEventListener("keydown", e => { if (e.key === "Escape" && !$("toast").hidden) { clearTimeout(toastT); $("toast").hidden = true; } });
// warnings and errors: one item each in the message list, until dismissed (#94); announced once (#93)
function notice(t, err){
  const box = $("notices");
  if ([...box.children].some(m => m.dataset.text === t)) { say(t, err); return; }   // already on screen
  const m = document.createElement("div"); m.className = "msg has-x" + (err ? " err" : ""); m.dataset.text = t;
  const s = document.createElement("span"); s.textContent = t;
  const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.innerHTML = ICON_X; x.title = "Dismiss";
  x.setAttribute("aria-label", "Dismiss: " + (t.length > 60 ? t.slice(0, 57) + "…" : t));
  x.onclick = () => { const nb = m.nextElementSibling || m.previousElementSibling; m.remove(); (nb ? nb.querySelector(".x") : drop).focus(); };
  m.append(s, x); box.appendChild(m); say(t, err);
}
// screen-reader announcements (#93): the live regions stay in the page, and each message is added as a new node so a
// repeated message is announced again; urgent ones (errors) go to the role="alert" region
function say(t, urgent){ const p = document.createElement("p"); p.textContent = t; $(urgent ? "sayAlert" : "sayPolite").appendChild(p); setTimeout(() => p.remove(), 20000); }

/* ---------- sample parts ---------- */
const S0 = 'fill="none" stroke="#000" stroke-width="0.2"';
const SAMPLES = [
  ["star-ornament.svg", 8, `<svg xmlns="${SVGNS}" width="70mm" height="67mm" viewBox="0 0 70 67"><polygon points="35,0.5 43.2,24.6 69.2,25.1 48.6,40.8 56.1,65.9 35,51 13.9,65.9 21.4,40.8 0.8,25.1 26.8,24.6" ${S0}/><circle cx="35" cy="12" r="1.8" ${S0}/></svg>`],
  ["l-bracket.svg", 6, `<svg xmlns="${SVGNS}" width="80mm" height="60mm" viewBox="0 0 80 60"><polygon points="0,0 80,0 80,16 16,16 16,60 0,60" ${S0}/><circle cx="8" cy="50" r="2.5" ${S0}/><circle cx="70" cy="8" r="2.5" ${S0}/></svg>`],
  ["crescent-moon.svg", 6, `<svg xmlns="${SVGNS}" width="34mm" height="60mm" viewBox="0 0 34 60"><path d="M30 0 A30 30 0 0 0 30 60 A36 36 0 0 1 30 0 Z" ${S0}/></svg>`],
  ["coaster-round.svg", 4, `<svg xmlns="${SVGNS}" width="95mm" height="95mm" viewBox="0 0 95 95"><circle cx="47.5" cy="47.5" r="47.4" ${S0}/><circle cx="47.5" cy="47.5" r="38" fill="none" stroke="#2d55f0" stroke-width="0.3"/></svg>`],
  ["shop-sign.svg", 2, `<svg xmlns="${SVGNS}" width="180mm" height="80mm" viewBox="0 0 180 80"><rect x="0.1" y="0.1" width="179.8" height="79.8" rx="8" ${S0}/><circle cx="12" cy="40" r="2.5" ${S0}/><circle cx="168" cy="40" r="2.5" ${S0}/><rect x="30" y="22" width="120" height="36" rx="3" fill="#2d55f0" opacity=".35"/></svg>`],
  ["hex-tag.svg", 6, `<svg xmlns="${SVGNS}" width="50mm" height="43.3mm" viewBox="0 0 50 43.3"><polygon points="12.5,0.1 37.5,0.1 49.9,21.65 37.5,43.2 12.5,43.2 0.1,21.65" ${S0}/><circle cx="25" cy="8" r="2" ${S0}/></svg>`],
];
fillInputs();
for (const [n, q, t] of SAMPLES) { try { const p = parseSVG(t, n); p.qty = q; p.sample = true; parts.push(p); } catch(e) { console.error(e); } }
renderParts();
run(4000, true);
})();
