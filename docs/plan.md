# Haodoo 当前推进计划

> **状态快照：2026-08-13**
>
> 这是新会话判断“下一步做什么”的权威入口。长期产品设计见 [`design.md`](design.md)，Reader / WebView 兼容架构细节见 [`reader-compatibility-roadmap.md`](reader-compatibility-roadmap.md)。

## 0. 新会话先读这里：当前仍是 P2.5，不是 P3

当前主线：

```text
P0 可行性验证             ✅
P1 Classic Catalog        ✅ 基本完成
P2 Reader Baseline        ✅ 主链可用
P2.5 兼容性收口 / 架构     ← 当前阶段
P3 中文排版专项             ⛔ 冻结扩展
P4 本地 / 离线
P5 Modern Catalog
```

**不要根据旧的 P1 → P2 → P3 顺序直接进入 P3。**

P3 writing-mode Spike 已经在 main，但当前任务是把 Android WebView 兼容突破收束成可维护架构。P2.5 Exit Criteria 全部满足之前，不继续字体、主题、简繁转换或竖排细节。

当前 P2.5 执行状态：

```text
Step 0  恢复绿色基线               ✅
Phase A Compatibility baseline      ◐ 已有真实设备基线，最终冻结回归待做
Phase B BrowserCapabilities          ✅
Phase C SectionDocumentLoader        ← 下一项实现任务
Phase D BlobTextRegistry
Phase E Foliate patch 收口
        ↓
P2.5 Exit Criteria
        ↓
正式继续 P3
```

---

## 1. 当前关键事实

### 1.1 P3 Spike 已提前落到 main

`5781ede` — `feat(reader): start P3 CJK typography and vertical layout spike`

已包含：

- `source / horizontal / vertical` writing mode；
- CJK 字距与基础排版控制；
- 横竖排切换后的 Foliate 重分页 + CFI 恢复；
- P3 Reader UI 控件；
- Chromium / Firefox writing-mode smoke coverage。

它现在只作为 **已落地的实验 Spike 和回归样本**。不要继续扩大 P3 功能面。

### 1.2 writing-mode CI 回归已收口

此前 Chromium smoke 在强制恢复 `horizontal-tb` 时偶发读到 `null`。结论是 Foliate iframe reflow 生命周期中的测试竞态，不是 Reader 产品回归。

修复后：

- main CI #91 绿色；
- writing-mode 必须连续稳定观测后才通过；
- Chromium / Firefox 真实 EPUB smoke 均绿色。

### 1.3 `BrowserCapabilities` 表示“当前应用环境实际可用能力”

Phase B 新增的 capability 结果不是浏览器品牌表，也不是“UA 理论支持列表”。它描述 **当前 document 环境中的有效运行能力**，因此会受到浏览器实现、sandbox、CSP 等共同影响。

例如当前 `index.html` 的 CSP：

```text
connect-src 'self' https://raw.githubusercontent.com
```

没有开放 `blob:`，所以 `fetch(blob:)` 在 CI Chromium 中也可以是 FAIL。这个结果是有效事实，不代表 Chromium 本身不会 `fetch(blob:)`。

因此：

- 不允许根据单个 capability 反推浏览器品牌；
- Phase C 必须按实际可用能力选 transport；
- `blobIframe`、`srcdocIframe`、`documentWriteIframe` 是 section transport 的直接信号；
- CSP 是否未来允许 `connect-src blob:` 应独立评估，不为了让 probe 变绿而修改安全策略。

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

- `ReaderEngine`；
- Foliate adapter；
- 真实好读 EPUB 打开；
- TOC / 前后翻页 / 章节跳转；
- CFI 位置保存与恢复；
- 基础字号 / 行距 / 页边距；
- Chromium / Firefox smoke tests；
- Chrome / Chromium 实际可读；
- Firefox Android 实际可读；
- Via Android 实际可读；
- 百度浏览器 Android WebView 实际可读。

### PWA 安装第一轮 ✅

- Chrome / Chromium 原生安装；
- Firefox Android 手动安装指导；
- iOS Add to Home Screen 指导；
- 通用 Android 安装 / 快捷方式指导；
- Firefox PWA 图标修复；
- Chrome 已安装后不再显示安装按钮；
- standalone 下隐藏安装入口。

---

## 3. Android WebView 兼容结论

