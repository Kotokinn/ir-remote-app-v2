#!/usr/bin/env node
// Applies a shadcn/tweakcn theme in one command: rewrites src/styles/theme.css (the ONLY file that holds the
// colors, fonts, radius and shadows) and keeps the browser/PWA theme color in step. Nothing else needs editing —
// components use theme tokens (bg-primary, text-muted-foreground…) and .bg-brand-gradient is derived from --primary.
//
//   npm run theme -- --list                          the names available on tweakcn.com
//   npm run theme -- cosmic-night                    a tweakcn preset by name
//   npm run theme -- https://tweakcn.com/themes/<id> a theme page URL (also your own saved themes)
//   npm run theme -- https://tweakcn.com/r/themes/<id>.json
//   npm run theme -- theme.json                      a registry JSON saved from tweakcn ("Install"/"Copy")
//   npm run theme -- theme.css                       CSS pasted from tweakcn's "Code" tab (:root / .dark / @theme inline)
//
// Undo with git (`git checkout src/styles/theme.css`) or apply another theme.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME_CSS = join(root, "src/styles/theme.css");
const REGISTRY = "https://tweakcn.com/r/themes";

class UsageError extends Error {}

// Throws instead of process.exit(): exiting while a fetch is still winding down trips a libuv assertion on
// Node 25 / Windows.
function fail(message) {
  throw new UsageError(message);
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    fail(`could not reach ${url} (${error instanceof Error ? error.message : error})`);
  }
  if (!response.ok) fail(`${url} answered ${response.status}`);
  return response.json();
}

// ---------- colour helpers (for the browser theme color and the contrast hints) ----------
function parseOklch(value) {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(value ?? "");
  if (!match) return null;
  const l = match[1].endsWith("%") ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
  return { l, c: parseFloat(match[2]), h: parseFloat(match[3]) };
}

function oklchToHex({ l, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    linear
      .map((v) => {
        const clamped = Math.min(1, Math.max(0, v));
        const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255).toString(16).padStart(2, "0");
      })
      .join("")
  );
}

// ---------- fonts ----------
const SYSTEM_FONTS = new Set(
  [
    "sans-serif", "serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "cursive",
    "fantasy", "-apple-system", "blinkmacsystemfont", "segoe ui", "arial", "helvetica", "helvetica neue",
    "georgia", "times new roman", "times", "courier new", "courier", "menlo", "monaco", "consolas",
    "verdana", "tahoma", "trebuchet ms", "impact", "roboto mono ",
  ].map((name) => name.trim())
);

function primaryFamily(stack) {
  const first = (stack ?? "").split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first && !SYSTEM_FONTS.has(first.toLowerCase()) && !first.startsWith("var(") ? first : null;
}

/** A Google Fonts stylesheet URL that actually exists for this family (not every font has every weight). */
async function googleFontUrl(family) {
  const name = family.replace(/ /g, "+");
  for (const weights of ["wght@400;500;600;700", "wght@400;700", "wght@400", null]) {
    const url = `https://fonts.googleapis.com/css2?family=${name}${weights ? `:${weights}` : ""}&display=swap`;
    try {
      const response = await fetch(url);
      if (response.ok) return url;
    } catch {
      return null; // offline: skip the web font, the system fallback in the stack still applies
    }
  }
  return null;
}

// ---------- CSS generation ----------
const COLOR_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary",
  "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent",
  "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "chart-1", "chart-2",
  "chart-3", "chart-4", "chart-5", "sidebar", "sidebar-foreground", "sidebar-primary",
  "sidebar-primary-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];
const SHADOWS = ["2xs", "xs", "sm", "", "md", "lg", "xl", "2xl"];

function declarations(vars) {
  return Object.entries(vars)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
}

function themeInline(vars) {
  const lines = [
    ...COLOR_TOKENS.filter((token) => token in vars).map((token) => `  --color-${token}: var(--${token});`),
    ...["sans", "serif", "mono"].filter((name) => `font-${name}` in vars).map((name) => `  --font-${name}: var(--font-${name});`),
  ];
  if ("radius" in vars) {
    lines.push(
      "  --radius-sm: calc(var(--radius) - 4px);",
      "  --radius-md: calc(var(--radius) - 2px);",
      "  --radius-lg: var(--radius);",
      "  --radius-xl: calc(var(--radius) + 4px);"
    );
  }
  for (const size of SHADOWS) {
    const name = size ? `shadow-${size}` : "shadow";
    if (name in vars) lines.push(`  --${name}: var(--${name});`);
  }
  for (const name of ["tighter", "tight", "wide", "wider", "widest"]) {
    if (`tracking-${name}` in vars) lines.push(`  --tracking-${name}: var(--tracking-${name});`);
  }
  return `@theme inline {\n${lines.join("\n")}\n}`;
}

function cssObject(object, indent = "") {
  return Object.entries(object)
    .map(([key, value]) =>
      typeof value === "object"
        ? `${indent}${key} {\n${cssObject(value, indent + "  ")}\n${indent}}`
        : `${indent}${key}: ${value};`
    )
    .join("\n");
}

