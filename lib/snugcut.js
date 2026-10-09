// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Guy Heckman. Licensed under the GNU Affero General Public License v3.0 or later (see LICENSE).
// SnugCut library: SVG/DXF import, outlines, nesting, kerf compensation and SVG/DXF export. No UI.
// Plain browser ES module; needs the DOM (SVG measuring) and window.ClipperLib (clipper-lib, loaded by the page).
// snugcut.html is generated from this file and app/ by tools/build.py: edit these, not snugcut.html.
export const SVGNS = "http://www.w3.org/2000/svg";
export const IN = 25.4, SC = 1000;               // clipper integer units per mm
const KEEP_ATTRS = ["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-dasharray","fill-rule","clip-rule","opacity","style","class","font-family","font-size","color"];
export const esc = s => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
export const n4 = v => +v.toFixed(4);
const sig = v => { const r = +v.toPrecision(7); return Object.is(r, -0) ? "0" : String(r); };   // significant digits
export const CL = window.ClipperLib;
let appVersion = "";                    // written into exported files
export const setVersion = v => { appVersion = v; };

/* ---------- messages (#128) ---------- */
// Every message the library shows a person has a code and values (README "Library messages"). setMessages(fn) lets the
// caller word them: fn(code, vars, english) returns the text, or anything but a string for the English below.
// Errors carry the worded text as .message, plus .code and .vars.
const s_ = (n, one, many) => n === 1 ? one : many;
const HIDDEN_LAYERS = "frozen, off, non-plotting or Defpoints layers";
export const MESSAGES = {
  "dxf.binary": v => `${v.name} is a binary DXF. Save it as an ASCII DXF and try again.`,
  "dxf.unreadable": v => `${v.name} isn't a readable DXF file.`,
  "dxf.noUnits": v => `${v.name} doesn't say what units it's drawn in, so it was read as ${v.units === "in"
    ? "inches, as its imperial measurement setting suggests" : "millimeters"}. If that's wrong, change it next to the part in the parts list.`,
  "dxf.tooManyItems": v => `${v.name} expands to more than ${v.limit.toLocaleString("en-US")} items (blocks and arrays), so it wasn't added.`,
  "dxf.tooManyPoints": v => `${v.name} draws more than ${v.limit.toLocaleString("en-US")} points (blocks and arrays repeat them), so it wasn't added.`,
  "dxf.splineDegree": v => `${v.name} has a spline of degree ${v.degree}, but only degrees 1 to 11 can be read, so it wasn't added.`,
  "dxf.hiddenLeftOut": v => `${v.name}: left out ${v.count} item${s_(v.count, "", "s")} on ${HIDDEN_LAYERS}.`,
  "dxf.skipped": v => `${v.name}: skipped ${v.skipped.map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ")} (only lines, arcs, circles, ellipses, polylines and splines are cut).`,
  "dxf.nothingToCut": v => `${v.name} has no lines, arcs, circles, ellipses, polylines or splines to cut on visible layers in model space`
    + (v.hidden ? `; ${v.hidden} item${s_(v.hidden, " is", "s are")} on ${HIDDEN_LAYERS}.` : "."),   // #85
  "svg.unreadable": v => `${v.name} isn't a readable SVG file.`,
  "svg.tooManyPoints": v => `${v.name} has more than ${v.limit.toLocaleString("en-US")} points along its curves, so it wasn't added.`,
  "svg.tooManyCopies": v => `${v.name} repeats shapes through linked copies (<use>) more than ${v.limit.toLocaleString("en-US")} times, so it wasn't added.`,
  "svg.nothingVisible": v => `${v.name} has no visible shapes to place.`,
  "svg.nothingToCut": v => `${v.name} has no cuttable shapes.`,
  "svg.noClosedOutline": v => `${v.name} has no closed outline to nest.`,
  "kerf.holeTooNarrow": v => `A hole in ${v.name} is narrower than the kerf, so it was left as drawn.`,
  "kerf.markup": v => `${v.name} has text, images, linked copies or effects, so its kerf can't be compensated; it is exported as drawn.`,
  "dxfOut.nothing": v => `${v.name} has nothing that can be written to DXF.`,
  "dxfOut.clipping": v => `Not in the DXF: clipping, masks and filters (shapes exported whole) in ${v.name}.`,
  "dxfOut.text": v => `Not in the DXF: text in ${v.name}.`,
  "dxfOut.images": v => `Not in the DXF: images in ${v.name}.`,
  "dxfOut.use": v => `Not in the DXF: linked copies (<use>) in ${v.name}.`,
  "dxfOut.element": v => `Not in the DXF: <${v.tag}> elements in ${v.name}.`,
  "dxfOut.paint": v => `Not in the DXF: gradient and pattern colors (exported black) in ${v.name}.`,
  "dxfOut.markers": v => `Not in the DXF: markers (arrowheads and the like) in ${v.name}.`,
  "dxfOut.unreadable": v => `Not in the DXF: unreadable paths in ${v.name}.`,
  "dxfOut.fills": () => "Filled areas are written as their outlines.",
};
let wording = null;
export const setMessages = fn => { wording = typeof fn === "function" ? fn : null; };
export function msg(code, vars = {}){
  const en = MESSAGES[code](vars);
  if (!wording) return en;
  try { const t = wording(code, vars, en); return typeof t === "string" ? t : en; } catch(e) { return en; }
}
const fail = (code, vars) => Object.assign(new Error(msg(code, vars)), {code, vars});

/* ---------- settings (lengths in mm) ---------- */
const DEFAULTS = {mode:"shape", unit:"mm", plateW:300, plateH:300, kerf:0.1, gap:1, margin:3, rotStep:90, prec:0.25, rotate:true, outline:false, dpi:96, prefix:"", format:"svg", comp:false, pool:1};
export const S = {...DEFAULTS};
let uid = 0, geoVer = 0;
export const invalidateGeometry = () => { geoVer++; };   // settings that change outlines, envelopes or no-fit polygons

/* ---------- SVG parsing & outline extraction ---------- */
let host;
function lenToMM(str, dpi){
  if (!str) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(str);
  if (!m) return null;
  const v = parseFloat(m[1]), u = (m[2] || "px").toLowerCase();
  return {mm:v, cm:v*10, in:v*IN, pt:v*IN/72, pc:v*IN/6, px:v*IN/dpi}[u];
}
export function measureScale(p){
  measureScaleOnly(p);
  p.wMM = p.bbox.width * p.kx; p.hMM = p.bbox.height * p.ky;
  buildOutline(p);
}
const SHAPES = "path,rect,circle,ellipse,polygon,polyline,line,text,use,image";
const XLINK = "http://www.w3.org/1999/xlink";
const useRef = el => (el.getAttribute("href") || el.getAttributeNS(XLINK, "href") || "").replace(/^#/, "");
// SVG lengths and points read through the DOM are single precision, half a unit apart at 5e6. Far from the origin,
// take a plain number as written in the attribute when it agrees with the DOM's value; closer in, keep the DOM's (#214).
const FAR = 1e4;
const exact = (f, a) => { if (!(Math.abs(f) > FAR) || a == null) return f; const t = a.trim(), n = Number(t);
  return t && isFinite(n) && Math.abs(n - f) <= Math.abs(f) * 1e-6 ? n : f; };
const len = (el, k) => exact(el[k].baseVal.value, el.getAttribute(k));
const pointsOf = el => { const ps = [...el.points], t = (el.getAttribute("points") || "").trim().split(/[\s,]+/);
  return ps.map((q, i) => [exact(q.x, t[2*i]), exact(q.y, t[2*i + 1])]); };
const boxOf = el => { const b = el.getBBox(); if (el.localName !== "rect") return b;
  const at = k => el.getAttribute(k);
  return {x:exact(b.x, at("x")), y:exact(b.y, at("y")), width:exact(b.width, at("width")), height:exact(b.height, at("height"))}; };
const noIds = n => { n.removeAttribute("id"); n.querySelectorAll("[id]").forEach(c => c.removeAttribute("id")); return n; };
function extractRings(g){
  // sample every drawable element into polylines, in the part's own user units.
  // A <use> of shapes in this file is measured as those shapes where the copy puts them (#15); copies inside a copy count
  // as their box. The copies are set out all at once in a duplicate of the part with no ids: nothing refers into it, so
  // one layout serves the whole measurement. Setting them out one by one in the part itself made the browser rebuild
  // every <use> of the changed shapes each time, which took seconds for a 1 KB file (#158).
  const G = noIds(g.cloneNode(true)), orig = [...g.querySelectorAll(SHAPES)], copy = [...G.querySelectorAll(SHAPES)], wraps = new Map();
  orig.forEach((el, i) => {
    if (el.localName !== "use" || el.closest("defs,clipPath,mask,symbol,pattern,marker") || isHidden(el, g)) return;
    const id = useRef(el), ref = id && g.querySelector(`[id="${CSS.escape(id)}"]`);   // in the part: it is measured in a shadow root (#261)
    if (ref && g.contains(ref) && !ref.contains(el) && ref.localName !== "symbol" && ref.localName !== "svg") {
      const w = document.createElementNS(SVGNS, "g");
      w.setAttribute("transform", `${el.getAttribute("transform") || ""} translate(${len(el, "x")} ${len(el, "y")})`);
      w.appendChild(noIds(ref.cloneNode(true)));
      wraps.set(copy[i], w);
    }
  });
  g.after(G);
  for (const [el, w] of wraps) el.after(w);
  const rings = [];
  try { sampleRings(copy, G, wraps, rings); } finally { G.remove(); }
  return rings;
}
// the points a part's outline may be sampled into: curves looping in place made 1.2 million points out of a 42 KB file,
// and a 1 MB one would make 30 million (#271). The same limit as a DXF's.
const SAMPLE_LIMIT = 2000000;
let sampleLeft = 0, sampleName = "";
const spend = n => { if ((sampleLeft -= n) < 0) throw fail("svg.tooManyPoints", {name:sampleName, limit:SAMPLE_LIMIT}); };
function markerRings(el, T, rings){
  // the room markers (arrowheads, dots) take, which the browser leaves out of every box it measures (#281): a marker
  // draws inside its viewport, markerWidth × markerHeight (in stroke widths unless markerUnits="userSpaceOnUse") with
  // its reference point on the vertex, so it stays within that viewport's diagonal of the vertex whatever its angle
  if (!["path", "line", "polyline", "polygon"].includes(el.localName)) return;
  const cs = getComputedStyle(el), on = [cs.markerStart, cs.markerMid, cs.markerEnd].map(v => v && v !== "none" ? v : null);
  if (!on.some(Boolean)) return;
  const vs = [];
  if (el.localName === "line") { const v = k => len(el, k); vs.push([v("x1"), v("y1")], [v("x2"), v("y2")]); }
  else if (el.localName === "path") {
    let sx = 0, sy = 0; try { for (const sg of parsePathD(el.getAttribute("d") || "")) {
      if (sg[0] === "M") { sx = sg[1]; sy = sg[2]; vs.push([sx, sy]); } else if (sg[0] === "Z") vs.push([sx, sy]); else vs.push(sg.slice(-2)); } } catch(e) {}
  } else { vs.push(...pointsOf(el)); if (el.localName === "polygon" && vs.length) vs.push(vs[0]); }
  const sw = parseFloat(cs.strokeWidth) || 1, root = el.getRootNode();
  vs.forEach((v, i) => {
    const ref = on[i === 0 ? 0 : i === vs.length - 1 ? 2 : 1], id = ref && /url\(\s*["']?#([^"')]+)/.exec(ref);
    const mk = id && root.getElementById && root.getElementById(id[1]);
    if (!mk || mk.localName !== "marker") return;
    const r = Math.hypot(mk.markerWidth.baseVal.value, mk.markerHeight.baseVal.value) * (mk.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : sw);
    if (!(r > 0)) return;
    const R = r / Math.cos(Math.PI / 8), pts = [];
    for (let k = 0; k < 8; k++) pts.push(T(v[0] + R * Math.cos(k * Math.PI / 4 + Math.PI / 8), v[1] + R * Math.sin(k * Math.PI / 4 + Math.PI / 8)));
    rings.push({closed:true, pts, marker:true});
  });
}
function sampleRings(list, root, wraps, rings){
  const hostInv = host.getScreenCTM().inverse();
  for (const el of list) {
    if (el.closest("defs,clipPath,mask,symbol,pattern,marker")) continue;
    if (isHidden(el, root)) continue;                    // hidden shapes are neither measured nor exported
    const scr = el.getScreenCTM(); if (!scr) continue;
    const m = hostInv.multiply(scr);
    const T = (x, y) => [m.a*x + m.c*y + m.e, m.b*x + m.d*y + m.f];
    const tag = el.localName, w = wraps && wraps.get(el);
    if (w) { sampleRings([...w.querySelectorAll(SHAPES)], w, null, rings); continue; }
    markerRings(el, T, rings);
    let rr = null;                                       // a rounded rect is sampled along its corners (#15)
    if (tag === "rect") { const cs = getComputedStyle(el), b = boxOf(el);
      let rx = parseFloat(cs.rx), ry = parseFloat(cs.ry); if (isNaN(rx)) rx = isNaN(ry) ? 0 : ry; if (isNaN(ry)) ry = rx;
      rx = Math.min(Math.max(rx, 0), b.width / 2); ry = Math.min(Math.max(ry, 0), b.height / 2);
      if (rx > 0 && ry > 0) rr = {b, rx, ry}; }
    if (!rr && (tag === "rect" || tag === "text" || tag === "use" || tag === "image")) {
      const b = boxOf(el); if (!b.width && !b.height) continue;
      rings.push({closed:true, pts:[T(b.x,b.y), T(b.x+b.width,b.y), T(b.x+b.width,b.y+b.height), T(b.x,b.y+b.height)]});
    } else if (tag === "polygon" || tag === "polyline") {
      const pts = pointsOf(el).map(([x, y]) => T(x, y)); spend(pts.length);
      if (pts.length > 1) rings.push({closed: tag === "polygon", pts});
    } else if (tag === "line") {
      const v = k => len(el, k);                         // resolves units and percentages, as extractFlat does (#163)
      rings.push({closed:false, pts:[T(v("x1"), v("y1")), T(v("x2"), v("y2"))]});
    } else {
      const scale = Math.sqrt(Math.abs(m.a*m.d - m.b*m.c)) || 1;
      // path, circle, ellipse: points straight from the path data, lines at their ends and curves every ~0.1 mm.
      // Much faster than getPointAtLength, which walks the whole path on every call (long CAD/DXF paths took minutes).
      let segs = null;
      try {
        const v = k => len(el, k);
        if (tag === "path") segs = parsePathD(el.getAttribute("d") || "");
        else if (rr) { const {b:{x, y, width:w, height:h}, rx, ry} = rr;
          segs = parsePathD(`M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`); }
        else { const cx = v("cx"), cy = v("cy"), rx = tag === "circle" ? v("r") : v("rx"), ry = tag === "circle" ? v("r") : v("ry");
          segs = rx > 0 && ry > 0 ? parsePathD(`M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`) : []; }
      } catch(e) { segs = null; }
      if (segs) {
        const tol = extractStepU * 2.5;
        let cur = null, x = 0, y = 0, sx = 0, sy = 0;
        const end = z => { if (cur && cur.length > 1) { const a = cur[0], b = cur[cur.length - 1];
          rings.push({closed: z || tag !== "path" || Math.hypot(a[0]-b[0], a[1]-b[1]) < tol, pts:cur}); } cur = null; };
        for (const sg of segs) {
          if (sg[0] === "M") { end(false); x = sx = sg[1]; y = sy = sg[2]; cur = [T(x, y)]; continue; }
          if (sg[0] === "Z") { end(true); x = sx; y = sy; continue; }
          if (!cur) cur = [T(x, y)];
          if (sg[0] === "L") { x = sg[1]; y = sg[2]; cur.push(T(x, y)); spend(1); continue; }
          const [, x1, y1, x2, y2, x3, y3] = sg;                                // cubic
          const len = (Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)) * scale;
          const n = Math.min(400, Math.max(2, Math.ceil(len / extractStepU)));
          spend(n);
          for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t;
            cur.push(T(u*u*u*x + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3, u*u*u*y + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3)); }
          x = x3; y = y3;
        }
        end(false);
        continue;
      }
      let L = 0; try { L = el.getTotalLength(); } catch(e) {}                // unreadable path data: let the browser sample it
      if (!(L > 0)) continue;
      const n = Math.min(6000, Math.max(24, Math.ceil(L * scale / extractStepU)));
      spend(n);
      const step = L / n;
      let cur = [], prev = null;
      for (let i = 0; i <= n; i++) {
        const q = el.getPointAtLength(Math.min(L, i * step));
        if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) > step * 2.5) { if (cur.length > 1) rings.push({closed:true, pts:cur}); cur = []; }
        cur.push(T(q.x, q.y)); prev = q;
      }
      if (cur.length > 1) {
        const a = cur[0], b = cur[cur.length - 1];
        const closed = tag !== "path" || Math.hypot(a[0]-b[0], a[1]-b[1]) < step * 2.5 || /z\s*$/i.test(el.getAttribute("d") || "");
        rings.push({closed, pts:cur});
      }
    }
  }
}
let extractStepU = 1;
function isHidden(el, root){
  for (let a = el; a && a !== root; a = a.parentElement) if (getComputedStyle(a).display === "none") return true;
  return false;
}
/* ---------- external references ----------
   The file's nodes are put into this page to be measured, so anything that points off the file (images, <use> of
   other files, @import, url() fonts and paints) would be fetched by the browser. Only #fragment and data: survive. */
// comments removed in one pass; an unterminated one is left in place, so a url() after it is still seen. A regex here
// rescanned the rest of the text from every "/*" (#162).
const stripComments = s => { let out = "", i = 0;
  for (;;) { const a = s.indexOf("/*", i), b = a < 0 ? -1 : s.indexOf("*/", a + 2); if (b < 0) return out + s.slice(i); out += s.slice(i, a); i = b + 2; } };
const decodeCSS = s => stripComments(s)
  .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (m, h) => { const c = parseInt(h, 16); return String.fromCodePoint(c > 0 && c <= 0x10FFFF ? c : 0xFFFD); })
  .replace(/\\([^\n])/g, "$1");
