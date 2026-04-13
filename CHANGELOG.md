# 更新日志

格式参考：`YYYY-MM-DD HH:MM CST` — 修改人 — 一句话总结

---

## 2026-04-13

### 17:02 CST — 你 — 优化风险卡片布局、改写示例精度与前端细节
- 风险卡片左右分栏重新调整：左侧放置「原文摘录 + 风险分析」，右侧放置「修改建议 + 改写后条款」，优化法务阅读动线。
- 风险分析区块新增柠檬黄浅色边框（`--yellow-bg: #fefce8` / `--yellow-border: #fde047`），与修改建议、改写后条款形成更清晰的语义区分。
- 前端进度弹窗新增 checkpoint 去重逻辑，解决 LLM 增强阶段「正在生成 AI 优化建议与改写示例，请稍候…」重复堆叠的问题。
- 优化 `enhance_suggestions_with_llm.py` 的 System Prompt：
  - `optimized_suggestion` 明确禁止 Markdown 表格、列表，要求输出连贯叙述文字；
  - `rewritten_clause` 明确要求基于原文证据进行「针对性改写」，生成可直接替换原文的条款，而非通用模板。
- `render_risk_report.py` 与结果页标签统一从「改写示例」改为「改写后条款」，语义更贴近实际用途。
- **文件改动**：`data-compliance-web/templates/result.html`、`data-compliance-web/templates/index.html`、`data-compliance-web/scripts/enhance_suggestions_with_llm.py`、`data-compliance-web/scripts/render_risk_report.py`

### 16:39 CST — 你 — 修复 Flask 重载导致任务状态丢失与 LLM 增强可用性
- 新增任务状态持久化机制：`app.py` 在每次进度更新、任务完成或失败时将 `tasks[task_id]` 写入 `output/<task_id>/task_state.json`。
- 所有查询路由（`/api/progress`、`/result`、`/api/result`、`/api/download`）优先从磁盘恢复任务状态，解决 `debug=True` 热重载后内存字典丢失导致的「自动复核卡住」和「任务不存在」问题。
- LLM 增强步骤增加独立进度提示「正在生成 AI 优化建议与改写示例」，并支持从 `.deepseek_key` 文件读取 API Key；失败时抛出明确错误信息。
- **文件改动**：`data-compliance-web/app.py`、`CHANGELOG.md`

### 14:26 CST — 你 — 前端输出页重构与首页体验优化
- 将结果页 `result.html` 重构为与首页一致的 Plus Jakarta Sans + Inter 设计系统，统一配色与卡片质感。
- 调整风险卡片两栏布局：左侧仅保留原文摘录，右侧放置「风险分析」与「修改建议」，解决修改建议框过度撑大问题。
- 放大审查结论、优先行动、风险分析、修改建议等区块标题字号，提升可读性。
- 删除结果页中的「审查路径」展示块，减少信息噪音。
- 修复证据清单中风险等级标签换行问题。
- 首页 `index.html` 新增上传文件后自动填充文档名称功能。
- 补充 `requirements.txt` 中缺失的 `pypdf` 依赖，修复 PDF 上传预处理报错。
- **文件改动**：`data-compliance-web/templates/result.html`、`data-compliance-web/templates/index.html`、`data-compliance-web/requirements.txt`

### 14:39 CST — 你 — 同步更新 README 与 Web 端说明文档
- 更新根目录 `README.md`：补充 2026-04-13 前端与体验优化说明，包括设计系统统一、风险卡片分栏、字号优化、自动填充、依赖修复等。
- 更新 `data-compliance-web/README.md`：修正使用步骤、输出内容、功能特点、注意事项和技术说明，增加 PDF 支持、自动填充文档名、自定义 CSS 字体体系等描述。
- **文件改动**：`README.md`、`data-compliance-web/README.md`

