# Haodoo 当前推进计划

> **状态快照：2026-08-13**
>
> 这是新会话判断“下一步做什么”的权威入口。长期产品设计见 [`design.md`](design.md)，Reader / WebView 兼容架构细节见 [`reader-compatibility-roadmap.md`](reader-compatibility-roadmap.md)。

## 0. 新会话先读这里：当前不是 P3

当前主线是：

```text
P0 可行性验证            ✅
P1 Classic Catalog       ✅ 基本完成
P2 Reader Baseline       ✅ 主链可用
P2.5 兼容性收口 / 架构    ← 当前阶段
P3 中文排版专项            ⛔ 暂停继续扩展
P4 本地 / 离线
P5 Modern Catalog
```

**不要根据旧的 P1 → P2 → P3 顺序直接进入 P3。**

当前第一目标是把已经解决的 Android WebView 兼容方案收束成可维护架构，并恢复/保持完整回归绿色。

---

## 1. 一个重要的当前状态：P3 Spike 已经提前落到 main

在本计划修订之前，一个新会话已经提交：

`5781ede` — `feat(reader): start P3 CJK typography and vertical layout spike`

它加入了：

- `source / horizontal / vertical` writing mode；
- CJK 字距与排版控制；
- 横竖排切换后的 Foliate 重分页 + CFI 恢复；
- P3 Reader UI 控件；
- Chromium / Firefox writing-mode smoke coverage。

**这部分现在只视为“已落地的实验 Spike”，不是当前继续开发的阶段。不要继续往字体、主题、简繁转换或竖排细节扩展。**

当前最新 CI 已暴露一个回归：Chromium smoke 在“强制切回 horizontal”时读取到的 EPUB document writing mode 为 `null`。

因此现在的执行顺序是：

```text
先恢复 CI 绿色 / 确认 P3 Spike 没破坏 Reader
        ↓
P2.5 compatibility freeze
        ↓
BrowserCapabilities extraction
        ↓
SectionDocumentLoader
        ↓
BlobTextRegistry
        ↓
Foliate patch 收口
        ↓
P2.5 exit criteria 全部通过
        ↓
再正式继续 P3
```

不要把当前 CI 红灯当成继续实现 P3 的理由；它是兼容性收口的一部分。

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

## 3. Android WebView 已确认的根因

问题不是 WebView 不能排版，而是 Foliate 默认 transport 在部分 WebView 中失效。

诊断结果：

```text
PASS  JavaScript compatibility
FAIL  fetch(blob:)
FAIL  sandbox iframe navigation to blob:
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
        ├── Blob URL → 正常浏览器 blob iframe
        │
        └── 保存改写后的章节文本
                    ↓
              BlobTextRegistry
                    ↓
blob iframe 失败 → 取回 HTML → srcdoc → document.write fallback
                    ↓
              Foliate 正常分页
```

Via 与百度浏览器已经通过这条路径成功显示正文。

兼容策略必须继续保持 **capability-driven**，禁止新增 `if (isVia)` / `if (isBaidu)` 一类品牌分支。

---

## 4. P2.5 — 当前阶段

### Step 0 — 先恢复当前 main 的绿色基线 ← **立即下一步**

当前 `5781ede` P3 Spike 后，最新 CI 在 Chromium Reader smoke 中失败：

```text
Forced horizontal mode did not reach the EPUB document: null
```

先完成：

- [ ] 确认失败是测试时序问题、Reader re-open 生命周期问题，还是 P3 writing-mode 实现回归；
- [ ] 修复或收束 P3 Spike，使 Chromium smoke 重新绿色；
- [ ] Firefox smoke 同样通过；
- [ ] 不趁此机会继续新增 P3 功能；
- [ ] Via / 百度现有正文 fallback 不被改坏。

只有绿色基线恢复后，才开始架构抽离。

### Phase A — Compatibility Freeze / 回归矩阵

目标环境：

- Chrome Android；
- Firefox Android；
- Via Android；
- 百度浏览器 Android WebView；
- Desktop Chromium；
- Desktop Firefox；
- iOS Safari（有设备时）。

至少验证：

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
- [ ] WebView fallback 不影响 Chromium / Firefox。

### Phase B — 抽离 `BrowserCapabilities`

这是绿色基线后的**第一项架构实现任务**。

- [ ] 从 `#diagnostics` 抽出 capability probes；
- [ ] 建立 typed `BrowserCapabilities`；
- [ ] page / session 内缓存结果；
- [ ] Reader 与 diagnostics 共用同一套检测；
- [ ] diagnostics 只做展示与复制报告；
- [ ] 不增加 browser-name sniffing。

目标模型：

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

### Phase C — `SectionDocumentLoader`

把当前 iframe fallback 变成正式策略：

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

- capability 结果可直接跳过已知坏路径；
- 未知环境保留 timeout；
- Chromium / Firefox 保持 blob 快路径；
- transport / render / pagination 错误可区分。

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

- [ ] 每个 patch 都写明原因；
- [ ] 每个 patch 都写明删除条件；
- [ ] generic polyfill 能移出 Foliate patch 的逐步移出；
- [ ] 保留 upstream source assertions；
- [ ] 回归覆盖完整前不升级 Foliate；
- [ ] generic hardening 后续可考虑 upstream PR。

---

## 5. P2.5 Exit Criteria

只有全部满足，才允许正式继续 P3：

- [ ] 当前 P3 Spike 不再让 CI 变红；
- [ ] Chromium smoke 绿色；
- [ ] Firefox smoke 绿色；
- [ ] Chrome / Firefox / Via / 百度真实阅读链绿色；
- [ ] `BrowserCapabilities` 已抽离；
- [ ] diagnostics 与 Reader 共用 probes；
- [ ] `SectionDocumentLoader` 边界明确；
- [ ] `BlobTextRegistry` 生命周期明确；
- [ ] Foliate patches 已分类并可维护；
- [ ] 不存在新增的浏览器品牌 Reader 分支。

---

## 6. P3 — 中文排版专项 ⛔ 冻结扩展，等待 P2.5 Exit

已经提前存在的 Spike 可以保留用于回归与架构验证，但当前不继续扩大功能面。

P2.5 完成后再继续：

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
推进最靠前未完成的 P2.5 step/phase
      ↓
P2.5 Exit Criteria 全绿
      ↓
才继续 P3
```

### 当前新会话推荐任务

> 继续推进 `yushun1990/haodoo`。当前阶段是 P2.5 Reader 兼容性收口，不继续扩展 P3。main 上已经有 `5781ede` 的 P3 writing-mode Spike，但最新 Chromium smoke 在强制恢复 `horizontal-tb` 时返回 `null`。第一步先审计这个失败，恢复 Chromium / Firefox CI 绿色，同时不能破坏 Via / 百度的 blob → registry → srcdoc/document.write fallback。绿色基线恢复后，下一架构任务是 Phase B：抽离 `BrowserCapabilities`，让 diagnostics 和 Reader 共用 capability probes。不要继续字体、主题、简繁转换或竖排细节。