// data: URLs are kept only for raster images and fonts. Anything else (an embedded SVG or HTML) can carry its own outside
// links and active content into the exported file, where other software may render it without the browser's limits (#78).
const safeData = v => /^data:\s*(?:image\/(?:png|jpe?g|gif|webp|avif|bmp)|font\/|application\/(?:x-)?font)/i.test(v);
function cssExternal(v){
  v = decodeCSS(v).toLowerCase();
  if (v.includes("@import")) return true;
  for (const m of v.matchAll(/(?:url|src)\(\s*(['"]?)\s*([^'")\s]*)/g)) if (!(m[2][0] === "#" || safeData(m[2]))) return true;
  if (/(?:image-set|image|cross-fade)\(/.test(v)) {
    for (const m of v.matchAll(/(['"])\s*([^'"]*)\1/g)) if (!(m[2][0] === "#" || safeData(m[2]))) return true;
    // a URL kept as a string in a custom property and used as image-set(var(--u)): its value is only known after var()
    // is substituted, so any var() in these functions counts as outside (#238)
    if (v.includes("var(")) return true;
  }
  // a custom property holding a string can carry a URL into any of those functions, in this rule or another (#238)
  // (checked one declaration at a time: one pattern over the whole text backtracked quadratically, #272)
  const parts = v.split(/([;{}])/);
  for (let i = 0; i < parts.length; i += 2) {
    const m = (i && parts[i - 1] === "}" ? /\s--[^\s:]*\s*:/ : /(?:^|\s)--[^\s:]*\s*:/).exec(parts[i]);
    if (m && /['"]/.test(parts[i].slice(m.index + m[0].length))) return true;
  }
  return false;
}
function splitDecls(t){
  // split a declaration block on ";" outside quotes and parentheses (keeps shorthands such as mask: whole)
  const out = []; let depth = 0, q = "", cur = "";
  for (const ch of t) {
    if (q) { if (ch === q) q = ""; } else if (ch === '"' || ch === "'") q = ch; else if (ch === "(") depth++; else if (ch === ")") depth--;
    else if (ch === ";" && !depth) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function cleanSheet(text){
  // returns sanitized CSS text, or null when nothing needed removing (the original text is kept byte for byte)
  if (!cssExternal(text)) return null;
  const sheet = new CSSStyleSheet();
  try { sheet.replaceSync(decodeCSS(text)); } catch(e) { return ""; }   // @import is dropped by replaceSync
  const walk = rules => { for (const r of [...rules]) {
    if (r.style && cssExternal(r.style.cssText)) r.style.cssText = splitDecls(r.style.cssText).filter(d => !cssExternal(d)).join("; ");
    if (r.cssRules) walk(r.cssRules);
  } };
  walk(sheet.cssRules);
  return [...sheet.cssRules].map(r => r.cssText).filter(t => !cssExternal(t)).join("\n");
}
const ANIM = new Set(["animate", "animateMotion", "animateTransform", "set", "discard"]);
// SVG elements, in their exact case, that may stay in a part (no script, foreignObject or font: those, any other
// unprefixed name and any case variant would become live HTML if other software parsed the exported plate as HTML, #161)
const SVG_ELEMENTS = new Set(("a altGlyph altGlyphDef altGlyphItem circle clipPath color-profile cursor defs desc ellipse feBlend feColorMatrix "
  + "feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA "
  + "feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting "
  + "feSpotLight feTile feTurbulence filter font-face font-face-format font-face-name font-face-src font-face-uri g glyph glyphRef "
  + "hatch hatchpath hkern image line linearGradient marker mask mesh meshgradient meshpatch meshrow metadata missing-glyph mpath "
  + "path pattern polygon polyline radialGradient rect solidcolor stop style svg switch symbol text textPath title tref tspan use "
  + "view vkern").split(" "));
function stripExternal(root){
  let n = 0;
  for (const el of [...root.querySelectorAll("*")]) {
    if (!root.contains(el)) continue;                   // already removed with its parent
    // HTML/MathML elements (img, link, iframe, …) fetch even when not rendered; SMIL can set href/fill to a URL.
    // Unprefixed elements must be known SVG elements; prefixed ones (inkscape:, sodipodi:, rdf:, …) stay, as an HTML
    // parser reads those as unknown, inert tags.
    if (el.namespaceURI === "http://www.w3.org/1999/xhtml" || el.namespaceURI === "http://www.w3.org/1998/Math/MathML" || (el.namespaceURI === SVGNS && ANIM.has(el.localName))
      || (!el.prefix && !(el.namespaceURI === SVGNS && SVG_ELEMENTS.has(el.localName)))) { el.remove(); n++; continue; }
    // an HTML parser reads what's inside <desc> and <title> as HTML, so only their text stays
    if (el.namespaceURI === SVGNS && (el.localName === "desc" || el.localName === "title")) for (const c of [...el.children]) { c.remove(); n++; }
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const a of [...el.attributes]) {
      const v = a.value.trim(), ln = a.localName.toLowerCase();      // HTML parsers lowercase attribute names (HREF → href)
      if (ln === "href" || ln === "src" || ln === "srcset" || ln === "srcdoc") {
        if (v[0] === "#" || (safeData(v) && (el.localName === "image" || el.localName === "feImage"))) continue;
        el.removeAttributeNS(a.namespaceURI, a.localName); n++;
      } else if (a.localName === "base" && a.namespaceURI === "http://www.w3.org/XML/1998/namespace") {
        el.removeAttributeNS(a.namespaceURI, a.localName);
      } else if (a.localName === "style" && !a.namespaceURI) {
        if (!cssExternal(a.value)) continue;
        const keep = splitDecls(decodeCSS(a.value)).filter(d => !cssExternal(d)).join("; ");
        if (keep) el.setAttribute("style", keep); else el.removeAttribute("style");
        n++;
      } else if (cssExternal(a.value)) { el.removeAttributeNS(a.namespaceURI, a.localName); n++; }
    }
    if (el.localName === "style") { const c = cleanSheet(el.textContent); if (c !== null) { el.textContent = c; n++; } }
  }
  return n;
}
function renameSelectors(css, f){
  // rewrite #id and .class names, and the :root pseudo-class, in selectors only (the text before each "{" that isn't an
  // at-rule); declarations, strings, comments, attribute selectors and XML entities (&gt; in serialized markup) are
  // left as they are. f(kind, name) returns the new name, or null to keep it; kind is "#", "." or ":".
  const sel = s => s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?\*\/|\[[^\]]*\]|&(?:[a-z]+|#\d+|#x[0-9a-f]+);)|([#.])(-?[A-Za-z_][\w-]*)|(:)(root)(?![\w-])/gi,
    (m, keep, k, name, k2, name2) => { if (keep) return keep; if (k2) { k = k2; name = name2; } const r = f(k, name); return r == null ? m : k + r; });
  let out = "", seg = "", q = "", depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (q) { seg += ch; if (ch === "\\") seg += css[++i] ?? ""; else if (ch === q) q = ""; continue; }
    if (ch === "/" && css[i+1] === "*") { const j = css.indexOf("*/", i + 2), e = j < 0 ? css.length : j + 2; seg += css.slice(i, e); i = e - 1; continue; }
    if (ch === "&") { const m = /^&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.exec(css.slice(i, i + 12)); if (m) { seg += m[0]; i += m[0].length - 1; continue; } }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(depth - 1, 0);
    else if (!depth && ch === "{") { out += (/^\s*@/.test(seg) ? seg : sel(seg)) + ch; seg = ""; continue; }
    else if (!depth && (ch === "}" || ch === ";")) { out += seg + ch; seg = ""; continue; }
    seg += ch;
  }
  return out + seg;
}
/* ---------- DXF import ----------
   An ASCII DXF is turned into an SVG part (mm, Y down, plain paths with one stroke color per DXF color), which then
   goes through parseSVG like any other file. Model space only; frozen, off and non-plotting layers are skipped. */
const DXF_MM = {1:25.4, 2:304.8, 3:1609344, 4:1, 5:10, 6:1000, 7:1e6, 8:2.54e-5, 9:0.0254, 10:914.4, 11:1e-7, 12:1e-6, 13:1e-3, 14:100, 15:1e4, 16:1e5,
  21:304.8006096, 22:25.4000508, 23:914.4018288, 24:1609347.218694};
function aciColor(i){
  // AutoCAD Color Index → RGB. 7 (white on a black CAD screen) is black here, as on a sheet.
  if (!(i >= 1 && i <= 255) || i === 7) return "#000000";
  if (i < 10) return ["", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "", "#808080", "#c0c0c0"][i];
  if (i >= 250) return ["#333333", "#505050", "#696969", "#828282", "#bebebe", "#ffffff"][i - 250];
  const h = Math.floor((i - 10) / 10) * 15, k = (i - 10) % 10, v = [255, 204, 153, 127, 76][k >> 1], s = k & 1 ? 0.5 : 1;
  const f = n => { const q = (n + h / 60) % 6; return Math.floor(v * (1 - s * Math.max(0, Math.min(q, 4 - q, 1)))); };
  return "#" + [f(5), f(3), f(1)].map(c => c.toString(16).padStart(2, "0")).join("");
}
export function dxfToSVG(text, name, opts = {}){
  if (/^AutoCAD Binary DXF/.test(text)) throw fail("dxf.binary", {name});
  const lines = text.split(/\r\n|\r|\n/), recs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i], 10), v = lines[i + 1].trim();
    if (isNaN(c)) { if (!lines[i].trim() && i >= lines.length - 2) break; throw fail("dxf.unreadable", {name}); }
    if (c === 0) recs.push({type:v.toUpperCase(), g:[]}); else if (recs.length) recs[recs.length - 1].g.push([c, v]);
  }
  if (!recs.some(r => r.type === "SECTION")) throw fail("dxf.unreadable", {name});
  const str = (r, c, d) => { const p = r.g.find(q => q[0] === c); return p ? p[1] : d; };
  const trueColor = r => str(r, 420) != null ? "#" + (+str(r, 420) & 0xffffff).toString(16).padStart(6, "0") : null;   // group 420
  const num = (r, c, d = 0) => { const v = parseFloat(str(r, c)); return isFinite(v) ? v : d; };
  const nums = (r, c) => r.g.filter(q => q[0] === c).map(q => parseFloat(q[1]) || 0);
  const header = {}, layers = new Map(), blocks = new Map(), model = [];
  let sec = null, block = null;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === "SECTION") {
      sec = str(r, 2, "").toUpperCase();
      if (sec === "HEADER") for (let j = 0; j < r.g.length; j++) if (r.g[j][0] === 9 && r.g[j + 1]) header[r.g[j][1].toUpperCase()] = r.g[j + 1][1];
      continue;
    }
    if (r.type === "ENDSEC") { sec = null; continue; }
    if (sec === "TABLES" && r.type === "LAYER") {
      const c = num(r, 62, 7), fl = num(r, 70);
      layers.set(str(r, 2, "0").toUpperCase(), {   // layer names ignore case, as in CAD (#268)
        color:trueColor(r) ?? aciColor(Math.abs(c)),
        hidden:c < 0 || (fl & 1) === 1 || str(r, 290) === "0"});
    } else if (sec === "BLOCKS") {
      if (r.type === "BLOCK") { block = {name:str(r, 2, ""), bx:num(r, 10), by:num(r, 20), ents:[]}; blocks.set(block.name.toUpperCase(), block); }
      else if (r.type === "ENDBLK") block = null;
      else if (block) block.ents.push(r);
    } else if (sec === "ENTITIES") model.push(r);
  }
  // POLYLINE + VERTEX… + SEQEND become one record; ATTRIBs after an INSERT are dropped
  const group = list => { const out = []; let poly = null;
    for (const r of list) {
      if (r.type === "VERTEX") { if (poly) poly.verts.push(r); continue; }
      if (r.type === "SEQEND") { poly = null; continue; }
      if (r.type === "ATTRIB") continue;
      if (r.type === "POLYLINE") { poly = r; r.verts = []; }
      out.push(r);
    }
    return out; };
  for (const b of blocks.values()) b.ents = group(b.ents);
  // a file that doesn't declare its units ($INSUNITS missing or 0, as in every R12 file) is read as mm, or as inches when
  // $MEASUREMENT says imperial; opts.units ("mm" or "in") is the user's choice for such a file, from the parts list (#90)
  const unit = DXF_MM[+header.$INSUNITS], notes = [];
  const units = unit ? null : opts.units || (header.$MEASUREMENT != null && +header.$MEASUREMENT === 0 ? "in" : "mm");
  const k = unit || (units === "in" ? IN : 1);
  if (!unit && !opts.units) notes.push(msg("dxf.noUnits", {name, units}));

  const out = new Map(), skipped = {};                          // layer → color → path data
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, count = 0, onHidden = 0, work = 0, points = 0;
  // a crafted file can't hang the page (#77): block-array cells and entities drawn are counted against a limit, and arc
  // sweeps are reduced with a modulo instead of a loop that never ends on huge angles. Points written are counted too,
  // since every array cell repeats its block's whole outline (#160): 2 million take about 2.5 s to read and measure.
  const LIMIT = 250000, PLIMIT = 2000000, TAU = 2 * Math.PI;
  const tooBig = () => { if (++work > LIMIT) throw fail("dxf.tooManyItems", {name, limit:LIMIT}); };
  const sweep = (a, b) => { const s = ((b - a) % TAU + TAU) % TAU; return s > 1e-12 ? s : TAU; };   // end after start, at most one turn
  const mul = (A, B) => [A[0]*B[0] + A[2]*B[1], A[1]*B[0] + A[3]*B[1], A[0]*B[2] + A[2]*B[3], A[1]*B[2] + A[3]*B[3], A[0]*B[4] + A[2]*B[5] + A[4], A[1]*B[4] + A[3]*B[5] + A[5]];
  const fmtN = v => { const r = +v.toFixed(4); return Object.is(r, -0) ? "0" : String(r); };
  function draw(r, M, ctx, depth){
    const t = r.type; tooBig();
    if (num(r, 67) === 1 || num(r, 60) === 1) return;                         // paper space, invisible
    let layer = str(r, 8, "0"); if (layer === "0" && ctx.layer) layer = ctx.layer;
    const L = layers.get(layer.toUpperCase()) || {color:"#000000", hidden:false};
    if (L.hidden || layer.toUpperCase() === "DEFPOINTS") { onHidden++; return; }   // named in a notice (#80)
    const ci = num(r, 62, 256);
    const color = trueColor(r) ?? (ci === 256 ? L.color : ci === 0 ? ctx.color || "#000000" : aciColor(Math.abs(ci)));
    const wcs = t === "LINE" || t === "ELLIPSE" || t === "SPLINE" || (t === "POLYLINE" && num(r, 70) & 8);
    if (num(r, 230, 1) < 0 && !wcs) M = mul(M, [-1, 0, 0, 1, 0, 0]);         // 2D entity in an OCS with extrusion (0,0,-1)
    if (t === "INSERT") {
      const b = blocks.get(str(r, 2, "").toUpperCase());
      if (!b || depth > 16) return;
      const sx = num(r, 41, 1), sy = num(r, 42, 1), a = num(r, 50) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
      const cols = Math.max(1, num(r, 70, 1)), rows = Math.max(1, num(r, 71, 1));
      for (let c = 0; c < cols; c++) for (let w = 0; w < rows; w++) {
        tooBig();
        const ox = c * num(r, 44), oy = w * num(r, 45);
        const R = [co, si, -si, co, num(r, 10) + co*ox - si*oy, num(r, 20) + si*ox + co*oy];
        const N = mul(M, mul(R, [sx, 0, 0, sy, -sx*b.bx, -sy*b.by]));
        for (const e of b.ents) draw(e, N, {layer, color}, depth + 1);
      }
      return;
    }
    const d = [];
    const P = (x, y) => { if (++points > PLIMIT) throw fail("dxf.tooManyPoints", {name, limit:PLIMIT});
      const X = (M[0]*x + M[2]*y + M[4]) * k, Y = -(M[1]*x + M[3]*y + M[5]) * k;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); return [X, Y]; };
    const ell = (cx, cy, ax, ay, bx, by, ta, tb, move) => {
      // elliptical arc C + A cos t + B sin t from ta to tb, as cubics (≤ 90° each)
      const n = Math.max(1, Math.ceil(Math.abs(tb - ta) / (Math.PI / 2) - 1e-9)), dt = (tb - ta) / n, h = 4 / 3 * Math.tan(dt / 4);
      const pt = t => [cx + ax*Math.cos(t) + bx*Math.sin(t), cy + ay*Math.cos(t) + by*Math.sin(t)];
      const dv = t => [-ax*Math.sin(t) + bx*Math.cos(t), -ay*Math.sin(t) + by*Math.cos(t)];
      if (move) d.push(["M", P(...pt(ta))]);
      for (let j = 0; j < n; j++) {
        const s = ta + j*dt, e = s + dt, [px, py] = pt(s), [qx, qy] = pt(e), [ux, uy] = dv(s), [vx, vy] = dv(e);
        d.push(["C", P(px + h*ux, py + h*uy), P(qx - h*vx, qy - h*vy), P(qx, qy)]);
      }
    };
    const bulgeTo = (ax, ay, bx, by, bu) => {
      if (!bu || (ax === bx && ay === by)) { d.push(["L", P(bx, by)]); return; }
      const th = 4 * Math.atan(bu), ch = Math.hypot(bx - ax, by - ay), off = ch / 2 / Math.tan(th / 2), r0 = ch / 2 / Math.sin(th / 2);
      const cx = (ax + bx) / 2 - (by - ay) / ch * off, cy = (ay + by) / 2 + (bx - ax) / ch * off, s = Math.atan2(ay - cy, ax - cx), rr = Math.abs(r0);
      ell(cx, cy, rr, 0, 0, rr, s, s + th, false);
    };
    const poly = (vs, closed) => {                                             // vs: [[x, y, bulge]]
      if (vs.length < 2) return;
      d.push(["M", P(vs[0][0], vs[0][1])]);
      for (let j = 1; j < vs.length; j++) bulgeTo(vs[j-1][0], vs[j-1][1], vs[j][0], vs[j][1], vs[j-1][2]);
      if (closed) { const a = vs[vs.length - 1], b = vs[0]; if (a[2] || a[0] !== b[0] || a[1] !== b[1]) bulgeTo(a[0], a[1], b[0], b[1], a[2]); d.push(["Z"]); }
    };
    if (t === "LINE") d.push(["M", P(num(r, 10), num(r, 20))], ["L", P(num(r, 11), num(r, 21))]);
    else if (t === "CIRCLE") { const rr = num(r, 40); if (rr > 0) { ell(num(r, 10), num(r, 20), rr, 0, 0, rr, 0, 2 * Math.PI, true); d.push(["Z"]); } }
    else if (t === "ARC") {
      const rr = num(r, 40), a = num(r, 50) * Math.PI / 180 % TAU, b = a + sweep(a, num(r, 51) * Math.PI / 180 % TAU);
      if (rr > 0 && isFinite(a) && isFinite(b)) ell(num(r, 10), num(r, 20), rr, 0, 0, rr, a, b, true);
    } else if (t === "ELLIPSE") {
      const ax = num(r, 11), ay = num(r, 21), q = num(r, 40, 1), sg = num(r, 230, 1) < 0 ? -1 : 1;
      const a = num(r, 41) % TAU, b = a + sweep(a, num(r, 42, TAU) % TAU);
      if (!isFinite(a) || !isFinite(b)) return;
      ell(num(r, 10), num(r, 20), ax, ay, -ay * q * sg, ax * q * sg, a, b, true);
      if (Math.abs(b - a - TAU) < 1e-6) d.push(["Z"]);
    } else if (t === "LWPOLYLINE") {
      const vs = [];
      for (const [c, v] of r.g) { if (c === 10) vs.push([+v || 0, 0, 0]); else if (vs.length && c === 20) vs[vs.length - 1][1] = +v || 0; else if (vs.length && c === 42) vs[vs.length - 1][2] = +v || 0; }
      poly(vs, (num(r, 70) & 1) === 1);
    } else if (t === "POLYLINE") {
      const fl = num(r, 70);
      if (fl & 80) { skipped["polygon mesh"] = (skipped["polygon mesh"] || 0) + 1; return; }
      poly(r.verts.filter(v => !(num(v, 70) & 16)).map(v => [num(v, 10), num(v, 20), num(v, 42)]), (fl & 1) === 1);
    } else if (t === "SPLINE") {
      const p = num(r, 71, 3), K = nums(r, 40), W = nums(r, 41), xs = nums(r, 10), ys = nums(r, 20), C = xs.map((x, j) => [x, ys[j] || 0]);
      const fx = nums(r, 11), fy = nums(r, 21);
      if (C.length > p && K.length === C.length + p + 1) {
        // CAD programs write degrees up to 11 (3 is usual); de Boor costs O(p²) per point, so a crafted degree of a few
        // hundred took minutes (#159)
        if (!(Number.isInteger(p) && p >= 1 && p <= 11)) throw fail("dxf.splineDegree", {name, degree:p});
        const ev = u => {                                                        // de Boor, rational when weights are given
          let s = p; while (s < C.length - 1 && u >= K[s + 1]) s++;
          const q = []; for (let j = 0; j <= p; j++) { const w = W.length === C.length ? W[s - p + j] : 1; q.push([C[s - p + j][0]*w, C[s - p + j][1]*w, w]); }
          for (let lv = 1; lv <= p; lv++) for (let j = p; j >= lv; j--) { const i = s - p + j, den = K[i + p - lv + 1] - K[i], al = den ? (u - K[i]) / den : 0;
            q[j] = q[j].map((v, z) => (1 - al) * q[j - 1][z] + al * v); }
          return [q[p][0] / q[p][2], q[p][1] / q[p][2]];
        };
        const us = [], lo = K[p], hi = K[C.length];
        for (let s = p; s < C.length; s++) { if (K[s + 1] <= K[s]) continue; for (let j = 0; j < 16; j++) us.push(K[s] + (K[s + 1] - K[s]) * j / 16); }
        us.push(hi - (hi - lo) * 1e-9);
        // 16 points per knot span, plus halving where a piece's middle is more than 0.005 mm off its chord: a large span
        // came out up to 0.9 mm off the curve (#262)
        const tol = 0.005 / (k * Math.max(Math.hypot(M[0], M[1]), Math.hypot(M[2], M[3]))), pts = [];
        const off = (a, b, m) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
          const t = l ? Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / l)) : 0;
          return Math.hypot(m[0] - a[0] - t * dx, m[1] - a[1] - t * dy); };
        const refine = (u0, a, u1, b, depth) => {
          const um = (u0 + u1) / 2, m = ev(um);
          if (depth < 10 && off(a, b, m) > tol) { refine(u0, a, um, m, depth + 1); pts.push(m); refine(um, m, u1, b, depth + 1); }
        };
        const at = us.map(ev);
        at.forEach((q, j) => { if (j) refine(us[j - 1], at[j - 1], us[j], q, 0); pts.push(q); });
        poly(pts.map(([x, y]) => [x, y, 0]), (num(r, 70) & 1) === 1);
      } else if (fx.length > 1) {
        // fit points only: cubic spline through them (chord-length parameters, natural ends) as Béziers
        const Q = fx.map((x, j) => [x, fy[j] || 0]); if ((num(r, 70) & 1) === 1) Q.push(Q[0]);
        const n = Q.length - 1, hs = []; for (let j = 0; j < n; j++) hs.push(Math.hypot(Q[j+1][0] - Q[j][0], Q[j+1][1] - Q[j][1]) || 1e-9);
        const Mx = [0], My = [0];
        if (n > 1) {                                                             // tridiagonal solve for the second derivatives
          const a = [], b = [], c = [], rx = [], ry = [];
          for (let j = 1; j < n; j++) { a.push(hs[j-1]); b.push(2 * (hs[j-1] + hs[j])); c.push(hs[j]);
            rx.push(6 * ((Q[j+1][0] - Q[j][0]) / hs[j] - (Q[j][0] - Q[j-1][0]) / hs[j-1])); ry.push(6 * ((Q[j+1][1] - Q[j][1]) / hs[j] - (Q[j][1] - Q[j-1][1]) / hs[j-1])); }
          for (let j = 1; j < b.length; j++) { const m = a[j] / b[j-1]; b[j] -= m * c[j-1]; rx[j] -= m * rx[j-1]; ry[j] -= m * ry[j-1]; }
          const sx = [], sy = []; for (let j = b.length - 1; j >= 0; j--) { sx[j] = (rx[j] - (j + 1 < b.length ? c[j] * sx[j+1] : 0)) / b[j]; sy[j] = (ry[j] - (j + 1 < b.length ? c[j] * sy[j+1] : 0)) / b[j]; }
          Mx.push(...sx); My.push(...sy);
        }
        Mx.push(0); My.push(0);
        d.push(["M", P(Q[0][0], Q[0][1])]);
        for (let j = 0; j < n; j++) {
          const h = hs[j], ux = (Q[j+1][0] - Q[j][0]) / h, uy = (Q[j+1][1] - Q[j][1]) / h;
          const d0x = ux - h * (2*Mx[j] + Mx[j+1]) / 6, d0y = uy - h * (2*My[j] + My[j+1]) / 6, d1x = ux + h * (Mx[j] + 2*Mx[j+1]) / 6, d1y = uy + h * (My[j] + 2*My[j+1]) / 6;
          d.push(["C", P(Q[j][0] + d0x*h/3, Q[j][1] + d0y*h/3), P(Q[j+1][0] - d1x*h/3, Q[j+1][1] - d1y*h/3), P(Q[j+1][0], Q[j+1][1])]);
        }
        if ((num(r, 70) & 1) === 1) d.push(["Z"]);
      }
    } else { if (t !== "VIEWPORT") skipped[t] = (skipped[t] || 0) + 1; return; }
    if (!d.length) return;
    if (!out.has(layer)) out.set(layer, new Map());
    const byC = out.get(layer); if (!byC.has(color)) byC.set(color, []); byC.get(color).push(d);   // one path per entity: measured separately, fast
    count++;
  }
  for (const r of group(model)) draw(r, [1, 0, 0, 1, 0, 0], {layer:null, color:null}, 0);
  const sk = Object.entries(skipped);
  if (onHidden) notes.push(msg("dxf.hiddenLeftOut", {name, count:onHidden}));
  if (sk.length) notes.push(msg("dxf.skipped", {name, skipped:sk}));   // [DXF entity type, count]
  if (!count) throw fail("dxf.nothingToCut", {name, hidden:onHidden});
  const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3), used = new Set();
  // The browser measures in single precision, so a drawing far from the origin (site coordinates) got a bounding box
  // off by up to a few tenths of a mm (#164). Its coordinates are moved toward the origin by whole meters, which
  // leaves drawings within a meter of it as they were.
  const ox = Math.trunc(x0 / 1000) * 1000, oy = Math.trunc(y0 / 1000) * 1000;
  const fmtD = d => d.map(sg => sg[0] + sg.slice(1).map(([X, Y]) => fmtN(X - ox) + " " + fmtN(Y - oy)).join(" ")).join("");
  let body = "";
  for (const [ln, byC] of out) {
    let id = "layer-" + (ln.replace(/[^A-Za-z0-9_.-]+/g, "_") || "0"); while (used.has(id)) id += "_"; used.add(id);
    body += `<g id="${esc(id)}">` + [...byC].map(([c, ds]) => `<g stroke="${c}">` + ds.map(dd => `<path d="${fmtD(dd)}"/>`).join("") + `</g>`).join("") + `</g>`;
  }
  const svg = `<svg xmlns="${SVGNS}" width="${fmtN(w)}mm" height="${fmtN(h)}mm" viewBox="${fmtN(x0 - ox)} ${fmtN(y0 - oy)} ${fmtN(w)} ${fmtN(h)}">`
    + `<g fill="none" stroke-width="0.1">${body}</g></svg>`;
  return {svg, notes, units};
}
const USE_LIMIT = 100000;
function useCopies(root){
  // the number of elements the browser creates for the <use> copies in this file
  const byId = new Map(); for (const el of root.querySelectorAll("[id]")) if (!byId.has(el.id)) byId.set(el.id, el);
  const memo = new Map(), busy = new Set();
  const size = el => {                                  // el and everything it draws, copies included
    if (memo.has(el)) return memo.get(el);
    if (busy.has(el)) return 0;                         // a reference loop isn't drawn
    busy.add(el);
    let n = 1;
    for (const c of el.children) n += size(c);
    if (el.localName === "use") { const ref = byId.get(useRef(el)); if (ref) n += size(ref); }
    busy.delete(el); memo.set(el, n);
    return n;
  };
  try { return size(root) - root.querySelectorAll("*").length - 1; } catch(e) { return Infinity; }   // nested too deep to count
}
export function parseSVG(text, name){
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length || root.localName !== "svg") throw fail("svg.unreadable", {name});
  root.querySelectorAll("script,foreignObject").forEach(n => n.remove());
  // every <use> makes the browser build a copy of what it points to, copies inside copies included, as soon as the
  // part is put in the page: a 2 KB file can ask for millions (#158)
  if (useCopies(root) > USE_LIMIT) throw fail("svg.tooManyCopies", {name, limit:USE_LIMIT});
  const stripped = stripExternal(root);
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  const pfx = `p${++uid}_`, ids = new Map();
  root.querySelectorAll("[id]").forEach(el => { ids.set(el.id, pfx + el.id); el.id = pfx + el.id; });
  if (ids.size) {
    const re = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g;
    const fix = v => v.replace(re, (m, id) => ids.has(id) ? `url(#${ids.get(id)})` : m);
    for (const el of all) {
      for (const a of [...el.attributes]) {
        let nv = fix(a.value);
        if (a.localName === "href" && nv[0] === "#" && ids.has(nv.slice(1))) nv = "#" + ids.get(nv.slice(1));
        if (nv !== a.value) el.setAttributeNS(a.namespaceURI, a.name, nv);
      }
      if (el.localName === "style") el.textContent = renameSelectors(fix(el.textContent), (k, id) => k === "#" && ids.has(id) ? ids.get(id) : null);
    }
  }
  const sheets = all.filter(el => el.localName === "style");
  if (sheets.length) {
    // class names get the same prefix, so one file's .cut rules can't restyle another file's parts on a plate
    for (const el of all) { const c = (el.getAttribute("class") || "").trim(); if (c) el.setAttribute("class", c.split(/\s+/).map(n => pfx + n).join(" ")); }
    // and :root becomes :host: parts are measured in a shadow tree (#239), where :root matches nothing and :host is the
    // element above the part, so custom properties set on :root still reach its shapes
    for (const el of sheets) { const t = renameSelectors(el.textContent, (k, n) => k === "." ? pfx + n : k === ":" ? "host" : null); if (t !== el.textContent) el.textContent = t; }
  }
  const vbA = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const vb = vbA.length === 4 && vbA.every(isFinite) && vbA[2] > 0 && vbA[3] > 0 ? vbA : null;
  const rootAttrs = KEEP_ATTRS.filter(a => root.hasAttribute(a)).map(a => `${a}="${esc(root.getAttribute(a))}"`).join(" ");
  const ser = new XMLSerializer();
  const inner = [...root.childNodes].filter(n => n.nodeType === 1).map(n => ser.serializeToString(n)).join("");
  if (!host) {
    // measured in a shadow tree, so the page's own CSS (a {color}, [hidden] {display:none}, .icon, …) can't match the
    // part's elements and change what is measured or exported, and the part's CSS can't match the page's (#239, #63)
    const box = document.createElement("div"); box.setAttribute("aria-hidden", "true");
    box.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
    host = document.createElementNS(SVGNS, "svg"); host.style.cssText = "all:initial;color-scheme:light;color:#000;position:absolute;left:0;top:0;opacity:0;pointer-events:none";
    box.attachShadow({mode:"closed"}).appendChild(host); document.body.appendChild(box);
  }
  // all:initial + black: parts must not inherit the page's theme color or fonts (currentColor would export as the UI text color, #44).
  // Hidden with opacity, which isn't inherited: visibility:hidden would make every part's own visibility unreadable (#17).
  const g = document.createElementNS(SVGNS, "g");
  if (sheets.length && root.hasAttribute("class")) g.setAttribute("class", root.getAttribute("class"));   // so rules on the root's classes match
  // the root's fill, stroke, font-size, style, … inherit to every shape, so measuring and flattening must see them (#64)
  for (const a of KEEP_ATTRS) if (a !== "class" && root.hasAttribute(a)) g.setAttribute(a, root.getAttribute(a));
  for (const n of root.childNodes) if (n.nodeType === 1) g.appendChild(document.importNode(n, true));
  // the file's own viewport, at one px per unit, so percentage lengths resolve as in the file (#260)
  const px = v => { const m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(px|mm|cm|in|pt|pc)?\s*$/i.exec(v || ""), n = m ? parseFloat(m[1]) : NaN;
    return n > 0 ? n * {px:1, mm:96 / IN, cm:960 / IN, in:96, pt:96 / 72, pc:16}[(m[2] || "px").toLowerCase()] : null; };
  const vw = vb ? vb[2] : px(root.getAttribute("width")), vh = vb ? vb[3] : px(root.getAttribute("height"));
  const [W, H] = vw && vh ? [vw, vh] : [10, 10];
  host.setAttribute("viewBox", `0 0 ${W} ${H}`); host.setAttribute("width", W); host.setAttribute("height", H);
  host.appendChild(g);
  let bb, rings;
  const p = {uid, name, inner, rootAttrs, vb, wAttr:root.getAttribute("width"), hAttr:root.getAttribute("height"), par:root.getAttribute("preserveAspectRatio"), qty:1, lock:false, stripped};
  try {
    const pct = fixPercents(g);
    const inl = inlineSheets(g);
    p.hidden = dropHidden(g);
    if (pct || inl || p.hidden) p.inner = [...g.children].map(n => ser.serializeToString(n)).join("");
    bb = g.getBBox();
    if (!bb || (bb.width <= 0 && bb.height <= 0)) throw fail("svg.nothingVisible", {name});
    p.bbox = {x:bb.x, y:bb.y, width:Math.max(bb.width, 1e-6), height:Math.max(bb.height, 1e-6)};
    // sample at ~0.1 mm along curves (unit guess refined by measureScale)
    measureScaleOnly(p);
    extractStepU = 0.1 / Math.min(p.kx, p.ky);
    sampleLeft = SAMPLE_LIMIT; sampleName = name;
    rings = extractRings(g);
    p.flat = extractFlat(g);
    if (!p.flat) { const r = extractFlat(g, true); p.loose = r.items.length ? r.items : null; p.looseSkipped = r.skipped; }   // for DXF export
  } finally { g.remove(); }
  if (!rings.length) throw fail("svg.nothingToCut", {name});
  p.rings = rings;
  if (rings.some(r => r.marker)) {                   // the box takes in the markers' room too, for Bounding box mode (#281)
    let x0 = p.bbox.x, y0 = p.bbox.y, x1 = x0 + p.bbox.width, y1 = y0 + p.bbox.height;
    for (const r of rings) if (r.marker) for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    p.bbox = {x:x0, y:y0, width:x1 - x0, height:y1 - y0};
  }
  // getBBox works in single precision: a drawing far from its origin (site or GIS exports) gets a box off by up to a
  // few tenths of a unit, and Bounding box mode places parts by it (#213). Far out, take the box from the sampled
  // outlines instead, which are in double precision, when they agree with it to within that error.
  const far = Math.max(Math.abs(bb.x), Math.abs(bb.y), Math.abs(bb.x + bb.width), Math.abs(bb.y + bb.height));
  if (far > 1e4) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const tol = far * 1e-6;
    if (Math.abs(x0 - bb.x) <= tol && Math.abs(y0 - bb.y) <= tol && Math.abs(x1 - bb.x - bb.width) <= tol && Math.abs(y1 - bb.y - bb.height) <= tol)
      p.bbox = {x:x0, y:y0, width:Math.max(x1 - x0, 1e-6), height:Math.max(y1 - y0, 1e-6)};
  }
  p.cx = p.bbox.x + p.bbox.width/2; p.cy = p.bbox.y + p.bbox.height/2;
  measureScale(p);
  if (!p.outers.length) throw fail("svg.noClosedOutline", {name});
  const thumbSVG = `<svg xmlns="${SVGNS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${p.bbox.x} ${p.bbox.y} ${p.bbox.width} ${p.bbox.height}"><g ${rootAttrs}>${p.inner}</g></svg>`;
  p.thumb = URL.createObjectURL(new Blob([thumbSVG], {type:"image/svg+xml"}));
  return p;
}
const PCT_ATTRS = {rect:["x","y","width","height","rx","ry"], circle:["cx","cy","r"], ellipse:["cx","cy","rx","ry"],
  line:["x1","y1","x2","y2"], image:["x","y","width","height"], use:["x","y","width","height"], svg:["x","y","width","height"]};
