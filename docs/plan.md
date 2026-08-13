# Haodoo 当前推进计划

> **状态快照：2026-08-13**
>
> 这是新会话判断“下一步做什么”的权威入口。长期产品设计见 [`design.md`](design.md)，Reader / WebView 兼容架构细节见 [`reader-compatibility-roadmap.md`](reader-compatibility-roadmap.md)。

## 0. 当前阶段：P2.5，不是 P3

```text
P0 可行性验证             ✅
P1 Classic Catalog        ✅ 基本完成
P2 Reader Baseline        ✅ 主链可用
P2.5 兼容性收口 / 架构     ← 当前阶段
P3 中文排版专项             ⛔ 冻结扩展
P4 本地 / 离线
P5 Modern Catalog
```

P3 writing-mode Spike 已经在 main，但当前任务仍是把 Android WebView 兼容突破收束成可维护架构。P2.5 Exit Criteria 全部满足之前，不继续字体、主题、简繁转换或竖排细节。

当前 P2.5 执行状态：

```text
Step 0  恢复绿色基线               ✅
Phase A Compatibility baseline      ◐ 已有真实设备基线，最终冻结回归待做
Phase B BrowserCapabilities          ✅
Phase C SectionDocumentLoader        ✅
Phase D BlobTextRegistry             ✅
Phase E Foliate patch 收口           ← 下一项实现任务
        ↓
P2.5 Exit Criteria
        ↓
正式继续 P3
```

---

## 1. 当前关键事实

### 1.1 P3 Spike 已提前落到 main

`5781ede` — `feat(reader): start P3 CJK typography and vertical layout spike`

已包含 `source / horizontal / vertical` writing mode、CJK 字距与基础排版控制、横竖排重分页 + CFI 恢复、Reader UI 控件，以及 Chromium / Firefox writing-mode smoke。

它只作为 **已落地的实验 Spike 和回归样本**。不要继续扩大 P3 功能面。

### 1.2 writing-mode CI 回归已收口

此前 Chromium smoke 强制恢复 `horizontal-tb` 时偶发读到 `null`，结论是 Foliate iframe reflow 生命周期中的测试竞态，不是 Reader 产品回归。修复后 Chromium / Firefox 真实 EPUB smoke 持续绿色。

### 1.3 `BrowserCapabilities` 是有效运行能力，不是 UA 能力表

Phase B 的 capability 描述 **当前应用 document 环境中的实际可用能力**，会同时受到浏览器实现、sandbox、CSP 等影响。

当前 CSP 的 `connect-src` 没有 `blob:`，所以 `fetch(blob:)` 即使在 Chromium 中也可以是 FAIL。这不是 Chromium 品牌特征。

因此：

- 不根据 capability 反推浏览器品牌；
- transport 按实际 capability 选择；
- 不为了让 probe 全绿而放宽 CSP；
- 禁止新增 Via / 百度 / Chrome 的 UA 分支。

### 1.4 Section transport 已从 Foliate patch 抽成策略边界

Phase C 后的职责：

```text
Foliate
  ├── EPUB semantics
  ├── section lifecycle
  ├── style hooks
  └── pagination

Haodoo SectionDocumentLoader
  └── 把 section document 放进 sandbox iframe
        ├── blob iframe
        ├── srcdoc
        └── document.write
```

应用在导入 Foliate 前安装一个很薄的 loader bridge。patched paginator 只交出 iframe + source + rewritten HTML provider，然后回到 Foliate 的 render / pagination 流程。

失败边界已经区分：

- `SectionDocumentTransportError` → transport；
- `SectionRenderError` → document preparation / render hook；
- `SectionPaginationError` → pagination layout。

### 1.5 Blob text 已有独立所有权与生命周期

Phase D 后不再暴露 `globalThis.__HAODOO_FOLIATE_BLOB_TEXT__ = new Map()`。

现在是：

```text
Foliate Loader createURL
        ↓
BlobTextRegistry.register(blobUrl, rewrittenText)
        ↓
SectionDocumentLoader fallback 通过 getHtml provider 读取
        ↓
Foliate unref / destroy
        ↓
BlobTextRegistry.delete(blobUrl)
        ↓
URL.revokeObjectURL(blobUrl)
```

关键边界：

- registry 是独立的 memory-only adapter；
- contract 为 `register/get/delete/clear`，`size()` 仅用于诊断/测试；
- Foliate 仍拥有 blob URL 的 create / unref / destroy 生命周期；
- registry 只镜像 rewritten XHTML / HTML / SVG 文本，不拥有 URL revoke；
- `SectionDocumentLoader` 仍只依赖 `getHtml()` provider，不直接依赖 registry 实现；
- registry 不承担 EPUB 持久缓存、离线存储或缓存策略；
- legacy patch 能迁移本地已经打过旧 Map patch 的 `node_modules`，不要求先手工删除依赖目录。

---

## 2. 已完成 / 已验证

### P0 — 可行性验证 ✅