async function fromRegistryItem(item, source) {
  const { theme = {}, light = {}, dark = {} } = item.cssVars ?? {};
  // tweakcn repeats the font/radius/shadow variables in light and dark; the light copy (plus "theme") is the base.
  const base = { ...theme, ...light };
  const darkOnly = Object.fromEntries(
    Object.entries(dark).filter(([key, value]) => base[key] !== value && !/^(font-|radius$|spacing$|letter-spacing$)/.test(key))
  );

  const imports = [];
  for (const key of ["font-sans", "font-serif", "font-mono"]) {
    const family = primaryFamily(base[key]);
    const url = family && (await googleFontUrl(family));
    if (url && !imports.includes(url)) imports.push(url);
    else if (family && !url) console.warn(`theme: font "${family}" not loaded (unavailable or offline); the fallback in its stack is used.`);
  }

  const extra = item.css && Object.keys(item.css).length ? `\n\n${cssObject(item.css)}` : "";
  const css = `${imports.map((url) => `@import url("${url}");`).join("\n")}${imports.length ? "\n\n" : ""}/* Generated by scripts/theme.mjs — ${item.title ?? item.name ?? source}
   source: ${source}
   Re-run \`npm run theme\` to switch themes; this file is safe to edit by hand. */

:root {
${declarations(base)}
}

.dark {
${declarations(darkOnly)}
}

${themeInline({ ...base, ...dark })}${extra}
`;
  return { css, light: base, dark: { ...base, ...dark } };
}

/** Pasted CSS from tweakcn's "Code" tab: use as is, add the token mapping if it has none. */
function fromCss(text, source) {
  const light = {};
  const dark = {};
  for (const [block, target] of [[/:root\s*\{([^}]*)\}/, light], [/\.dark\s*\{([^}]*)\}/, dark]]) {
    const match = block.exec(text);
    if (match) for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) target[name] = value.trim();
  }
  if (!Object.keys(light).length) fail("no :root { … } block found in that CSS");
  const hasMapping = /@theme\s+inline/.test(text);
  const css = `/* Pasted from ${source} by scripts/theme.mjs — edit by hand or run \`npm run theme\` again. */\n\n${text.trim()}\n${
    hasMapping ? "" : `\n${themeInline({ ...light, ...dark })}\n`
  }`;
  return { css, light, dark: { ...light, ...dark } };
}

// ---------- contrast hints (lightness only; warns, never blocks) ----------
function hints(label, vars) {
  const primary = parseOklch(vars.primary);
  if (!primary) return [];
  const out = [];
  for (const surface of ["background", "accent", "muted", "card"]) {
    const other = parseOklch(vars[surface]);
    if (other && Math.abs(primary.l - other.l) < 0.3) {
      out.push(`${label}: --primary (L ${primary.l.toFixed(2)}) is close to --${surface} (L ${other.l.toFixed(2)}): text-primary / icons in the primary color may be hard to read on it.`);
    }
  }
  return out;
}

// ---------- main ----------
async function main() {
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length === 0) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).join("\n").replace(/^\/\/ ?/gm, ""));
  return;
}

if (args[0] === "--list") {
  const registry = await getJson(`${REGISTRY}/registry.json`);
  for (const item of registry.items) console.log(`${item.name.padEnd(20)} ${item.title ?? ""}`);
  return;
}

const input = args[0];
let result;
if (existsSync(resolve(input))) {
  const text = readFileSync(resolve(input), "utf8");
  result = input.endsWith(".css") ? fromCss(text, input) : await fromRegistryItem(JSON.parse(text), input);
} else if (/^https?:\/\//.test(input)) {
  const url = new URL(input);
  const id = url.pathname.split("/").filter(Boolean).pop()?.replace(/\.json$/, "");
  if (!id) fail("that URL has no theme id");
  const jsonUrl = url.pathname.includes("/r/themes/") ? input : `${REGISTRY}/${id}.json`;
  result = await fromRegistryItem(await getJson(jsonUrl), jsonUrl);
} else if (/^[\w-]+$/.test(input)) {
  result = await fromRegistryItem(await getJson(`${REGISTRY}/${input}.json`), `${REGISTRY}/${input}.json`);
} else {
  fail(`don't know what "${input}" is (a theme name, a tweakcn URL, or a .json/.css file)`);
}

writeFileSync(THEME_CSS, result.css);
console.log(`theme written to src/styles/theme.css`);

// The browser bar / PWA color follows the light primary.
const primary = parseOklch(result.light.primary);
if (primary) {
  const hex = oklchToHex(primary);
  const layout = join(root, "src/app/layout.tsx");
  if (existsSync(layout)) {
    const before = readFileSync(layout, "utf8");
    const after = before.replace(/themeColor: "#[0-9a-fA-F]{3,8}"/, `themeColor: "${hex}"`);
    if (after !== before) writeFileSync(layout, after);
  }
  const manifest = join(root, "public/manifest.webmanifest");
  if (existsSync(manifest)) {
    const data = JSON.parse(readFileSync(manifest, "utf8"));
    data.theme_color = hex;
    writeFileSync(manifest, JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`browser/PWA theme color set to ${hex}`);
}

for (const line of [...hints("light", result.light), ...hints("dark", result.dark)]) console.warn(`hint: ${line}`);
}

main().catch((error) => {
  console.error(`theme: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