function fixPercents(g){
  // percentage lengths are written out as the user-unit values they resolve to in the file's viewport, so the outline,
  // the export, the thumbnail and the plate (each drawn in a different viewport) all agree (#260). Shapes in clip paths,
  // masks, patterns, markers and symbols are left alone: their percentages can be relative to something else.
  let n = 0;
  for (const el of g.querySelectorAll(Object.keys(PCT_ATTRS).join(","))) {
    if (el.namespaceURI !== SVGNS || el.closest("clipPath,mask,pattern,marker,symbol")) continue;
    for (const k of PCT_ATTRS[el.localName]) {
      const a = el.getAttribute(k);
      if (!a || !/%\s*$/.test(a) || !el[k] || !el[k].baseVal) continue;
      el.setAttribute(k, String(+el[k].baseVal.value.toPrecision(7))); n++;
    }
  }
  return n;
}
const PRES = new Set(["fill","fill-opacity","fill-rule","stroke","stroke-width","stroke-opacity","stroke-linecap","stroke-linejoin",
  "stroke-miterlimit","stroke-dasharray","stroke-dashoffset","opacity","display","visibility","color","font-family","font-size",
  "font-weight","font-style","font-variant","font-stretch","text-anchor","dominant-baseline","alignment-baseline","baseline-shift",
  "letter-spacing","word-spacing","text-decoration","writing-mode","direction","unicode-bidi","clip-path","clip-rule","mask","filter",
  "stop-color","stop-opacity","flood-color","flood-opacity","lighting-color","marker-start","marker-mid","marker-end","paint-order",
  "vector-effect","shape-rendering","text-rendering","image-rendering","color-interpolation","color-interpolation-filters","overflow",
  "pointer-events","transform-origin","mix-blend-mode","isolation"]);