### 15:02 CST — 你 — 接入 DeepSeek API，生成非模板化优化建议与改写示例
- 新增 `data-compliance-web/scripts/enhance_suggestions_with_llm.py`：在审查流水线中调用 DeepSeek 大模型，对每个风险项生成更自然、贴合上下文的优化建议，并给出可直接参考的「改写示例」条款。
- 直接替换原有 `suggestion` 为模型生成的优化建议，失败或无 API Key 时自动回退到规则模板建议，保证可用性。
- 更新 `finding.schema.json` 与 `report.schema.json`：新增 `rewritten_clause`（改写示例）与 `llm_enhanced`（是否已成功增强）字段。
- 更新 `run_review_pipeline.py`：在 `auto_recheck_report.py` 之后插入 LLM 增强步骤，输出 `07_report_llm_enhanced.json`。
- 更新 `result.html`：右侧风险卡片新增绿色「改写示例」区块；更新 `render_risk_report.py`：Markdown 报告同步输出改写示例。
- 补充 `requirements.txt`：新增 `openai>=1.30.0`（DeepSeek 兼容 OpenAI SDK）。
- **文件改动**：`data-compliance-web/scripts/enhance_suggestions_with_llm.py`、`data-compliance-web/scripts/run_review_pipeline.py`、`data-compliance-web/scripts/render_risk_report.py`、`data-compliance-web/templates/result.html`、`data-compliance-web/requirements.txt`、`projects/data-compliance-ai-project-kit/config/finding.schema.json`、`projects/data-compliance-ai-project-kit/config/report.schema.json`

## 2026-04-11

### 21:10 CST — 向阳 — 修复下载整改清单失败，并继续压缩报告噪音
- 修复 `/dev/result` 场景下点击下载整改清单返回“任务不存在”的问题：将 `dev-mock` 结果注册到运行时任务表，确保下载链路与正式任务一致。
- 上传链继续补齐二进制文档处理：`preprocess_input.py` 与 `classify_document_type.py` 均已支持 PDF / DOCX / DOC，不再把二进制文件当 UTF-8 文本硬读。
- 结果页继续调整为更贴近法务阅读的顺序：弱化“问题位置”展示，优先突出问题内容、风险说明、主法规依据与条款要点，并将补充规范索引与系统判断详情后置。
- 报告下载补齐 Markdown 输出，方便用户直接阅读或转存。
- 新增仓库根 `README.md`，仅保留本轮最新更新内容与当前状态说明。
- **文件改动**：`data-compliance-web/app.py`、`data-compliance-web/scripts/preprocess_input.py`、`data-compliance-web/scripts/classify_document_type.py`、`data-compliance-web/scripts/run_rule_based_review.py`、`data-compliance-web/scripts/aggregate_review_findings.py`、`data-compliance-web/scripts/render_risk_report.py`、`data-compliance-web/scripts/apply_external_norm_mapping.py`、`data-compliance-web/templates/result.html`、`projects/data-compliance-ai-project-kit/scripts/preprocess_input.py`、`projects/data-compliance-ai-project-kit/scripts/classify_document_type.py`、`projects/data-compliance-ai-project-kit/scripts/apply_external_norm_mapping.py`、`projects/data-compliance-ai-project-kit/scripts/enrich_report_with_regulation_db.py`、`README.md`、`CHANGELOG.md`

## 2026-04-09

### 20:24 CST — 向阳 — 调整更新日志策略：旧日志只追加，不覆盖
- 将 `CHANGELOG.md` 设为安全上传中的特殊合并文件：若本地与远端都新增了日志内容，上传时会自动合并双方日志。
- 合并逻辑保留旧日志与历史日期分组，并优先保留本地新增条目，再补入远端新增条目，避免覆盖旧日志。
- 新增测试覆盖 `CHANGELOG.md` 双边更新场景，并更新 `UPSTREAM.md` 说明 `CHANGELOG-MERGE` 状态与日志追加规则。
- **文件改动**：`projects/data-compliance-ai-project-kit/scripts/safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/tests/test_safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/UPSTREAM.md`、`CHANGELOG.md`
### 20:19 CST — 向阳 — 将同步基线改为本地专用，避免团队互相污染状态
- 将安全上传基线状态文件位置从项目目录内改为本地 `.openclaw/data-compliance-review/default-sync-state.json`，不再进入 GitHub 仓库。
- 更新 `UPSTREAM.md`：明确团队成员同步最新代码后即可共用脚本，但各自需先运行一次 `init` 建立本地基线。
- 重新执行真实 `check` 与 `plan`，当前结果均为无冲突，可安全上传。
- **文件改动**：`projects/data-compliance-ai-project-kit/config/default-sync-source.json`、`projects/data-compliance-ai-project-kit/UPSTREAM.md`、`CHANGELOG.md`

