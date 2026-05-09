// src/storage/settings.ts
function normalizeSettings(raw) {
  return {
    aiEnabled: raw?.aiEnabled !== false,
    deepseekApiKey: raw?.deepseekApiKey?.trim() || "",
    deepseekBaseUrl: raw?.deepseekBaseUrl?.trim() || "https://api.deepseek.com",
    deepseekModel: raw?.deepseekModel?.trim() || "deepseek-chat"
  };
}
async function loadSettings() {
  if (!globalThis.chrome?.storage?.local) {
    return normalizeSettings({});
  }
  const raw = await chrome.storage.local.get("settings");
  return normalizeSettings(raw.settings);
}

// node_modules/idb/build/index.js
var instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
var idbProxyableTypes;
var cursorAdvanceMethods;
function getIdbProxyableTypes() {
  return idbProxyableTypes || (idbProxyableTypes = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function getCursorAdvanceMethods() {
  return cursorAdvanceMethods || (cursorAdvanceMethods = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
var transactionDoneMap = /* @__PURE__ */ new WeakMap();
var transformCache = /* @__PURE__ */ new WeakMap();
var reverseTransformCache = /* @__PURE__ */ new WeakMap();
function promisifyRequest(request) {
  const promise = new Promise((resolve, reject) => {
    const unlisten = () => {
      request.removeEventListener("success", success);
      request.removeEventListener("error", error);
    };
    const success = () => {
      resolve(wrap(request.result));
      unlisten();
    };
    const error = () => {
      reject(request.error);
      unlisten();
    };
    request.addEventListener("success", success);
    request.addEventListener("error", error);
  });
  reverseTransformCache.set(promise, request);
  return promise;
}
function cacheDonePromiseForTransaction(tx) {
  if (transactionDoneMap.has(tx))
    return;
  const done = new Promise((resolve, reject) => {
    const unlisten = () => {
      tx.removeEventListener("complete", complete);
      tx.removeEventListener("error", error);
      tx.removeEventListener("abort", error);
    };
    const complete = () => {
      resolve();
      unlisten();
    };
    const error = () => {
      reject(tx.error || new DOMException("AbortError", "AbortError"));
      unlisten();
    };
    tx.addEventListener("complete", complete);
    tx.addEventListener("error", error);
    tx.addEventListener("abort", error);
  });
  transactionDoneMap.set(tx, done);
}
var idbProxyTraps = {
  get(target, prop, receiver) {
    if (target instanceof IDBTransaction) {
      if (prop === "done")
        return transactionDoneMap.get(target);
      if (prop === "store") {
        return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
      }
    }
    return wrap(target[prop]);
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  },
  has(target, prop) {
    if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
      return true;
    }
    return prop in target;
  }
};
function replaceTraps(callback) {
  idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
  if (getCursorAdvanceMethods().includes(func)) {
    return function(...args) {
      func.apply(unwrap(this), args);
      return wrap(this.request);
    };
  }
  return function(...args) {
    return wrap(func.apply(unwrap(this), args));
  };
}
function transformCachableValue(value) {
  if (typeof value === "function")
    return wrapFunction(value);
  if (value instanceof IDBTransaction)
    cacheDonePromiseForTransaction(value);
  if (instanceOfAny(value, getIdbProxyableTypes()))
    return new Proxy(value, idbProxyTraps);
  return value;
}
function wrap(value) {
  if (value instanceof IDBRequest)
    return promisifyRequest(value);
  if (transformCache.has(value))
    return transformCache.get(value);
  const newValue = transformCachableValue(value);
  if (newValue !== value) {
    transformCache.set(value, newValue);
    reverseTransformCache.set(newValue, value);
  }
  return newValue;
}
var unwrap = (value) => reverseTransformCache.get(value);
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
  const request = indexedDB.open(name, version);
  const openPromise = wrap(request);
  if (upgrade) {
    request.addEventListener("upgradeneeded", (event) => {
      upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
    });
  }
  if (blocked) {
    request.addEventListener("blocked", (event) => blocked(
      // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
      event.oldVersion,
      event.newVersion,
      event
    ));
  }
  openPromise.then((db) => {
    if (terminated)
      db.addEventListener("close", () => terminated());
    if (blocking) {
      db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
    }
  }).catch(() => {
  });
  return openPromise;
}
var readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
var writeMethods = ["put", "add", "delete", "clear"];
var cachedMethods = /* @__PURE__ */ new Map();
function getMethod(target, prop) {
  if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
    return;
  }
  if (cachedMethods.get(prop))
    return cachedMethods.get(prop);
  const targetFuncName = prop.replace(/FromIndex$/, "");
  const useIndex = prop !== targetFuncName;
  const isWrite = writeMethods.includes(targetFuncName);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
  ) {
    return;
  }
  const method = async function(storeName, ...args) {
    const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
    let target2 = tx.store;
    if (useIndex)
      target2 = target2.index(args.shift());
    return (await Promise.all([
      target2[targetFuncName](...args),
      isWrite && tx.done
    ]))[0];
  };
  cachedMethods.set(prop, method);
  return method;
}
replaceTraps((oldTraps) => ({
  ...oldTraps,
  get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
  has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
}));
var advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
var methodMap = {};
var advanceResults = /* @__PURE__ */ new WeakMap();
var ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
var cursorIteratorTraps = {
  get(target, prop) {
    if (!advanceMethodProps.includes(prop))
      return target[prop];
    let cachedFunc = methodMap[prop];
    if (!cachedFunc) {
      cachedFunc = methodMap[prop] = function(...args) {
        advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
      };
    }
    return cachedFunc;
  }
};
async function* iterate(...args) {
  let cursor = this;
  if (!(cursor instanceof IDBCursor)) {
    cursor = await cursor.openCursor(...args);
  }
  if (!cursor)
    return;
  cursor = cursor;
  const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
  ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
  reverseTransformCache.set(proxiedCursor, unwrap(cursor));
  while (cursor) {
    yield proxiedCursor;
    cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
    advanceResults.delete(proxiedCursor);
  }
}
function isIteratorProp(target, prop) {
  return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
}
replaceTraps((oldTraps) => ({
  ...oldTraps,
  get(target, prop, receiver) {
    if (isIteratorProp(target, prop))
      return iterate;
    return oldTraps.get(target, prop, receiver);
  },
  has(target, prop) {
    return isIteratorProp(target, prop) || oldTraps.has(target, prop);
  }
}));

