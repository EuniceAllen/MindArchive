# 🧠 MindArchive

> 本地优先的 AI 对话归档系统 — 你的第二大脑

MindArchive 是一个 Chrome 扩展，将你与 ChatGPT、Claude 等 AI 模型的对话**一键捕获、转码为 Markdown、本地存档**。它不只是导出工具，而是面向长期记忆管理的认知档案系统。

---

## ✨ 功能

- 🔍 **自动检测** — 打开 ChatGPT / Claude 对话页，扩展自动识别平台
- 📥 **一键捕获** — 提取对话中的所有消息（用户 + 助手）
- 📜 **完整历史加载** — 自动向上滚动，逐批触发 ChatGPT 懒加载，直到整段对话全部载入 DOM
- 📝 **Markdown 导出** — YAML frontmatter + 清晰时间线格式，可被任何 Markdown 编辑器、静态站点、RAG 管道消费
- 💾 **本地存储** — 所有数据保存在 Chrome Local Storage，不上传任何服务器
- 🌙 **暗色模式** — 自动跟随系统主题

---

## 🚀 快速开始

```bash
git clone https://github.com/EuniceAllen/MindArchive.git
cd mindarchive
npm install
npm run build
