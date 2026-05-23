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

---

1.打开 chrome://extensions/
2.开启「开发者模式」
3.点击「加载已解压的扩展程序」
4.选择 dist/ 目录
5.打开 ChatGPT 或 Claude，点击扩展图标

---

src/
├── background.ts              # Service Worker — 消息中继
├── content/
│   └── index.ts               # Content Script — 注入聊天页面
├── core/
│   └── types.ts               # 核心类型定义
├── platforms/
│   ├── base.ts                # PlatformAdapter 接口
│   ├── registry.ts            # 平台注册中心
│   ├── chatgpt.ts             # ChatGPT 适配器
│   ├── claude.ts              # Claude 适配器
│   └── chatgpt/
│       ├── extractor.ts       # DOM 提取 + 文本清洗
│       ├── observer.ts        # MutationObserver 实时监听
│       ├── historyLoader.ts   # 渐进式完整历史加载
│       └── types.ts           # 内部类型
├── formatters/
│   └── markdown.ts            # Conversation → Markdown
├── storage/
│   └── export.ts              # Chrome Storage + 文件下载
└── popup/
    ├── index.html             # 弹窗 UI
    ├── popup.css              # 样式 (暗色模式)
    └── popup.ts               # UI 交互逻辑

---

## 适配器模式 — 新增 AI 平台只需：

-1.创建platforms/新平台.ts，实现 PlatformAdapter 接口
-2.在registry.ts 中注册
🧪 技术栈
层	技术
框架	Chrome Extension Manifest V3
语言	TypeScript (strict)
构建	Vite + @crxjs/vite-plugin
存储	Chrome Storage API (local)
导出	Blob + chrome.downloads API

---

## 🗺 路线图
### MVP (当前)

 ChatGPT / Claude 对话捕获
 Markdown 导出
 完整历史自动加载
 暗色模式
### 未来

 语义搜索 (向量嵌入)
 AI 摘要生成
 思维图谱可视化
 概念链接
 时间线重建
 更多平台 (Gemini, DeepSeek…)
## 📄 许可
-MIT
