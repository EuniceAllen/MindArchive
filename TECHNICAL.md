# MindArchive 技术方案

> 本地优先的 AI 对话归档系统 — 架构设计与多平台适配策略

---

## 目录

1. [总体架构](#1-总体架构)
2. [平台适配器接口](#2-平台适配器接口)
3. [ChatGPT 适配方案](#3-chatgpt-适配方案)
4. [Claude 适配方案](#4-claude-适配方案)
5. [DeepSeek 适配方案](#5-deepseek-适配方案)
6. [跨世界通信机制](#6-跨世界通信机制)
7. [Markdown 渲染引擎](#7-markdown-渲染引擎)
8. [存储与导出](#8-存储与导出)

---

## 1. 总体架构

```
┌──────────────────────────────────────────────────┐
│                   Popup (UI)                      │
│  index.html  ←→  popup.ts  ←→  popup.css         │
└────────────────────┬─────────────────────────────┘
                     │ chrome.runtime.sendMessage
┌────────────────────▼─────────────────────────────┐
│            Background Service Worker              │
│  background.ts — 消息中继、状态管理                │
└────────────────────┬─────────────────────────────┘
                     │ chrome.tabs.sendMessage
┌────────────────────▼─────────────────────────────┐
│              Content Script (Isolated World)      │
│  content/index.ts — 消息分发、平台检测             │
│  ├── chatgpt.ts   →  chatgpt/extractor.ts        │
│  ├── claude.ts    →  claude/extractor.ts         │
│  └── deepseek.ts  →  deepseek/extractor.ts       │
└────────────────────┬─────────────────────────────┘
                     │ window.postMessage
┌────────────────────▼─────────────────────────────┐
│           Page Context (MAIN World)               │
│  chatgpt/interceptor.js   — fetch() 拦截          │
│  deepseek/interceptor-page.ts — fetch() 拦截      │
└──────────────────────────────────────────────────┘
```

**关键设计决策：**

- **API 优先，DOM 回退** — 每个平台都优先从页面自身 API 获取数据，仅在 API 不可用时回退到 DOM 解析
- **MAIN world 拦截** — 利用 `world: "MAIN"` 的 content script 拦截页面自身的 `fetch()` 调用，零额外网络请求
- **postMessage 桥接** — MAIN world 和 isolated world 之间通过 `window.postMessage` 传递数据

---

## 2. 平台适配器接口

所有平台适配器实现统一的 `PlatformAdapter` 接口：

```typescript
interface PlatformAdapter {
  readonly id: string;           // 唯一标识，如 "chatgpt"
  readonly name: string;         // 人类可读名称，如 "ChatGPT"

  detect(): boolean;             // 检测当前页面是否匹配
  extractMessages(): Message[];  // 从 DOM 提取可见消息
  extractTitle(): string;        // 提取对话标题
  observeNewMessages(cb): () => void; // 设置 MutationObserver
  captureConversation(): Promise<Conversation>; // 完整捕获流程
}
```

新增平台只需实现此接口并在 `registry.ts` 注册即可，核心逻辑零修改。

---

## 3. ChatGPT 适配方案

### 3.1 网站特征

| 特征 | 说明 |
|------|------|
| 消息选择器 | `[data-message-author-role]`（语义属性，跨版本稳定） |
| API 端点 | `GET /backend-api/conversation/{id}` |
| 数据结构 | 树形 `mapping` 节点，需 DFS 遍历展平 |
| 懒加载 | 滚动到顶部触发异步批量加载 |
| 滚动容器 | 内部 div（非 window），使用虚拟滚动器 |

### 3.2 提取策略

**策略 1 — API 拦截（主策略）**

```
MAIN world interceptor.js
  → hook window.fetch()
  → 匹配 /backend-api/conversation/
  → clone response → parse JSON
  → postMessage → isolated world extractor
  → DFS 遍历 mapping 树，按 parent/children 关系展平为线性消息列表
```

- **零额外网络请求** — 拦截的是页面自身的 API 调用
- **获取完整对话** — API 返回全部消息，无需滚动加载

**策略 2 — DOM 提取（回退）**

```
[data-message-author-role] → 提取 role + 文本内容
  → 剥离 UI 元素（button, [role="button"], .sr-only, [aria-hidden]）
  → 按 DOM 顺序输出（天然时间顺序）
```

### 3.3 历史加载引擎

ChatGPT 的懒加载是项目最复杂的工程挑战之一：

```
loadEntireConversationHistory():
  for each iteration (最多 200 次):
    1. scrollTop -= 1200px → dispatch scroll event
    2. waitForDOMStabilization(600ms) — MutationObserver 防抖
    3. getConversationMetrics() — 快照对比
    4. if ALL metrics 连续 3 轮不变 → done
    5. if scrollHeight 无增长 + scrollTop = 0 → done
```

**为什么需要防抖？** ChatGPT 异步获取数据后 React 渲染多轮 DOM 变更，必须等全部渲染完成再测量。

### 3.4 滚动容器检测

ChatGPT 使用内部虚拟滚动器，`scrollTop` 的语义被拦截。检测算法：

```
1. 收集所有 overflow-y:auto|scroll 且包含 [data-message-author-role] 的元素
2. 按可滚动区域大小排序
3. 逐个测试 scrollTop 是否可被赋值改变
4. 如果直接赋值失败 → 尝试 scrollTo()
5. 如果仍失败 → 向上遍历 3 层父元素
6. 最后回退 → <main> 或任意可滚动元素
```

---

## 4. Claude 适配方案

### 4.1 网站特征

| 特征 | 说明 |
|------|------|
| 用户消息 | `div[class*="font-user-message"]` |
| AI 回复 | `div.font-claude-response` |
| API 端点 | `GET /api/organizations/{org}/chat_conversations/{id}` |
| API 返回 | 原始 Markdown（`chat_messages[].text`） |
| DOM 结构 | 深度嵌套，富文本分散在多层 div 中 |

### 4.2 提取策略

**策略 1 — API 提取（主策略）**

```
从 URL 提取 org_id 和 conversation_id
  → GET /api/organizations/{org}/chat_conversations/{id}
  → 直接读取 chat_messages[].text（原始 Markdown）
  → 按 index 排序 → 映射为 Message[]
```

Claude 的 API 返回原始 Markdown，**彻底避免了 DOM 内容碎片化问题**。

**策略 2 — DOM 深度优先遍历（回退）**

```
doExtract():
  收集所有用户 + AI 消息容器
  → 按 DOM 位置排序
  → walkDFS(el, blocks):
      p        → text block
      h1-h4    → heading block
      ul/ol    → list block
      blockquote → blockquote block
      img/figure → image placeholder
      div.overflow-x-auto → code_block
  → blocksToText() 展平为兼容文本
```

DFS 遍历保持子元素的原始顺序，确保段落、代码块、列表等结构的语义不丢失。

---

## 5. DeepSeek 适配方案

### 5.1 网站特征

| 特征 | 说明 |
|------|------|
| 消息选择器 | `.ds-message` |
| AI 标记 | `.ds-assistant-message-main-content` |
| API 端点 | `GET /api/v0/chat/history_messages?chat_session_id={id}` |
| 分页机制 | 游标分页（`seq_id` / `offset` / `cursor`） |
| 权限模型 | Bearer token 在页面刷新后失效，需重新获取 |
| 消息粒度 | 每条消息包含多个 `fragments`（REQUEST / RESPONSE / THINK / SEARCH） |

### 5.2 三级缓存架构

```
┌─────────────────────────────────────────────────┐
│ Tier 1: MAIN world 拦截                         │
│ interceptor-page.ts hook fetch()                │
│ → 拦截 /api/v0/chat/history_messages            │
│ → 累积到 window.__mindarchive_deepseek_cache__  │
└──────────────────┬──────────────────────────────┘
                   │ postMessage
┌──────────────────▼──────────────────────────────┐
│ Tier 2: 隔离世界桥接                            │
│ interceptor.ts 监听 postMessage                 │
│ → 写入 window.__mindarchive_bridge_cache__      │
└──────────────────┬──────────────────────────────┘
                   │ 同世界读取
┌──────────────────▼──────────────────────────────┐
│ Tier 3: 提取器消费                              │
│ extractor.ts fetchConversationFromApi()         │
│ → 即时检查 → storage 检查 → 等待 postMessage    │
│ → 最多等待 10s，超时返回 needsRefresh           │
└─────────────────────────────────────────────────┘
```

### 5.3 一次性授权流程

DeepSeek 的 API 需要有效的 Bearer token，该 token 在刷新页面后自动出现在页面自身的 fetch 请求中：

```
正常流程（刷新后）:
  页面自身 GET history_messages → interceptor 捕获 → 自动填充缓存 ✅

冷启动（首次打开）:
  interceptor 未捕获到请求 → 缓存为空
  → 弹出授权面板 → 用户从 Network 复制 fetch 代码
  → 提取 headers → 存入 chrome.storage.session
  → interceptor 使用存储的 headers 发起请求
```

### 5.4 递归分页加载

DeepSeek 的长对话分为多页，需递归拉取：

```
fetchConversationFromApi():
  1. 即时检查 window cache
  2. 若无 → 检查 chrome.storage.session 中的 headers
  3. 若无 headers → 返回 needsRefresh
  4. 通过 postMessage 通知 MAIN world 发起 fetch
  5. 等待缓存更新（最多 10s）
  6. 检查 has_more → 递归拉取下一页
```

### 5.5 消息片段解析

```typescript
// DeepSeek 消息结构
DeepSeekApiMessage {
  role: "USER" | "ASSISTANT"
  fragments: [
    { type: "REQUEST", content: "..." },   // 用户请求
    { type: "RESPONSE", content: "..." },  // AI 回复
    { type: "THINK", content: "..." },     // 思考过程（若启用）
    { type: "SEARCH", content: "..." },    // 搜索结果（若启用）
  ]
}
```

提取时按角色选择对应片段类型（USER→REQUEST, ASSISTANT→RESPONSE），保留 Markdown 格式。

---

## 6. 跨世界通信机制

Chrome 扩展的 content script 运行在隔离世界（isolated world），无法直接访问页面的 JavaScript 对象。MindArchive 使用以下机制跨越此限制：

### 6.1 MAIN World 拦截

通过 `manifest.json` 配置 `world: "MAIN"` 的 content script：

```json
{
  "matches": ["https://chatgpt.com/*"],
  "js": ["src/platforms/chatgpt/interceptor.js"],
  "run_at": "document_start",
  "world": "MAIN"
}
```

MAIN world 脚本可以 hook `window.fetch()` 和 `XMLHttpRequest`，拦截页面自身的 API 调用。

### 6.2 postMessage 桥接

```
MAIN world                      Isolated world
─────────                       ──────────────
hook fetch()
  → clone response
  → window.postMessage({
      type: "__mindarchive_*_cache_update__",
      payload: data
    }, "*")
                                  window.addEventListener("message", ...)
                                    → 缓存到当前 window
                                    → extractor 读取
```

### 6.3 chrome.storage 桥接（DeepSeek 专用）

对于 DeepSeek 的一次性授权场景，使用 `chrome.storage.session` 在 popup 和 content script 之间传递 headers：

```
Popup                       Content Script (isolated)
─────                       ─────────────────────────
用户粘贴 fetch 代码
  → 提取 headers
  → chrome.storage.session.set() 
                              chrome.storage.session.get()
                                → postMessage → MAIN world
```

---

## 7. Markdown 渲染引擎

### 7.1 输出格式

```markdown
---
platform: chatgpt
title: "Python 异步编程最佳实践"
url: https://chatgpt.com/c/xxx
captured_at: 2026-05-25T10:30:00.000Z
message_count: 24
mindarchive_id: chatgpt_lw5gk_8x3m2n
---

# Python 异步编程最佳实践

## 🧑 You
asyncio 和 threading 的区别是什么？

## 🤖 ChatGPT
asyncio 和 threading 是 Python 中两种不同的并发模型...

## 🧑 You
什么时候应该用 asyncio 而不是多线程？

## 🤖 ChatGPT
选择 asyncio 还是多线程取决于你的工作负载类型...
```

### 7.2 平台标签

| 平台 ID | 用户标签 | AI 标签 |
|---------|---------|---------|
| `chatgpt` | 🧑 You | 🤖 ChatGPT |
| `claude` | 🧑 You | 🤖 Claude |
| `deepseek` | 🧑 You | 🤖 DeepSeek |

### 7.3 结构化内容块

Claude DOM 回退提取产生结构化块，渲染时保持原始格式：

| 块类型 | Markdown 输出 |
|--------|-------------|
| `text` | 直接输出段落 |
| `heading` | `## 标题` |
| `code_block` | ` ```lang\ncode\n``` ` |
| `list` | `- item` 或 `1. item` |
| `blockquote` | `> quote` |

---

## 8. 存储与导出

### 8.1 本地存储

- **存储引擎**：Chrome Local Storage (`chrome.storage.local`)
- **数据格式**：`Conversation[]` JSON 序列化
- **去重策略**：按 `conversation.id` 去重
- **配额**：约 10MB（可存储数千条对话）

### 8.2 文件导出

```
downloadConversation():
  formatConversation() → Markdown 字符串
    → new Blob([markdown], {type: "text/markdown"})
    → FileReader.readAsDataURL() → data URL
    → chrome.downloads.download({url, filename, saveAs: true})
```

文件名格式：`{platform}_{title}_{date}.md`

### 8.3 存储键约定

| 键 | 用途 |
|----|------|
| `mindarchive_conversations` | 已保存对话列表 |
| `mindarchive_autosave` | 自动保存开关 |
| `mindarchive_version` | 扩展版本（用于迁移） |
| `deepseek_headers` | DeepSeek 临时授权（session 存储） |

---

## 附录：网站选择器稳定性分析

| 平台 | 选择器 | 稳定性 | 备注 |
|------|--------|--------|------|
| ChatGPT | `[data-message-author-role]` | ⭐⭐⭐⭐⭐ | 语义属性，跨多个 UI 重写周期未变 |
| Claude | `div.font-claude-response` | ⭐⭐⭐⭐ | 语义 class，变化频率低 |
| Claude | `div[class*="font-user-message"]` | ⭐⭐⭐ | 部分匹配，容错性好 |
| DeepSeek | `.ds-message` | ⭐⭐⭐⭐ | 命名空间前缀，相对稳定 |
| DeepSeek | `.ds-assistant-message-main-content` | ⭐⭐⭐ | 较长的组合 class，可能变化 |

**选择器策略：** 优先使用语义属性（`data-*`），其次用语义 class 名，避免依赖自动生成的 hash class。
