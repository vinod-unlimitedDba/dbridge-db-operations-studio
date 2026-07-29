/*
 * Generates app/theme-dark.css from the light stylesheets.
 *
 * The console's ~28 feature stylesheets hardcode roughly 2,400 colour literals
 * instead of sharing tokens, so a hand-written dark theme would drift the first
 * time anyone touched a panel. This walks each sheet and mirrors every
 * colour-bearing rule under an html[data-theme="dark"] scope, inverting each
 * literal according to the role the property implies.
 *
 * Run after changing any light stylesheet:
 *   node tools/generate-dark-theme.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

// Order matters: the generated overrides are emitted in the same cascade order
// as the light sheets so relative specificity is preserved rule for rule.
const SHEETS = [
  "styles.css", "catalog.css", "log-details.css", "remote-access.css",
  "log-intelligence-v1.css", "devops-advanced.css", "notepad-editor.css",
  "connection-session.css", "sql-studio-dbgate.css", "editor-autocomplete.css",
  "performance-dashboard.css", "sql-performance-v3.css", "oracle-performance-v1.css",
  "performance-friendly-v1.css", "runtime-trace-workbench.css",
  "sql-performance-unified-v1.css", "sql-recommendations.css", "oracle-sql-xray.css",
  "investigation-center.css", "intelligence-suite.css", "goldengate-suite.css",
  "container-visuals.css", "container-access.css", "file-comparison.css",
  "oracle-trace-lab.css", "advanced-audits.css", "workspace-tabs.css",
  "enterprise-shell-v1.css",
];

/* ---------- colour maths ---------- */

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  let a = null;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  else if (h.length === 4) { a = parseInt(h[3] + h[3], 16) / 255; h = h.slice(0, 3).split("").map((c) => c + c).join(""); }
  else if (h.length === 8) { a = parseInt(h.slice(6, 8), 16) / 255; h = h.slice(0, 6); }
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h, s; const l = (mx + mn) / 2;
  if (mx === mn) h = s = 0;
  else {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

const hx = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- role inference ---------- */

// A custom property carries no role on its own, so infer it from the name.
// Getting this wrong is what produces dark text on a dark panel.
function roleForToken(name) {
  const n = name.toLowerCase();
  if (/(text|ink|foreground|-fg|muted|copy|label|title)/.test(n)) return "ink";
  if (/(border|line|edge|rule|divider|outline|stroke)/.test(n)) return "edge";
  if (/(bg|background|canvas|surface|panel|navy|side|terminal|soft|fill|shadow|scrim|overlay)/.test(n)) return "surface";
  return "accent";
}

function roleFor(prop) {
  const p = prop.toLowerCase();
  if (p.startsWith("--")) return roleForToken(p);
  if (p.startsWith("background")) return "surface";
  if (p === "color" || p === "fill" || p === "stroke" || p === "caret-color" || p === "text-decoration-color") return "ink";
  if (p.includes("shadow") || p.startsWith("border") || p.startsWith("outline") || p.startsWith("column-rule")) return "edge";
  return "accent";
}

// Parts of the light UI are already dark (sidebar, terminal panes, shadows).
// Inverting those would break them, so they pass through untouched.
function alreadyDarkReady({ l }, role) {
  if (role === "surface") return l < 26;
  if (role === "ink") return l >= 58;
  if (role === "edge") return l < 30;
  return false;
}

// Role-aware inversion: surfaces flip deep, text flips bright, accents stay vivid.
function darkify({ h, s, l }, role) {
  // Text must always land bright enough to read on a dark surface.
  if (role === "ink") return { h, s: clamp(s * 0.7, 0, 55), l: clamp(100 - l, 62, 92) };

  if (s < 12) {
    // near-neutral: lightness inversion onto a slightly blue-tinted grey ramp
    const nh = 222, ns = clamp(6 + s * 0.5, 4, 12);
    if (l >= 88) return { h: nh, s: ns, l: clamp(13 - (l - 88) * 0.35, 8.5, 13) };   // white surfaces -> deep panels
    if (l >= 70) return { h: nh, s: ns, l: clamp(20 - (l - 70) * 0.2, 16, 20) };     // light fills -> raised panels
    if (l >= 45) return { h: nh, s: ns + 2, l: clamp(100 - l - 12, 38, 55) };        // mid grey -> muted text
    if (l >= 22) return { h: nh, s: ns + 3, l: clamp(100 - l - 6, 62, 78) };         // dark grey -> body text
    return { h: nh, s: ns + 4, l: clamp(96 - l * 0.6, 84, 94) };                     // near-black -> near-white
  }

  // saturated / tinted colours
  if (l >= 90) return { h, s: clamp(s * 0.75, 10, 40), l: clamp(17 - (l - 90) * 0.3, 13, 18) };  // pastel tint fills
  if (l >= 78) return { h, s: clamp(s * 0.8, 12, 45), l: clamp(23 - (l - 78) * 0.35, 18, 24) };  // soft tint fills
  if (l >= 60) return { h, s: clamp(s * 0.95, 30, 85), l: clamp(l + 4, 60, 74) };                // accents -> keep bright
  if (l >= 35) return { h, s: clamp(s * 0.95, 30, 85), l: clamp(l + 22, 58, 72) };               // mid accents -> brighten
  if (l >= 18) return { h, s: clamp(s * 0.85, 25, 70), l: clamp(l + 12, 26, 40) };               // dark tinted surfaces
  return { h, s: clamp(s * 0.8, 20, 60), l: clamp(l + 6, 12, 24) };
}

function convertHex(hex, role) {
  const { r, g, b, a } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  if (alreadyDarkReady(hsl, role)) return hex;
  const out = darkify(hsl, role);
  const c = hslToRgb(out.h, out.s, out.l);
  const base = `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`;
  return a === null ? base : `${base}${hx(a * 255)}`;
}

function convertFuncColor(fn, parts, role, original) {
  const [r, g, b] = parts.slice(0, 3).map(Number);
  const hsl = rgbToHsl(r, g, b);
  if (alreadyDarkReady(hsl, role)) return original;
  const out = darkify(hsl, role);
  const c = hslToRgb(out.h, out.s, out.l);
  const alpha = parts.length > 3 ? `, ${parts[3]}` : "";
  return `${fn}(${c.r}, ${c.g}, ${c.b}${alpha})`;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FN_RE = /\brgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/g;

function transformValue(value, role) {
  let out = value.replace(HEX_RE, (m) => convertHex(m, role));
  out = out.replace(FN_RE, (m, r, g, b, a) => {
    const fn = m.trim().startsWith("rgba") ? "rgba" : "rgb";
    return convertFuncColor(fn, a === undefined ? [r, g, b] : [r, g, b, a], role, m);
  });
  return out;
}

const COLOR_PROPS = /^(background|background-color|background-image|color|border|border-[a-z-]+|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|column-rule|column-rule-color|accent-color|text-decoration-color|scrollbar-color)$/;
const hasColor = (v) => /#[0-9a-fA-F]{3,8}\b/.test(v) || /\brgba?\(/.test(v);

/* ---------- minimal CSS walker ---------- */

function splitTopLevel(str, sep) {
  const out = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function prefixSelector(sel) {
  return splitTopLevel(sel, ",").map((raw) => {
    const s = raw.trim();
    if (!s) return null;
    if (s === ":root" || s === "html") return `html[data-theme="dark"]`;
    if (s.startsWith("html")) return `html[data-theme="dark"]${s.slice(4)}`;
    if (/^(from|to|\d+%)$/.test(s)) return null; // keyframe stop
    return `html[data-theme="dark"] ${s}`;
  }).filter(Boolean).join(",");
}

function transformDeclarations(block) {
  const kept = [];
  for (const decl of splitTopLevel(block, ";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    let value = decl.slice(idx + 1).trim();
    if (!value || !hasColor(value)) continue;
    if (!prop.startsWith("--") && !COLOR_PROPS.test(prop.toLowerCase())) continue;

    let important = "";
    if (/!important$/i.test(value)) { important = "!important"; value = value.replace(/!important$/i, "").trim(); }
    const converted = transformValue(value, roleFor(prop));
    if (converted === value) continue; // already dark-appropriate; no override needed
    kept.push(`${prop}:${converted}${important}`);
  }
  return kept;
}

// Walk a CSS string, emitting dark-scoped mirrors of every colour-bearing rule.
function processCss(css) {
  const rules = [];
  let i = 0;
  const end = css.length;

  while (i < end) {
    while (i < end && /\s/.test(css[i])) i++;
    if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i); i = e < 0 ? end : e + 2; continue; }
    if (i >= end) break;

    const start = i;
    let depth = 0;
    while (i < end) {
      const ch = css[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if ((ch === "{" || ch === ";") && depth === 0) break;
      i++;
    }
    if (i >= end) break;
    const prelude = css.slice(start, i).trim();
    if (css[i] === ";") { i++; continue; } // at-statement such as @import

    i++; // past '{'
    const bodyStart = i;
    let braces = 1;
    while (i < end && braces > 0) {
      if (css[i] === "{") braces++;
      else if (css[i] === "}") braces--;
      if (braces > 0) i++;
    }
    const body = css.slice(bodyStart, i);
    i++; // past '}'

    if (prelude.startsWith("@keyframes") || prelude.startsWith("@-webkit-keyframes")) continue;

    if (prelude.startsWith("@")) {
      const inner = processCss(body); // nested at-rule such as @media
      if (inner.trim()) rules.push(`${prelude}{\n${inner}\n}`);
      continue;
    }

    const decls = transformDeclarations(body);
    if (!decls.length) continue;
    const sel = prefixSelector(prelude);
    if (sel) rules.push(`${sel}{${decls.join(";")}}`);
  }
  return rules.join("\n");
}

/* ---------- run ---------- */

const chunks = [`/* DBridge dark theme - GENERATED FILE, do not hand-edit.
   Regenerate with: node tools/generate-dark-theme.mjs */`];

let ruleCount = 0;
for (const name of SHEETS) {
  let css;
  try { css = readFileSync(join(APP, name), "utf8"); }
  catch { console.warn(`skipped missing sheet: ${name}`); continue; }
  const dark = processCss(css);
  if (!dark.trim()) continue;
  ruleCount += dark.split("\n").filter((line) => line.includes("{")).length;
  chunks.push(`\n/* ===== ${name} ===== */\n${dark}`);
}

const output = chunks.join("\n");
writeFileSync(join(APP, "theme-dark.css"), output, "utf8");
console.log(`theme-dark.css written: ${output.length} bytes, ${ruleCount} rules`);