- Classic catalog / cover / EPUB 来源成立；
- GitHub Raw catalog / EPUB 浏览器 CORS 成立；
- `haodoo.org` EPUB / cover 浏览器 CORS 成立；
- WordPress API 适合构建期同步；
- 无需常驻 CORS proxy；
- 静态 PWA + 构建期 catalog 路线成立。

### P1 — Classic Catalog ✅

- TypeScript + React + Vite；
- lint / typecheck / GitHub Actions；
- Classic catalog 构建与归一化；
- 真实书目、搜索、分类、书籍详情；
- 横式 / 直式 EPUB 资源；
- PWA manifest / Service Worker。

### P2 — Reader Baseline ✅ 主链可用

- `ReaderEngine` / Foliate adapter；
- 真实好读 EPUB；
- TOC / 翻页 / 章节跳转；
- CFI 保存与恢复；
- 基础排版；
- Chromium / Firefox smoke；
- Chrome / Chromium、Firefox Android、Via Android、百度 Android WebView 均已有实际可读基线。

### PWA 安装第一轮 ✅

- Chrome / Chromium 原生安装；
- Firefox Android 手动安装指导；
- iOS Add to Home Screen 指导；
- standalone 下隐藏安装入口。

---

## 3. Android WebView 兼容结论

问题不是 WebView 不能排版，而是 Foliate 默认 section transport 在部分环境中失效。

已观察到的受影响环境表现：

```text
PASS  JavaScript compatibility
FAIL  fetch(blob:)                    ← 也可能受 CSP 影响
FAIL  sandbox iframe navigation blob:
PASS  iframe srcdoc
PASS  iframe document.write
PASS  CSS columns
PASS  Range geometry
PASS  ResizeObserver
PASS  document.fonts
```

当前正式路径：

```text
BrowserCapabilities
        ↓
SectionDocumentLoader
        │
        ├── blob iframe        ← 正常浏览器快路径
        │      ↓ unsupported / runtime fail
        ├── srcdoc
        │      ↓ unsupported / runtime fail
        └── document.write
               ↓ fail
         explicit transport error

fallback HTML source
        ↑
BlobTextRegistry ← mirrors Foliate blob lifecycle
```

兼容策略继续保持 **capability-driven**，禁止浏览器品牌分支。

---

## 4. P2.5 — 当前阶段

### Step 0 — 绿色基线 ✅

- [x] writing-mode smoke 生命周期竞态已修；
- [x] Chromium smoke 绿色；
- [x] Firefox smoke 绿色；
- [x] 没有借机继续扩展 P3。

### Phase A — Compatibility Freeze / 回归矩阵 ◐

已有自动 / 实际基线，但 P2.5 Exit 前仍需最终真机冻结回归：

- [ ] Chrome Android；
- [ ] Firefox Android；
- [ ] Via Android；
- [ ] 百度浏览器 Android WebView；
- [ ] iOS Safari（有设备时）；
- [ ] 横式 / 原始直式 EPUB；
- [ ] 多卷册；
- [ ] 连续翻页 / 跨章节 / TOC；
- [ ] CFI 恢复；
- [ ] 排版变化；
- [ ] 横竖屏；
- [ ] 一本关闭再开第二本；
- [ ] repeated open / destroy；
- [ ] 无永久 navigation lock；
- [x] compatibility 代码没有破坏 Desktop Chromium / Firefox 回归。

### Phase B — `BrowserCapabilities` ✅

- [x] probes 从 diagnostics 抽离；
- [x] typed `BrowserCapabilities`；
- [x] page / session Promise cache；
- [x] Reader / diagnostics 共用 probes；
- [x] explicit refresh；
- [x] idle warm-up，不阻塞首开；
- [x] 8 个 canonical capabilities 有 Chromium / Firefox smoke；
- [x] 无 browser-name sniffing。

### Phase C — `SectionDocumentLoader` ✅

- [x] 独立 typed loader contract；
- [x] 输入支持 iframe / section URL / rewritten HTML provider；
- [x] 消费已解析的 `BrowserCapabilities` snapshot；
- [x] capability=false 时直接记录并跳过坏 transport；
- [x] capability 尚未知时保留短 timeout fallback；
- [x] runtime transport 失败仍可继续 fallback；
- [x] Chromium / Firefox 真实 EPUB 保持 blob 快路径；
- [x] srcdoc 与 document.write 策略可被独立强制验证；
- [x] transport / render / pagination failure 分类；
- [x] React Reader UI 不知道 iframe transport；
- [x] Foliate patch 只保留 bridge + Foliate 自身 render/pagination；
- [x] 不新增浏览器品牌判断；
- [x] Chromium / Firefox CI 在 loader 策略测试后继续通过真实 EPUB 回归。

### Phase D — `BlobTextRegistry` ✅

