// src/workers/review.worker.ts
var API_BASE = "http://127.0.0.1:5100";
self.onmessage = async (event) => {
  if (event.data?.type !== "run-review") return;
  try {
    const { documentName, source, reviewType } = event.data;
    const formData = new FormData();
    formData.append("document_name", documentName);
    formData.append("review_type", reviewType || "document");
    if (source.kind === "text") {
      formData.append("input_text", source.text);
    } else if (source.kind === "binary") {
      const blob = new Blob([source.bytes], { type: source.mimeType });
      formData.append("file", blob, source.fileName);
    }
    self.postMessage({ type: "progress", progress: { step: 1, totalSteps: 9, message: "\u63D0\u4EA4\u5BA1\u67E5\u8BF7\u6C42...", status: "running" } });
    let taskId;
    try {
      const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        throw new Error(`\u4E0A\u4F20\u5931\u8D25 (${uploadRes.status}): ${errText || uploadRes.statusText}`);
      }
      const uploadData = await uploadRes.json();
      taskId = uploadData.task_id;
      if (!taskId) throw new Error("\u670D\u52A1\u7AEF\u672A\u8FD4\u56DE\u4EFB\u52A1 ID");
    } catch (err) {
      throw new Error(`\u4E0A\u4F20\u8BF7\u6C42\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
    }
    let attempts = 0;
    let lastStatus = "";
    while (attempts < 120) {
      await new Promise((r) => setTimeout(r, 2e3));
      attempts++;
      let progRes;
      try {
        progRes = await fetch(`${API_BASE}/api/progress/${taskId}`);
      } catch (err) {
        self.postMessage({ type: "progress", progress: { step: attempts, totalSteps: 9, message: `\u8FDE\u63A5\u4E2D... (${attempts})`, status: "running" } });
        continue;
      }
      if (!progRes.ok) {
        self.postMessage({ type: "progress", progress: { step: attempts, totalSteps: 9, message: `\u67E5\u8BE2\u8FDB\u5EA6... (${attempts})`, status: "running" } });
        continue;
      }
      const text = await progRes.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      if (lines.length === 0) continue;
      let last;
      try {
        last = JSON.parse(lines[lines.length - 1].slice(6));
      } catch {
        continue;
      }
      lastStatus = last.status;
      if (last.status === "completed") {
        self.postMessage({ type: "progress", progress: { step: 9, totalSteps: 9, message: "\u5BA1\u67E5\u5B8C\u6210", status: "completed" } });
        break;
      } else if (last.status === "failed") {
        throw new Error(last.error || last.message || "\u5BA1\u67E5\u5931\u8D25");
      } else {
        const step = last.progress?.step || 0;
        const msg = last.progress?.message || "\u5BA1\u67E5\u8FDB\u884C\u4E2D...";
        self.postMessage({ type: "progress", progress: { step, totalSteps: 9, message: msg, status: "running" } });
      }
    }
    if (attempts >= 120) throw new Error("\u5BA1\u67E5\u8D85\u65F6\uFF08\u8D85\u8FC7 4 \u5206\u949F\uFF09");
    let bundle;
    try {
      const resultRes = await fetch(`${API_BASE}/api/result/${taskId}`);
      if (!resultRes.ok) {
        const errText = await resultRes.text().catch(() => "");
        throw new Error(`\u83B7\u53D6\u7ED3\u679C\u5931\u8D25 (${resultRes.status}): ${errText || resultRes.statusText}`);
      }
      bundle = await resultRes.json();
      bundle.task_id = taskId;
    } catch (err) {
      throw new Error(`\u83B7\u53D6\u7ED3\u679C\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
    }
    self.postMessage({ type: "completed", bundle });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "failed", error: message });
  }
};
//# sourceMappingURL=review.worker.js.map