function dropHidden(g){
  // shapes a browser wouldn't show are not part of the cut (#17): removed before anything is measured, nested or
  // exported. Hidden = display:none on it or an ancestor, visibility other than visible (a visible child of a hidden
  // group counts, as in CSS), opacity 0 on it or an ancestor, or nothing painted (no fill and no stroke).
  let n = 0;
  const paint = (v, o) => v && v !== "none" && !/^rgba\(.*,\s*0\)$/.test(v) && !/^transparent$/.test(v) && !(parseFloat(o) === 0);
  for (const el of [...g.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text,use,image")]) {
    if (el.namespaceURI !== SVGNS || el.closest("defs,clipPath,mask,symbol,pattern,marker")) continue;
    const cs = getComputedStyle(el);
    let hide = cs.visibility !== "visible";
    for (let a = el; !hide && a && a !== g; a = a.parentElement) { const c = getComputedStyle(a); hide = c.display === "none" || parseFloat(c.opacity) === 0; }
    if (!hide && el.localName !== "use" && el.localName !== "image") {
      const fill = el.localName !== "line" && paint(cs.fill, cs.fillOpacity), stroke = paint(cs.stroke, cs.strokeOpacity) && parseFloat(cs.strokeWidth) > 0;
      hide = !fill && !stroke;
    }
    if (hide) { el.remove(); n++; }
  }
  return n;
}
function inlineSheets(g){
  // MakeIT ignores class, universal and descendant selectors but applies element-type rules to the whole plate, so a
  // part's <style> can't be exported as is (#38, #42). Write the computed value of every property the rules declare
  // onto the elements they match (as presentation attributes where possible), then drop the rules. Only @font-face
  // and similar at-rules are kept. Returns true when the part had a <style> block.
  const sheets = [...g.querySelectorAll("style")];
  if (!sheets.length) return false;
  const want = new Map(), add = (el, props) => { if (!want.has(el)) want.set(el, new Set()); for (const q of props) want.get(el).add(q); };
  const ancestors = []; for (let a = g.parentElement; a; a = a.parentElement) ancestors.push(a);
  const walk = rules => { for (const r of rules) {
    if (r instanceof CSSStyleRule) {
      const props = [...r.style];
      if (!props.length) continue;
      let els = [];
      try { els = [...g.querySelectorAll(r.selectorText)]; if ([g, ...ancestors].some(a => a.matches(r.selectorText))) els.push(...g.children); } catch(e) { continue; }
      for (const el of els) add(el, props);
      if (r.cssRules && r.cssRules.length) walk(r.cssRules);       // nested rules
    } else if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);   // @media, @supports, @layer, …
  } };
  for (const s of sheets) { try { if (s.sheet) walk(s.sheet.cssRules); } catch(e) {} }
  const px = v => v.replace(/(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)px\b/gi, "$1");
  const val = (prop, v) => {
    v = v.replace(/url\("(#[^"\\]*)"\)/g, "url($1)");                // url("#id") → url(#id), as uniquifyIds expects
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(v);
    if (m) {
      const a = m[4] == null ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
      if (a === 0 && (prop === "fill" || prop === "stroke")) return "none";
      if (a === 1) return "#" + [m[1], m[2], m[3]].map(c => Math.round(+c).toString(16).padStart(2, "0")).join("");
      return v;
    }
    return PRES.has(prop) && !/url\(|["']/.test(v) ? px(v).replace(/,\s*/g, prop === "stroke-dasharray" ? " " : ", ") : v;
  };
  // the computed values have var() substituted: check them again, so nothing the sanitizer couldn't see reaches the export (#238)
  const writes = [...want].map(([el, props]) => { const cs = getComputedStyle(el); return [el, [...props].map(q => [q, cs.getPropertyValue(q)]).filter(([q, v]) => v !== "" && !cssExternal(`${q}:${v}`))]; });
  for (const s of sheets) {
    const keep = s.sheet ? [...s.sheet.cssRules].filter(r => r instanceof CSSFontFaceRule || r instanceof CSSKeyframesRule).map(r => r.cssText).join("\n") : "";
    if (keep) s.textContent = keep; else s.remove();
  }
  for (const [el, kv] of writes) {
    if (!el.isConnected) continue;
    let extra = "";
    for (const [q, v] of kv) {
      if (el.style.getPropertyValue(q) !== "") continue;             // the element's own style attribute already says it
      if (PRES.has(q)) el.setAttribute(q, val(q, v)); else extra += `${q}:${val(q, v)};`;
    }
    if (extra) { const s0 = (el.getAttribute("style") || "").trim(); el.setAttribute("style", s0 + (s0 && !s0.endsWith(";") ? ";" : "") + extra); }
  }
  return true;
}
function measureScaleOnly(p){
  let kx, ky;
  if (p.vb) { const w = lenToMM(p.wAttr, S.dpi), h = lenToMM(p.hAttr, S.dpi); kx = w ? w/p.vb[2] : null; ky = h ? h/p.vb[3] : null;
    if (kx == null && ky == null) kx = ky = IN / S.dpi; else if (kx == null) kx = ky; else if (ky == null) ky = kx;
    // viewBox and width/height with different aspect ratios: viewers scale uniformly unless preserveAspectRatio is
    // "none" (#65); meet (the default, also for an invalid value) fits the viewBox inside, slice fills the box. The
    // xMid/yMax… alignment only shifts the drawing in the viewport, and parts are placed by their own bbox, so it
    // doesn't change the cut.
    else if (kx !== ky) { const m = /^\s*(?:defer\s+)?(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(meet|slice))?\s*$/.exec(p.par || "");
      if (!m || m[1] !== "none") kx = ky = (m && m[2] === "slice" ? Math.max : Math.min)(kx, ky); } }
  else {
    // no viewBox: user units are CSS px (1/96 in) whenever width or height has an absolute unit, as in every viewer;
    // only files sized in px or without units follow the Unitless SVG scale setting (#73)
    const abs = /^\s*[-+]?[\d.]+(?:e[-+]?\d+)?\s*(?:mm|cm|in|pt|pc)\s*$/i;
    kx = ky = abs.test(p.wAttr || "") || abs.test(p.hAttr || "") ? IN / 96 : IN / S.dpi;
  }
  p.kx = kx; p.ky = ky;
}

/* ---------- one object per part: shapes rewritten as plain paths in plate coordinates ---------- */
function parsePathD(d){
  // returns absolute segments: ["M",x,y] ["L",x,y] ["C",x1,y1,x2,y2,x,y] ["Z"]
  const out = [], n = d.length, reNum = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null;
  const ws = () => { while (i < n && (d[i] === "," || d[i] === " " || d[i] === "\t" || d[i] === "\n" || d[i] === "\r" || d[i] === "\f")) i++; };
  const num = () => { ws(); reNum.lastIndex = i; const m = reNum.exec(d); if (!m || !m[0].length) throw new Error("bad path"); i = reNum.lastIndex; return +m[0]; };
  const flag = () => { ws(); const c = d[i]; if (c !== "0" && c !== "1") throw new Error("bad flag"); i++; return c === "1"; };
  const more = () => { ws(); return i < n && /[-+.\d]/.test(d[i]); };
  while (true) {
    ws(); if (i >= n) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd || cmd === "Z" || cmd === "z") throw new Error("bad path");   // a number after Z looped forever (#152)
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    let first = true;
    do {
      const ox = rel ? x : 0, oy = rel ? y : 0;
      let keepC = false, keepQ = false;
      if (C === "M") {
        x = ox + num(); y = oy + num();
        if (first) { out.push(["M", x, y]); sx = x; sy = y; } else out.push(["L", x, y]);
      } else if (C === "L") { x = ox + num(); y = oy + num(); out.push(["L", x, y]); }
      else if (C === "H") { x = ox + num(); out.push(["L", x, y]); }
      else if (C === "V") { y = oy + num(); out.push(["L", x, y]); }
      else if (C === "C" || C === "S") {
        let x1, y1;
        if (C === "C") { x1 = ox + num(); y1 = oy + num(); }
        else { x1 = lcx == null ? x : 2*x - lcx; y1 = lcy == null ? y : 2*y - lcy; }
        const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        out.push(["C", x1, y1, x2, y2, ex, ey]); lcx = x2; lcy = y2; x = ex; y = ey; keepC = true;
      } else if (C === "Q" || C === "T") {
        let qx, qy;
        if (C === "Q") { qx = ox + num(); qy = oy + num(); }
        else { qx = lqx == null ? x : 2*x - lqx; qy = lqy == null ? y : 2*y - lqy; }
        const ex = ox + num(), ey = oy + num();
        out.push(["C", x + 2/3*(qx - x), y + 2/3*(qy - y), ex + 2/3*(qx - ex), ey + 2/3*(qy - ey), ex, ey]);
        lqx = qx; lqy = qy; x = ex; y = ey; keepQ = true;
      } else if (C === "A") {
        const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), ex = ox + num(), ey = oy + num();
        for (const c of arcToCubics(x, y, rx, ry, rot, fa, fs, ex, ey)) out.push(c);
        x = ex; y = ey;
      } else if (C === "Z") { out.push(["Z"]); x = sx; y = sy; }
      else throw new Error("bad command");
      if (!keepC) { lcx = lcy = null; } if (!keepQ) { lqx = lqy = null; }
      first = false;
    } while (C !== "Z" && more());
  }
  return out;
}
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2){
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [["L", x2, y2]];
  const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp*dx + sp*dy, y1p = -sp*dx + cp*dy;
  const lam = x1p*x1p/(rx*rx) + y1p*y1p/(ry*ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const den = rx*rx*y1p*y1p + ry*ry*x1p*x1p;
  let co = Math.sqrt(Math.max(0, (rx*rx*ry*ry - den) / den)); if (fa === fs) co = -co;
  const cxp = co*rx*y1p/ry, cyp = -co*ry*x1p/rx;
  const cx = cp*cxp - sp*cyp + (x1 + x2)/2, cy = sp*cxp + cp*cyp + (y1 + y2)/2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy);
  const t1 = ang(1, 0, (x1p - cxp)/rx, (y1p - cyp)/ry);
  let dt = ang((x1p - cxp)/rx, (y1p - cyp)/ry, (-x1p - cxp)/rx, (-y1p - cyp)/ry);
  if (!fs && dt > 0) dt -= 2*Math.PI; else if (fs && dt < 0) dt += 2*Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI/2) - 1e-9)), del = dt / segs, k = 4/3 * Math.tan(del/4);
  const map = (u, v) => [cx + rx*cp*u - ry*sp*v, cy + rx*sp*u + ry*cp*v];
  const out = [];
  for (let s = 0; s < segs; s++) {
    const a = t1 + s*del, b = a + del, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const c1 = map(ca - k*sa, sa + k*ca), c2 = map(cb + k*sb, sb - k*cb);
    const e = s === segs - 1 ? [x2, y2] : map(cb, sb);
    out.push(["C", c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
  }
  return out;
}
const FLAT_SHAPES = new Set(["path","rect","circle","ellipse","line","polyline","polygon"]);
const FLAT_SKIP = new Set(["g","a","svg","switch","defs","style","title","desc","metadata","linearGradient","radialGradient","stop","symbol","clipPath","mask","pattern","marker","filter","view"]);
function cssColor(v){
  if (!v || v === "none") return "none";
  if (/^url\(/i.test(v)) return undefined;
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(v);
  if (!m) return v;
  if (m[4] != null && parseFloat(m[4]) === 0) return "none";
  return "#" + [m[1], m[2], m[3]].map(c => Math.round(+c).toString(16).padStart(2, "0")).join("");
}
function extractFlat(g, loose){
  // every drawable shape → absolute path segments in the part's user units; null when the part needs its original markup.
  // loose (for DXF export of such parts): keep every shape that can be drawn as a path and list what was left out.
  const hostInv = host.getScreenCTM().inverse();
  const out = [], skipped = new Set(), opac = new Map();
  for (const el of g.querySelectorAll("*")) {
    if (el.namespaceURI !== SVGNS) continue;
    if (el.closest("defs,clipPath,mask,symbol,pattern,marker,filter")) continue;   // a filter's primitives draw nothing (#265)
    const tag = el.localName, cs = getComputedStyle(el);
    if ((cs.clipPath && cs.clipPath !== "none") || (cs.mask && cs.mask !== "none") || (cs.filter && cs.filter !== "none")) {
      if (!loose) return null;
      skipped.add("clipping");
    }
    if (FLAT_SKIP.has(tag)) continue;
    if (FLAT_SHAPES.has(tag) && [cs.markerStart, cs.markerMid, cs.markerEnd].some(v => v && v !== "none")) {
      if (!loose) return null;                          // markers: keep the original markup, which draws them (#281)
      skipped.add("markers");
    }
    if (!FLAT_SHAPES.has(tag)) {                        // text, images, <use>: keep original markup
      if (!loose) return null;
      if (["text","tspan","textPath"].includes(tag)) skipped.add("text"); else if (tag === "image") skipped.add("images");
      else if (tag === "use") skipped.add("use"); else skipped.add("<" + tag);
      continue;
    }
    if (isHidden(el, g)) continue;
    let fill = tag === "line" ? "none" : cssColor(cs.fill), stroke = cssColor(cs.stroke);     // a line is never filled
    if (fill === undefined || stroke === undefined) {
      if (!loose) return null;
      skipped.add("paint");
      if (fill === undefined) fill = "#000000"; if (stroke === undefined) stroke = "#000000";
    }
    if (fill === "none" && stroke === "none") continue;
    let d;
    const v = k => len(el, k);
    if (tag === "path") d = el.getAttribute("d") || "";
    else if (tag === "rect") {
      const x = v("x"), y = v("y"), w = v("width"), h = v("height");
      if (w <= 0 || h <= 0) continue;
      // the corner radii as drawn: CSS rx/ry (from a style sheet or attribute) win over the attributes, as in the outline (#263)
      const radius = k => { const c = cs[k]; if (!c || c === "auto") return null;
        const n = parseFloat(c), a = el.hasAttribute(k) ? v(k) : null;
        if (c.endsWith("%") || isNaN(n)) return a;
        return a != null && Math.abs(n - a) <= 1e-6 * Math.max(1, Math.abs(a)) ? a : n; };
      let rx = radius("rx"), ry = radius("ry");
      if (rx == null) rx = ry ?? 0; if (ry == null) ry = rx;
      rx = Math.min(rx, w/2); ry = Math.min(ry, h/2);
      d = rx > 0 && ry > 0
        ? `M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`
        : `M${x} ${y}H${x+w}V${y+h}H${x}Z`;
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = v("cx"), cy = v("cy"), rx = tag === "circle" ? v("r") : v("rx"), ry = tag === "circle" ? v("r") : v("ry");
      if (rx <= 0 || ry <= 0) continue;
      d = `M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`;
    } else if (tag === "line") d = `M${v("x1")} ${v("y1")}L${v("x2")} ${v("y2")}`;
    else {
      const pts = pointsOf(el).map(([x, y]) => `${x} ${y}`);
      if (pts.length < 2) continue;
      d = "M" + pts.join("L") + (tag === "polygon" ? "Z" : "");
    }
    let segs;
    try { segs = parsePathD(d); } catch(e) { if (!loose) return null; skipped.add("unreadable"); continue; }
    if (!segs.length) continue;
    const scr = el.getScreenCTM(); if (!scr) continue;
    const m = hostInv.multiply(scr);
    const T = (x, y) => [m.a*x + m.c*y + m.e, m.b*x + m.d*y + m.f];
    for (const s of segs) for (let j = 1; j < s.length; j += 2) { const [X, Y] = T(s[j], s[j+1]); s[j] = X; s[j+1] = Y; }
    const k = Math.sqrt(Math.abs(m.a*m.d - m.b*m.c)), sw = (parseFloat(cs.strokeWidth) || 0) * k;
    // caps, joins and dashes (lengths scaled like the stroke width); null/defaults are not written on export
    const ml = parseFloat(cs.strokeMiterlimit), da = cs.strokeDasharray || "none";
    let dash = da === "none" || da.includes("%") ? null : da.split(/[\s,]+/).map(parseFloat).filter(isFinite).map(v => v * k);
    if (dash && !dash.some(v => v > 0)) dash = null;
    // opacity isn't inherited but multiplies down the tree: a shape in <g opacity="0.3"> draws at 30% (#267)
    let o = 1;
    for (let a = el; a; a = a === g ? null : a.parentElement) {
      if (!opac.has(a)) { const v = parseFloat(getComputedStyle(a).opacity); opac.set(a, isNaN(v) ? 1 : v); }
      o *= opac.get(a);
    }
    out.push({segs, fill, stroke, sw, evenodd: cs.fillRule === "evenodd", fo: o * (parseFloat(cs.fillOpacity) || (cs.fillOpacity === "0" ? 0 : 1)), so: o * (parseFloat(cs.strokeOpacity) || (cs.strokeOpacity === "0" ? 0 : 1)),
      cap: cs.strokeLinecap || "butt", join: cs.strokeLinejoin || "miter", ml: isFinite(ml) ? ml : 4, dash, doff: dash ? (parseFloat(cs.strokeDashoffset) || 0) * k : 0,
      lay: (/_layer-(.+)$/.exec(el.closest("g[id*='_layer-']")?.id || "") || [])[1]});   // DXF layer, for parts imported from DXF
  }
  if (loose) return {items:out, skipped:[...skipped]};
  return out.length ? out : null;
}
function placeMatrix(tx, ty, deg, kx, ky, cx, cy){
  // part user units → plate mm: translate(tx,ty) rotate(deg) scale(kx,ky) translate(-cx,-cy)
  const r = deg * Math.PI / 180, co = Math.abs(deg % 90) === 0 ? Math.round(Math.cos(r)) : Math.cos(r), si = Math.abs(deg % 90) === 0 ? Math.round(Math.sin(r)) : Math.sin(r);
  const a = kx*co, b = kx*si, c = -ky*si, d = ky*co;
  return [a, b, c, d, tx - (a*cx + c*cy), ty - (b*cx + d*cy)];
}
const n3 = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? "0" : String(r); };
const slug = s => (s.replace(/\.(svg|dxf)$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "part").replace(/^(\d)/, "p$1");
function uniquifyIds(markup, prefix){
  // give every id in original markup a per-instance prefix and rewrite url(#id), href="#id" and #id in <style>
  const ids = [...new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))];
  const re = v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const id of ids) {
    const e = re(id), n = prefix + id;
    // replacer functions, not replacement strings: a $ in an id ($', $&, $1…) must not expand (#76)
    markup = markup.replace(new RegExp(`(\\sid=")${e}(")`, "g"), (m, a, b) => a + n + b)
      .replace(new RegExp(`url\\(\\s*(['"]?)#${e}\\1\\s*\\)`, "g"), () => `url(#${n})`)
      .replace(new RegExp(`(href\\s*=\\s*["'])#${e}(["'])`, "g"), (m, a, b) => a + "#" + n + b);
  }
  if (ids.length) {
    const has = new Set(ids);
    markup = markup.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, a, css, z) => a + renameSelectors(css, (k, id) => k === "#" && has.has(id) ? prefix + id : null) + z);
  }
  return markup;
}
// whether point q ([x, y]) is inside the ring poly ([[x, y], …]), by the even-odd rule
function insideRing(q, poly){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < (xj - xi) * (q[1] - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
function cutPlan(p, flat = p.flat, byLayer = false){
  // the part's subpaths with their nesting depth (how many closed contours contain them), computed once per part;
  // inner cuts (holes, slots, engraving) must come before the outline that contains them.
  // byLayer (DXF export of parts imported from DXF): open pieces are only joined within their source layer
  const ck = p.kx + "," + p.ky, slot = (flat === p.flat ? "cutPlan" : "loosePlan") + (byLayer ? "L" : "");
  if (p[slot] && p[slot + "Key"] === ck) return p[slot];
  let subs = [];
  flat.forEach((it, item) => {
    // after Z, drawing goes on from the subpath's start point as a new subpath (as in SVG), not as part of the closed one (#264)
    let cur = null, home = null;
    for (const sg of it.segs) {
      if (sg[0] === "M") home = [sg[1], sg[2]];
      if (sg[0] === "M" || !cur || cur.segs[cur.segs.length - 1][0] === "Z") {
        cur = {item, segs:sg[0] === "M" || !home ? [] : [["M", ...home]]}; subs.push(cur);
      }
      cur.segs.push(sg);
    }
  });
  subs = joinSubpaths(flat, subs, 0.01 / Math.min(p.kx, p.ky), byLayer);
  for (const sub of subs) {
    const pts = []; let x = 0, y = 0;
    for (const sg of sub.segs) {
      if (sg[0] === "M" || sg[0] === "L") { x = sg[1]; y = sg[2]; pts.push([x, y]); }
      else if (sg[0] === "C") {
        for (let i = 1; i <= 4; i++) { const t = i / 4, u = 1 - t;
          pts.push([u*u*u*x + 3*u*u*t*sg[1] + 3*u*t*t*sg[3] + t*t*t*sg[5], u*u*u*y + 3*u*u*t*sg[2] + 3*u*t*t*sg[4] + t*t*t*sg[6]]); }
        x = sg[5]; y = sg[6];
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    const a = pts[0], z = pts[pts.length - 1];
    sub.pts = pts; sub.bb = [x0, y0, x1, y1];
    sub.closed = pts.length > 2 && (sub.segs[sub.segs.length - 1][0] === "Z" || Math.hypot(a[0] - z[0], a[1] - z[1]) <= 1e-6 * Math.max(x1 - x0, y1 - y0, 1));
  }
  for (const sub of subs) {
    sub.depth = 0;
    for (const o of subs) {
      if (o === sub || !o.closed || !sub.pts.length) continue;
      const [a0, b0, a1, b1] = sub.bb, [c0, d0, c1, d1] = o.bb;
      if (a0 >= c0 && b0 >= d0 && a1 <= c1 && b1 <= d1 && (a1 - a0) * (b1 - b0) < (c1 - c0) * (d1 - d0) && insideRing(sub.pts[0], o.pts)) sub.depth++;
    }
  }
  p[slot + "Key"] = ck;
  return (p[slot] = subs);
}
const lineKey = it => [it.cap, it.join, it.ml, it.dash ? it.dash.join(",") : "", it.doff].join("|");
function joinSubpaths(flat, subs, tol, byLayer){
  // chain open subpaths of the same line style whose ends meet (within tol, part units) into continuous paths,
  // reversing pieces where needed; a chain that returns to its start is closed with Z. CAD/DXF exports often
  // store every segment of an outline as its own subpath, which the laser would otherwise cut one at a time.
  // byLayer: only pieces on the same source layer are chained.
  const end = segs => { const s = segs[segs.length - 1]; return [s[s.length - 2], s[s.length - 1]]; };
  const start = segs => [segs[0][1], segs[0][2]];
  const near = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const reverse = segs => {
    const pts = segs.map(sg => [sg[sg.length - 2], sg[sg.length - 1]]), out = [["M", ...pts[pts.length - 1]]];
    for (let i = segs.length - 1; i >= 1; i--) {
      const sg = segs[i], q = pts[i - 1];
      out.push(sg[0] === "C" ? ["C", sg[3], sg[4], sg[1], sg[2], q[0], q[1]] : ["L", q[0], q[1]]);
    }
    return out;
  };
  const styleKey = sub => { const it = flat[sub.item]; return it.fill === "none" ? it.stroke + "|" + it.sw + "|" + it.so + "|" + lineKey(it) + (byLayer ? "|" + it.lay : "") : null; };
  const isOpen = sub => sub.segs.length > 1 && sub.segs[sub.segs.length - 1][0] !== "Z" && sub.segs.every((sg, i) => i === 0 ? sg[0] === "M" : sg[0] === "L" || sg[0] === "C");
  const out = [], pool = new Map();
  for (const sub of subs) {
    const k = isOpen(sub) ? styleKey(sub) : null;
    if (k == null) { out.push(sub); continue; }
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(sub);
    out.push({pending:k});
  }
  // Each step takes the lowest-numbered remaining piece with an end near either end of the chain, as a linear scan
  // would, but finds the candidates in a grid of tol-sized cells, and grows the chain without copying it: a scan per
  // step was quadratic, 14 s for 30,000 shuffled lines (#154).
  const chains = new Map();
  const cell = p => Math.floor(p[0] / tol) + "," + Math.floor(p[1] / tol);
  for (const [k, list] of pool) {
    const n = list.length, used = new Uint8Array(n), grid = new Map(), res = [];
    const put = (p, i) => { const c = cell(p); let a = grid.get(c); if (!a) grid.set(c, a = []); a.push(i); };
    list.forEach((sub, i) => { put(start(sub.segs), i); put(end(sub.segs), i); });
    const nearIdx = (p, best) => {        // lowest unused piece with an end in the 3 × 3 cells around p (filtered by near later)
      const cx = Math.floor(p[0] / tol), cy = Math.floor(p[1] / tol);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = grid.get((cx + dx) + "," + (cy + dy)); if (!a) continue;
        for (const i of a) if (!used[i] && i < best) { const o = list[i].segs;
          if (near(p, start(o)) || near(p, end(o))) best = i; }
      }
      return best;
    };
    for (let f = 0; f < n; f++) {
      if (used[f]) continue;
      used[f] = 1;
      const first = list[f], segs = first.segs.slice(), front = [];   // front: pieces put before segs, newest last
      const S = () => start(front.length ? front[front.length - 1] : segs);
      while (!near(S(), end(segs))) {
        const e = end(segs), st = S(), i = nearIdx(st, nearIdx(e, n));
        if (i === n) break;
        const o = list[i].segs; used[i] = 1;
        if (near(e, start(o))) for (let j = 1; j < o.length; j++) segs.push(o[j]);
        else if (near(e, end(o))) { const r = reverse(o); for (let j = 1; j < r.length; j++) segs.push(r[j]); }
        else if (near(st, end(o))) front.push(o);
        else front.push(reverse(o));
      }
      let all = segs;
      if (front.length) { all = front[front.length - 1].slice();
        for (let j = front.length - 2; j >= 0; j--) for (let q = 1; q < front[j].length; q++) all.push(front[j][q]);
        for (let q = 1; q < segs.length; q++) all.push(segs[q]); }
      if (all.length > 2 && near(start(all), end(all))) {
        const last = all[all.length - 1].slice(), [sx, sy] = start(all);
        last[last.length - 2] = sx; last[last.length - 1] = sy;
        all = all.slice(0, -1).concat([last, ["Z"]]);
      }
      res.push({item:first.item, segs:all});
    }
    chains.set(k, res);
  }
  // chains take the place of the first piece of each style, keeping the source order of everything else
  const done = new Set();
  return out.flatMap(sub => sub.pending == null ? [sub] : done.has(sub.pending) ? [] : (done.add(sub.pending), chains.get(sub.pending)));
}
function cutGroups(p, flat, sc, byLayer = false){
  // the part's subpaths in cut order, grouped by line style (one SVG <path> each): same-style lines share a group,
  // every filled shape is its own; groups with the deepest (innermost) cuts first, the outline that contains them last.
  // byLayer (DXF export of parts imported from DXF): also grouped by source layer, one output layer per source layer
  const groups = new Map();
  for (const sub of cutPlan(p, flat, byLayer)) {
    const it = flat[sub.item];
    const key = it.fill === "none" ? "L|" + it.stroke + "|" + n3(it.sw * sc) + "|" + n3(it.so) + "|" + lineKey(it) + (byLayer ? "|" + it.lay : "") : "F|" + sub.item;
    if (!groups.has(key)) groups.set(key, {it, fill:it.fill !== "none", order:groups.size, subs:[]});
    groups.get(key).subs.push(sub);
  }
  return [...groups.values()].map(g => {
    g.subs = g.subs.slice().sort((x, y) => y.depth - x.depth);   // stable sort keeps source order within a depth
    g.depth = Math.min(...g.subs.map(s => s.depth));
    return g;
  }).sort((x, y) => y.depth - x.depth || x.fill - y.fill || x.order - y.order);
}
function flattenCubic(p0, p1, p2, p3, tol, pts, depth = 0){
  // adaptive subdivision until the control points are within tol of the chord; pushes the end points of the pieces
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1], L = Math.hypot(dx, dy) || 1e-12;
  const d1 = Math.abs((p1[0] - p0[0]) * dy - (p1[1] - p0[1]) * dx) / L, d2 = Math.abs((p2[0] - p0[0]) * dy - (p2[1] - p0[1]) * dx) / L;
  if (depth > 12 || Math.max(d1, d2) * 0.75 <= tol) { pts.push(p3); return; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3), e = mid(a, b), g = mid(b, c), m = mid(e, g);
  flattenCubic(p0, a, e, m, tol, pts, depth + 1); flattenCubic(m, g, c, p3, tol, pts, depth + 1);
}
function kerfPaths(p, gr, M, notes){
  // kerf compensation for one cut group: each closed, unfilled subpath moved by half the kerf, outward for outlines
  // (even nesting depth) and inward for holes (odd), as plate-mm polylines within 0.002 mm. Returns one entry per
  // subpath: null = unchanged (open, filled, or a hole too small to compensate), else the offset contour(s).
  const c = kerfC(p);
  if (!c || gr.fill) return null;
  const [a, b, cc, d, e, f] = M, T = (x, y) => [a*x + cc*y + e, b*x + d*y + f];
  return gr.subs.map(sub => {
    if (!sub.closed) return null;
    const pts = []; let cur = null;
    for (const sg of sub.segs) {
      if (sg[0] === "M" || sg[0] === "L") { cur = T(sg[1], sg[2]); pts.push(cur); }
      else if (sg[0] === "C") { const p3 = T(sg[5], sg[6]); flattenCubic(cur, T(sg[1], sg[2]), T(sg[3], sg[4]), p3, 0.002, pts); cur = p3; }
    }
    const ring = pts.map(([x, y]) => ({X:Math.round(x * SC), Y:Math.round(y * SC)}));
    if (ring.length < 3 || Math.abs(area(ring)) < 1) return null;
    const ccw = CL.Clipper.Orientation(ring); if (!ccw) ring.reverse();
    const off = new CL.ClipperOffset(2, 2); off.AddPath(ring, CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
    const res = new CL.Paths(); off.Execute(res, (sub.depth % 2 ? -c : c) * SC);
    if (!res.length) { notes && notes.add(msg("kerf.holeTooNarrow", {name:p.name})); return null; }
    const [sx, sy] = pts[0];
    return res.map(q => {
      if (CL.Clipper.Orientation(q) !== ccw) q.reverse();               // keep the drawn direction
      let k = 0, best = Infinity;                                       // and start next to the drawn start point
      q.forEach((v, i) => { const dd = (v.X / SC - sx) ** 2 + (v.Y / SC - sy) ** 2; if (dd < best) { best = dd; k = i; } });
      return q.slice(k).concat(q.slice(0, k)).map(v => [v.X / SC, v.Y / SC]);
    });
  });
}
const markupNote = (p, notes) => { if (kerfC() && !p.precomp) notes.add(msg("kerf.markup", {name:p.name})); };
function partMarkup(p, M, id, fallbackTransform, notes){
  // one <path> when the part's shapes share a style; otherwise one <g> of plain paths with no transforms.
  // Cut order: deepest (innermost) subpaths first, the outline that contains them last.
  if (!p.flat) {
    if (notes) markupNote(p, notes);
    return `<g id="${id}" transform="${fallbackTransform}"><g ${p.rootAttrs}>${uniquifyIds(p.inner, id + "_")}</g></g>`;
  }
  const [a, b, c, d, e, f] = M, sc = Math.sqrt(Math.abs(a*d - b*c));
  const toD = segs => segs.map(s => s[0] === "Z" ? "Z" : s[0] + (() => { const o = []; for (let j = 1; j < s.length; j += 2) o.push(n3(a*s[j] + c*s[j+1] + e) + " " + n3(b*s[j] + d*s[j+1] + f)); return o.join(" "); })()).join("");
  const strokeAttr = it => it.stroke === "none" ? `stroke="none"` : `stroke="${it.stroke}" stroke-width="${n3(Math.max(it.sw * sc, 0.01))}"${it.so < 1 ? ` stroke-opacity="${n3(it.so)}"` : ""}`
    + (it.cap !== "butt" ? ` stroke-linecap="${it.cap}"` : "") + (it.join !== "miter" ? ` stroke-linejoin="${it.join}"` : "")
    + (/^miter/.test(it.join) && it.ml !== 4 ? ` stroke-miterlimit="${n3(it.ml)}"` : "")
    + (it.dash ? ` stroke-dasharray="${it.dash.map(v => n3(v * sc)).join(" ")}"${it.doff ? ` stroke-dashoffset="${n3(it.doff * sc)}"` : ""}` : "");
  const els = cutGroups(p, p.flat, sc).map(g => {
    const it = g.it, kc = kerfPaths(p, g, M, notes);
    const dd = g.subs.map((s, i) => kc && kc[i] ? kc[i].map(q => "M" + q.map(([x, y]) => n3(x) + " " + n3(y)).join("L") + "Z").join("") : toD(s.segs)).join("");
    return g.fill
      ? `<path d="${dd}" fill="${it.fill}"${it.fo < 1 ? ` fill-opacity="${n3(it.fo)}"` : ""}${it.evenodd ? ` fill-rule="evenodd"` : ""} ${strokeAttr(it)}/>`
      : `<path d="${dd}" fill="none" ${strokeAttr(it)}/>`;
  }).map(markup => ({markup}));
  if (els.length === 1) return els[0].markup.replace("<path ", `<path id="${id}" `);
  return `<g id="${id}">${els.map(x => x.markup).join("")}</g>`;
}

/* ---------- polygon helpers ---------- */
function rdp(path, tol){
  // Ramer–Douglas–Peucker on a closed ring of {X,Y}. Its worst case is quadratic (a 40,000-tooth zigzag took 1.5 s),
  // so past a work budget no ordinary outline reaches it falls back to radial(), which is linear (#271)
  const n = path.length; if (n < 5) return path;
  let work = 0;
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (path[i].X - path[0].X) ** 2 + (path[i].Y - path[0].Y) ** 2; if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop(); const A = path[a], B = path[b % n];
    const dx = B.X - A.X, dy = B.Y - A.Y, len = Math.hypot(dx, dy) || 1;
    if ((work += b - a) > 2e7) return radial(path, tol);
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (path[i].X - A.X) - dx * (path[i].Y - A.Y)) / len; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(path[i]);
  // a ring thinner than tol collapses to a line: keep it within tol another way rather than whole, since growing a
  // 10,000-tooth zigzag by the spacing took 15 s (a 20,000-tooth one minutes) and froze the page (#271)
  return out.length >= 3 ? out : n > 64 ? radial(path, tol) : path;
}
function radial(path, tol){
  // keeps each point farther than tol from the last one kept: a point dropped is within tol of the segment from that
  // one, so the result stays within tol of the ring, as with rdp()
  const out = [path[0]], t2 = tol * tol;
  for (let i = 1; i < path.length; i++) { const l = out[out.length - 1], dx = path[i].X - l.X, dy = path[i].Y - l.Y; if (dx * dx + dy * dy > t2) out.push(path[i]); }
  return out.length >= 3 ? out : path;
}

function tangled(rings){
  // whether the lines cross each other more than TANGLE times, counted on a grid (or would take too long to count).
  // Tracing their outline costs the union about 60 µs per crossing: a DXF spline crossing itself 80,000 times froze
  // the page for minutes (#271)
  const X = [], Y = [], R = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rings.forEach((r, ri) => { const q = r.pts, n = q.length, m = r.closed ? n : n - 1;
    for (let i = 0; i < m; i++) { const a = q[i], b = q[(i + 1) % n]; if (a[0] === b[0] && a[1] === b[1]) continue;
      X.push(a[0], b[0]); Y.push(a[1], b[1]); R.push(ri);
      x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]); y0 = Math.min(y0, a[1], b[1]); y1 = Math.max(y1, a[1], b[1]); } });
  const n = R.length; if (n < 2) return false;
  // open lines are grown into thin shapes first, which costs about 160 ns for each line passing the height of each
  // turn of a line where it heads back up: a 160,000-point DXF zigzag spline took 8 s
  const lo = [], hi = [], mins = [];
  for (const r of rings) { if (r.closed) continue; const q = r.pts;
    for (let i = 0; i + 1 < q.length; i++) { lo.push(Math.min(q[i][1], q[i + 1][1])); hi.push(Math.max(q[i][1], q[i + 1][1])); }
    for (let i = 1; i + 1 < q.length; i++) if (q[i - 1][1] > q[i][1] && q[i + 1][1] >= q[i][1]) mins.push(q[i][1]); }
  if (mins.length) {
    lo.sort((a, b) => a - b); hi.sort((a, b) => a - b);
    const below = (arr, y) => { let a = 0, b = arr.length; while (a < b) { const c = (a + b) >> 1; if (arr[c] <= y) a = c + 1; else b = c; } return a; };
    let sweep = 0; for (const y of mins) if ((sweep += below(lo, y) - below(hi, y)) > SWEEP) return true;
  }
  const side = Math.ceil(Math.sqrt(n)), w = Math.max(x1 - x0, y1 - y0, 1e-9) / side * (1 + 1e-9);
  const cell = (x, y) => Math.floor((y - y0) / w) * (side + 1) + Math.floor((x - x0) / w);
  const cells = new Map(); let work = 0;
  for (let i = 0; i < n; i++) {                      // the cells a segment passes through, in steps of a cell
    const ax = X[2*i], ay = Y[2*i], dx = X[2*i+1] - ax, dy = Y[2*i+1] - ay, steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / w);
    let last = -1;
    for (let t = 0; t <= steps; t++) for (const [ex, ey] of [[0, 0], [1, 0], [0, 1]]) {
      const c = cell(ax + dx * Math.min(1, (t + ex * 0.5) / Math.max(steps, 1)), ay + dy * Math.min(1, (t + ey * 0.5) / Math.max(steps, 1)));
      if (c === last) continue; last = c;
      let l = cells.get(c); if (!l) cells.set(c, l = []); if (l[l.length - 1] !== i) l.push(i);
      if (++work > TANGLE_WORK) return true;
    }
  }
  const o = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  let k = 0;
  for (const [c, l] of cells) for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
    if (++work > TANGLE_WORK) return true;
    const i = l[a], j = l[b]; if (R[i] === R[j] && Math.abs(i - j) === 1) continue;     // neighbors share an end
    const ax = X[2*i], ay = Y[2*i], bx = X[2*i+1], by = Y[2*i+1], cx = X[2*j], cy = Y[2*j], dx = X[2*j+1], dy = Y[2*j+1];
    if (o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) >= 0 || o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) >= 0) continue;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / ((bx - ax) * (dy - cy) - (by - ay) * (dx - cx));
    if (cell(ax + t * (bx - ax), ay + t * (by - ay)) === c && ++k > TANGLE) return true;   // counted once, in its cell
  }
  return false;
}
const TANGLE = 10000, TANGLE_WORK = 2e7, SWEEP = 1e7;
function buildOutline(p){
  // union of every shape → outer contours only (holes and engraving inside are ignored), in mm centered on the part
  if (!p.rings) return;
  const toInt = r => r.pts.map(([x, y]) => ({X:Math.round((x - p.cx) * p.kx * SC), Y:Math.round((y - p.cy) * p.ky * SC)}));
  p.tangled = tangled(p.rings);
  if (p.tangled) {                                   // nested by the shape around all of it instead, with a notice
    const h = hull(p.rings.flatMap(toInt)), off = new CL.ClipperOffset(2, 0.05 * SC), res = new CL.Paths();
    off.AddPath(h, CL.JoinType.jtSquare, h.length >= 3 ? CL.EndType.etClosedPolygon : CL.EndType.etOpenSquare);
    off.Execute(res, 0.05 * SC);                     // with the allowance open lines get
    p.outers = res.filter(q => q.length >= 3).map(q => CL.Clipper.Orientation(q) ? q : q.reverse());
    p.areaMM = p.outers.reduce((s, q) => s + Math.abs(area(q)), 0) / (SC * SC);
    p.env = null;
    return;
  }
  const c = new CL.Clipper();
  const open = [];
  for (const r of p.rings) {
    const path = toInt(r);
    if (r.closed && path.length >= 3 && Math.abs(area(path)) > SC * SC * 0.01) c.AddPath(path, CL.PolyType.ptSubject, true);
    else open.push(path);
  }
  if (open.length) {
    const off = new CL.ClipperOffset(2, 0.05 * SC); off.AddPaths(open, CL.JoinType.jtSquare, CL.EndType.etOpenSquare);
    const res = new CL.Paths(); off.Execute(res, 0.05 * SC);
    c.AddPaths(res, CL.PolyType.ptSubject, true);
  }
  const tree = new CL.PolyTree();
  c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  p.outers = tree.Childs().map(n => n.Contour()).filter(q => q.length >= 3);
  p.outers.forEach(q => { if (!CL.Clipper.Orientation(q)) q.reverse(); });
  p.areaMM = p.outers.reduce((s, q) => s + Math.abs(area(q)), 0) / (SC * SC);
  p.env = null;
}
export function envelope(p){
  // outline grown by half the part spacing (+ precision allowance), simplified; complex outlines are simplified
  // harder (and grown by the same extra amount) so nesting stays fast
  if (p.env && p.env.ver === geoVer && p.env.useHoles === !!p.useHoles) return p.env;
  const MAXV = 72;
  let tol = S.prec * SC, simp;
  for (let tries = 0; tries < 8; tries++) {
    simp = p.outers.map(q => rdp(q, tol * 0.8));
    if (simp.reduce((s, q) => s + q.length, 0) <= MAXV || tol >= 2 * SC) break;
    tol *= 1.5;
  }
  simp.forEach(q => { if (!CL.Clipper.Orientation(q)) q.reverse(); });
  const off = new CL.ClipperOffset(2, tol * 0.5);
  off.AddPaths(simp, CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
  let res = new CL.Paths(); off.Execute(res, ((S.kerf + S.gap) / 2 + kerfC(p)) * SC + tol);
  res = res.filter(q => CL.Clipper.Orientation(q)).map(q => rdp(q, tol * 0.15));
  let convex = false;
  if (res.length === 1) { const h = hull(res[0]); if (area(h) - area(res[0]) <= area(h) * 0.01) { res = [h]; convex = true; } }
  const pieces = convex ? [res[0]] : res.flatMap(q => convexPieces(q));
  const holes = p.useHoles ? holeRegions(p) : [];
  p.env = {ver:geoVer, useHoles:!!p.useHoles, paths:res, pieces, convex, tol, area:res.reduce((s, q) => s + area(q), 0), holes,
    holeArea:holes.reduce((s, h) => s + h.area, 0)};
  p.shapes = new Map();
  return p.env;
}
// Parts inside holes (#3): a part's holes are its closed, unfilled inner contours at odd nesting depth (the rule kerf
// compensation uses), offered to other parts only when the user turns it on for that part, since SnugCut can't tell a
// closed cut from a closed score outline.
function holeSubs(p){
  if (!p.flat) return [];
  return cutPlan(p).filter(sub => sub.closed && sub.depth % 2 === 1 && p.flat[sub.item].fill === "none");
}
export const hasHoles = p => holeSubs(p).length > 0;
function holeFree(p, tol){
  // the free space in each hole: the hole minus everything drawn inside it, one Paths per hole, in integer mm×SC
  // centered on the part like the outline; the hole is simplified within 0.8 × tol (none when tol is 0)
  if (!p.flat) return [];
  const subs = cutPlan(p);
  const ring = sub => {   // sampled within 0.05 mm, in centered integer units
    const pts = []; let cur = null;
    const T = (x, y) => [(x - p.cx) * p.kx, (y - p.cy) * p.ky];
    for (const sg of sub.segs) {
      if (sg[0] === "M" || sg[0] === "L") { cur = T(sg[1], sg[2]); pts.push(cur); }
      else if (sg[0] === "C") { const p3 = T(sg[5], sg[6]); flattenCubic(cur, T(sg[1], sg[2]), T(sg[3], sg[4]), p3, 0.05, pts); cur = p3; }
    }
    return pts.map(([x, y]) => ({X:Math.round(x * SC), Y:Math.round(y * SC)}));
  };
  const inBB = (a, b) => a.bb[0] >= b.bb[0] && a.bb[1] >= b.bb[1] && a.bb[2] <= b.bb[2] && a.bb[3] <= b.bb[3];
  const out = [];
  for (const h of holeSubs(p)) {
    const H = tol ? rdp(ring(h), tol * 0.8) : ring(h); if (H.length < 3) continue;
    if (!CL.Clipper.Orientation(H)) H.reverse();
    const c = new CL.Clipper(); c.AddPath(H, CL.PolyType.ptSubject, true);
    for (const o of subs) {               // whatever lies inside the hole stays solid (open lines with a little width)
      if (o === h || !o.pts.length || !inBB(o, h) || !insideRing(o.pts[0], h.pts)) continue;
      const q = ring(o); if (q.length < 2) continue;
      if (o.closed && q.length >= 3) { if (!CL.Clipper.Orientation(q)) q.reverse(); c.AddPath(q, CL.PolyType.ptClip, true); }
      else { const off = new CL.ClipperOffset(2, 0.05 * SC); off.AddPath(q, CL.JoinType.jtSquare, CL.EndType.etOpenSquare);
        const r = new CL.Paths(); off.Execute(r, 0.05 * SC); r.forEach(x => c.AddPath(x, CL.PolyType.ptClip, true)); }
    }
    const free = new CL.Paths();
    c.Execute(CL.ClipType.ctDifference, free, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    out.push(free);
  }
  return out;
}
// the part's real material for the fill figures: its outline area minus the free space in its holes (#3)
export function fillMM(p){
  const k = p.kx + "," + p.ky;
  if (p.fillKey !== k) { p.fillKey = k; p.fill = p.areaMM - holeFree(p, 0).reduce((s, free) => s + free.reduce((t, q) => t + area(q), 0), 0) / (SC * SC); }
  return p.fill;
}
function holeRegions(p){
  // the free space in each hole shrunk by half the part spacing (+ the precision allowance and the kerf compensation),
  // so another part's envelope inside it keeps the full spacing to the hole's edge and to anything in it; regions may
  // have islands
  const tol = S.prec * SC, d = ((S.kerf + S.gap) / 2 + kerfC(p)) * SC + tol, out = [];
  for (const free of holeFree(p, tol)) {
    const off = new CL.ClipperOffset(2, tol * 0.5); off.AddPaths(free, CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
    const tree = new CL.PolyTree(); off.Execute(tree, -d);
    for (const n of tree.Childs()) {      // one region per outer contour, with its islands
      const paths = [n.Contour(), ...n.Childs().map(k => k.Contour())].map(q => rdp(q, tol * 0.15)).filter(q => q.length >= 3);
      if (!paths.length) continue;
      const a = paths.reduce((s2, q) => s2 + area(q), 0);
      if (a < SC * SC) continue;          // under 1 mm²: nothing fits
      out.push({paths, area:a});
    }
  }
  return out;
}
function convexPieces(poly){
  // ear-clipping triangulation, then Hertel–Mehlhorn merging into convex pieces
  const P = poly.map(v => ({X:v.X, Y:v.Y}));
  let sa = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i+1) % P.length]; sa += a.X*b.Y - b.X*a.Y; }
  if (sa < 0) P.reverse();
  const cr = (a, b, c) => (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
  const idx = P.map((_, i) => i), tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = P[ia], b = P[ib], c = P[ic], z = cr(a, b, c);
      if (z === 0) { idx.splice(k, 1); cut = true; break; }
      if (z < 0) continue;
      let inside = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const q = P[j];
        if (cr(a, b, q) >= 0 && cr(b, c, q) >= 0 && cr(c, a, q) >= 0) { inside = true; break; }
      }
      if (inside) continue;
      tris.push([ia, ib, ic]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) return [poly];            // self-intersecting or degenerate: fall back to the whole outline
  }
  if (idx.length === 3) tris.push(idx.slice());
  let pcs = tris;
  const convexIdx = r => { for (let i = 0; i < r.length; i++) if (cr(P[r[i]], P[r[(i+1) % r.length]], P[r[(i+2) % r.length]]) < 0) return false; return true; };
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < pcs.length; i++) for (let j = i + 1; j < pcs.length; j++) {
      const A = pcs[i], B = pcs[j];
      for (let a = 0; a < A.length; a++) {
        const u = A[a], v = A[(a + 1) % A.length];
        const b = B.indexOf(v);
        if (b < 0 || B[(b + 1) % B.length] !== u) continue;
        const Ar = A.slice(a + 1).concat(A.slice(0, a + 1));       // v ... u
        const Br = B.slice(b + 1).concat(B.slice(0, b + 1));       // u ... v
        const m = Ar.concat(Br.slice(1, -1));
        if (convexIdx(m)) { pcs.splice(j, 1); pcs[i] = m; merged = true; break outer; }
      }
    }
  }
  return pcs.map(r => r.map(i => P[i]));
}
/* ---------- nesting core ----------
   Shapes, no-fit polygons, placement, packing and the order search. Self-contained (it uses only its arguments and
   the global performance), because the search worker (#4) runs this same function from its source text: CL is
   clipper-lib, SC the integer units per mm, and hooks give what the page works out from the imported file
   (envOf(p): the part's envelope, kerfOf(p): its kerf compensation, fillOf(p): its real material, ver(): the geometry
   version). */