问题不是 WebView 不能排版，而是 Foliate 默认 section transport 在部分 WebView 中失效。

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

当前兼容路径：

```text
Foliate rewritten XHTML / HTML
        │
        ├── Blob URL → 正常 blob iframe 路径
        │
        └── 保存改写后的章节文本
                    ↓
              BlobTextRegistry
                    ↓
blob iframe 失败 → 取回 HTML → srcdoc → document.write fallback
                    ↓
              Foliate 正常分页
```

Via 与百度浏览器此前已通过这条路径成功显示正文。

兼容策略必须保持 **capability-driven**，禁止新增 `if (isVia)` / `if (isBaidu)` / User-Agent 品牌分支。

---

## 4. P2.5 — 当前阶段

### Step 0 — 绿色基线 ✅

- [x] 定位 writing-mode smoke 失败为 iframe lifecycle 测试竞态；
- [x] Chromium smoke 恢复绿色；
- [x] Firefox smoke 同样通过；
- [x] 没有借修复继续新增 P3 功能；
- [x] Reader 产品代码无需为该失败回滚 writing-mode Spike。

Via / 百度的最终真实设备复验仍属于 P2.5 Exit 前的 compatibility freeze，不用桌面自动化冒充完成。

### Phase A — Compatibility Freeze / 回归矩阵 ◐

已有基线环境：

- Chrome / Chromium；
- Firefox Android；
- Via Android；
- 百度浏览器 Android WebView；
- Desktop Chromium；
- Desktop Firefox。

最终冻结回归还需要覆盖：

- [ ] Chrome Android；
- [ ] Firefox Android；
- [ ] Via Android；
- [ ] 百度浏览器 Android WebView；
- [ ] iOS Safari（有设备时）；
- [ ] 横式 EPUB；
- [ ] 原始直式 EPUB；
- [ ] 多卷册；
- [ ] 连续翻页 / 跨章节；
- [ ] TOC；
- [ ] CFI 恢复；
- [ ] 字号 / 行距 / 页边距变化；
- [ ] 横竖屏；
- [ ] 一本关闭后再开第二本；
- [ ] repeated open / destroy；
- [ ] 无永久 navigation lock；
- [x] WebView compatibility 代码没有破坏 Desktop Chromium / Firefox smoke。

### Phase B — `BrowserCapabilities` ✅

已完成：

- [x] 从 `#diagnostics` 抽出 capability probes；
- [x] 建立 typed `BrowserCapabilities`；
- [x] page / session 内 Promise cache；
- [x] diagnostics 和 Reader 使用同一 probe 模块；
- [x] diagnostics 只负责触发、展示和复制报告；
- [x] Reader 在 EPUB 已可读后 idle warm-up，不阻塞首次打开；
- [x] 手动“重新诊断”可以显式 refresh cache；
- [x] 没有 browser-name sniffing；
- [x] Chromium / Firefox CI 会真实访问 `#diagnostics` 并产出 8 个 canonical capabilities；
- [x] capability smoke 后原有真实 EPUB 回归继续通过。

当前模型：

```ts
type BrowserCapabilities = {
  blobFetch: boolean
  blobIframe: boolean
  srcdocIframe: boolean
  documentWriteIframe: boolean
  cssColumns: boolean
  rangeGeometry: boolean
  resizeObserver: boolean
  documentFonts: boolean
}
```

Reader 目前只预热并缓存这些事实。**Phase B 不负责改变 section transport。**

### Phase C — `SectionDocumentLoader` ← **立即下一步**

目标：把现在散落在 Foliate patch 中的 iframe fallback 变成正式、可测试的 transport 策略。

目标顺序：

```text
blob iframe
   ↓ unsupported / fail
srcdoc
   ↓ unsupported / fail
document.write
   ↓ fail
explicit compatibility error
```

要求：

- [ ] 定义明确的 `SectionDocumentLoader` contract；
- [ ] 输入能接受 blob URL 与已改写 HTML；
- [ ] 消费 `BrowserCapabilities`；
- [ ] capability 已知 false 时直接跳过对应坏路径；
- [ ] 未知 / 运行时失效环境仍保留 timeout / failure fallback；
- [ ] Chromium / Firefox 保持 blob iframe 快路径；
- [ ] Via / 百度能直接避开已知坏 transport，而不是每章节重复等 timeout；
- [ ] transport / render / pagination 错误可以区分；
- [ ] 不让 React Reader UI 知道 iframe transport；
- [ ] 不新增浏览器品牌判断。

