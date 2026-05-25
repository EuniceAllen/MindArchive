# 🧠 MindArchive 2.0

![MIT](https://img.shields.io/badge/license-MIT-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![Version](https://img.shields.io/badge/version-2.0-6366f1)

> 把 AI 对话变成**可检索、可沉淀、可长期使用的知识资产**

MindArchive 是一个本地优先的 Chrome 扩展，用于捕获 ChatGPT / Claude / DeepSeek 上的对话，并自动转换为结构化 Markdown 知识档案。**所有数据保存在本地，不上传任何服务器。**

---

## ✨ 核心能力

| 能力 | 说明 |
|------|------|
| 📥 **一键捕获** | 自动提取当前对话的用户+AI 完整上下文 |
| 🔌 **多平台支持** | ChatGPT · Claude · DeepSeek，插件式架构可扩展 |
| 📝 **结构化 Markdown** | YAML frontmatter + 时间线结构，兼容 Obsidian / Notion / RAG |
| 🛡️ **本地优先** | 零网络上传，完全离线可用，隐私至上 |
| 🌙 **自动暗色模式** | 跟随系统主题 |

---

## 🎬 快速开始

```bash
git clone https://github.com/EuniceAllen/MindArchive.git
cd MindArchive
npm install
npm run build
```

### 安装扩展

1. 打开 `chrome://extensions/`
2. 开启「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择 `dist/` 目录
5. 打开 ChatGPT / Claude / DeepSeek 页面，点击扩展图标即可捕获

---

## 🏗 项目结构

```
src/
├── background.ts                 # Service Worker（消息中转）
├── content/
│   └── index.ts                  # 页面注入脚本（消息分发）
├── core/
│   └── types.ts                  # 核心类型定义
├── platforms/                    # 平台适配器（插件式架构）
│   ├── base.ts                   # PlatformAdapter 接口
│   ├── registry.ts               # 平台注册中心
│   ├── chatgpt.ts                # ChatGPT 适配器
│   ├── claude.ts                 # Claude 适配器
│   ├── deepseek.ts               # DeepSeek 适配器
│   ├── chatgpt/
│   │   ├── extractor.ts          # API + DOM 提取
│   │   ├── observer.ts           # 实时消息监听
│   │   ├── historyLoader.ts      # 完整历史加载引擎
│   │   ├── interceptor.js        # MAIN world fetch 拦截
│   │   └── types.ts
│   ├── claude/
│   │   ├── extractor.ts          # API + DFS DOM 回退
│   │   └── observer.ts
│   └── deepseek/
│       ├── extractor.ts          # 三级缓存 + 递归分页
│       ├── observer.ts
│       ├── interceptor.ts        # 隔离世界存储桥
│       └── interceptor-page.ts   # MAIN world 请求拦截
├── formatters/
│   └── markdown.ts               # Markdown 渲染引擎
├── storage/
│   └── export.ts                 # 本地存储 + 文件导出
└── popup/
    ├── index.html                # 弹出面板 UI
    ├── popup.css
    └── popup.ts
```

---

## 🧠 架构设计

新增平台只需三步：

```text
1. 在 platforms/ 新建 adapter，实现 PlatformAdapter 接口
2. 在 registry.ts 注册
3. 核心逻辑零修改
```

详见 [TECHNICAL.md](./TECHNICAL.md) — 完整技术方案与各平台适配细节。

---

## 🧪 技术栈

| 层级 | 技术 |
|------|------|
| Extension | Chrome Extension Manifest V3 |
| Language | TypeScript (strict) |
| Build | Vite + @crxjs/vite-plugin |
| Storage | Chrome Local Storage |
| Export | Blob + chrome.downloads API |

---

## 🗺 Roadmap

### ✅ 已完成 (v2.0)

- ChatGPT / Claude / DeepSeek 全平台支持
- API 优先提取策略（避免 DOM 碎片化）
- DeepSeek 递归分页加载 + 一次性授权流程
- 结构化内容块提取（Claude 深度优先遍历）
- ChatGPT 完整历史滚动加载引擎
- Markdown 结构化导出（YAML frontmatter）
- 本地优先存储（零网络上传）
- 自动暗色模式
- 代码清理与架构优化

### 🚧 规划中

- 🔍 语义搜索（向量检索）
- 🧠 AI 自动摘要
- 🧭 思维图谱 / 知识图谱
- 🔗 概念链接系统
- 🌍 Gemini / Perplexity 支持

---

## 💡 设计理念

> AI 对话的价值不在"回答"，而在"累积"

MindArchive 让每一次 AI 对话，都成为长期可复用的认知资产。

---

## 📄 License

MIT

---

## 🏷 Changelog

### v2.0.0 (2026-05-25)

**架构重构 & 体验精简**

- 🔧 **移除废弃功能** — 去掉已失效的「加载完整对话」手动按钮及设置面板
- 🧹 **代码清理** — 消除 20+ 处死代码、未使用类型、冗余逻辑
- 📝 **版本统一** — popup 版本号、manifest、package.json 同步为 2.0
- 📚 **技术文档** — 新增 TECHNICAL.md 完整技术方案

### v1.2.0 (2026-05-24)

**Claude API 优先提取**

- 使用 claude.ai 内部 API 作为主提取策略，返回原始 markdown
- DOM 深度优先遍历作为回退，支持结构化块提取

### v1.1.0

**DeepSeek 支持**

- fetch 拦截 + 三级缓存架构
- 递归分页加载长对话
- 一次性授权流程

### v1.0.0

**初始发布** — ChatGPT 支持、Markdown 导出、本地存储