function nestCore(CL, SC, hooks){
  const area = path => CL.Clipper.Area(path);
  function hull(pts){
    const P = pts.slice().sort((a, b) => a.X - b.X || a.Y - b.Y);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1));
    if (!CL.Clipper.Orientation(h)) h.reverse();
    return h;
  }
  function bounds(paths){
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of paths) for (const q of p) { if (q.X < a) a = q.X; if (q.Y < b) b = q.Y; if (q.X > c) c = q.X; if (q.Y > d) d = q.Y; }
    return {minX:a, minY:b, maxX:c, maxY:d};
  }
  function holeFit(A, hi, B){
    // where B's origin may go so that B's envelope lies wholly inside hole region hi of A (A at the origin): the region
    // moved by −(a vertex of each of B's outlines), minus every position where B touches the region's edges. Exact for
    // B's convex pieces: B meets an edge exactly when its origin is in edge ⊕ (−piece).
    const key = A.key + "#" + hi + "|" + B.key;
    let r = nfpCache.get(key);
    if (r) return r;
    const R = A.holes[hi];
    r = [];
    if (R.maxX - R.minX >= B.maxX - B.minX && R.maxY - R.minY >= B.maxY - B.minY) {
      let base = R.paths;
      for (const q of B.paths) {
        const v = q[0], c = new CL.Clipper(), moved = R.paths.map(path => path.map(u => ({X:u.X - v.X, Y:u.Y - v.Y})));
        if (base === R.paths) { base = moved; continue; }
        c.AddPaths(base, CL.PolyType.ptSubject, true); c.AddPaths(moved, CL.PolyType.ptClip, true);
        base = new CL.Paths(); c.Execute(CL.ClipType.ctIntersection, base, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
      }
      const c = new CL.Clipper(); c.AddPaths(base, CL.PolyType.ptSubject, true);
      for (const path of R.paths) for (let i = 0; i < path.length; i++) {
        const e0 = path[i], e1 = path[(i + 1) % path.length];
        for (const pb of B.pieces) { const pts = []; for (const b of pb) pts.push({X:e0.X - b.X, Y:e0.Y - b.Y}, {X:e1.X - b.X, Y:e1.Y - b.Y});
          c.AddPath(hull(pts), CL.PolyType.ptClip, true); }
      }
      r = new CL.Paths(); c.Execute(CL.ClipType.ctDifference, r, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    }
    return cacheSet(key, r);
  }
  function shape(p, ang){
    const env = hooks.envOf(p);
    let s = p.shapes.get(ang);
    if (s) return s;
    const r = ang * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    const rot = q => ang === 0 ? q : q.map(v => ({X:Math.round(v.X*co - v.Y*si), Y:Math.round(v.X*si + v.Y*co)}));
    const paths = env.paths.map(rot);
    // bounds of the part's real cut outline (moved out by the kerf when compensated): what has to stay inside the margins
    const tb = bounds(p.outers.map(rot)), k = hooks.kerfOf(p) * SC;
    const cut = {minX:tb.minX - k, minY:tb.minY - k, maxX:tb.maxX + k, maxY:tb.maxY + k};
    const holes = env.holes.map(h => { const ps = h.paths.map(rot); return {paths:ps, ...bounds(ps)}; });
    s = {key:`${p.uid}:${ang}:${hooks.ver()}${env.useHoles ? "h" : ""}`, part:p, ang, paths, pieces:env.pieces.map(rot), convex:env.convex, area:env.area,
      holes, holeArea:env.holeArea, cut, ...bounds(paths)};
    p.shapes.set(ang, s);
    return s;
  }
  // A ⊕ (−B) for convex pieces in O(n + m) by merging their edges by angle, returned exactly as hull() would return the
  // hull of every a − b (strictly convex, counterclockwise, from the lowest-x, then lowest-y vertex), so layouts don't
  // change. null when a piece isn't convex (the whole-outline fallback of convexPieces): hull() handles it.
  function convexSum(pa, pb){
    const prep = poly => {                   // counterclockwise, no repeated or collinear vertices; null if not convex
      const q = []; for (const v of poly) { const l = q[q.length - 1]; if (!l || l.X !== v.X || l.Y !== v.Y) q.push(v); }
      while (q.length > 1 && q[0].X === q[q.length - 1].X && q[0].Y === q[q.length - 1].Y) q.pop();
      let neg = false, pos = false; const out = [];
      for (let i = 0; i < q.length; i++) { const a = q[(i + q.length - 1) % q.length], b = q[i], c = q[(i + 1) % q.length];
        const z = (b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X); if (z > 0) pos = true; else if (z < 0) neg = true; if (z) out.push(b); }
      if (pos && neg) return null;
      if (neg) out.reverse();
      return out.length >= 3 ? out : null;
    };
    const A = prep(pa), B = prep(pb && pb.map(v => ({X:-v.X, Y:-v.Y})));
    if (!A || !B) return null;
    const low = P => { let k = 0; for (let i = 1; i < P.length; i++) if (P[i].Y < P[k].Y || (P[i].Y === P[k].Y && P[i].X < P[k].X)) k = i; return P.slice(k).concat(P.slice(0, k)); };
    const P = low(A), Q = low(B), n = P.length, m = Q.length, out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      const a = P[i % n], b = Q[j % m]; out.push({X:a.X + b.X, Y:a.Y + b.Y});
      const ea = {X:P[(i + 1) % n].X - a.X, Y:P[(i + 1) % n].Y - a.Y}, eb = {X:Q[(j + 1) % m].X - b.X, Y:Q[(j + 1) % m].Y - b.Y};
      const z = i >= n ? -1 : j >= m ? 1 : ea.X * eb.Y - ea.Y * eb.X;
      if (z > 0) i++; else if (z < 0) j++; else { i++; j++; }
    }
    const r = prep(out); if (!r) return null;
    let k = 0; for (let t = 1; t < r.length; t++) if (r[t].X < r[k].X || (r[t].X === r[k].X && r[t].Y < r[k].Y)) k = t;
    return r.slice(k).concat(r.slice(0, k));
  }
  const nfpCache = new Map(), NFP_MAX = 80000;
  // a full cache drops its oldest quarter, not everything: a big mixed job needs more pairs than fit, and clearing it all
  // made every pack rebuild most of them
  // Entries are kept as flat Int32Arrays (x, y, x, y…), one object per polygon instead of one per point: a full cache of
  // {X,Y} objects made garbage collection pause the page for up to a second.
  function cacheSet(key, r){
    if (nfpCache.size >= NFP_MAX) { let n = NFP_MAX >> 2; for (const k of nfpCache.keys()) { nfpCache.delete(k); if (!--n) break; } }
    const packed = r.map(q => { const a = new Int32Array(q.length * 2); q.forEach((v, i) => { a[2*i] = v.X; a[2*i + 1] = v.Y; }); return a; });
    nfpCache.set(key, packed);
    return packed;
  }
  const unpack = (a, dx = 0, dy = 0) => { const q = new Array(a.length >> 1); for (let i = 0; i < q.length; i++) q[i] = {X:a[2*i] + dx, Y:a[2*i + 1] + dy}; return q; };
  function nfp(A, B){
    // region where B's origin may NOT go when A sits at the origin: A ⊕ (−B), built from convex piece pairs
    const key = A.key + "|" + B.key;
    let r = nfpCache.get(key);
    if (r) return r;
    const sum = (pa, pb) => convexSum(pa, pb) || hull(pa.flatMap(a => pb.map(b => ({X:a.X - b.X, Y:a.Y - b.Y}))));
    if (A.pieces.length === 1 && B.pieces.length === 1) r = [sum(A.pieces[0], B.pieces[0])];
    else {
      const c = new CL.Clipper();
      for (const pa of A.pieces) for (const pb of B.pieces) c.AddPath(sum(pa, pb), CL.PolyType.ptSubject, true);
      r = new CL.Paths();
      c.Execute(CL.ClipType.ctUnion, r, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    }
    return cacheSet(key, r);
  }
  function bestPos(bin, Bs, F){
    // the margins are checked against the real cut outline, not the envelope: simplification can leave the envelope up
    // to 0.95 × the precision inside the outline, which let cuts reach into the margin (#72)
    let xMin = F.mL - Bs.cut.minX, xMax = F.mR - Bs.cut.maxX, yMin = F.mT - Bs.cut.minY, yMax = F.mB - Bs.cut.maxY;
    if (xMin > xMax || yMin > yMax) return null;
    if (xMax - xMin < 2) xMax = xMin + 2;
    if (yMax - yMin < 2) yMax = yMin + 2;
    const ifp = [{X:xMin, Y:yMin}, {X:xMax, Y:yMin}, {X:xMax, Y:yMax}, {X:xMin, Y:yMax}];
    let region;
    if (!bin.items.length) region = [ifp];
    else {
      const c = new CL.Clipper();
      c.AddPath(ifp, CL.PolyType.ptSubject, true);
      for (const it of bin.items) {
        // skip neighbors that can't reach the inner-fit rectangle
        if (it.x + it.s.maxX - Bs.minX < xMin || it.x + it.s.minX - Bs.maxX > xMax || it.y + it.s.maxY - Bs.minY < yMin || it.y + it.s.minY - Bs.maxY > yMax) continue;
        let block = nfp(it.s, Bs);
        if (it.s.holes.length) {            // the neighbor's holes, where Bs fits inside them, are open (#3)
          const fits = it.s.holes.flatMap((_, hi) => holeFit(it.s, hi, Bs));
          if (fits.length) { const d = new CL.Clipper(); d.AddPaths(block.map(q => unpack(q)), CL.PolyType.ptSubject, true); d.AddPaths(fits.map(q => unpack(q)), CL.PolyType.ptClip, true);
            block = new CL.Paths(); d.Execute(CL.ClipType.ctDifference, block, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero); }
        }
        for (const q of block) c.AddPath(q instanceof Int32Array ? unpack(q, it.x, it.y) : q.map(v => ({X:v.X + it.x, Y:v.Y + it.y})), CL.PolyType.ptClip, true);
      }
      region = new CL.Paths();
      c.Execute(CL.ClipType.ctDifference, region, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    }
    let best = null;
    const bb = bin.bb;
    for (const path of region) for (const v of path) {
      const x0 = Math.min(bb.x0, v.X + Bs.minX), y0 = Math.min(bb.y0, v.Y + Bs.minY), x1 = Math.max(bb.x1, v.X + Bs.maxX), y1 = Math.max(bb.y1, v.Y + Bs.maxY);
      const sc = (x1 - x0) / SC * ((y1 - y0) / SC) + (v.Y + v.X * 0.5) / SC * 1e-3;
      if (!best || sc < best.sc) best = {x:v.X, y:v.Y, sc};
    }
    return best;
  }
  function newBin(){ return {items:[], area:0, fill:0, envArea:0, bb:{x0:Infinity, y0:Infinity, x1:-Infinity, y1:-Infinity}}; }
  function addTo(bin, s, pos){
    bin.items.push({s, x:pos.x, y:pos.y});
    // area scores the search: whole outlines, a part nested in a hole adding nothing. fill is for the figures shown: real
    // material, so a hole counts as empty until a part is nested in it, and then only that part counts (#3)
    if (s.holes.length) bin.holey = true;
    if (!bin.holey || container(bin.items, bin.items.length - 1) == null) bin.area += s.part.areaMM;
    bin.fill += hooks.fillOf(s.part);
    bin.envArea += s.area - s.holeArea;
    const b = bin.bb; b.x0 = Math.min(b.x0, pos.x + s.minX); b.y0 = Math.min(b.y0, pos.y + s.minY); b.x1 = Math.max(b.x1, pos.x + s.maxX); b.y1 = Math.max(b.y1, pos.y + s.maxY);
  }
  async function pack(items, order, angPick, F, pause){
    // pause() is awaited about every 30 ms: it lets the page (or the worker's messages) in, and throws to stop the pack
    const bins = []; let last = performance.now();
    const frameA = (F.R - F.L) * (F.B - F.T);
    // also between rotations: one part at 24 angles against one bin (holes on) ran over a second without a pause (#148)
    const breathe = async () => { if (performance.now() - last > 30) { await pause(); last = performance.now(); } };
    for (const i of order) {
      const it = items[i]; let done = false;
      const angs = angPick(it);
      for (const bin of bins) {
        if (frameA - bin.envArea < it.envArea * 0.98) continue;
        // a shape that found no place in this plate finds none again while the plate is unchanged, so its later copies
        // skip it: bestPos is pure, so the layout is the same, only without repeating the plate's whole difference
        const full = bin.full || (bin.full = new Map());
        let best = null;
        for (const a of angs) {
          const s = shape(it.part, a);
          if (full.get(s.key) !== bin.items.length) {
            const pos = bestPos(bin, s, F);
            if (!pos) full.set(s.key, bin.items.length);
            else if (!best || pos.sc < best.pos.sc) best = {s, pos};
          }
          await breathe();
        }
        if (best) { addTo(bin, best.s, best.pos); done = true; break; }
        await breathe();
      }
      if (!done) {
        const bin = newBin(); let best = null;
        for (const a of angs) { const s = shape(it.part, a); const pos = bestPos(bin, s, F); if (pos && (!best || pos.sc < best.pos.sc)) best = {s, pos}; await breathe(); }
        if (best) { addTo(bin, best.s, best.pos); bins.push(bin); }
      }
      await breathe();
    }
    return bins;
  }
  function score(bins, plateA){ let sq = 0; for (const b of bins) { const u = b.area / plateA; sq += u*u; } return [bins.length, -sq]; }
  const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-9);
  function container(items, j){
    // the part whose hole item j was placed in (the innermost one), or null: its cuts must all come first (#3)
    const B = items[j], v = B.s.paths[0][0], pt = {X:v.X + B.x, Y:v.Y + B.y};
    // within this many units of an edge counts as on it: the vertex can land a fraction of a unit past it from rounding
    const TOL = 4, near = (q, r) => r.some((a, k) => {
      const b = r[(k + 1) % r.length], dx = b.X - a.X, dy = b.Y - a.Y, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dy) / l)) : 0;
      return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dy) <= TOL;
    });
    let best = null, bestA = Infinity;
    items.forEach((A, i) => {
      if (i === j) return;
      A.s.holes.forEach(h => {
        const q = {X:pt.X - A.x, Y:pt.Y - A.y}, [outer, ...islands] = h.paths;
        // the vertex usually lies on the hole region's edge (placements are its vertices), so the edge counts as inside
        // (#151); only a point strictly inside an island is out, and a vertex rounded just past either edge stays on it (#259)
        if ((CL.Clipper.PointInPolygon(q, outer) === 0 && !near(q, outer))
          || islands.some(r => CL.Clipper.PointInPolygon(q, r) === 1 && !near(q, r))) return;
        const a = area(outer); if (a < bestA) { bestA = a; best = i; }
      });
    });
    return best;
  }
  // the search's random numbers (mulberry32), seeded with 7; the state is st.seed, so a search can be continued later,
  // in this thread or another
  // one step of mulberry32 from state s: [next state, number in [0, 1)]
  function m32(s){ s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return [s, ((t ^ t >>> 14) >>> 0) / 4294967296]; }
  function rand(st){ const [s, v] = m32(st.seed | 0); st.seed = s; return v; }
  // the same numbers from a seed, as a function (Bounding box mode's search)
  function mulberry(seed){ return () => { const [s, v] = m32(seed | 0); seed = s; return v; }; }
  // The order search: the sorted starting orders still pending, then a random walk of 1–3 swaps or moves from the best
  // order, each try kept when it is no worse. st ({pending, seed, bestOrder, bestScore, tried}) is updated as it goes, so
  // the caller can continue the search. o: {items, F, plateA, minPlates, ms, t0, angPick, pause, onBest(bins, score),
  // onStep(), onDraw()}.
  async function searchLoop(st, o){
    const {items, F, plateA, minPlates, ms, t0, angPick, pause} = o;
    while (st.pending.length) {
      // the time limit covers the starting packs too: on a big job at fine steps one pack can take longer than the
      // whole search, so the second is skipped once a layout exists and the time is up (#234). ms 0 packs both
      if (st.bestScore && ms && performance.now() - t0 >= ms) { st.pending = []; break; }
      const order = st.pending.shift();
      const bins = await pack(items, order, angPick, F, pause);
      st.tried++;
      const sc = score(bins, plateA);
      if (!st.bestScore || better(sc, st.bestScore)) { st.bestOrder = order; st.bestScore = sc; o.onBest(bins, sc); }
      o.onStep();
    }
    if (items.length < 2) return;
    let cur = st.bestOrder, curScore = st.bestScore;
    while (performance.now() - t0 < ms) {
      if (st.bestScore[0] <= minPlates && st.bestScore[0] === 1) break;
      const ord = cur.slice(), n = ord.length;
      const moves = 1 + Math.floor(rand(st) * 3);
      for (let m = 0; m < moves; m++) {
        const a = Math.floor(rand(st) * n), b = Math.floor(rand(st) * n);
        if (rand(st) < 0.5) [ord[a], ord[b]] = [ord[b], ord[a]]; else { const [x] = ord.splice(a, 1); ord.splice(b, 0, x); }
      }
      if (o.onDraw) o.onDraw();
      const bins = await pack(items, ord, angPick, F, pause);
      st.tried++;
      const sc = score(bins, plateA);
      if (!better(curScore, sc)) { cur = ord; curScore = sc; }
      if (better(sc, st.bestScore)) { st.bestOrder = ord; st.bestScore = sc; o.onBest(bins, sc); }
      o.onStep();
    }
  }
  return {area, hull, bounds, shape, newBin, addTo, container, score, better, searchLoop, mulberry};
}
const core = nestCore(CL, SC, {envOf:p => envelope(p), kerfOf:p => kerfC(p), fillOf:p => fillMM(p), ver:() => geoVer});
const {area, hull, container} = core;
export const {shape, score, better, mulberry} = core;