**边界要求：** Phase C 先建立 loader / strategy 边界；不要同时把 BlobTextRegistry 生命周期重构完，也不要扩展 P3。

### Phase D — `BlobTextRegistry`

- [ ] 独立模块；
- [ ] `register/get/delete/clear`；
- [ ] 与 Foliate blob 生命周期同步；
- [ ] destroy 清理；
- [ ] focused tests；
- [ ] 只在内存中存在，不承担 EPUB 持久缓存职责。

### Phase E — Foliate patch 收口

把现有 patch 分成：

1. upstream hardening；
2. generic runtime compatibility；
3. Haodoo WebView adaptation。

要求：

- [ ] 每个 patch 写明原因；
- [ ] 每个 patch 写明删除条件；
- [ ] generic polyfill 能移出 Foliate patch 的逐步移出；
- [ ] 保留 upstream source assertions；
- [ ] 回归覆盖完整前不升级 Foliate；
- [ ] generic hardening 后续可考虑 upstream PR。

---

## 5. P2.5 Exit Criteria

只有全部满足，才允许正式继续 P3：

- [x] 当前 P3 Spike 不再让 CI 变红；
- [x] Chromium smoke 绿色；
- [x] Firefox smoke 绿色；
- [ ] Chrome / Firefox / Via / 百度最终真实阅读链复验绿色；
- [x] `BrowserCapabilities` 已抽离；
- [x] diagnostics 与 Reader 共用 probes；
- [ ] `SectionDocumentLoader` 边界明确并落地；
- [ ] `BlobTextRegistry` 生命周期明确；
- [ ] Foliate patches 已分类并可维护；
- [x] 当前没有新增浏览器品牌 Reader 分支。

---

## 6. P3 — 中文排版专项 ⛔ 冻结扩展，等待 P2.5 Exit

已存在的 Spike 保留用于回归与架构验证。P2.5 完成后再继续：

### P3.1 横排

- 中文默认排版；
- 字号 / 行距 / 字距 / 页边距；
- 段落视觉；
- 中英文混排。

### P3.2 竖排

- `vertical-rl`；
- 从右向左列进；
- 分页与手势；
- 标点 / 英数 / ruby / 图片 / 章节标题；
- 原始直式 EPUB 对比；
- Android Chromium / Via / 百度 / iOS Safari 实机。

### P3.3 简繁显示

显示层转换，不修改原 EPUB，不改变永久 CFI 位置。

### P3.4 字体

系统字体优先，不分发未经授权字体。

### P3.5 主题

Light / Dark / Warm / Low Contrast / 自定义前景背景。

---

## 7. P4 — 本地 / 离线

已有：Service Worker、PWA shell、阅读位置本地保存。

后续：

- IndexedDB / OPFS abstraction；
- 最近阅读 / 收藏 / 书签；
- ReaderPreferences persistence；
- per-book override；
- 明确的“保存离线”；
- EPUB local storage；
- 离线打开；
- quota / storage error；
- 删除下载 / 存储占用；
- 导出原始 EPUB。

**不要自动缓存全部 EPUB。**

---

## 8. P5 — Modern Catalog

Reader 核心稳定后再做：

- WordPress 构建期同步；
- 稳定书码；
- metadata / cover / EPUB 提取；
- `sync-modern`；
- 全量 / 增量；
- Classic / Modern 合并；
- conflict report；
- GitHub Actions 定时同步。

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
P2.5 Exit Criteria 全绿
      ↓
才继续 P3
```

### 当前新会话推荐任务

> 继续推进 `yushun1990/haodoo`。当前阶段是 P2.5 Reader 兼容性收口，P3 暂停扩展。绿色基线已恢复，Phase B `BrowserCapabilities` 已完成；capability 表示当前应用环境的有效运行能力，会受到 CSP 等策略影响，不能当浏览器品牌判断。下一项是 Phase C：建立 `SectionDocumentLoader`，消费 capability 结果，在 blob iframe → srcdoc → document.write 之间进行显式、可测试的 transport 选择，并区分 transport/render/pagination failure。不要在 Phase C 顺手完成 BlobTextRegistry 重构，也不要继续字体、主题、简繁转换或竖排细节。
