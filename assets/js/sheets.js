// ===============================
// Google Sheets (GViz) loader
// ===============================
// Uses JSONP to avoid CORS issues in the browser.
// Falls back to localStorage cache, then to a local snapshot JSON.

(function () {
  const cache = new Map();
  const inflight = new Map();
  const runId = Date.now().toString(36);
  const storagePrefix = "byplan_sheet_cache:";
  const maxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

  const state = {
    usedSnapshot: false,
    usedStorage: false,
    errors: [],
    forceFallback: false
  };

  const snapshotUrl = (window.SITE_CONFIG && window.SITE_CONFIG.SNAPSHOT_URL)
    ? String(window.SITE_CONFIG.SNAPSHOT_URL)
    : "assets/data/snapshot.json";
  let snapshotPromise = null;

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

  function jsonp(url, cbName, timeoutMs) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let done = false;

      const cleanup = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[cbName];
        script.remove();
        if (err) reject(err);
      };

      const timer = setTimeout(() => cleanup(new Error("GViz JSONP timeout")), timeoutMs);

      window[cbName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.async = true;
      script.src = url;
      script.onerror = () => cleanup(new Error("GViz JSONP load error"));
      document.head.appendChild(script);
    });
  }

  async function loadSnapshot() {
    if (!snapshotUrl) return null;
    if (!snapshotPromise) {
      const url = (() => {
        try {
          return new URL(snapshotUrl, document.baseURI).href;
        } catch {
          return snapshotUrl;
        }
      })();
      snapshotPromise = fetch(url, { cache: "no-store" })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null);
    }
    return snapshotPromise;
  }

  async function resolveFallback(tabName, stored, errForThrow) {
    if (stored) {
      state.usedStorage = true;
      return stored;
    }

    const snapshot = await loadSnapshot();
    const snapTab = snapshot && snapshot.tabs && Array.isArray(snapshot.tabs[tabName])
      ? snapshot.tabs[tabName]
      : null;

    if (snapTab) {
      state.usedSnapshot = true;
      return snapTab;
    }

    const err = errForThrow || new Error("Sheets fallback missing");
    state.errors.push({ tab: tabName, message: err.message });
    throw err;
  }

  async function fetchTab(sheetId, tabName) {
    const key = `${sheetId}:${tabName}`;
    if (cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);

    const storageKey = `${storagePrefix}${key}`;
    const stored = readStorage(storageKey);

    const promise = (async () => {
      if (!sheetId) {
        const data = await resolveFallback(tabName, stored, new Error("SHEET_ID missing"));
        cache.set(key, data);
        return data;
      }

      if (state.forceFallback) {
        const data = await resolveFallback(tabName, stored, new Error("Sheets unavailable"));
        cache.set(key, data);
        return data;
      }

      const cbName = `__byplanGviz_${runId}_${Math.random().toString(36).slice(2)}`;
      const tqx = `out:json;responseHandler:${cbName};reqId:${runId}`;
      const params = new URLSearchParams({
        sheet: tabName,
        headers: "1",
        tqx
      });
      const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;

      try {
        const payload = await jsonp(url, cbName, 5000);
        if (!payload || payload.status === "error") {
          throw new Error(`GViz error for "${tabName}"`);
        }
        if (!payload.table) return [];
        const objects = tableToObjects(payload.table);
        cache.set(key, objects);
        writeStorage(storageKey, objects);
        return objects;
      } catch (err) {
        state.forceFallback = true;
        const data = await resolveFallback(tabName, stored, err instanceof Error ? err : new Error(String(err)));
        cache.set(key, data);
        return data;
      }
    })();

    inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      inflight.delete(key);
    }
  }

  window.Sheets = { fetchTab, state };
})();