### 20:17 CST — 向阳 — 补充团队共用说明，并新增开发前检查命令
- 为安全上传脚本新增 `check` 命令，用于每次开发前检查本地是否已经追上 GitHub 最新版本。
- 明确团队成员也可共用这套脚本；建议每位成员先执行一次 `init` 建立自己的本地基线状态。
- 更新 `UPSTREAM.md`：补充“团队是否可共用”“开发前检查”“状态解释”等说明。
- 当前真实检查结果为 `AHEAD-LOCAL`：本地存在未上传更新，但未落后于 GitHub 远端。
- **文件改动**：`projects/data-compliance-ai-project-kit/scripts/safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/tests/test_safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/UPSTREAM.md`、`CHANGELOG.md`

### 20:14 CST — 向阳 — 新增安全上传工作流，避免覆盖远端新内容
- 新增 `safe_upload_default_upstream.py` 与 `safe_upload_default_upstream.sh`，用于上传前执行“三方比较”：只自动上传本地单边变更、自动回补远端单边变更、遇到双方同改同一文件时停止。
- 将 `.gitignore`、`CHANGELOG.md` 纳入数据合规项目默认同步范围，并新增 `default-sync-state.json` 作为上传基线状态文件。
- 补充 `UPSTREAM.md` 使用说明，并新增 `test_safe_upload_default_upstream.py` 覆盖核心判定逻辑。
- 已初始化当前基线状态，当前 `plan` 结果显示无冲突，可安全识别本地待上传文件。
- **文件改动**：`projects/data-compliance-ai-project-kit/config/default-sync-source.json`、`projects/data-compliance-ai-project-kit/scripts/safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/scripts/safe_upload_default_upstream.sh`、`projects/data-compliance-ai-project-kit/tests/test_safe_upload_default_upstream.py`、`projects/data-compliance-ai-project-kit/UPSTREAM.md`、`projects/data-compliance-ai-project-kit/config/default-sync-state.json`、`CHANGELOG.md`

### 20:01 CST — 向阳 — 同步远端最新内容并补齐日志规则
- 将远端最新 `CHANGELOG.md` 与 `data-compliance-web/templates/result.html` 同步到本地 workspace。
- 合并更新根目录 `.gitignore`：保留本地 workspace 既有忽略规则，同时补入数据合规仓库所需忽略项。
- 明确后续更新日志书写口径：每次改动都写入 `CHANGELOG.md`，标注**修改人**与**具体更新时间（精确到小时分钟，CST）**。
- **文件改动**：`.gitignore`、`CHANGELOG.md`、`data-compliance-web/templates/result.html`

### 前端改为蓝白 SaaS 风格（你）
- 将 `index.html` 与 `result.html` 整体色调改回蓝白 SaaS 风格（Inter + Noto Sans SC、primary-500 `#3b66f5`）
- 保留优化后的结果页结构：Executive Summary、Sticky 侧边导航、风险详情卡片左右分栏、法规/证据折叠
- **文件改动**：`data-compliance-web/templates/index.html`、`data-compliance-web/templates/result.html`

### 前端样式回滚 + 功能保留（你）
- 将 SaaS 蓝白风格回滚为 original editorial 风格（衬线体、金棕装饰线、灰褐主色）
- 保留并优化了全部功能模块展示：风险聚类、整改任务、证据清单、专项审查包
- 中风险/P2/自动复核 统一从金黄色替换为深灰褐（`#635a4d`），解决视觉疲劳问题
- **文件改动**：`data-compliance-web/templates/index.html`、`data-compliance-web/templates/result.html`

### GitHub 仓库初始化 + 协作文档
- 初始化 Git 仓库，推送到 `https://github.com/AiYuSherry/data-compliance-review`
- 新增 `.gitignore`、`API_CONTRACT.md`、`TEAM_STATUS.md`、`CHANGELOG.md`

### Bug 修复
- 修复 `app.py` 因 `selected_paths` 后端输出为 `dict` 列表导致的 `TypeError: unhashable type: 'dict'`
- 新增 `/dev/result` mock 路由，方便前端独立开发

---

> 提示：你的朋友可以在 GitHub 仓库页面点右上角 **Watch → All activity**，这样每次 push 都会收到邮件通知，实现自动同步。