/* ---------- placement ---------- */
// how far compensated cuts move out from the drawn outline; 0 for parts kept as original markup (text, images, effects),
// which both exports write as drawn, so nesting gives them no compensation allowance either. kerfC() = compensation on.
export const kerfC = p => S.comp && !(p && (p.precomp || !p.flat)) ? S.kerf / 2 : 0;
export function binFrame(){
  // mL…mB: the margin lines, which each part's real cut outline must stay inside (#72). L…B: the same box grown by the
  // envelope's nominal overhang (half spacing + precision), used only to estimate how many plates are needed.
  const half = (S.kerf + S.gap) / 2, tol = S.prec;
  return {L:(S.margin - half - tol) * SC, T:(S.margin - half - tol) * SC, R:(S.plateW - S.margin + half + tol) * SC, B:(S.plateH - S.margin + half + tol) * SC,
    mL:S.margin * SC, mT:S.margin * SC, mR:(S.plateW - S.margin) * SC, mB:(S.plateH - S.margin) * SC};
}
export const ABORT = {};
let runToken = 0;
export const newRun = () => ++runToken;     // a new run; older runs' packs stop at their next yield
export const isCurrent = token => token === runToken;
// yield to the page between pack chunks. The ~4 ms that nested setTimeout(0) idles is what lets the page paint: an
// unclamped yield (a message) left it painting about twice a second during a search (#146)
const tick = () => new Promise(r => setTimeout(r, 0));
export const angleList = p => {
  if (p.lock || !S.rotStep) return [0];
  const out = []; for (let a = 0; a < 360; a += S.rotStep) out.push(a); return out;
};
/* both modes produce plates of placements: {part, x, y (mm), ang (deg), rx, ry (anchor, user units), env (preview polygons, mm)} */
export function toPlates(bins){
  return bins.map(b => ({area:b.fill, items:b.items.map((it, j) => ({part:it.s.part, x:it.x / SC, y:it.y / SC, ang:it.s.ang, rx:it.s.part.cx, ry:it.s.part.cy,
    env:it.s.paths.map(q => q.map(v => [(v.X + it.x) / SC, (v.Y + it.y) / SC])), in:container(b.items, j)}))}));
}