// src/storage/db.ts
var DB_NAME = "data-compliance-review-extension";
var DB_VERSION = 1;
var JOB_STORE = "jobs";
var dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(JOB_STORE)) {
      const store = db.createObjectStore(JOB_STORE, { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
      store.createIndex("status", "status");
    }
  }
});
async function putJob(job) {
  const db = await dbPromise;
  await db.put(JOB_STORE, job);
}
async function getJob(jobId2) {
  const db = await dbPromise;
  return db.get(JOB_STORE, jobId2);
}

// src/storage/jobs.ts
async function updateJobProgress(jobId2, progress, status = "running") {
  const job = await getJob(jobId2);
  if (!job) return;
  await putJob({
    ...job,
    status,
    progress,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function completeJob(jobId2, result) {
  const job = await getJob(jobId2);
  if (!job) return;
  await putJob({
    ...job,
    status: "completed",
    progress: {
      step: 9,
      totalSteps: 9,
      message: "\u5BA1\u67E5\u5B8C\u6210",
      status: "completed"
    },
    result,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function failJob(jobId2, error) {
  const job = await getJob(jobId2);
  if (!job) return;
  await putJob({
    ...job,
    status: "failed",
    error,
    progress: {
      ...job.progress,
      status: "failed",
      message: error
    },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// src/ui/result.ts
var app = document.querySelector("#app");
var params = new URLSearchParams(window.location.search);
var jobId = params.get("jobId");
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function renderLoading(job) {
  const pct = Math.round(job.progress.step / job.progress.totalSteps * 100);
  app.innerHTML = `
    <section class="hero-shell">
      <div class="hero-card">
        <p class="eyebrow">\u6B63\u5728\u5BA1\u67E5</p>
        <h1>${escapeHtml(job.documentName)}</h1>
        <p class="supporting">${escapeHtml(job.progress.message)}</p>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-meta"><span>\u8FDB\u5EA6</span><span>${pct}%</span></div>
      </div>
    </section>
  `;
}
function downloadBlob(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
function renderList(items, className = "") {
  if (!items.length) return '<p class="detail-empty">\u6682\u65E0</p>';
  return `<ul class="${className || "detail-list"}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}
function renderRegulationCards(regulations) {
  return regulations.map(
    (reg) => `
        <article class="reg-card">
          <div class="risk-meta-row">
            ${reg.standard_code ? `<span class="reg-code">${escapeHtml(reg.standard_code)}</span>` : ""}
            <span class="task-owner">${escapeHtml(reg.effect_level || reg.doc_category || "\u89C4\u8303\u7D22\u5F15")}</span>
          </div>
          <h4>${escapeHtml(reg.title)}</h4>
          ${reg.match_keywords?.length ? `<p class="detail-muted">\u547D\u4E2D\u8BCD\uFF1A${escapeHtml(reg.match_keywords.join("\u3001"))}</p>` : ""}
          ${reg.snippet ? `<p class="reg-snippet">${escapeHtml(reg.snippet)}</p>` : ""}
        </article>
      `
  ).join("");
}
function renderRiskCard(item) {
  const summaryReason = item.missing_groups?.length ? `\u8BE5\u5904\u672A\u660E\u786E ${item.missing_groups.join("\u3001")}\uFF0C\u5B58\u5728 ${item.risk_point}\u3002` : item.ambiguity_hits?.length ? `\u8BE5\u5904\u5B58\u5728\u300C${item.ambiguity_hits.join("\u3001")}\u300D\u7B49\u6A21\u7CCA\u8868\u8FF0\uFF0C\u5B58\u5728 ${item.risk_point}\u3002` : `\u8BE5\u5904\u5B58\u5728 ${item.risk_point}\u3002`;
  return `
    <article class="risk-item">
      <div class="risk-meta-row">
        <div class="risk-meta-row">
          <span class="risk-badge badge-${item.risk_level}">${item.risk_level}</span>
          ${item.theme_name ? `<span class="theme-tag">${escapeHtml(item.theme_name)}</span>` : ""}
        </div>
        ${item.auto_recheck_status ? `<span class="task-owner">${escapeHtml(item.auto_recheck_status)}</span>` : ""}
      </div>
      <h3>${escapeHtml(item.risk_point)}</h3>

      ${item.evidence?.length ? `
            <div class="quote-block">
              <p class="info-label">\u539F\u6587\u6458\u5F55</p>
              ${item.evidence.slice(0, 2).map((evidence) => `<blockquote class="risk-quote">${escapeHtml(evidence)}</blockquote>`).join("")}
            </div>
          ` : ""}

      <div class="analysis-box">
        <p class="info-label">\u95EE\u9898\u8BE6\u60C5</p>
        <p class="risk-reason">${escapeHtml(summaryReason)}</p>
      </div>

      <div class="two-col">
        <div class="info-box">
          <p class="info-label">\u6CD5\u89C4\u4F9D\u636E</p>
          <p class="detail-primary">${escapeHtml(item.legal_basis || "\u5F85\u8865\u5145")}</p>
        </div>
        <div class="info-box">
          <p class="info-label">\u4FEE\u6539\u5EFA\u8BAE</p>
          <p>${escapeHtml(item.suggestion)}</p>
        </div>
      </div>

      ${item.rewritten_clause ? `
            <div class="info-box" style="margin-top:16px">
              <p class="info-label">\u6539\u5199\u540E\u6761\u6B3E</p>
              <p>${escapeHtml(item.rewritten_clause)}</p>
            </div>
          ` : ""}

      <details class="detail-panel">
        <summary>\u6CD5\u89C4\u4F9D\u636E\u4E0E\u5B9A\u4F4D\u8BE6\u60C5</summary>
        <div class="detail-grid">
          <div class="info-box">
            <p class="info-label">\u7CFB\u7EDF\u5224\u65AD\u8BE6\u60C5</p>
            <p>${escapeHtml(item.reason)}</p>
          </div>
          ${item.auto_recheck_notes ? `
                <div class="info-box">
                  <p class="info-label">\u81EA\u52A8\u590D\u6838\u8BF4\u660E</p>
                  <p>${escapeHtml(item.auto_recheck_notes)}</p>
                </div>
              ` : ""}
          ${item.trigger_hits?.length ? `
                <div class="info-box">
                  <p class="info-label">\u89E6\u53D1\u4E3B\u9898</p>
                  ${renderList(item.trigger_hits, "chip-list")}
                </div>
              ` : ""}
          ${item.missing_groups?.length ? `
                <div class="info-box">
                  <p class="info-label">\u5F85\u8865\u8981\u7D20</p>
                  ${renderList(item.missing_groups, "chip-list")}
                </div>
              ` : ""}
          ${item.ambiguity_hits?.length ? `
                <div class="info-box">
                  <p class="info-label">\u6A21\u7CCA\u8868\u8FF0</p>
                  ${renderList(item.ambiguity_hits, "chip-list")}
                </div>
              ` : ""}
          ${item.path_ids?.length ? `
                <div class="info-box">
                  <p class="info-label">\u547D\u4E2D\u5BA1\u67E5\u8DEF\u5F84</p>
                  ${renderList(item.path_ids, "chip-list")}
                </div>
              ` : ""}
          ${item.supporting_regulations?.length ? `
                <div class="detail-span">
                  <p class="info-label">\u8865\u5145\u89C4\u8303\u7D22\u5F15</p>
                  <div class="reg-grid">${renderRegulationCards(item.supporting_regulations)}</div>
                </div>
              ` : ""}
          ${item.evidence?.length ? `
                <div class="detail-span">
                  <p class="info-label">\u8865\u5145\u8BC1\u636E\u7247\u6BB5</p>
                  ${item.evidence.map((evidence) => `<blockquote class="risk-quote">${escapeHtml(evidence)}</blockquote>`).join("")}
                </div>
              ` : ""}
        </div>
      </details>
    </article>
  `;
}
function renderCompleted(job, bundle) {
  const riskStats = bundle.report.stats;
  const topTask = bundle.remediation.tasks[0];
  app.innerHTML = `
    <header class="result-header">
      <div>
        <p class="eyebrow">\u5BA1\u67E5\u5B8C\u6210</p>
        <h1>${escapeHtml(bundle.report.document_name)}</h1>
        <p class="supporting">${escapeHtml(bundle.report.summary)}</p>
      </div>
      <div class="header-actions">
        <button id="downloadJsonButton" class="secondary-button">\u4E0B\u8F7D JSON</button>
        <button id="downloadMarkdownButton" class="primary-button">\u4E0B\u8F7D Markdown</button>
      </div>
    </header>

    <section class="overview-grid">
      <article class="overview-card">
        <p class="card-label">\u5BA1\u67E5\u7ED3\u8BBA</p>
        <div class="risk-tally">
          <div><strong>${riskStats.high_risk}</strong><span>\u9AD8\u98CE\u9669</span></div>
          <div><strong>${riskStats.medium_risk}</strong><span>\u4E2D\u98CE\u9669</span></div>
          <div><strong>${riskStats.advisory}</strong><span>\u5EFA\u8BAE\u4F18\u5316</span></div>
        </div>
        ${bundle.report.auto_recheck_triggered ? `<div class="notice-bar">\u5DF2\u89E6\u53D1\u81EA\u52A8\u590D\u6838\uFF1A${escapeHtml(bundle.report.auto_recheck_summary || "\u7CFB\u7EDF\u5DF2\u5B8C\u6210\u81EA\u52A8\u590D\u6838")}</div>` : ""}
      </article>
      <article class="overview-card">
        <p class="card-label">\u4F18\u5148\u884C\u52A8</p>
        <h2>${escapeHtml(topTask?.title || "\u6682\u65E0\u6574\u6539\u4EFB\u52A1")}</h2>
        <p>${escapeHtml(topTask?.objective || "\u5F53\u524D\u672A\u751F\u6210\u6574\u6539\u4EFB\u52A1\u3002")}</p>
      </article>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h2>\u62A5\u544A\u8BF4\u660E</h2>
        <span>${bundle.report.selected_review_paths.length} \u6761\u5BA1\u67E5\u8DEF\u5F84</span>
      </div>
      <div class="info-box report-meta-box">
        <p><strong>\u5BA1\u67E5\u8303\u56F4\uFF1A</strong>${escapeHtml(bundle.report.review_scope)}</p>
        <p><strong>\u6587\u6863\u7C7B\u578B\uFF1A</strong>${escapeHtml(bundle.report.document_type)}</p>
        <p><strong>\u547D\u4E2D\u8DEF\u5F84\uFF1A</strong>${escapeHtml(bundle.report.selected_review_paths.join("\u3001") || "\u672A\u8BC6\u522B")}</p>
        ${bundle.report.notes?.length ? `<div class="note-list">${bundle.report.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>` : ""}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h2>\u98CE\u9669\u8BE6\u60C5</h2>
        <span>${bundle.report.items.length} \u9879\u53D1\u73B0</span>
      </div>
      <div class="risk-list">${bundle.report.items.map((item) => renderRiskCard(item)).join("")}</div>
    </section>

    ${bundle.report.risk_clusters?.length ? `
          <section class="section-block">
            <div class="section-head">
              <h2>\u98CE\u9669\u805A\u7C7B</h2>
              <span>${bundle.report.risk_clusters.length} \u4E2A\u4E3B\u9898</span>
            </div>
            <div class="cluster-grid">
              ${bundle.report.risk_clusters.map(
    (cluster) => `
                    <article class="cluster-card">
                      <div class="risk-meta-row">
                        <h3>${escapeHtml(cluster.theme_name)}</h3>
                        <span class="task-owner">${cluster.item_count} \u9879</span>
                      </div>
                      <p class="detail-muted">\u9AD8\u98CE\u9669 ${cluster.high_risk_count} / \u4E2D\u98CE\u9669 ${cluster.medium_risk_count} / \u5EFA\u8BAE\u4F18\u5316 ${cluster.advisory_count}</p>
                      <p>${escapeHtml(cluster.risk_points.join("\u3001"))}</p>
                    </article>
                  `
  ).join("")}
            </div>
          </section>
        ` : ""}

    <section class="section-block">
      <div class="section-head">
        <h2>\u6574\u6539\u4EFB\u52A1</h2>
        <span>P1 ${bundle.remediation.priority_counts.P1} / P2 ${bundle.remediation.priority_counts.P2}</span>
      </div>
      <div class="task-list">
        ${bundle.remediation.tasks.map((task) => {
    const item = task;
    return `
              <article class="task-card">
                <div class="risk-meta-row">
                  <span class="priority-chip">${escapeHtml(item.priority || "P3")}</span>
                  <span class="task-owner">${escapeHtml(item.owner_hint || "\u5F85\u6307\u6D3E")}</span>
                </div>
                <h3>${escapeHtml(item.title || "")}</h3>
                <p>${escapeHtml(item.objective || "")}</p>
                ${Array.isArray(item.suggested_actions) && item.suggested_actions.length ? `<div class="task-subsection"><p class="info-label">\u5EFA\u8BAE\u52A8\u4F5C</p>${renderList(item.suggested_actions)}</div>` : ""}
                ${Array.isArray(item.required_evidence) && item.required_evidence.length ? `<div class="task-subsection"><p class="info-label">\u6240\u9700\u8BC1\u660E\u6750\u6599</p>${renderList(item.required_evidence)}</div>` : ""}
              </article>
            `;
  }).join("")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <h2>\u8BC1\u636E\u6E05\u5355</h2>
        <span>${bundle.evidence.checklist_count} \u9879</span>
      </div>
      <div class="evidence-list">
        ${bundle.evidence.checklist.map(
    (row) => `
              <article class="evidence-card">
                <div class="risk-meta-row">
                  <span class="risk-badge badge-${row.risk_level}">${row.risk_level}</span>
                  <span class="task-owner">${escapeHtml(row.owner_hint)}</span>
                </div>
                <h3>${escapeHtml(row.risk_point)}</h3>
                <p class="detail-muted">${escapeHtml(row.why_needed)}</p>
                <ul>${row.evidence_items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </article>
            `
  ).join("")}
      </div>
    </section>
  `;
  document.querySelector("#downloadJsonButton")?.addEventListener("click", () => {
    downloadBlob(`${bundle.report.document_name}_report.json`, JSON.stringify(bundle.report, null, 2), "application/json");
  });
  document.querySelector("#downloadMarkdownButton")?.addEventListener("click", () => {
    downloadBlob(`${bundle.report.document_name}_report.md`, bundle.markdown, "text/markdown");
  });
}
function renderFailure(job) {
  app.innerHTML = `
    <section class="hero-shell">
      <div class="hero-card error-card">
        <p class="eyebrow">\u5BA1\u67E5\u5931\u8D25</p>
        <h1>${escapeHtml(job.documentName)}</h1>
        <p class="supporting">${escapeHtml(job.error || job.progress.message)}</p>
      </div>
    </section>
  `;
}
async function runJob(job) {
  const settings = await loadSettings();
  const worker = new Worker(chrome.runtime.getURL("workers/review.worker.js"), {
    type: "module"
  });
  worker.postMessage({
    type: "run-review",
    documentName: job.documentName,
    source: job.source,
    settings
  });
  worker.onmessage = async (event) => {
    if (event.data?.type === "progress") {
      await updateJobProgress(job.id, event.data.progress, "running");
      const fresh = await getJob(job.id);
      if (fresh) renderLoading(fresh);
      return;
    }
    if (event.data?.type === "completed") {
      await completeJob(job.id, event.data.bundle);
      const fresh = await getJob(job.id);
      if (fresh?.result) renderCompleted(fresh, fresh.result);
      worker.terminate();
      return;
    }
    if (event.data?.type === "failed") {
      await failJob(job.id, event.data.error);
      const fresh = await getJob(job.id);
      if (fresh) renderFailure(fresh);
      worker.terminate();
    }
  };
}
async function init() {
  if (!jobId) {
    app.innerHTML = '<p class="empty-state">\u7F3A\u5C11\u4EFB\u52A1 ID\u3002</p>';
    return;
  }
  const job = await getJob(jobId);
  if (!job) {
    app.innerHTML = '<p class="empty-state">\u672A\u627E\u5230\u5BF9\u5E94\u4EFB\u52A1\u3002</p>';
    return;
  }
  if (job.status === "completed" && job.result) {
    renderCompleted(job, job.result);
    return;
  }
  if (job.status === "failed") {
    renderFailure(job);
    return;
  }
  renderLoading(job);
  await runJob(job);
}
init().catch((error) => {
  app.innerHTML = `<p class="empty-state">${escapeHtml(String(error))}</p>`;
});
//# sourceMappingURL=result.js.map
