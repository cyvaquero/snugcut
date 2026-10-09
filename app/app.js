// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Guy Heckman. Licensed under the GNU Affero General Public License v3.0 or later (see LICENSE).
// SnugCut app: the page's UI (settings, parts list, plate previews, downloads) on top of lib/snugcut.js.
// snugcut.html is generated from this file, lib/ and the rest of app/ by tools/build.py: edit these, not snugcut.html.
import {ABORT, CL, IN, S, SVGNS, angleList, better, binFrame, computeRectLayout, dxfToSVG, efficiency, envelope, esc, hasHoles,
  fitsPlate, invalidateGeometry, isCurrent, kerfC, measureScale, mulberry, n4, newRun, pack, parseSVG, plateDXF,
  plateSVG, rectFits, score, setMessages, setVersion, shape, toPlates} from "../lib/snugcut.js";
import {EN} from "./strings-en.js";

(() => {
const $ = id => document.getElementById(id);
setVersion($("appver").textContent);
$("changelog").href += "#" + $("appver").textContent.replace(/^v|\./g, "");   // GitHub's anchor for "## 0.1.27" is #0127
// numbers on screen follow the browser's locale ("0,2" in de-DE, "54 %" in fr-FR), in Latin digits and without
// grouping; exports keep "." whatever the locale (#128)
const LOC = (() => { try { return new Intl.NumberFormat(navigator.language).resolvedOptions().locale; } catch(e) { return "en-US"; } })();
const nfs = new Map();
const nf = (k, o) => nfs.get(k) || nfs.set(k, new Intl.NumberFormat(LOC, {numberingSystem:"latn", useGrouping:false, ...o})).get(k);
const num = (v, d = 0, min = 0) => { const r = +v.toFixed(d); return nf(`${d}/${min}`, {minimumFractionDigits:min, maximumFractionDigits:d}).format(r === 0 ? 0 : r); };   // rounded as toFixed did, never "-0"
const pct = v => nf("%", {style:"percent", maximumFractionDigits:0}).format(Math.round(100 * v) / 100);
// text (#128): every message app.js shows comes from the string table (strings-en.js) by key, as a whole sentence. The
// page's own text is in index.html, marked with data-t keys for the translations to come (#129); English is the only
// language for now.
const LANG = "en", STR = EN, PR = new Intl.PluralRules(LANG);
document.documentElement.lang = LANG;
const t = (key, v = {}) => Object.hasOwn(STR, key) ? fill(STR[key], v) : (console.error("no text for " + key), key);
function fill(s, v){
  let out = "";
  for (let i = 0; i < s.length;) {
    if (s[i] !== "{") { out += s[i++]; continue; }
    let j = i, depth = 0;
    do { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; } while (depth && j < s.length);
    const body = s.slice(i + 1, j - 1), m = /^(\w+),\s*(plural|select),([\s\S]*)$/.exec(body); i = j;
    if (!m) { out += Object.hasOwn(v, body) ? v[body] : `{${body}}`; continue; }
    const x = v[m[1]], cases = {};
    for (const c of m[3].matchAll(/(=?\w+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) cases[c[1]] = c[2];
    const pick = m[2] === "select" ? cases[x] ?? cases.other : cases["=" + x] ?? cases[PR.select(x)] ?? cases.other;
    out += fill(m[2] === "plural" ? pick.replace(/#/g, num(x)) : pick, v);
  }
  return out;
}
// the library's messages in the app's words, with its counts formatted for the locale (README "Library messages")
setMessages((code, v) => Object.hasOwn(STR, "lib." + code) ? t("lib." + code, {...v, limit: v.limit == null ? "" : nf("g", {useGrouping:true}).format(v.limit),
  list: v.skipped ? v.skipped.map(([type, n]) => `${n} ${type.toLowerCase()}`).join(", ") : ""}) : undefined);
if (!CL) { $("plates").innerHTML = `<div class="fatal" role="alert">${t("fatal.noClipper")}</div>`; $("status").textContent = t("status.noEngine"); return; }
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
// a typed number: "0,2" and "0.2" both mean 0.2 (one decimal mark, either one, no grouping); NaN when it isn't one (#229)
const parseNum = s => { const x = String(s).trim().replace(/^\u2212/, "-"), v = +x.replace(",", ".");
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(x) && isFinite(v) ? v : NaN; };
const fmt = (mm, d) => num(toDisp(mm), d ?? (S.unit === "in" ? 3 : 1));
const LEN = ["plateW","plateH","kerf","gap","margin"];
const LEN_NAME = {plateW:"len.plateW", plateH:"len.plateH", kerf:"len.kerf", gap:"len.gap", margin:"len.margin"};
// say t once the user stops typing for a moment; a later call with the same key replaces it, and one without text cancels it
const later = new Map();
function sayLater(key, text){ clearTimeout(later.get(key)); later.delete(key); if (text) later.set(key, setTimeout(() => { later.delete(key); say(text); }, 700)); }
// add or remove one id in an element's aria-describedby, keeping the others (such as a hint, #204); an error goes first
function describe(el, id, on, first){
  const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(x => x && x !== id);
  if (on) first ? ids.unshift(id) : ids.push(id);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" ")); else el.removeAttribute("aria-describedby");
}
// field errors (#97): the field gets aria-invalid and a message right after it (its description) saying what's wrong
// and which value is still in use; both go as soon as the value is valid. A new or changed message is also announced,
// once typing pauses (#166).
function fieldErr(input, msg, quiet){
  let e = document.getElementById(input.id + "-err");
  if (!msg) { sayLater(input.id); if (e) { e.remove(); input.removeAttribute("aria-invalid"); describe(input, e.id, false); } return; }
  if (!quiet && (!e || e.textContent !== msg)) sayLater(input.id, msg);
  if (!e) { e = document.createElement("p"); e.className = "ferr"; e.id = input.id + "-err"; const row = input.closest(".part"); row ? row.appendChild(e) : input.after(e); }
  e.textContent = msg; input.setAttribute("aria-invalid", "true"); describe(input, e.id, true, true);
}
function fillInputs(){
  for (const k of LEN) {
    const dec = k === "kerf" ? (S.unit === "in" ? 4 : 3) : (S.unit === "in" ? 3 : 2);
    $(k).value = num(toDisp(S[k]), dec); fieldErr($(k));
  }
  $("rotStep").value = String(S.rotStep); $("prec").value = String(S.prec); $("dpi").value = String(S.dpi); $("outline").checked = S.outline; $("rotate").checked = S.rotate; $("kerfComp").checked = !!S.comp; showCompWarn(); $("prefix").value = S.prefix; $("format").value = S.format === "dxf" ? "dxf" : "svg"; prefixEx();
  document.body.dataset.mode = S.mode;
  $("m-shape").setAttribute("aria-pressed", S.mode === "shape"); $("m-bbox").setAttribute("aria-pressed", S.mode === "bbox");
  document.querySelectorAll(".u").forEach(e => e.textContent = S.unit);
  $("kerf").placeholder = t("kerf.placeholder", {value: S.unit === "in" ? num(0.004, 3) : num(0.1, 2, 2)});   // 0.10 in would be 2.54 mm (#172)
  $("u-mm").setAttribute("aria-pressed", S.unit === "mm"); $("u-in").setAttribute("aria-pressed", S.unit === "in");
}
function setUnit(u){
  if (S.unit === u) return;
  const conv = v => isNaN(v) ? "" : num(u === "in" ? v / IN : v * IN, 4);
  $("kDesign").value = conv(parseNum($("kDesign").value)); $("kMeasured").value = conv(parseNum($("kMeasured").value));
  S.unit = u; save(); fillInputs(); kerfCalc(); renderParts(); renderLayout();
}
$("u-mm").onclick = () => setUnit("mm");
$("u-in").onclick = () => setUnit("in");
for (const k of LEN) $(k).addEventListener("input", () => {
  const v = parseNum($(k).value), plate = k === "plateW" || k === "plateH";
  const bad = isNaN(v) ? "field.nan" : plate && v <= 0 ? "field.notPositive" : v < 0 ? "field.negative" : "";
  fieldErr($(k), bad && t(bad, {field: t(LEN_NAME[k]), value: fmt(S[k], k === "kerf" ? (S.unit === "in" ? 4 : 3) : undefined), unit: S.unit}));
  if (!bad) { S[k] = fromDisp(v); save(); if (k === "kerf" || k === "gap") invalidateGeometry(); restart(); }
});
$("rotStep").onchange = e => { S.rotStep = +e.target.value; save(); restart(); };
$("prec").onchange = e => { S.prec = +e.target.value; save(); invalidateGeometry(); restart(); };
$("outline").onchange = e => { S.outline = e.target.checked; save(); };
// the warning describes the checkbox while it shows, and its heading is announced when compensation is turned on (#166)
function showCompWarn(){ $("compWarn").hidden = !S.comp; describe($("kerfComp"), "compWarn", S.comp); }
$("kerfComp").onchange = e => { S.comp = e.target.checked; showCompWarn(); if (S.comp) say($("compWarn").querySelector("b").textContent); save(); invalidateGeometry(); restart(); };
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
  const d = parseNum($("kDesign").value), m = parseNum($("kMeasured").value), typed = k => $(k).value.trim() !== "";
  fieldErr($("kDesign"), isNaN(d) && typed("kDesign") ? t("kcalc.nan") : !isNaN(d) && d <= 0 ? t("kcalc.designedPositive") : "");
  fieldErr($("kMeasured"), isNaN(m) && typed("kMeasured") ? t("kcalc.nan") : !isNaN(m) && m <= 0 ? t("kcalc.measuredPositive") : !isNaN(d) && !isNaN(m) && m > d ? t("kcalc.measuredSmaller") : "");
  if (isNaN(d) || isNaN(m) || d <= 0 || m <= 0 || m > d) { sayLater("kOut"); $("kOut").textContent = t("kcalc.none"); $("kUse").disabled = true; return null; }
  const k = fromDisp(d - m), out = t("kcalc.result", {value: fmt(k, S.unit === "in" ? 4 : 3), unit: S.unit});
  if (out !== $("kOut").textContent) sayLater("kOut", out);   // announced once typing pauses (#166)
  $("kOut").textContent = out; $("kUse").disabled = false; return k;
}
$("kDesign").oninput = kerfCalc; $("kMeasured").oninput = kerfCalc;
$("kUse").onclick = () => { const k = kerfCalc(); if (k != null) { S.kerf = k; save(); fillInputs(); invalidateGeometry(); restart(); toast(t("toast.kerfUpdated")); } };

/* ---------- search controller ---------- */
let search = null;   // {items, bestOrder, bestScore, tried, F}
async function run(ms, fresh, quiet){   // quiet: the run at page load isn't announced (#241)
  const token = newRun();
  if (S.mode === "bbox") { search = null; layout = computeRectLayout(parts); renderLayout(); setRunning(false, quiet); return; }
  const F = binFrame();
  $("status").innerHTML = `<span class="dot on"></span>${t("status.nesting")}`;
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
        for (let k = 0; k < p.qty; k++) items.push({part:p, envArea:e.area, netArea:e.area - e.holeArea});
      }
      // the area a part takes from the plate leaves out its holes when other parts may nest in them (#165)
      const minPlates = items.length ? Math.ceil(items.reduce((s, it) => s + it.netArea, 0) / ((F.R - F.L) * (F.B - F.T)) - 1e-9) : 0;
      search = {items, oversize, minPlates, bestOrder:null, bestScore:null, tried:0, F, rnd:mulberry(7)};
      if (!items.length) { layout = {plates:[], oversize, minPlates:0}; renderLayout(); return; }
      const idx = items.map((_, i) => i);
      const keys = [it => it.envArea, it => { const s = shape(it.part, 0); return Math.max(s.maxX - s.minX, s.maxY - s.minY); }];
      for (const key of keys) {
        // the time limit covers the starting packs too: on a big job at fine steps one pack can take longer than the
        // whole search, so the second is skipped once a layout exists and the time is up (#234). run(0) packs both
        if (search.bestScore && ms && performance.now() - t0 >= ms) break;
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
    if (e !== ABORT) { console.error(e); notice(t("notice.nestError", {error: e.message || e}), true); }
    else return;
  } finally {
    if (isCurrent(token)) setRunning(false, quiet);
  }
}
function status(t0, ms, token){
  if (!isCurrent(token)) return;
  const el = Math.min(performance.now() - t0, ms);   // a pack that ends past the limit doesn't read "8.7 of 4 s" (#234)
  $("status").innerHTML = `<span class="dot on"></span>${t("status.searching", {elapsed: num(el/1000, 1, 1), total: num(ms/1000), tried: search.tried})}`;
}
let searching = false;
function setRunning(on, quiet){
  const f = document.activeElement;
  searching = on; showStale();
  $("stop").hidden = !on; $("more").setAttribute("aria-disabled", on || !search || !search.items.length);
  if (!on) $("status").innerHTML = `<span class="dot"></span>${layout && layout.stale ? t("run.stale") : search && search.tried ? t("status.best", {tried: search.tried}) : t("status.ready")}${layout && layout.plates.length && !layout.stale && search && search.bestScore && search.bestScore[0] > search.minPlates ? " " + t("status.longer") : ""}`;
  if (!on && !quiet) say(runSummary());
  if (on && f === $("more")) $("stop").focus(); else if (!on && f === $("stop")) $("more").focus();   // they hand focus to each other (#95)
}
// one sentence for screen readers when a run ends (#93)
function runSummary(){
  if (!layout) return t("status.ready");
  if (layout.stale) return t("run.stale");
  if (layout.noArea) return t("run.noArea");
  const n = layout.plates.length, placed = layout.plates.reduce((a, b) => a + b.items.length, 0);
  const want = parts.reduce((a, p) => a + p.qty, 0), fill = n ? pct(layout.plates.reduce((a, b) => a + b.area, 0) / (S.plateW * S.plateH * n)) : "";
  const out = [n ? t("run.finished", {n, fill, placed, want}) : t(want ? "run.nothingPlaced" : "run.noParts")];
  const E = n && efficiency(layout.plates);
  if (E) out.push(t("run.efficiency", {rating: E.rating, eff: pct(E.eff)}));
  if (layout.oversize.length) out.push(t("run.oversize", {n: layout.oversize.length}));
  return out.join(" ");
}
$("stop").onclick = () => { newRun(); setRunning(false); };
$("more").onclick = () => { if ($("more").getAttribute("aria-disabled") !== "true") run(30000, false); };
let tmr;
// a change to the parts or settings: the plates on screen no longer match, so they can't be downloaded until a new pack replaces them,
// and the old search can't be continued
function staleLayout(){ search = null; if (layout) { layout.stale = true; showStale(); } }
function restart(){ clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => { renderParts(); run(4000, true); }, 250); }

/* ---------- parts list ---------- */
// icons are hidden from assistive tech: the buttons they sit in are named by aria-label (#178)
const ICON_LOCK = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`;
// open shackle when unlocked: the lock's state shows in its shape, not only its color (#98)
const ICON_UNLOCK = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0"/></svg>`;
// a part's holes open to other parts (#3): an empty frame when off, a frame with a part inside when on
const ICON_HOLE = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" stroke-dasharray="2 1.5"/></svg>`;
const ICON_HOLE_ON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><rect x="6" y="6" width="4" height="4" rx=".5" fill="currentColor"/></svg>`;
const ICON_NOHOLE = ICON_HOLE.replace("</svg>", `<path d="M2.5 13.5l11-11"/></svg>`);   // stand-in on parts without holes (#141)
const ICON_X = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
function renderParts(){
  // the list is rebuilt: put focus back on the same control of the same part (#95)
  const box = $("parts"), fa = document.activeElement, fr = fa && box.contains(fa) ? fa.closest(".part") : null;
  const keep = fr ? {uid:fr.dataset.uid, sel:fa.matches("input") ? "input" : fa.matches("select") ? "select" : fa.matches(".lk") ? ".lk" : fa.matches(".hl") ? ".hl" : ".rm"} : null;
  box.innerHTML = "";
  const F = binFrame();
  for (const p of parts) {
    const row = document.createElement("div"); row.className = "part"; row.dataset.uid = p.uid;
    const ok = S.mode === "bbox" ? rectFits(p) : fitsPlate(p, F);
    row.innerHTML = `<img alt="" src="${p.thumb}"><div class="info"><div class="nm" id="nm-${p.uid}" title="${esc(p.name)}">${esc(p.name)}</div><div class="sz${ok?"":" bad"}">${t(ok ? "part.size" : "part.sizeTooBig", {w: fmt(p.wMM), h: fmt(p.hMM), unit: esc(S.unit)})}</div>${p.dxf ? `<div class="du"><span id="dl-${p.uid}">${t("part.drawnIn")}</span><select id="du-${p.uid}" aria-labelledby="dl-${p.uid} nm-${p.uid}"><option value="mm"${p.dxf.units === "mm" ? " selected" : ""}>mm</option><option value="in"${p.dxf.units === "in" ? " selected" : ""}>${t("part.inches")}</option></select></div>` : ""}</div>
      <div class="qw"><span class="ql" id="ql-${p.uid}">${t("part.qty")}</span><input type="number" id="q-${p.uid}" min="0" step="1" value="${p.qty}" aria-labelledby="ql-${p.uid} nm-${p.uid}"></div>
      <div class="acts">${S.mode === "bbox" ? "" : hasHoles(p) ? `<button type="button" class="icon hl" aria-pressed="${!!p.useHoles}" title="${t("part.holesTitle")}" aria-label="${t("part.holesLabel", {name: esc(p.name)})}">${p.useHoles ? ICON_HOLE_ON : ICON_HOLE}</button>` : `<span class="icon nohole" title="${t("part.noHoles")}" aria-hidden="true">${ICON_NOHOLE}</span>`}<button type="button" class="icon lk" aria-pressed="${p.lock}" title="${t("part.lockTitle")}" aria-label="${t("part.lockLabel", {name: esc(p.name)})}">${p.lock ? ICON_LOCK : ICON_UNLOCK}</button><button type="button" class="icon rm" title="${t("part.removeTitle")}" aria-label="${t("part.removeLabel", {name: esc(p.name)})}">${ICON_X}</button></div>`;
    const q = row.querySelector("input");
    q.oninput = () => {
      const ok = /^\s*\d+\s*$/.test(q.value);   // whole numbers only: 2.5 or -3 are refused with a message, not truncated (#97)
      fieldErr(q, ok ? "" : t("part.qtyErr", {qty: p.qty}));
      if (ok) delete p.qtyDraft; else p.qtyDraft = q.value;   // kept, with its error, when the list is rebuilt (#240)
      if (ok) { p.qty = parseInt(q.value, 10); updateCount(); clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 350); }
    };
    const du = row.querySelector(".du select");
    if (du) du.onchange = () => { const np = reunit(p, du.value); if (np) { say(t("part.readIn", {name: np.name, units: du.value, w: fmt(np.wMM), h: fmt(np.hMM), unit: S.unit})); renderParts(); $("parts").querySelector(`.part[data-uid="${np.uid}"] select`).focus(); restart(); } };
    const lk = row.querySelector(".lk"), rm = row.querySelector(".rm"), hl = row.querySelector(".hl");
    if (hl) hl.onclick = () => { p.useHoles = !p.useHoles; hl.setAttribute("aria-pressed", p.useHoles); hl.innerHTML = p.useHoles ? ICON_HOLE_ON : ICON_HOLE; clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 250); };
    lk.onclick = () => { p.lock = !p.lock; lk.setAttribute("aria-pressed", p.lock); lk.innerHTML = p.lock ? ICON_LOCK : ICON_UNLOCK; clearTimeout(tmr); newRun(); staleLayout(); tmr = setTimeout(() => run(4000, true), 250); };
    rm.onclick = () => {   // focus moves to the next part's quantity (or the previous one, or the drop zone) (#95)
      const i = parts.indexOf(p), nb = parts[i + 1] || parts[i - 1];
      removeParts(x => x === p); renderParts();
      (nb ? $("parts").querySelector(`.part[data-uid="${nb.uid}"] input`) : drop).focus(); restart();
    };
    box.appendChild(row);
    // an invalid entry the user hasn't fixed yet survives the rebuild, error included; it was announced when typed (#240)
    if (p.qtyDraft != null) { q.value = p.qtyDraft; fieldErr(q, t("part.qtyErr", {qty: p.qty}), true); }
  }
  if (!parts.length) box.innerHTML = `<p class="note" style="margin:0">${t("parts.none")}</p>`;
  $("sampleBadge").hidden = !parts.some(p => p.sample);
  updateCount();
  if (keep) { const r = box.querySelector(`.part[data-uid="${keep.uid}"]`); if (r) r.querySelector(keep.sel).focus(); }
}
function updateCount(){
  const n = parts.reduce((a, p) => a + p.qty, 0);
  $("partCount").textContent = t("parts.count", {files: parts.length, n});
}
// a DXF file that doesn't declare its units is read again in the units the user picks (#90); the part keeps its place,
// quantity and lock
function reunit(p, units){
  try {
    const np = parseSVG(dxfToSVG(p.dxf.text, p.name, {units}).svg, p.name);
    Object.assign(np, {fromDXF:true, qty:p.qty, qtyDraft:p.qtyDraft, lock:p.lock, useHoles:p.useHoles, precomp:p.precomp, dxf:{text:p.dxf.text, units}});
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
// A file says it already has kerf compensation built in only where SnugCut (once Plate Nester) writes that: the comment
// right after the <svg> tag, or the 999 comment that opens a DXF. The same words anywhere else, such as in a <desc>,
// don't count (#179).
const builtInComp = (text, dxf) => (dxf
  ? /^\uFEFF?\s*999\r?\n(?:SnugCut|Plate Nester) \S+ kerf-compensated: [\d.]+ mm per side/
  : /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>\s*<!-- (?:SnugCut|Plate Nester) [^<>]*?-->\s*<!-- kerf-compensated: [\d.]+ mm per side/).test(text);
async function addFiles(list){
  const isDXF = f => /\.dxf$/i.test(f.name);
  const files = [...list].filter(f => /\.svg$/i.test(f.name) || f.type === "image/svg+xml" || isDXF(f));
  if (!files.length) { notice(t("files.only"), true); return; }
  if (parts.some(p => p.sample)) removeParts(p => p.sample);
  const errs = [], notes = [];                                // errors: files that couldn't be added
  const stripped = [], hiddenIn = [];
  for (const f of files) { try {
    let text = await f.text();
    const pre = builtInComp(text, isDXF(f));
    let dxf = null;
    if (isDXF(f)) { const r = dxfToSVG(text, f.name); if (r.units) dxf = {text, units:r.units}; text = r.svg; notes.push(...r.notes); }
    const p = parseSVG(text, f.name); p.fromDXF = isDXF(f); p.dxf = dxf; parts.push(p); if (p.stripped) stripped.push(p.name);
    if (p.hidden) hiddenIn.push(t("files.hiddenItem", {n: p.hidden, name: p.name}));
    if (pre) { p.precomp = true; notes.push(t("files.precomp", {name: f.name})); }
  } catch(e) { errs.push(e.message); } }
  if (hiddenIn.length) notes.push(t("files.hidden", {list: hiddenIn.join(", ")}));
  if (stripped.length) notes.push(t("files.stripped", {list: stripped.join(", ")}));
  errs.forEach(e => notice(e, true)); notes.forEach(n => notice(n));
  restart();
}
$("clear").onclick = () => { removeParts(() => true); restart(); };

let plateURLs = [];
function renderLayout(){
  // the plates are rebuilt on every better layout: put focus back on the same plate's Download button (#95) or "Parts on
  // this plate" summary, and reopen the part lists that were open (#156)
  const box = $("plates"), fa = document.activeElement, fi = fa === $("dlAll") ? -1 : fa && box.contains(fa) && fa.dataset.i != null ? +fa.dataset.i : null;
  const open = [...box.querySelectorAll(".plist")].map(d => d.open), sums = [...box.querySelectorAll(".plist summary")], si = sums.indexOf(fa);
  try { drawLayout(); } finally {
    box.querySelectorAll(".plist").forEach((d, i) => { if (open[i]) d.open = true; });
    if (fi != null) refocusPlate(fi);
    else if (si >= 0) { const s = box.querySelectorAll(".plist summary"); (s[Math.min(si, s.length - 1)] || drop).focus(); }
  }
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
  $("sFill").textContent = L.plates.length ? pct(L.plates.reduce((a, b) => a + b.area, 0) / (plateA * L.plates.length)) : "–";
  $("sParts").textContent = placed;
  // efficiency rating (#138): "6/10" read as "6 out of 10", with the percentage under it
  const E = efficiency(L.plates), cut = E && Math.min(E.offcut.w, E.offcut.h) >= 10 ? E.offcut : null;
  $("sEff").innerHTML = E ? `<span aria-hidden="true">${E.rating}/10</span><span class="sr-only">${t("stat.eff", {rating: E.rating})}</span>` : "–";
  $("sEffK").textContent = E ? t("stat.effLabel", {eff: pct(E.eff)}) : t("stat.effNone");
  const msg = text => { const m = document.createElement("div"); m.className = "msg"; m.textContent = text; msgs.appendChild(m); };
  const bbox = S.mode === "bbox", canRot = bbox ? S.rotate : !!S.rotStep;
  for (const p of L.oversize) msg(t(!p.lock && canRot ? (bbox ? "layout.oversizeBbox" : "layout.oversizeRot") : "layout.oversize", {name: p.name, w: fmt(p.wMM), h: fmt(p.hMM), unit: S.unit}));
  if (L.noArea) msg(t("run.noArea"));
  // when nothing was placed, say why only if no message above already does (#84)
  if (!L.plates.length && !L.noArea && !L.oversize.length) box.innerHTML = `<p class="note">${t(!parts.length ? "layout.addFiles" : !parts.some(p => p.qty) ? "layout.setQty" : "layout.nonePlaced")}</p>`;
  L.plates.forEach((pl, i) => {
    const url = URL.createObjectURL(new Blob([plateSVG(pl, {preview:true})], {type:"image/svg+xml"})); plateURLs.push(url);
    const ratio = pl.area / plateA, fill = pct(ratio);
    const env = pl.items.map(it => it.env.map(q => `<polygon points="${q.map(([x, y]) => `${n4(x)},${n4(y)}`).join(" ")}" fill="none" stroke="var(--guide)" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"><title>${it.ang ? t("plate.rotated", {name: esc(it.part.name), ang: it.ang}) : esc(it.part.name)}</title></polygon>`).join("")).join("");
    const mg = S.margin > 0 ? `<rect x="${n4(S.margin)}" y="${n4(S.margin)}" width="${n4(S.plateW-2*S.margin)}" height="${n4(S.plateH-2*S.margin)}" fill="none" stroke="var(--guide-margin)" stroke-width="1" stroke-dasharray="1 3" vector-effect="non-scaling-stroke"/>` : "";
    // text alternative (#96): the image says what's on the plate, and is described by the list of the parts on it. The
    // description is a hidden copy of the list: the list itself is in a <details> that is usually closed, and a closed
    // one gave the image no description (#168).
    const alt = t("plate.alt", {i: i+1, n: L.plates.length, parts: pl.items.length, fill});
    const groups = new Map();
    for (const it of pl.items) {
      const g = groups.get(it.part) || {n:0, rot:new Map()}, a = ((Math.round(it.ang) % 360) + 360) % 360;
      g.n++; if (a) g.rot.set(a, (g.rot.get(a) || 0) + 1); groups.set(it.part, g);
    }
    const lines = [...groups].map(([p, g]) => g.rot.size
      ? t("plate.lineRot", {name: esc(p.name), n: g.n, rots: [...g.rot].sort((a, b) => a[0] - b[0]).map(([a, n]) => t("plate.rot", {n, ang: a})).join(", ")})
      : t("plate.line", {name: esc(p.name), n: g.n}));
    const list = lines.map(l => `<li>${l}</li>`).join("");
    const card = document.createElement("article"); card.className = "plate"; card.setAttribute("aria-labelledby", `plate-${i}-h`);   // named by its heading (#102)
    card.innerHTML = `<div class="hd"><div><h3 class="t" id="plate-${i}-h">${t("plate.title", {i: i+1, n: L.plates.length})}</h3><div class="m">${t(cut && i === L.plates.length - 1 ? "plate.metaOffcut" : "plate.meta", {parts: pl.items.length, fill, w: fmt(S.plateW), h: fmt(S.plateH), unit: esc(S.unit), cw: cut && fmt(cut.w), ch: cut && fmt(cut.h)})}</div></div><button type="button" data-i="${i}" class="btn small" aria-label="${t("plate.downloadLabel", {format: ext().toUpperCase(), i: i+1, n: L.plates.length})}">${t("plate.download", {format: ext().toUpperCase()})}</button></div>
      <div class="sheet" style="aspect-ratio:${S.plateW}/${S.plateH}"><img alt="${alt}" aria-describedby="pdesc-${i}" src="${url}"><span id="pdesc-${i}" hidden>${lines.join("; ")}</span><svg viewBox="0 0 ${n4(S.plateW)} ${n4(S.plateH)}" preserveAspectRatio="none" aria-hidden="true">${mg}${env}</svg></div>
      <div class="bar" aria-hidden="true"><i style="width:${Math.round(100 * ratio)}%"></i></div>
      <details class="plist"><summary>${t("plate.list")}</summary><ul id="plist-${i}">${list}</ul></details>`;
    card.querySelector("button").onclick = () => exportPlate(i);
    box.appendChild(card);
  });
  $("dlAll").hidden = !(L.plates.length > 1 && window.JSZip); prefixEx(); showStale();
}
// while a search runs it can replace the layout at any moment, so single plates of a multi-plate job can't be downloaded
// (two files could come from different layouts); Download all takes one layout at once (#153)
const plateBusy = () => searching && !!layout && layout.plates.length > 1;
function showStale(){
  const st = !!(layout && layout.stale), busy = !st && plateBusy();
  $("plates").classList.toggle("stale", st);
  $("plates").querySelectorAll(".plate .hd button").forEach(b => { b.setAttribute("aria-disabled", st || busy);
    b.title = st ? t("plate.staleTitle") : busy ? t("plate.busyTitle") : ""; });
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
  if (kerfC()) notes.add(t("export.compNote", {value: fmt(S.kerf / 2, S.unit === "in" ? 4 : 3), unit: S.unit}));
  if (ext() === "svg") return plateSVG(pl, {notes});
  const r = plateDXF(pl); r.notes.forEach(n => notes.add(n)); return r.dxf;
}
function exportPlate(i){
  if (!layout || layout.stale || plateBusy()) return;
  const notes = new Set();
  download(plateFile(layout.plates[i], notes), fname(i), ext() === "dxf" ? "application/dxf" : "image/svg+xml");
  toast(t("toast.saved", {file: fname(i)})); notes.forEach(n => notice(n));
}
$("dlAll").onclick = async () => {
  if (!layout || layout.stale || !window.JSZip) return;
  const zip = new JSZip();
  const notes = new Set();
  layout.plates.forEach((pl, i) => zip.file(fname(i), plateFile(pl, notes)));
  download(await zip.generateAsync({type:"blob"}), zipName());
  toast(t("toast.saved", {file: zipName()})); notes.forEach(n => notice(n));
};

