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

  async function fetchTab(sheetId, tabName) {
    const key = `${sheetId}:${tabName}`;
    if (cache.has(key)) return cache.get(key);

    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&headers=1`;

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
    return objects;
  }

  window.Sheets = { fetchTab };
})();