/* ---------- search worker (#4) ----------
   The order search runs in a Web Worker, so the page doesn't freeze and the search needn't pause for it. The worker is
   built from a Blob: clipper-lib's text, fetched with the page's own SRI hash (CSP connect-src), then nestCore and
   searchWorker from their source. It gets each part's envelope and figures, and answers with placements
   (uid, angle, x, y), which the page turns back into plates with the same core, so the layouts and exports are the
   ones the page would have made itself. Where a worker can't be had (an older browser, a stricter CSP, clipper-lib not
   fetchable), the search runs on the page as before. */
function searchWorker(self, nestCore, SC){
  const ABORT = {};
  let ver = 0, current = 0;
  const core = nestCore(self.ClipperLib, SC, {envOf:p => p.env, kerfOf:p => p.kerf, fillOf:p => p.fill, ver:() => ver});
  // a pause is a message, not setTimeout: with no page to paint, the worker needn't idle the ~4 ms of a nested
  // setTimeout(0) (#146); it only has to let a stop or a newer run in
  const ch = new MessageChannel(), wake = [];
  ch.port1.onmessage = () => wake.shift()();
  const pause = id => () => new Promise(r => { wake.push(r); ch.port2.postMessage(0); }).then(() => { if (current !== id) throw ABORT; });
  self.onmessage = async e => {
    const m = e.data;
    if (m.type === "stop") { if (current === m.id) current = 0; return; }
    if (m.type !== "run") return;
    current = m.id; ver = m.ver;
    const parts = new Map(m.parts.map(p => [p.uid, Object.assign(p, {shapes:new Map()})]));
    const items = m.items.map(([uid, envArea]) => ({part:parts.get(uid), envArea}));
    const st = m.st, post = (type, more) => self.postMessage({type, id:m.id, st, ...more});
    try {
      await core.searchLoop(st, {items, F:m.F, plateA:m.plateA, minPlates:m.minPlates, ms:m.ms, t0:performance.now() - m.elapsed,
        angPick:it => it.part.angs, pause:pause(m.id), onDraw:() => post("draw"), onStep:() => post("step"),
        onBest:(bins, score) => post("best", {score, bins:bins.map(b => b.items.map(it => [it.s.part.uid, it.s.ang, it.x, it.y]))})});
      post("done");
    } catch(err) { if (err !== ABORT) post("error", {message:String(err && err.message || err)}); }
  };
  self.postMessage({type:"ready"});
}
// The search workers (#4): one, or the pool of 2–4 the user picks (S.pool, #253). Each worker holds its own cache of
// part pairs (about 100 MB on 120 mixed parts), so the pool is off unless the user turns it on.
const poolSize = () => Math.min(Math.max(S.pool | 0, 1), 4);
let srcP = null, pool = [], broken = false, workersQ = Promise.resolve(null), workerRun = 0, clipperSrc = null;
function workerSource(){
  // clipper-lib's text, fetched with the page's own SRI hash, and the search code: or null where that fails
  return srcP || (srcP = (async () => {
    try {
      if (typeof Worker !== "function" || !CL || !clipperSrc) return null;
      const res = await fetch(clipperSrc.url, clipperSrc.integrity ? {integrity:clipperSrc.integrity} : {});
      // the app's own code runs strict in the worker too, as in the page (#289); clipper-lib before it stays as it is
      return res.ok ? `${await res.text()}\n;(function(){ "use strict"; (${searchWorker})(self, ${nestCore}, ${SC}); })();\n` : null;
    } catch(e) { return null; }
  })());
}
function spawn(src){
  // a worker that has said it's ready, or null
  return new Promise(resolve => {
    let w, url, t;
    const done = ok => { clearTimeout(t); URL.revokeObjectURL(url); w.onmessage = w.onerror = null; if (!ok) w.terminate(); resolve(ok ? w : null); };
    try { url = URL.createObjectURL(new Blob([src], {type:"text/javascript"})); w = new Worker(url); }
    catch(e) { if (url) URL.revokeObjectURL(url); resolve(null); return; }
    t = setTimeout(() => done(false), 10000);
    w.onmessage = e => { if (e.data && e.data.type === "ready") done(true); };
    w.onerror = () => done(false);
  });
}
function getWorkers(){
  // resolves to as many workers as the setting asks for, or null to search on the page; one call at a time
  return workersQ = workersQ.then(async () => {
    if (broken) return null;
    const src = await workerSource();
    if (!src) return null;
    const n = poolSize();
    while (pool.length > n) pool.pop().terminate();      // a smaller pool: the others are closed, freeing their memory
    if (!pool.length) {                                  // the first shows whether workers can run here at all (CSP, browser)
      const w = await spawn(src);
      if (!w) { broken = true; return null; }
      pool.push(w);
    }
    if (pool.length < n) pool.push(...(await Promise.all(Array.from({length:n - pool.length}, () => spawn(src)))).filter(Boolean));
    return pool.slice();
  }, () => null);
}
// start building the workers early, while the page loads. src = {url, integrity}: where the page loaded clipper-lib
// from, and its SRI hash, which the worker loads it with; the library doesn't look for it in the page (#295). Without
// it, the search runs on the page.
export const startWorker = src => { if (src && src.url) clipperSrc = {url:String(src.url), integrity:String(src.integrity || "")}; getWorkers(); };
// One search in one worker: st is that search's state, updated from the worker's messages
const live = new Set();     // the running inWorker() calls, by their fail()
function inWorker(w, st, o, parts, byUid){
  const id = ++workerRun;
  return new Promise((resolve, reject) => {
    const end = () => { clearInterval(watch); w.removeEventListener("message", on); w.removeEventListener("error", bad); live.delete(fail); };
    const fail = err => { end(); reject(err); };
    // Stop and newer runs only bump the run token: tell the worker, and let the caller go at once. o.enough() ends
    // this search early without failing the run
    const watch = setInterval(() => {
      if (o.token !== runToken) { w.postMessage({type:"stop", id}); end(); reject(ABORT); }
      else if (o.enough && o.enough()) { w.postMessage({type:"stop", id}); end(); resolve(); }
    }, 50);
    // a worker that fails takes the pool down: every search still running in it is ended too, or its 50 ms watch and
    // listeners would stay until the next run (#288)
    const bad = e => { const err = new Error(e.message || "search worker failed"); broken = true; pool.forEach(x => x.terminate()); pool = []; [...live].forEach(f => f(err)); };
    const on = e => {
      const m = e.data;
      if (m.id !== id || o.token !== runToken) return;
      Object.assign(st, m.st);
      if (m.type === "best") o.onBest(m.bins.map(b => { const bin = core.newBin(); for (const [uid, ang, x, y] of b) core.addTo(bin, shape(byUid.get(uid), ang), {x, y}); return bin; }), m.score);
      else if (m.type === "step") o.onStep();
      else if (m.type === "draw") { if (o.onDraw) o.onDraw(); }
      else if (m.type === "done") { end(); resolve(); }
      else if (m.type === "error") { end(); reject(new Error(m.message)); }
    };
    w.addEventListener("message", on); w.addEventListener("error", bad); live.add(fail);
    w.postMessage({type:"run", id, ver:geoVer, parts, items:o.items.map(it => [it.part.uid, it.envArea]), F:o.F, plateA:o.plateA, minPlates:o.minPlates,
      ms:o.ms, elapsed:performance.now() - o.t0, st});
  });
}
// Search the order of items (st and o as in the core's searchLoop, plus o.token: the run, see newRun). Resolves when
// the search ends; rejects with ABORT when a newer run or Stop replaces it.
// With a pool, the sorted starting orders are packed side by side, one per worker, and the first one is kept on a tie,
// as when they ran one after the other. Then every worker walks from the best order, worker i with its own seed (worker
// 0 with st.seed, so it repeats the single search's tries). A better layout from any of them is shown; on an equal
// score the lower worker wins, so the result doesn't depend on which message comes first. st.walkers keeps each
// worker's seed and st.bestBy which worker's layout is shown, so "Search more" continues all of them.
export async function searchParts(st, o){
  const ws = await getWorkers();
  if (o.token !== runToken) throw ABORT;
  if (!ws) return core.searchLoop(st, {...o, angPick:it => angleList(it.part), pause:async () => { await tick(); if (o.token !== runToken) throw ABORT; }});
  const byUid = new Map(o.items.map(it => [it.part.uid, it.part]));
  const parts = [...byUid.values()].map(p => ({uid:p.uid, outers:p.outers, areaMM:p.areaMM, fill:fillMM(p), kerf:kerfC(p), angs:angleList(p), env:envelope(p)}));
  if (ws.length === 1) return inWorker(ws[0], st, o, parts, byUid);
  const take = (sc, by, order, bins) => {
    if (st.bestScore && !better(sc, st.bestScore) && (better(st.bestScore, sc) || by >= st.bestBy)) return;
    st.bestOrder = order; st.bestScore = sc; st.bestBy = by; o.onBest(bins, sc);
  };
  if (st.pending.length) {
    // an order leaves st.pending only once its pack has finished: one stopped by Stop or the time limit is packed
    // again by Search more, as with one worker (#270)
    const firsts = st.pending.slice(0, ws.length);
    await Promise.all(firsts.map((order, i) => {
      const sub = {pending:[order], seed:0, bestOrder:null, bestScore:null, tried:0};
      const settle = () => { const k = st.pending.indexOf(order); if (!sub.pending.length && k >= 0) st.pending.splice(k, 1); };
      // the time limit covers these packs too (#234): once one has given a layout and the time is up, the rest stop
      return inWorker(ws[i], sub, {...o, ms:0, onBest:(bins, sc) => take(sc, i, order, bins), onStep:() => { st.tried++; o.onStep(); },
        enough:() => !!st.bestScore && !!o.ms && performance.now() - o.t0 >= o.ms}, parts, byUid).then(settle, e => { settle(); throw e; });
    }));
    st.bestBy = 0;      // every walker starts from this order
  }
  if (o.items.length < 2) return;
  st.walkers = st.walkers || ws.map((_, i) => ({seed:i ? 7 + i : st.seed}));
  await Promise.all(ws.map((w, i) => {
    const wk = st.walkers[i] || (st.walkers[i] = {seed:7 + i});
    const sub = {pending:[], seed:wk.seed, bestOrder:st.bestOrder, bestScore:st.bestScore, tried:0};
    let seen = 0;
    const sync = () => { wk.seed = sub.seed; if (!i) st.seed = sub.seed; st.tried += sub.tried - seen; seen = sub.tried; };
    return inWorker(w, sub, {...o, onBest:(bins, sc) => { sync(); take(sc, i, sub.bestOrder, bins); }, onStep:() => { sync(); o.onStep(); }, onDraw:sync}, parts, byUid);
  }));
}

