// ===============================
// Google Sheets (GViz) loader
// ===============================
// This file fetches tabular data from a public Google Sheet using the GViz endpoint.
// URL format:
// https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:json&sheet=<TAB>&headers=1
//
// Notes:
// - The sheet must be public or at least accessible without login.
// - 'headers=1' forces the first row to be used as column names (recommended).

(function () {
  const cache = new Map();
  // Each page load gets its own cache-buster so Google/Browser caches can't bite you during editing.
  const runId = Date.now().toString(36);
  const storagePrefix = "byplan_sheet_cache:";
  const maxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

  function stripGvizWrapper(text) {
    // Typical response: "/*O_o*/\ngoogle.visualization.Query.setResponse({...});"
    const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);\s*$/s);
    if (!match) throw new Error("GViz response parse error: wrapper not found");
    return match[1];
  }

  function tableToObjects(table) {
    const cols = (table.cols || []).map(c => (c.label || "").trim());
    const rows = (table.rows || []).map(r => (r.c || []).map(cell => (cell && typeof cell.v !== "undefined") ? cell.v : ""));
    // Drop empty trailing columns
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

  function readStorage(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data)) return null;
      if (parsed.ts && (Date.now() - parsed.ts > maxAgeMs)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeStorage(storageKey, data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // ignore storage errors (quota, private mode)
    }
  }

  async function fetchTab(sheetId, tabName) {
    const key = `${sheetId}:${tabName}`;
    if (cache.has(key)) return cache.get(key);

    const storageKey = `${storagePrefix}${key}`;
    const stored = readStorage(storageKey);

    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&headers=1&cb=${runId}`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Cannot load sheet tab "${tabName}". HTTP ${res.status}`);
      }

      const text = await res.text();
      const jsonStr = stripGvizWrapper(text);
      const payload = JSON.parse(jsonStr);

      if (!payload.table) return [];
      const objects = tableToObjects(payload.table);

      cache.set(key, objects);
      writeStorage(storageKey, objects);
      return objects;
    } catch (err) {
      if (stored) {
        cache.set(key, stored);
        return stored;
      }
      throw err;
    }
  }

  window.Sheets = { fetchTab };
})();
