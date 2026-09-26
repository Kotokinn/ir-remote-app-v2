// @vitest-environment node
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import { LANGUAGES } from "./languages";

interface Tree {
  [key: string]: string | Tree;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [nested, text] of flatten(value, path)) out.set(nested, text);
  }
  return out;
}

/** {{placeholders}} and <tags> a translation must keep so the interpolation still lines up. */
function tokens(text: string): string[] {
  return [...(text.match(/\{\{\s*\w+\s*\}\}|<\/?\w+>/g) ?? [])].map((token) => token.replace(/\s+/g, "")).sort();
}

const source = flatten(en as Tree);

describe.each(LANGUAGES.filter((language) => language.code !== "en"))("locale $code", (language) => {
  it("has no keys the source language doesn't have (typos, or stale keys after a rename)", async () => {
    const translated = flatten((await language.load()) as Tree);
    const sourceBases = new Set([...source.keys()].map((key) => key.replace(PLURAL_SUFFIX, "")));
    const stray = [...translated.keys()].filter((key) => !sourceBases.has(key.replace(PLURAL_SUFFIX, "")));
    expect(stray).toEqual([]);
  });

  it("translates every key (a missing one silently shows English)", async () => {
    const translated = flatten((await language.load()) as Tree);
    const categories = new Intl.PluralRules(language.code).resolvedOptions().pluralCategories;
    const missing: string[] = [];
    for (const key of source.keys()) {
      const match = PLURAL_SUFFIX.exec(key);
      if (!match) {
        if (!translated.has(key)) missing.push(key);
        continue;
      }
      // Plural keys: this language needs its own set of forms (Vietnamese has one, Russian three…),
      // not English's "one"/"other".
      const base = key.slice(0, key.length - match[0].length);
      for (const category of categories) {
        if (!translated.has(`${base}_${category}`)) missing.push(`${base}_${category}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("keeps the placeholders and tags of the English text", async () => {
    const translated = flatten((await language.load()) as Tree);
    const broken: string[] = [];
    for (const [key, text] of translated) {
      const original = source.get(key) ?? source.get(key.replace(PLURAL_SUFFIX, "_other")) ?? source.get(key.replace(PLURAL_SUFFIX, "_one"));
      if (original === undefined) continue;
      const expected = tokens(original).filter((token) => token !== "{{count}}");
      const actual = tokens(text).filter((token) => token !== "{{count}}");
      if (JSON.stringify(expected) !== JSON.stringify(actual)) broken.push(key);
    }
    expect(broken).toEqual([]);
  });
});

describe("source language", () => {
  it("gives every plural key both English forms", () => {
    const bases = new Map<string, Set<string>>();
    for (const key of source.keys()) {
      const match = PLURAL_SUFFIX.exec(key);
      if (!match) continue;
      const base = key.slice(0, key.length - match[0].length);
      bases.set(base, (bases.get(base) ?? new Set()).add(match[1]));
    }
    for (const [base, forms] of bases) {
      expect({ base, forms: [...forms].sort() }).toEqual({ base, forms: ["one", "other"] });
    }
  });
});
