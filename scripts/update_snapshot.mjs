import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] || "";
};

const sheetId = getArg("--sheet") || process.env.SHEET_ID || "";
if (!sheetId) {
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
  "why_stats",
  "why_trust",
  "cases",
  "reviews",
  "faq",
  "contacts",
  "story",
  "story_scenes"
];

const tabsArg = getArg("--tabs");
const tabs = tabsArg
  ? tabsArg.split(",").map(s => s.trim()).filter(Boolean)
  : defaultTabs;

const outPath = getArg("--out") || "assets/data/snapshot.json";

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
      obj[col] = (row[i] ?? "");
    });
    return obj;
  });
}

async function fetchTab(tabName) {
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

async function run() {
  const data = {};
  for (const tab of tabs) {
    // eslint-disable-next-line no-console
    console.log(`Fetching: ${tab}`);
    data[tab] = await fetchTab(tab);
  }

  const snapshot = {
    meta: {
      generated_at: new Date().toISOString(),
      sheet_id: sheetId
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
