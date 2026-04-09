# 数据合规项目 - 团队状态板

## 当前阶段目标
让 Web 界面能完整、稳定地呈现 10 项审查结果及整改任务，并补齐缺失的专项包展示。

## 谁在干什么
- **你（前端）**：负责 `data-compliance-web/` 的界面和交互。
  - 当前：正在基于 `test_output/demo_data/` 中的样例 JSON 完善结果页展示。
  - 下一步：风险聚类可视化、整改任务展示、专项审查包（SDK/出境/隐私）展示。
- **朋友（后端/规则）**：负责 `projects/data-compliance-ai-project-kit/` 的审查脚本和配置。
  - 当前：维护规则引擎精度和输出格式。
  - 下一步：保证每次规则输出变化时，同步更新 demo 样例和 API_CONTRACT.md。

## 阻塞项
- [ ] **你**：`app.py` 的 `result_page` 目前只传了 `report`，`remediation/evidence/sdk_pack/cross_border_pack/privacy_pack` 还没传给模板，需要后端配合调整 `result_page` 路由。 **（可先通过 `/dev/result` mock 开发，稍后再接真实数据）**
- [ ] **朋友**：IMA 知识库 API 没权限，需要确认是否能解决或暂时绕过。

## 下一步待做（按优先级）
1. [x] 建立 Git 仓库、.gitignore、API 契约文档
2. [ ] 推送到远程仓库（GitHub/Gitee）
3. [ ] 前端：基于 mock 数据完成 result.html 的整改任务+专项包展示
4. [ ] 后端：更新 `result_page` 路由，把所有专项包 JSON 传给模板
5. [ ] 共同：跑一轮端到端测试（上传文件 → 审查 → 查看结果 → 下载报告）

## 协作规则
- 每天早上开工前 `git pull`，收工时 `git commit + push`。
- 不要通过微信传文件改代码。
- 后端改了 JSON 格式 → 必须同步更新 `test_output/demo_data/`。
- 前端改了页面布局 → 在 `TEAM_STATUS.md` 里 @ 一下后端提醒其检查展示效果。

## 上次同步时间
2026-04-09
