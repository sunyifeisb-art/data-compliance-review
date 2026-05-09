// src/workers/review.worker.ts
var API_BASE = "http://127.0.0.1:5100";
self.onmessage = async (event) => {
  if (event.data?.type !== "run-review") return;
  try {
    const { documentName, source } = event.data;
    const formData = new FormData();
    if (source.kind === "text") {
      formData.append("input_text", source.text);
      formData.append("document_name", documentName);
    } else if (source.kind === "binary") {
      const blob = new Blob([source.bytes], { type: source.mimeType });
      formData.append("file", blob, source.fileName);
    }
    self.postMessage({ type: "progress", progress: { step: 1, totalSteps: 9, message: "\u63D0\u4EA4\u5BA1\u67E5\u8BF7\u6C42...", status: "running" } });
    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
    if (!uploadRes.ok) throw new Error(`\u4E0A\u4F20\u5931\u8D25: ${uploadRes.status}`);
    const { task_id } = await uploadRes.json();
    if (!task_id) throw new Error("\u670D\u52A1\u7AEF\u672A\u8FD4\u56DE\u4EFB\u52A1 ID");
    let attempts = 0;
    let lastStatus = "";
    while (attempts < 120) {
      await new Promise((r) => setTimeout(r, 2e3));
      attempts++;
      const progRes = await fetch(`${API_BASE}/api/progress/${task_id}`);
      if (!progRes.ok) continue;
      const text = await progRes.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      if (lines.length === 0) continue;
      const last = JSON.parse(lines[lines.length - 1].slice(6));
      lastStatus = last.status;
      if (last.status === "completed") {
        self.postMessage({ type: "progress", progress: { step: 9, totalSteps: 9, message: "\u5BA1\u67E5\u5B8C\u6210", status: "completed" } });
        break;
      } else if (last.status === "failed") {
        throw new Error(last.error || "\u5BA1\u67E5\u5931\u8D25");
      } else {
        const step = last.progress?.step || 0;
        const msg = last.progress?.message || "\u5BA1\u67E5\u8FDB\u884C\u4E2D...";
        self.postMessage({ type: "progress", progress: { step, totalSteps: 9, message: msg, status: "running" } });
      }
    }
    if (attempts >= 120) throw new Error("\u5BA1\u67E5\u8D85\u65F6");
    const resultRes = await fetch(`${API_BASE}/api/result/${task_id}`);
    if (!resultRes.ok) throw new Error("\u83B7\u53D6\u7ED3\u679C\u5931\u8D25");
    const bundle = await resultRes.json();
    bundle.task_id = task_id;
    self.postMessage({ type: "completed", bundle });
  } catch (error) {
    self.postMessage({
      type: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
//# sourceMappingURL=review.worker.js.map
