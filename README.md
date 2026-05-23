# 🧠 MindArchive

![MIT](https://img.shields.io/badge/license-MIT-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)

> 把 AI 对话变成**可检索、可沉淀、可长期使用的知识资产**

MindArchive 是一个本地优先的 Chrome 扩展，用于捕获你在 ChatGPT、Claude 等平台上的对话，并自动转换为结构化 Markdown 知识档案。

它让 AI 对话不再“用完即失效”，而是变成你的第二大脑。

---

## 🚨 你可能遇到的问题

* AI 对话无法长期保存
* 有价值的内容散落在不同平台
* 无法检索历史思考过程
* 知识无法进入 Obsidian / RAG / 知识库

👉 AI 正在变成生产力工具，但“记忆系统”仍然缺失。

---

## ✨ MindArchive 做了什么

### 📥 一键捕获完整对话

自动提取用户 + AI 的完整上下文

### 🔄 自动加载历史记录

模拟滚动行为，完整拉取懒加载内容（不是只截当前屏幕）

### 📝 结构化 Markdown 输出

* YAML frontmatter
* 时间线结构
* 可直接进入 Obsidian / Notion / RAG pipeline

### 💾 本地优先存储

* 所有数据保存在 Chrome 本地存储
* 不上传任何服务器
* 完全离线可用

### 🌙 自动暗色模式

---

## 🎬 使用方式

```bash
git clone https://github.com/EuniceAllen/MindArchive.git
cd MindArchive
npm install
npm run build
```

### 安装扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/`
5. 打开 ChatGPT / Claude 页面
6. 点击扩展图标即可开始捕获

---

## 🧠 核心能力

### 📌 完整对话捕获

不仅抓当前屏幕，而是**自动加载整个历史对话**

### 📌 平台适配架构

支持插件式扩展不同 AI 平台

### 📌 Markdown 归档标准化

统一输出格式，方便二次利用

---

## 🧩 项目结构

```
src/
├── background.ts              # Service Worker（消息中转）
├── content/
│   └── index.ts              # 页面注入脚本
├── core/
│   └── types.ts              # 核心类型
├── platforms/
│   ├── base.ts               # 适配器接口
│   ├── registry.ts           # 平台注册中心
│   ├── chatgpt.ts
│   ├── claude.ts
│   └── chatgpt/
│       ├── extractor.ts      # DOM 解析
│       ├── observer.ts       # 实时监听
│       ├── historyLoader.ts  # 历史加载核心
│       └── types.ts
├── formatters/
│   └── markdown.ts           # 转 Markdown
├── storage/
│   └── export.ts             # 本地存储 + 导出
└── popup/
    ├── index.html
    ├── popup.css
    └── popup.ts
```

---

## 🧠 架构设计（插件化适配器）

新增平台只需：

```text
1. 在 platforms/ 新建 adapter
2. 实现 PlatformAdapter 接口
3. 在 registry.ts 注册
```

👉 核心逻辑无需修改

---

## 🧪 技术栈

| 层级        | 技术                           |
| --------- | ---------------------------- |
| Extension | Chrome Extension Manifest V3 |
| Language  | TypeScript (strict)          |
| Build     | Vite + @crxjs/vite-plugin    |
| Storage   | Chrome Local Storage         |
| Export    | Blob + chrome.downloads API  |

---

## 🗺 Roadmap

### ✅ MVP（已完成）

* ChatGPT / Claude 支持
* Markdown 导出
* 完整历史加载
* 本地存储
* 暗色模式

### 🚧 下一步

* 🔍 语义搜索（向量检索）
* 🧠 AI 自动摘要
* 🧭 思维图谱 / 知识图谱
* 🔗 概念链接系统
* ⏱ 时间线重建
* 🌍 更多平台（Gemini / DeepSeek / Perplexity）

---

## 💡 设计理念

> AI 对话的价值不在“回答”，而在“累积”

MindArchive 的目标是：

👉 让每一次 AI 对话，都成为长期可复用的认知资产

---

## 📄 License

MIT

---
