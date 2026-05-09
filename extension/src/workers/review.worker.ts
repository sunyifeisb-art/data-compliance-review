const API_BASE = 'http://127.0.0.1:5100';

self.onmessage = async (event: MessageEvent) => {
  if (event.data?.type !== 'run-review') return;

  try {
    const { documentName, source } = event.data;
    const formData = new FormData();

    if (source.kind === 'text') {
      formData.append('input_text', source.text);
      formData.append('document_name', documentName);
    } else if (source.kind === 'binary') {
      const blob = new Blob([source.bytes], { type: source.mimeType });
      formData.append('file', blob, source.fileName);
    }

    self.postMessage({ type: 'progress', progress: { step: 1, totalSteps: 9, message: '提交审查请求...', status: 'running' } });

    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    if (!uploadRes.ok) throw new Error(`上传失败: ${uploadRes.status}`);
    const { task_id } = await uploadRes.json();
    if (!task_id) throw new Error('服务端未返回任务 ID');

    // 轮询审查进度（API 返回 SSE 格式，需解析 data: 行）
    let attempts = 0;
    let lastStatus = '';
    while (attempts < 120) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const progRes = await fetch(`${API_BASE}/api/progress/${task_id}`);
      if (!progRes.ok) continue;
      const text = await progRes.text();
      // 解析 SSE: 取最后一个 data: JSON 行
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
      if (lines.length === 0) continue;
      const last = JSON.parse(lines[lines.length - 1].slice(6));
      lastStatus = last.status;

      if (last.status === 'completed') {
        self.postMessage({ type: 'progress', progress: { step: 9, totalSteps: 9, message: '审查完成', status: 'completed' } });
        break;
      } else if (last.status === 'failed') {
        throw new Error(last.error || '审查失败');
      } else {
        const step = last.progress?.step || 0;
        const msg = last.progress?.message || '审查进行中...';
        self.postMessage({ type: 'progress', progress: { step, totalSteps: 9, message: msg, status: 'running' } });
      }
    }

    if (attempts >= 120) throw new Error('审查超时');

    // 获取审查结果
    const resultRes = await fetch(`${API_BASE}/api/result/${task_id}`);
    if (!resultRes.ok) throw new Error('获取结果失败');
    const bundle = await resultRes.json();
    bundle.task_id = task_id;

    self.postMessage({ type: 'completed', bundle });
  } catch (error) {
    self.postMessage({
      type: 'failed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
