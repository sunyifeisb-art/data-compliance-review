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
async function listJobs(limit = 10) {
  const db = await dbPromise;
  const jobs = await db.getAll(JOB_STORE);
  return jobs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);
}

// src/storage/jobs.ts
function createInitialProgress() {
  return {
    step: 0,
    totalSteps: 9,
    message: "\u51C6\u5907\u5F00\u59CB",
    status: "pending"
  };
}
function createJobId() {
  return Math.random().toString(36).slice(2, 10);
}
async function createReviewJob(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const job = {
    id: input.id ?? createJobId(),
    documentName: input.documentName,
    source: input.source,
    reviewType: input.reviewType ?? "document",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    progress: createInitialProgress()
  };
  await putJob(job);
  return job;
}

// src/ui/sidepanel.ts
var documentNameInput = document.querySelector("#documentName");
var textInput = document.querySelector("#textInput");
var fileInput = document.querySelector("#fileInput");
var uploadZone = document.querySelector("#uploadZone");
var fileCard = document.querySelector("#fileCard");
var fileNameEl = document.querySelector("#fileName");
var fileSizeEl = document.querySelector("#fileSize");
var fileRemove = document.querySelector("#fileRemove");
var pickFileButton = document.querySelector("#pickFileButton");
var currentPageButton = document.querySelector("#currentPageButton");
var startButton = document.querySelector("#startReviewButton");
var statusBox = document.querySelector("#statusBox");
var recentJobs = document.querySelector("#recentJobs");
var settingsButton = document.querySelector("#openSettingsButton");
var reviewToggle = document.querySelector("#reviewToggle");
var toggleIndicator = document.querySelector("#toggleIndicator");
var pendingSource = null;
var reviewType = "document";
function setStatus(message, tone = "info") {
  statusBox.textContent = message;
  statusBox.dataset.tone = tone;
}
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function showFileCard(name, size) {
  fileNameEl.textContent = name;
  fileSizeEl.textContent = formatFileSize(size);
  fileCard.style.display = "flex";
  uploadZone.style.display = "none";
}
function hideFileCard() {
  fileCard.style.display = "none";
  uploadZone.style.display = "grid";
}
function setModeCopy(type) {
  const zoneTitle = uploadZone.querySelector("h3");
  const zoneDesc = uploadZone.querySelector("p");
  if (!zoneTitle || !zoneDesc) return;
  if (type === "code") {
    zoneTitle.textContent = "\u70B9\u51FB\u6216\u62D6\u62FD\u4E0A\u4F20\u4EE3\u7801\u6587\u4EF6";
    zoneDesc.textContent = "\u652F\u6301 ZIP\u3001JS\u3001PY\u3001TS\u3001Java\u3001Go \u7B49";
  } else {
    zoneTitle.textContent = "\u70B9\u51FB\u6216\u62D6\u62FD\u4E0A\u4F20\u6587\u6863";
    zoneDesc.textContent = "\u652F\u6301 PDF\u3001Word\u3001Markdown\u3001TXT";
  }
}
async function refreshJobs() {
  const jobs = await listJobs(8);
  if (!jobs.length) {
    recentJobs.innerHTML = '<p class="empty-state">\u8FD8\u6CA1\u6709\u5BA1\u67E5\u8BB0\u5F55\u3002</p>';
    return;
  }
  recentJobs.innerHTML = jobs.map(
    (job) => `
        <a class="history-item" data-job-id="${job.id}">
          <div>
            <div class="history-name">${job.documentName}</div>
            <div class="history-meta">${new Date(job.updatedAt).toLocaleString()}</div>
          </div>
          <span class="history-status">${job.status}</span>
        </a>
      `
  ).join("");
  recentJobs.querySelectorAll("[data-job-id]").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await chrome.runtime.sendMessage({
        type: "openResultPage",
        jobId: link.dataset.jobId
      });
    });
  });
}
async function selectFile(file) {
  const bytes = await file.arrayBuffer();
  pendingSource = {
    kind: "binary",
    fileName: file.name,
    mimeType: file.type || inferMimeType(file.name),
    bytes
  };
  if (!documentNameInput.value.trim()) {
    documentNameInput.value = file.name.replace(/\.[^.]+$/, "");
  }
  showFileCard(file.name, file.size);
  textInput.value = "";
  setStatus(`\u5DF2\u9009\u62E9\u6587\u4EF6\uFF1A${file.name}`);
}
function inferMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".md")) return "text/markdown";
  return "text/plain";
}
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const nextType = btn.dataset.reviewType || "document";
    if (nextType === reviewType) return;
    document.querySelectorAll(".mode-btn").forEach((item) => {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    reviewType = nextType;
    reviewToggle.dataset.active = nextType;
    toggleIndicator.classList.toggle("code-active", nextType === "code");
    pendingSource = null;
    fileInput.value = "";
    hideFileCard();
    setModeCopy(reviewType);
  });
  btn.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(document.querySelectorAll(".mode-btn"));
    const index = buttons.indexOf(btn);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
    buttons[nextIndex].click();
  });
});
uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-active");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-active");
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-active");
  const file = e.dataTransfer?.files?.[0];
  if (file) selectFile(file);
});
pickFileButton.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  await selectFile(file);
});
fileRemove.addEventListener("click", () => {
  pendingSource = null;
  fileInput.value = "";
  hideFileCard();
  setStatus("\u7B49\u5F85\u8F93\u5165");
});
currentPageButton.addEventListener("click", async () => {
  setStatus("\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u9875 PDF...");
  const response = await chrome.runtime.sendMessage({ type: "readCurrentTabPdf" });
  if (!response?.ok) {
    setStatus(response?.error || "\u5F53\u524D\u9875\u9762\u65E0\u6CD5\u8BFB\u53D6 PDF", "error");
    return;
  }
  const bytes = new Uint8Array(response.payload.bytes).buffer;
  const fileName = response.payload.fileName;
  pendingSource = {
    kind: "binary",
    fileName,
    mimeType: response.payload.mimeType,
    bytes
  };
  if (!documentNameInput.value.trim()) {
    documentNameInput.value = fileName.replace(/\.[^.]+$/, "");
  }
  showFileCard(fileName, bytes.byteLength);
  textInput.value = "";
  setStatus(`\u5DF2\u8BFB\u53D6\u5F53\u524D\u9875 PDF\uFF1A${fileName}`);
});
settingsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "openOptionsPage" });
});
startButton.addEventListener("click", async () => {
  const documentName = documentNameInput.value.trim();
  if (!documentName) {
    setStatus("\u8BF7\u8F93\u5165\u6587\u6863\u540D\u79F0", "error");
    return;
  }
  let source = pendingSource;
  const text = textInput.value.trim();
  if (!source && text) {
    source = {
      kind: "text",
      fileName: `${documentName}.txt`,
      text
    };
  }
  if (!source) {
    setStatus("\u8BF7\u4E0A\u4F20\u6587\u4EF6\u3001\u7C98\u8D34\u6587\u672C\uFF0C\u6216\u8BFB\u53D6\u5F53\u524D\u9875 PDF", "error");
    return;
  }
  const job = await createReviewJob({ documentName, source, reviewType });
  setStatus("\u5DF2\u521B\u5EFA\u4EFB\u52A1\uFF0C\u6B63\u5728\u6253\u5F00\u7ED3\u679C\u9875...");
  await chrome.runtime.sendMessage({ type: "openResultPage", jobId: job.id });
  await refreshJobs();
});
refreshJobs().catch((error) => setStatus(String(error), "error"));
//# sourceMappingURL=sidepanel.js.map