/* ---------- bounding-box mode: MaxRects packing ---------- */
const EPS = 1e-7;
class RectBin {
  constructor(W, H){ this.W = W; this.H = H; this.free = [{x:0,y:0,w:W,h:H}]; this.used = []; this.area = 0; }
  find(w, h, canRot, heur){
    let best = null;
    const tryIt = (f, ww, hh, rot) => {
      if (ww > f.w + EPS || hh > f.h + EPS) return;
      let s1, s2;
      const lw = f.w - ww, lh = f.h - hh;
      if (heur === 0) { s1 = Math.min(lw, lh); s2 = Math.max(lw, lh); }        // best short side
      else if (heur === 1) { s1 = Math.max(lw, lh); s2 = Math.min(lw, lh); }   // best long side
      else if (heur === 2) { s1 = f.w*f.h - ww*hh; s2 = Math.min(lw, lh); }    // best area
      else { s1 = f.y + hh; s2 = f.x; }                                        // bottom-left
      if (!best || s1 < best.s1 - EPS || (Math.abs(s1 - best.s1) <= EPS && s2 < best.s2)) best = {x:f.x, y:f.y, w:ww, h:hh, rot, s1, s2};
    };
    for (const f of this.free) { tryIt(f, w, h, false); if (canRot && Math.abs(w - h) > EPS) tryIt(f, h, w, true); }
    return best;
  }
  place(n){
    const out = [];
    for (const f of this.free) {
      if (n.x >= f.x + f.w - EPS || n.x + n.w <= f.x + EPS || n.y >= f.y + f.h - EPS || n.y + n.h <= f.y + EPS) { out.push(f); continue; }
      if (n.x > f.x + EPS) out.push({x:f.x, y:f.y, w:n.x - f.x, h:f.h});
      if (n.x + n.w < f.x + f.w - EPS) out.push({x:n.x + n.w, y:f.y, w:f.x + f.w - n.x - n.w, h:f.h});
      if (n.y > f.y + EPS) out.push({x:f.x, y:f.y, w:f.w, h:n.y - f.y});
      if (n.y + n.h < f.y + f.h - EPS) out.push({x:f.x, y:n.y + n.h, w:f.w, h:f.y + f.h - n.y - n.h});
    }
    this.free = out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS && (j < i || !(Math.abs(a.x-b.x)<EPS && Math.abs(a.y-b.y)<EPS && Math.abs(a.w-b.w)<EPS && Math.abs(a.h-b.h)<EPS))));
    this.used.push(n);
  }
}
function rectPackOnce(items, order, heur, W, H){
  const bins = [];
  for (const i of order) {
    const it = items[i]; let done = false;
    for (const b of bins) { const r = b.find(it.w, it.h, it.rot, heur); if (r) { r.item = it; b.place(r); b.area += it.area; done = true; break; } }
    if (!done) { const b = new RectBin(W, H); const r = b.find(it.w, it.h, it.rot, heur); r.item = it; b.place(r); b.area += it.area; bins.push(b); }
  }
  return bins;
}

export function computeRectLayout(parts){
  const s = S.kerf + S.gap;
  const W = S.plateW - 2*S.margin + s, H = S.plateH - 2*S.margin + s;
  const items = [], oversize = [];
  for (const p of parts) {
    if (!p.qty) continue;
    if (!rectFits(p)) { oversize.push(p); continue; }
    for (let k = 0; k < p.qty; k++) items.push({part:p, w:p.wMM + s + 2*kerfC(p), h:p.hMM + s + 2*kerfC(p), area:p.wMM*p.hMM, rot:S.rotate && !p.lock});
  }
  const noArea = S.plateW - 2*S.margin <= 0 || S.plateH - 2*S.margin <= 0;
  if (!items.length || W <= 0 || H <= 0) return {plates:[], oversize, minPlates:0, noArea};
  const plateA = S.plateW * S.plateH;
  const keys = [it => it.w*it.h, it => Math.max(it.w, it.h), it => it.h, it => it.w, it => it.w + it.h];
  let best = null, bestScore = null, bestOrder = null;
  const idx = items.map((_, i) => i);
  for (const key of keys) {
    const order = [...idx].sort((a, b) => key(items[b]) - key(items[a]));
    for (let h = 0; h < 4; h++) {
      const bins = rectPackOnce(items, order, h, W, H), sc = score(bins, plateA);
      if (!best || better(sc, bestScore)) { best = bins; bestScore = sc; bestOrder = {order, h}; }
    }
  }
  // local search: perturb the best ordering for a short, fixed budget
  const rnd = mulberry(1234), t0 = performance.now(), budget = items.length > 1 ? 350 : 0;
  let cur = bestOrder.order, curH = bestOrder.h;
  while (performance.now() - t0 < budget) {
    const o = cur.slice(), n = o.length, a = Math.floor(rnd()*n), b = Math.floor(rnd()*n);
    [o[a], o[b]] = [o[b], o[a]];
    const h = rnd() < 0.8 ? curH : Math.floor(rnd()*4);
    const bins = rectPackOnce(items, o, h, W, H), sc = score(bins, plateA);
    if (!better(bestScore, sc)) { cur = o; curH = h; if (better(sc, bestScore)) { best = bins; bestScore = sc; } }
  }
  const padA = items.reduce((a, it) => a + it.w*it.h, 0);
  // plate area for the fill figures = the parts' real material (outline minus holes), as in True shape mode; the packing
  // above still scores whole rectangles, since that's the space they take (#130, #3)
  const plates = best.map(b => ({area:b.used.reduce((a, u) => a + fillMM(u.item.part), 0), items:b.used.map(u => {
    const p = u.item.part, x = S.margin + kerfC(p) + u.x, y = S.margin + kerfC(p) + u.y, w = u.rot ? p.hMM : p.wMM, h = u.rot ? p.wMM : p.hMM;
    return {part:p, x:u.rot ? x + p.hMM : x, y, ang:u.rot ? 90 : 0, rx:p.bbox.x, ry:p.bbox.y, env:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]]};
  })}));
  return {plates, oversize, minPlates:Math.ceil(padA / (W*H) - 1e-9), noArea};
}

// material efficiency (#138): the parts' real material ÷ the material the job uses up. Full plates count whole; the last
// counts only up to one straight cut just past its parts (their envelopes), across the plate's width or its height,
// whichever leaves the larger offcut. Rated 1–10. null when nothing was placed.
export function efficiency(plates){
  if (!plates.length) return null;
  const W = S.plateW, H = S.plateH, last = plates[plates.length - 1];
  let x1 = 0, y1 = 0;
  for (const it of last.items) for (const q of it.env) for (const [x, y] of q) { if (x > x1) x1 = x; if (y > y1) y1 = y; }
  x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  const rows = W * y1, cols = x1 * H;
  const used = W * H * (plates.length - 1) + Math.min(rows, cols);
  const eff = used > 0 ? Math.min(1, plates.reduce((a, b) => a + b.area, 0) / used) : 0;
  return {eff, rating:Math.max(1, Math.min(10, Math.round(eff * 10))), offcut:rows <= cols ? {w:W, h:H - y1} : {w:W - x1, h:H}};
}
export function rectFits(p){
  const bw = S.plateW - 2*S.margin - 2*kerfC(p), bh = S.plateH - 2*S.margin - 2*kerfC(p);
  const a = p.wMM <= bw + 1e-9 && p.hMM <= bh + 1e-9;
  const b = !p.lock && S.rotate && p.hMM <= bw + 1e-9 && p.wMM <= bh + 1e-9;
  return a || b;
}



export function fitsPlate(p, F){
  return angleList(p).some(a => { const s = shape(p, a); return F.mR - F.mL >= s.cut.maxX - s.cut.minX && F.mB - F.mT >= s.cut.maxY - s.cut.minY; });
}
/* ---------- output ---------- */
function cutSequence(items){
  // laser order across a plate: rows top → bottom, left → right within a row (by each part's envelope)
  const boxes = items.map(it => { let x0 = Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of it.env) for (const [x, y] of q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return {it, x0, y0, y1}; }).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows = [];
  for (const bx of boxes) {
    const row = rows[rows.length - 1];
    if (row && bx.y0 < row.mid) row.items.push(bx);      // starts above the middle of the row's first part: same row
    else rows.push({mid:(bx.y0 + bx.y1) / 2, items:[bx]});
  }
  const order = rows.flatMap(r => r.items.sort((a, b) => a.x0 - b.x0).map(bx => bx.it));
  if (!items.some(it => it.in != null)) return order;
  // a part nested in another part's hole is cut, whole, before that part: once the hole is cut its slug can drop or
  // shift (#3). Otherwise the row order stands.
  const kids = new Map(), out = [];
  for (const it of order) if (it.in != null) { const c = items[it.in]; if (!kids.has(c)) kids.set(c, []); kids.get(c).push(it); }
  const emit = it => { for (const k of kids.get(it) || []) emit(k); out.push(it); };
  for (const it of order) if (it.in == null) emit(it);
  return out;
}
export function plateSVG(plate, opts = {}){
  const W = S.plateW, H = S.plateH;
  let s = `<svg xmlns="${SVGNS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n4(W)}mm" height="${n4(H)}mm" viewBox="0 0 ${n4(W)} ${n4(H)}">`;
  if (!opts.preview) s += `<!-- SnugCut ${appVersion} -->` + (kerfC() ? `<!-- ${compMark()} -->` : "");
  if (S.outline && !opts.preview) s += `<rect x="0" y="0" width="${n4(W)}" height="${n4(H)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`;
  const ids = new Map();
  for (const it of cutSequence(plate.items)) {
    const p = it.part;
    // scale and the part-unit offset with 7 significant digits (≈ 0.1 µm per m): 4 decimals cut fine viewBoxes off size by
    // up to a few % (#74). An offset of 1,000 or more keeps 4 decimals instead, or a far-out drawing moves by up to a unit (#217).
    const off = v => Math.abs(v) < 1000 ? sig(v) : String(+v.toFixed(4));
    const t = `translate(${n4(it.x)} ${n4(it.y)})${it.ang ? ` rotate(${it.ang})` : ""} scale(${sig(p.kx)} ${sig(p.ky)}) translate(${off(-it.rx)} ${off(-it.ry)})`;
    const base = slug(p.name), k = (ids.get(base) || 0) + 1; ids.set(base, k);
    s += partMarkup(p, placeMatrix(it.x, it.y, it.ang, p.kx, p.ky, it.rx, it.ry), `${base}-${k}`, t, opts.notes);
  }
  return s + `</svg>`;
}
/* ---------- DXF export (R12 ASCII, mm, origin bottom-left) ----------
   The same cut paths, order and joined outlines as the SVG export. Circular arcs (as written by arcToCubics and the
   DXF reader) become polyline bulges, so circles and rounded corners stay true arcs; other curves are flattened to
   within 0.01 mm. One layer per color, or per source layer for parts imported from DXF. */
const aciCache = new Map();
function aciNear(hex){
  if (!aciCache.has(hex)) {
    const v = parseInt(hex.slice(1), 16), r = v >> 16, g = v >> 8 & 255, b = v & 255;
    let best = 7, bd = Infinity;
    for (let i = 1; i < 256; i++) { const w = parseInt(aciColor(i).slice(1), 16), d = (r - (w >> 16)) ** 2 + (g - (w >> 8 & 255)) ** 2 + (b - (w & 255)) ** 2; if (d < bd) { bd = d; best = i; } }
    aciCache.set(hex, best);
  }
  return aciCache.get(hex);
}
export function plateDXF(plate){
  const W = S.plateW, H = S.plateH, out = [], layers = new Map(), notes = new Set();
  const f = v => { const r = +v.toFixed(6); return Object.is(r, -0) ? "0" : String(r); };
  const layer = (name, color) => {
    name = String(name).toUpperCase().replace(/[^A-Z0-9_$-]+/g, "_").slice(0, 31) || "0";
    if (!layers.has(name)) layers.set(name, aciNear(color));
    return name;
  };
  const emit = (vs, closed, L, aci) => {                                   // vs: [[x, y, bulge to the next vertex]]
    if (closed && vs.length > 2 && Math.hypot(vs[0][0] - vs[vs.length-1][0], vs[0][1] - vs[vs.length-1][1]) < 1e-7) vs.pop();
    if (vs.length < 2) return;
    if (!closed && vs.length === 2 && !vs[0][2]) { out.push("0", "LINE", "8", L, "62", aci, "10", f(vs[0][0]), "20", f(vs[0][1]), "30", "0", "11", f(vs[1][0]), "21", f(vs[1][1]), "31", "0"); return; }
    out.push("0", "POLYLINE", "8", L, "62", aci, "66", "1", "10", "0", "20", "0", "30", "0", "70", closed ? "1" : "0");
    for (const [x, y, bu] of vs) { out.push("0", "VERTEX", "8", L, "10", f(x), "20", f(y), "30", "0"); if (bu) out.push("42", f(bu)); }
    out.push("0", "SEQEND", "8", L);
  };
  const arcOf = (p0, p1, p2, p3) => {
    // bulge when the cubic is a circular arc, else null
    const B = t => { const u = 1 - t; return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]; };
    const m = B(0.5), ax = p0[0], ay = p0[1], bx = m[0], by = m[1], cx = p3[0], cy = p3[1];
    const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(dd) < 1e-12) return null;
    const a2 = ax*ax + ay*ay, b2 = bx*bx + by*by, c2 = cx*cx + cy*cy;
    const ox = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / dd, oy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / dd, r = Math.hypot(ax - ox, ay - oy);
    const tol = 0.0005 + 3.5e-4 * r;                                      // a cubic quarter circle is within 2.7e-4 × r of the true arc
    for (const t of [0.15, 0.3, 0.7, 0.85]) { const q = B(t); if (Math.abs(Math.hypot(q[0] - ox, q[1] - oy) - r) > tol) return null; }
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1];
    if (Math.abs(tx * (ax - ox) + ty * (ay - oy)) > 0.01 * Math.hypot(tx, ty) * r) return null;   // tangent must be perpendicular to the radius
    const ang = (x, y) => Math.atan2(y - oy, x - ox), wrap = v => v - 2 * Math.PI * Math.round(v / (2 * Math.PI));
    const th = wrap(ang(bx, by) - ang(ax, ay)) + wrap(ang(cx, cy) - ang(bx, by));
    return Math.tan(th / 4);
  };
  if (S.outline) emit([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]], true, layer("PLATE", "#ff0000"), 1);
  for (const it of cutSequence(plate.items)) {
    const p = it.part, flat = p.flat || p.loose;
    if (!flat) { notes.add(msg("dxfOut.nothing", {name:p.name})); continue; }
    if (!p.flat) { markupNote(p, notes); for (const s of p.looseSkipped) notes.add(s[0] === "<" ? msg("dxfOut.element", {name:p.name, tag:s.slice(1)}) : msg("dxfOut." + s, {name:p.name})); }   // written as drawn, like the SVG
    const [a, b, c, d, e, g] = placeMatrix(it.x, it.y, it.ang, p.kx, p.ky, it.rx, it.ry), sc = Math.sqrt(Math.abs(a*d - b*c));
    const T = (x, y) => [a*x + c*y + e, H - (b*x + d*y + g)];
    for (const gr of cutGroups(p, flat, sc, p.fromDXF)) {
      const col = gr.it.stroke !== "none" ? gr.it.stroke : gr.it.fill;
      if (gr.fill) notes.add(msg("dxfOut.fills"));
      const L = p.fromDXF && gr.it.lay ? layer(gr.it.lay, col) : layer(col.replace("#", ""), col), aci = aciNear(col);
      const kc = kerfPaths(p, gr, [a, b, c, d, e, g], notes);
      gr.subs.forEach((sub, si) => {
        if (kc && kc[si]) { for (const q of kc[si]) emit(q.map(([x, y]) => [x, H - y, 0]), true, L, aci); return; }
        let vs = [], closed = false, cur = null;
        for (const sg of sub.segs) {
          if (sg[0] === "M") { cur = T(sg[1], sg[2]); vs.push([cur[0], cur[1], 0]); }
          else if (sg[0] === "L") { cur = T(sg[1], sg[2]); vs.push([cur[0], cur[1], 0]); }
          else if (sg[0] === "C") {
            const p1 = T(sg[1], sg[2]), p2 = T(sg[3], sg[4]), p3 = T(sg[5], sg[6]), bu = arcOf(cur, p1, p2, p3);
            if (bu != null) { vs[vs.length - 1][2] = bu; vs.push([p3[0], p3[1], 0]); }
            else { const pts = []; flattenCubic(cur, p1, p2, p3, 0.01, pts); for (const q of pts) vs.push([q[0], q[1], 0]); }
            cur = p3;
          } else if (sg[0] === "Z") closed = true;
        }
        emit(vs, closed, L, aci);
      });
    }
  }
  const hdr = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "9", "$MEASUREMENT", "70", "1",
    "9", "$EXTMIN", "10", "0", "20", "0", "30", "0", "9", "$EXTMAX", "10", f(W), "20", f(H), "30", "0", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LTYPE", "70", "1", "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0", "0", "ENDTAB",
    "0", "TABLE", "2", "LAYER", "70", String(layers.size + (layers.has("0") ? 0 : 1)), "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS"];
  for (const [n, ci] of layers) if (n !== "0") hdr.push("0", "LAYER", "2", n, "70", "0", "62", String(ci), "6", "CONTINUOUS");
  hdr.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "BLOCKS", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  const all = (kerfC() ? ["999", `SnugCut ${appVersion} ${compMark()}`] : []).concat(hdr, out, ["0", "ENDSEC", "0", "EOF"]);
  let dxf = ""; for (let i = 0; i < all.length; i += 2) dxf += all[i].padStart(3) + "\r\n" + all[i + 1] + "\r\n";
  return {dxf, notes:[...notes]};
}
const compMark = () => `kerf-compensated: ${+(S.kerf / 2).toFixed(4)} mm per side, already built in; do not offset again`;