- [x] 独立 `BlobTextRegistry` 模块；
- [x] 明确 `register/get/delete/clear` contract；
- [x] 与 Foliate blob URL create / unref 生命周期同步；
- [x] loader / book destroy 时逐 URL 删除 registry entry 并 revoke；
- [x] focused contract / lifecycle tests；
- [x] focused test 会检查 patched `epub.js` 的 register/delete/revoke hooks；
- [x] 旧 `__HAODOO_FOLIATE_BLOB_TEXT__` 裸 Map 已移除；
- [x] `SectionDocumentLoader` 只依赖 HTML provider，不直接依赖具体 registry；
- [x] registry 只在内存中存在，不承担 EPUB 离线缓存职责；
- [x] 没有升级 Foliate，也没有继续 P3；
- [x] Phase D 后 Chromium / Firefox 原有真实 EPUB CI 回归继续绿色。

另有 `scripts/smoke-blob-registry.mjs` 可用于 focused 浏览器集成验证：真实 EPUB register → Reader close/destroy → registry size 归零 → reopen → 再清理。它不替代最终真机 Phase A。

### Phase E — Foliate patch 收口 ← **立即下一步**

把剩余 patch 分类为：

1. upstream hardening；
2. generic runtime compatibility；
3. Haodoo WebView adaptation。

要求：

- [ ] 为每个 patch 写明类别、原因与删除条件；
- [ ] 把能移出 Foliate source rewriting 的 generic polyfill 继续移到 compatibility/bootstrap；
- [ ] 保留并加强 upstream source assertions，升级 Foliate 时 fail-fast；
- [ ] 明确哪些 patch 可考虑 upstream PR；
- [ ] 回归覆盖完整前不升级 Foliate；
- [ ] 不在 Phase E 顺手继续 P3。

Phase E 完成后不要立即宣布 P2.5 结束，还要回到 Phase A 做最终真机冻结回归并核对 Exit Criteria。

---

## 5. P2.5 Exit Criteria

只有全部满足，才允许正式继续 P3：

- [x] P3 Spike 不再让 CI 变红；
- [x] Chromium smoke 绿色；
- [x] Firefox smoke 绿色；
- [ ] Chrome / Firefox / Via / 百度最终真实阅读链复验绿色；
- [x] `BrowserCapabilities` 已抽离；
- [x] diagnostics 与 Reader 共用 probes；
- [x] `SectionDocumentLoader` 边界明确并落地；
- [x] `BlobTextRegistry` 生命周期明确；
- [ ] Foliate patches 已分类并可维护；
- [x] 当前没有新增浏览器品牌 Reader 分支。

---

## 6. P3 — 中文排版专项 ⛔ 冻结扩展，等待 P2.5 Exit

已存在的 Spike 保留用于回归与架构验证。P2.5 完成后再继续：

- P3.1 横排：中文默认排版、字号 / 行距 / 字距 / 页边距、段落、中英文混排；
- P3.2 竖排：`vertical-rl`、列进、分页与手势、标点 / 英数 / ruby / 图片 / 标题、真机；
- P3.3 简繁显示：显示层转换，不修改原 EPUB / CFI；
- P3.4 字体：系统字体优先；
- P3.5 主题：Light / Dark / Warm / Low Contrast / 自定义前景背景。

---

## 7. P4 — 本地 / 离线

后续包括 IndexedDB / OPFS、最近阅读、收藏、书签、ReaderPreferences、per-book override、显式保存离线、quota/error、删除下载、导出 EPUB。

**不要自动缓存全部 EPUB。**

---

## 8. P5 — Modern Catalog

Reader 核心稳定后再做 WordPress 构建期同步、稳定书码、metadata / cover / EPUB 提取、全量 / 增量、Classic / Modern 合并与定时 Actions。

---

## 9. PWA / Release 后续

- Service Worker update / reload UX；
- standalone safe-area / status bar；
- offline / update messaging；
- diagnostics / about version；
- Firefox installed-PWA task-switch 黑预览调查；
- iOS Safari 实机；
- 大 EPUB 内存 / 性能；
- 基础无障碍。

---

## 10. 新会话标准启动流程

```text
读 docs/plan.md
      ↓
确认 main 最新 commit 与 CI
      ↓
如果 CI 红：先恢复绿色基线
      ↓
确认仍处于 P2.5
      ↓
读 reader-compatibility-roadmap.md
      ↓
推进最靠前未完成的 P2.5 phase
      ↓
Phase E 完成后执行 Phase A 最终真机冻结回归
      ↓
P2.5 Exit Criteria 全绿
      ↓
才继续 P3
```

### 当前新会话推荐任务

> 继续推进 `yushun1990/haodoo`。当前仍是 P2.5 Reader 兼容性收口，P3 暂停扩展。Phase B `BrowserCapabilities`、Phase C `SectionDocumentLoader`、Phase D `BlobTextRegistry` 已完成。下一项是 Phase E：系统分类并收口现有 Foliate patches，写清每个 patch 的类别、原因、删除条件和 upstream 可能性，把能脱离 Foliate source rewriting 的 generic compatibility 继续外移，同时保持 source assertions 和 Chromium / Firefox 回归。Phase E 后还要做 Phase A 最终真机冻结回归，不能直接宣布 P2.5 完成。