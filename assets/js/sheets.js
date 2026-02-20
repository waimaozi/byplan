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

  function isEmptyValue(v) {
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  }

  function mergeRow(base, extra) {
    const out = Object.assign({}, base);
    for (const [k, v] of Object.entries(extra || {})) {
      if (!isEmptyValue(v)) out[k] = v;
    }
    return out;
  }

  function keyFor(tabName, row) {
    const r = row || {};
    if (tabName === "cases") {
      return String(r.case_id || r.id || "").trim();
    }
    if (tabName === "reviews") {
      const id = String(r.id || "").trim();
      if (id) return id;
      const name = String(r.name || r.client || r.author || "").trim();
      const role = String(r.role || r.meta || r.city || "").trim();
      return (name || role) ? `${name}|${role}` : "";
    }
    if (tabName === "cases_media") {
      const cid = String(r.case_id || r.caseId || r.case || "").trim();
      if (!cid) return "";
      const label = String(r.label || r.title || r.scene || "").trim();
      const sort = String(r.sort || r.order || r.idx || r.position || "").trim();
      return label ? `${cid}|${label}` : `${cid}|${sort}`;
    }
    return "";
  }

  function applyExtra(tabName, rows) {
    const extra = (window.SHEETS_EXTRA && window.SHEETS_EXTRA[tabName]) || [];
    if (!Array.isArray(extra) || extra.length === 0) return rows;

    const out = Array.isArray(rows) ? rows.slice() : [];
    const index = new Map();

    for (const r of out) {
      const key = keyFor(tabName, r);
      if (key) index.set(key, r);
    }

    for (const er of extra) {
      const key = keyFor(tabName, er);
      if (!key) {
        out.push(er);
        continue;
      }
      const base = index.get(key);
      if (base) {
        const merged = mergeRow(base, er);
        const i = out.indexOf(base);
        if (i >= 0) out[i] = merged;
        index.set(key, merged);
      } else {
        out.push(er);
        index.set(key, er);
      }
    }

    return out;
  }

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
      const objects = applyExtra(tabName, tableToObjects(payload.table));

      cache.set(key, objects);
      writeStorage(storageKey, objects);
      return objects;
    } catch (err) {
      if (stored) {
        const merged = applyExtra(tabName, stored);
        cache.set(key, merged);
        return merged;
      }
      throw err;
    }
  }

  window.Sheets = { fetchTab };
})();
