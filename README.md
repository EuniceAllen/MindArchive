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

### ✅ 已完成

- ChatGPT / Claude / DeepSeek 三平台全适配
- API 优先提取策略（MAIN world fetch 拦截，零额外网络请求）
- DeepSeek 三级缓存 + 递归分页 + 一次性授权
- Claude DFS 深度优先遍历，结构化内容块提取
- ChatGPT 完整历史滚动加载引擎（MutationObserver 防抖）
- Markdown 结构化导出（YAML frontmatter，兼容 Obsidian / RAG）
- 本地优先存储，零网络上传，完全离线可用
- 自动暗色模式
- 扩展图标设计

### 🚧 规划中

- 🔍 语义搜索（向量检索）
- 🧠 AI 自动摘要
- 🧭 思维图谱 / 知识图谱
- 🔗 概念链接系统
- 🌍 Gemini / Perplexity 支持
- 📦 自定义专有容器格式

---

## 💡 设计理念

> AI 对话的价值不在"回答"，而在"累积"

MindArchive 让每一次 AI 对话，都成为长期可复用的认知资产。

---

## 📄 License

MIT

---

## 🏷 Changelog

### v2.0.0 (2026-05-25) — 架构精简 · 版本统一

**🧹 代码清理**
- 遍历全项目消除 20+ 处死代码：未使用类型字段、冗余权限、废弃 handler、空 XHR hook、未引用变量
- 精简 popup UI：移除已失效的「加载完整对话」手动按钮及关联的进度条 UI
- 移除不再需要的设置面板（自动加载/自动保存 Toggle），popup 回归极简

**🖼 视觉优化**
- 替换扩展图标为全新设计，适配 16/48/128 三档尺寸

**📝 Markdown 输出优化**
- 改进代码块安全包裹（safeCodeFence），防止嵌套 fence 破坏下游解析
- 图片自动转为 `![alt](src)` 占位符，保留语义信息

**🤖 Agent 体系**
- 新增 ChatGPT Optimizer agent — DOM 提取、MutationObserver、历史加载、实时捕获专项优化
- 新增 Markdown Formatter agent — YAML frontmatter、消息渲染、内容块序列化、Obsidian/Notion/RAG 兼容性

**📚 文档**
- README 全面重写，核心能力表格化、项目结构细化
- 新增 TECHNICAL.md（8 章，400+ 行）完整技术方案文档
- 版本号统一：manifest / package.json / popup 同步为 2.0

---

### v1.2.0 (2026-05-24) — Claude & DeepSeek API 优先

**🔌 Claude — API 优先提取**
- 主策略切换为 claude.ai 内部 API（`GET /api/organizations/{org}/chat_conversations/{id}`），直接获取原始 Markdown
- 彻底解决 DOM 内容碎片化：代码块被拆散、行内 code 脱离上下文等痛点
- DOM DFS 深度优先遍历作为回退，支持 `text | heading | code_block | list | blockquote` 五种结构化块

**🔌 DeepSeek — 递归分页 + 授权流程**
- 三级缓存架构：MAIN world 拦截 → 隔离世界桥接 → 提取器消费
- 递归分页加载长对话，自动追随 `has_more` / `cursor` 翻页
- 一次性授权 UI：用户从 Network 面板复制 fetch 代码，自动提取 Bearer token

**🐛 修复**
- manifest.json 版本号与 package.json 同步

---

### v1.1.0 (2026-05-24) — 多平台架构

**🏗 Claude 适配器重写**
- 通过实际 DOM 侦查确定真实结构：`div.font-claude-response`、`div[class*="font-user-message"]`
- 代码块通过 `div.overflow-x-auto > pre.code-block__code > code.language-xxx` 定位
- 发现并确认虚拟滚动问题：长对话中 DOM 节点动态挂载/卸载，滚动加载无法保证完整性 → 推动 v1.2.0 API 优先方案

**🆕 DeepSeek 平台支持**
- 消息选择器 `.ds-message` + `.ds-assistant-message-main-content` 角色检测
- MAIN world fetch 拦截 `/api/v0/chat/history_messages`
- 消息片段解析：REQUEST / RESPONSE / THINK / SEARCH

**🔄 ChatGPT 历史加载引擎**
- 智能滚动容器检测算法：`overflow-y` 候选收集 → 按可滚动区域排序 → 逐元素测试 scrollTop 可写性 → 向上 3 层父级回退
- MutationObserver 防抖稳定化：等待 React 批量渲染完成再测量，避免误判加载完毕
- 三重指标对比（messageCount / scrollHeight / scrollTop），连续 3 轮全稳定才判定完成

---

### v1.0.0 (2026-05-23) — 初始发布

- ChatGPT 支持：`[data-message-author-role]` 语义选择器
- Markdown 结构化导出（YAML frontmatter + 角色标签）
- Chrome Local Storage 本地存储
- 自动保存开关
- 暗色模式支持
