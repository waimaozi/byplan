import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { normalize } = require("../assets/js/img-legacy-map.js");

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] || "";
};

const sheetId = getArg("--sheet") || process.env.SHEET_ID || "";
const fixturePath = getArg("--fixture");
if (!sheetId && !fixturePath) {
  console.error("Missing SHEET_ID. Usage: node scripts/update_snapshot.mjs --sheet <ID>");
  process.exit(1);
}
if (typeof fetch !== "function") {
  console.error("This script requires Node.js 18+ (global fetch).");
  process.exit(1);
}

const defaultTabs = [
  "site",
  "pains",
  "deliverables",
  "steps",
  "trust",
  "stats",
  "pricing",
  "principles_do",
  "principles_dont",
  "mistakes",
  "cases",
  "cases_media",
  "why_stats",
  "why_trust",
  "reviews",
  "story",
  "story_scenes",
  "faq",
  "site_additions",
  "contacts"
];

const tabsArg = getArg("--tabs");
const tabs = tabsArg
  ? tabsArg.split(",").map(s => s.trim()).filter(Boolean)
  : defaultTabs;

const outPath = getArg("--out") || "assets/data/snapshot.json";
const overridesPath = getArg("--overrides");
const checkPaths = args.includes("--check");
const fixture = fixturePath ? JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8")) : null;

function stripGvizWrapper(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);\s*$/s);
  if (!match) throw new Error("GViz response parse error: wrapper not found");
  return match[1];
}

function tableToObjects(table) {
  const cols = (table.cols || []).map(c => (c.label || "").trim());
  const rows = (table.rows || []).map(r => (r.c || []).map(cell => (cell && typeof cell.v !== "undefined") ? cell.v : ""));
  let lastCol = cols.length - 1;
  while (lastCol >= 0 && !cols[lastCol]) lastCol--;
  const cleanCols = cols.slice(0, lastCol + 1);

  return rows.map(row => {
    const obj = {};
    cleanCols.forEach((col, i) => {
      if (col) obj[col] = (row[i] ?? "");
    });
    return obj;
  });
}

async function fetchTab(tabName) {
  if (fixture) {
    const payload = fixture[tabName];
    if (!payload) throw new Error(`Fixture tab missing: ${tabName}`);
    const parsed = typeof payload === "string" ? JSON.parse(stripGvizWrapper(payload)) : payload;
    return parsed.table ? tableToObjects(parsed.table) : [];
  }
  const params = new URLSearchParams({
    sheet: tabName,
    headers: "1",
    tqx: "out:json"
  });
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GViz ${tabName} HTTP ${res.status}`);
  const text = await res.text();
  const jsonStr = stripGvizWrapper(text);
  const payload = JSON.parse(jsonStr);
  if (!payload.table) return [];
  return tableToObjects(payload.table);
}

const imageFields = {
  cases_media: ["before_url", "after_url", "before_thumb", "after_thumb"],
  cases: ["img_url"],
  reviews: ["case_before_url", "case_after_url"],
  story: ["plan_before_src", "plan_after_src"],
  site: ["designer_photo_url"]
};

function normalizeImagePaths(data) {
  for (const [tab, fields] of Object.entries(imageFields)) {
    for (const row of data[tab] || []) {
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(row, field)) row[field] = normalize(row[field]);
      }
    }
  }
}

function assertValue(condition, message) {
  if (!condition) throw new Error(`Override precondition failed: ${message}`);
}

function applyOverrides(data, overrides) {
  const siteRows = data.site || (data.site = []);
  const site = Object.fromEntries(siteRows.map(row => [row.key, row]));
  assertValue(site.hero_badge && site.hero_badge.value === "Студия Byplane", 'site.hero_badge === "Студия Byplane"');
  assertValue(site.hero_title && String(site.hero_title.value).startsWith("C"), 'site.hero_title starts with Latin "C"');
  assertValue(data.steps?.[1]?.title === "3 концепции", 'steps[1].title === "3 концепции"');
  assertValue(String(data.steps?.[3]?.text || "").startsWith("Доводим"), 'steps[3].text starts with "Доводим"');
  assertValue(data.stats?.[2]?.label === "концепции в каждом проекте", 'stats[2].label === "концепции в каждом проекте"');
  assertValue(String(data.pricing?.[0]?.features || "").startsWith("3 варианта|"), 'pricing[0].features starts with "3 варианта|"');

  Object.entries(overrides.site || {}).forEach(([key, value]) => {
    if (!site[key]) { site[key] = { key, value: "" }; siteRows.push(site[key]); }   // upsert: allow new slots
    site[key].value = key === "hero_title" ? String(site[key].value).replace(/^C/, value) : value;
  });
  Object.entries(overrides.steps || {}).forEach(([index, values]) => Object.assign(data.steps[Number(index)], values));
  Object.entries(overrides.stats || {}).forEach(([index, values]) => Object.assign(data.stats[Number(index)], values));
  Object.entries(overrides.pricing || {}).forEach(([index, values]) => Object.assign(data.pricing[Number(index)], values));
}

function validateImagePaths(data) {
  const missing = [];
  for (const [tab, fields] of Object.entries(imageFields)) {
    for (const [index, row] of (data[tab] || []).entries()) {
      for (const field of fields) {
        const value = String(row[field] || "").trim();
        if (value && !/^(https?:)?\/\//i.test(value) && !/^data:/i.test(value) && !fs.existsSync(path.resolve(value))) {
          missing.push(`${tab}[${index}].${field}: ${value}`);
        }
      }
    }
  }
  if (missing.length) throw new Error(`Missing image paths:\n${missing.join("\n")}`);
}

async function run() {
  const data = {};
  for (const tab of tabs) {
    // eslint-disable-next-line no-console
    console.log(`Fetching: ${tab}`);
    data[tab] = await fetchTab(tab);
  }

  normalizeImagePaths(data);
  let overridesApplied = false;
  if (overridesPath) {
    const overrides = JSON.parse(fs.readFileSync(path.resolve(overridesPath), "utf8"));
    applyOverrides(data, overrides);
    overridesApplied = true;
  }
  if (checkPaths) validateImagePaths(data);

  const snapshot = {
    meta: {
      generated_at: new Date().toISOString(),
      sheet_id: sheetId,
      overrides_applied: overridesApplied
    },
    tabs: data
  };

  const outFull = path.resolve(outPath);
  fs.mkdirSync(path.dirname(outFull), { recursive: true });
  fs.writeFileSync(outFull, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot written to ${outFull}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