// short confirmations only ("Saved …", "Kerf updated"): on screen for at least 20 s, longer for long text, kept while
// the pointer is over it, and Esc closes it (#94). Warnings and errors go to notice() and stay until dismissed.
let toastT;
function toast(text){
  const el = $("toast"); el.textContent = text; el.hidden = false; say(text); clearTimeout(toastT);
  const wait = ms => { toastT = setTimeout(() => el.matches(":hover") ? wait(1000) : (el.hidden = true), ms); };
  wait(Math.max(20000, text.length * 100));
}
addEventListener("keydown", e => { if (e.key === "Escape" && !$("toast").hidden) { clearTimeout(toastT); $("toast").hidden = true; } });
// warnings and errors: one item each in the message list, until dismissed (#94); announced once (#93)
function notice(text, err){
  const box = $("notices");
  if ([...box.children].some(m => m.dataset.text === text)) { say(text, err); return; }   // already on screen
  const m = document.createElement("div"); m.className = "msg has-x" + (err ? " err" : ""); m.dataset.text = text;
  const s = document.createElement("span"); s.textContent = text;
  const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.innerHTML = ICON_X; x.title = t("notice.dismiss");
  x.setAttribute("aria-label", t("notice.dismissLabel", {text: text.length > 60 ? text.slice(0, 57) + "…" : text}));
  x.onclick = () => { const nb = m.nextElementSibling || m.previousElementSibling; m.remove(); (nb ? nb.querySelector(".x") : drop).focus(); };
  m.append(s, x); box.appendChild(m); say(text, err);
}
// screen-reader announcements (#93): the live regions stay in the page, and each message is added as a new node so a
// repeated message is announced again; urgent ones (errors) go to the role="alert" region
function say(text, urgent){ const p = document.createElement("p"); p.textContent = text; $(urgent ? "sayAlert" : "sayPolite").appendChild(p); setTimeout(() => p.remove(), 20000); }

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
for (const [n, q, svg] of SAMPLES) { try { const p = parseSVG(svg, n); p.qty = q; p.sample = true; parts.push(p); } catch(e) { console.error(e); } }
renderParts();
run(4000, true, true);   // the sample parts: shown, not announced, since the user hasn't done anything yet (#241)
})();
