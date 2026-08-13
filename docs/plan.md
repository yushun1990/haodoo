# Haodoo 推进计划

> **状态快照：2026-08-13**
>
> 本文件是新会话判断“现在应该做什么”的第一入口。详细 Reader / WebView 架构见 [`reader-compatibility-roadmap.md`](reader-compatibility-roadmap.md)，总体长期设计见 [`design.md`](design.md)。

## 0. 当前执行状态：不要直接进入 P3

当前项目已经完成 Classic Catalog、Reader Baseline 的主要功能，以及第一轮 PWA 安装体验；Chrome / Firefox / Via / 百度浏览器已经可以打开真实好读 EPUB。

但是 **P2 还没有正式退出**。

目前处于一个插入阶段：

```text
P1 Classic Catalog        ✅ 基本完成
        ↓
P2 Reader Baseline        ✅ 功能链可用
        ↓
P2.5 Reader 兼容性收口    ← 当前阶段
        ↓
P3 中文排版专项            ⛔ 暂时不要开始
        ↓
P4 本地 / 离线
        ↓
P5 Modern Catalog
```

### 新会话必须遵守的推进门槛

在以下工作完成前，**不要因为旧计划中的顺序而直接推进 P3 中文排版、主题、字体、繁简转换或新的 Reader UX 功能**：

1. 完成当前 Reader 的真实设备兼容回归；
2. 抽离并统一 `BrowserCapabilities`；
3. 把 iframe / blob / `srcdoc` / `document.write` 逻辑整理为明确的 `SectionDocumentLoader` 策略；
4. 正式封装 `BlobTextRegistry` 生命周期；
5. 分类并收缩 Foliate source patch；
6. 确认 Chrome、Firefox、Via、百度浏览器没有因为重构回退。

**当前第一实现任务是 `BrowserCapabilities` 抽离，不是 P3。**

---

## 1. 推进原则

Haodoo 不按“功能越多越完整”的方式推进，而围绕一条最短用户链收敛：

```text
找到一本书
    ↓
打开书籍
    ↓
舒服地阅读
    ↓
下次回来继续读
```

长期约束：

- 零持续成本优先；
- 静态部署优先；
- 不引入账号系统；
- 不自建内容服务器；
- 中文横排 / 竖排与繁体显示必须是一等 Reader 能力；
- 每阶段都要有可运行结果；
- Reader 兼容逻辑必须基于能力检测，不按浏览器品牌写 `if (isVia)` / `if (isBaidu)`；
- 兼容性稳定之前，不继续扩大 Reader 功能面。

---

## 2. 当前已经完成 / 验证

### P0 — 可行性验证 ✅

- [x] Classic 官方 GitHub 仓库包含 catalog、封面、书籍资料和 EPUB；
- [x] GitHub Raw catalog / EPUB 可被浏览器跨域读取；
- [x] `haodoo.org` EPUB / cover 可被浏览器跨域读取；
- [x] `haodoo.org` WordPress API 可在构建阶段读取；
- [x] 确认无需常驻 CORS Proxy；
- [x] 纯静态 PWA + 构建期 catalog 同步路线成立。

### P1 — Classic Catalog ✅ 基本完成

- [x] TypeScript + React + Vite 项目骨架；
- [x] lint / typecheck / CI；
- [x] PWA manifest / Service Worker；
- [x] Classic catalog 构建脚本；
- [x] Classic 数据归一化；
- [x] 真实书目首页；
- [x] 书名 / 作者搜索；
- [x] 分类浏览；
- [x] 书籍详情与 EPUB 入口；
- [x] 横式 / 直式资源进入统一 catalog。

阶段结论：**Classic 已足够作为 Reader 与兼容性开发的数据基础。**

### P2 — Reader Baseline ✅ 主链可用，但尚未退出

已经实现 / 验证：

- [x] `ReaderEngine` 抽象；
- [x] Foliate Reader adapter；
- [x] 从真实好读 EPUB 打开书籍；
- [x] 目录；
- [x] 上一页 / 下一页；
- [x] 章节跳转；
- [x] CFI / 稳定位置保存与恢复；
- [x] 基础字号、行距、页边距；
- [x] 移动 Reader UI；
- [x] Chromium Reader smoke test；
- [x] Firefox Reader smoke test；
- [x] Chrome / Chromium 阅读成功；
- [x] Firefox Android 阅读成功；
- [x] Via Android 阅读成功；
- [x] 百度浏览器 Android WebView 阅读成功。

### PWA 安装能力 ✅ 第一轮完成

- [x] Chrome / Chromium 原生 `beforeinstallprompt` 安装；
- [x] Firefox Android 手动安装说明；
- [x] iOS Add to Home Screen 说明；
- [x] Android 其他浏览器安装 / 快捷方式说明；
- [x] Firefox 安装图标兼容；
- [x] Chrome 已安装后隐藏安装按钮；
- [x] standalone 模式隐藏安装入口。

仍有后续产品化工作，但不阻塞当前 Reader 兼容架构重构。

---

## 3. 已确认的 Android WebView 根因

旧 Android WebView 兼容问题分成两层。

### 3.1 JavaScript API 兼容

部分环境缺少 Foliate 使用的新 API，包括：

- `Array.prototype.at`；
- `Array.prototype.findLast` / `findLastIndex`；
- `Object.fromEntries`；
- `Object.groupBy`；
- `Map.groupBy`；
- `String.prototype.replaceAll`。

当前已经通过早期兼容 bootstrap 与 Foliate build-time patch 解决。

### 3.2 正文空白的真正根因

`#diagnostics` 在问题 WebView 中验证出：

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

因此不是 WebView 不会排版，而是 Foliate 默认的 blob transport 在这些环境中失效。

当前工作方案：

```text
Foliate rewritten XHTML / HTML
        │
        ├── Blob URL → 正常浏览器 blob iframe
        │
        └── 同时保存文本 → BlobTextRegistry
                                │
blob iframe 失败                │
        ↓                       │
从 registry 取回章节 HTML ──────┘
        ↓
iframe srcdoc
        ↓ 失败时
iframe document.write
        ↓
Foliate 正常分页与渲染
```

Via 与百度浏览器已经用这条 fallback 成功显示正文。

这套逻辑目前仍部分存在于 Foliate patch 中，所以接下来要把它变成正式架构，而不是继续叠 patch。

---

## 4. P2.5 — 当前唯一优先阶段：Reader 兼容性收口与架构重构

详细设计参见 [`reader-compatibility-roadmap.md`](reader-compatibility-roadmap.md)。

### Phase A — Compatibility Freeze / 回归矩阵

目标：证明现在已经能工作的路径足够稳定，给后续重构建立安全网。

目标环境：

- Chrome Android；
- Firefox Android；
- Via Android；
- 百度浏览器 Android WebView；
- Desktop Chromium；
- Desktop Firefox；
- iOS Safari（有设备时补）。

至少测试：

- [ ] 横式 EPUB 打开；
- [ ] 原始直式 EPUB 打开；
- [ ] 多卷册；
- [ ] 前后翻页；
- [ ] 连续跨章节翻页；
- [ ] TOC 跳转；
- [ ] 关闭后恢复阅读位置；
- [ ] 字号 / 行距 / 页边距改变后位置稳定；
- [ ] 横竖屏切换；
- [ ] 关闭一本再打开第二本；
- [ ] 连续 open / destroy 不出现空白或锁死。

退出条件：

- 支持环境不再出现空白正文；
- 错误后不会永久锁住翻页；
- WebView fallback 不影响 Chromium / Firefox；
- 阅读位置恢复稳定。

### Phase B — 抽离 `BrowserCapabilities` ← **下一实现任务**

目标：Reader 与 `#diagnostics` 共用同一套真实能力检测。

任务：

- [ ] 从诊断页面抽出 probe；
- [ ] 建立 typed `BrowserCapabilities`；
- [ ] 能力结果按 session / page 缓存；
- [ ] 保留可复制的详细诊断报告；
- [ ] Reader 使用同一能力数据做策略选择；
- [ ] `#diagnostics` 变成纯展示层；
- [ ] 不增加浏览器品牌 sniffing。

建议模型：

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

### Phase C — 抽离 `SectionDocumentLoader`

目标：把当前 iframe fallback 从字符串 patch 逻辑整理为明确加载策略。

策略：

```text
blob iframe
    ↓ unsupported / fail
srcdoc
    ↓ unsupported / fail
document.write
    ↓ fail
explicit compatibility error
```

任务：

- [ ] 定义 `SectionDocumentLoader`；
- [ ] 基于 `BrowserCapabilities` 跳过已知失败路径；
- [ ] 未知环境保留 timeout 探测；
- [ ] Chromium / Firefox 保持正常 blob 快路径；
- [ ] 错误信息明确区分 transport / render / pagination。

### Phase D — 正式封装 `BlobTextRegistry`

目标：消除匿名全局兼容状态。

任务：

- [ ] 独立模块；
- [ ] `register/get/delete/clear`；
- [ ] 与 Foliate blob URL 生命周期一致；
- [ ] book destroy 后清空；
- [ ] 添加 focused tests；
- [ ] 明确只存在于内存，不作为 EPUB 持久缓存。

### Phase E — 收缩 Foliate patch 面积

所有 patch 分成三类：

1. **Upstream hardening**：section error propagation、detached-document guards、navigation lock cleanup；
2. **Runtime compatibility**：现代 JS API 兼容；
3. **Haodoo WebView adaptation**：blob registry / iframe fallback。

任务：

- [ ] 给每一个 patch 写明原因；
- [ ] 写明未来删除条件；
- [ ] generic runtime compatibility 能移出 Foliate patch 的尽量移出；
- [ ] 保留 source assertion，Foliate 升级后必须 fail loudly；
- [ ] 有回归覆盖后再评估升级 Foliate；
- [ ] 适合上游的 hardening 后续考虑提交 upstream。

### P2.5 总退出条件

只有下面全部成立，才正式允许进入 P3：

- [ ] Chrome / Firefox / Via / 百度真实阅读链保持绿色；
- [ ] `BrowserCapabilities` 已抽离；
- [ ] diagnostics 与 Reader 共用能力检测；
- [ ] `SectionDocumentLoader` 有明确边界；
- [ ] `BlobTextRegistry` 有明确生命周期；
- [ ] Foliate patches 已分类并可维护；
- [ ] CI Chromium / Firefox smoke tests 继续通过；
- [ ] 没有新的 browser-brand Reader 分支。

---

## 5. P3 — 中文排版专项 ⛔ 等待 P2.5 退出

P3 的目标不变：让“中文阅读是一等公民”成为真实能力。

**但新会话不得在 P2.5 未完成时直接开始这里。**

### P3.1 横排排版

- [ ] 中文横排默认样式；
- [ ] 字号；
- [ ] 行距；
- [ ] 字距；
- [ ] 页边距；
- [ ] 段落视觉调整；
- [ ] 中英文混排检查。

### P3.2 竖排 Spike

- [ ] `writing-mode: vertical-rl` 基线；
- [ ] 从右向左列进；
- [ ] 竖排分页；
- [ ] 翻页手势方向；
- [ ] 中文标点；
- [ ] 数字 / 英文混排；
- [ ] 图片；
- [ ] `ruby`；
- [ ] 章节标题；
- [ ] iOS Safari 验证；
- [ ] Android Chromium 验证；
- [ ] Via / 百度 WebView 验证；
- [ ] 对比好读原始直式 EPUB。

### P3.3 简繁显示

- [ ] `source` 原文模式；
- [ ] 显示层繁体转换；
- [ ] 转换不改变永久阅读位置；
- [ ] 模块 lazy-load；
- [ ] 随时切回原文；
- [ ] 后续复用架构支持简体显示转换。

### P3.4 字体

- [ ] `FontChoice`；
- [ ] 系统宋体 / 黑体 / 楷体类；
- [ ] 西文字体；
- [ ] fallback；
- [ ] 不引入未经授权字体；
- [ ] 后续用户字体方案。

### P3.5 主题

- [ ] Light；
- [ ] Dark；
- [ ] Warm；
- [ ] Low Contrast；
- [ ] 自定义文字色 / 背景色。

---

## 6. P4 — 本地书架与离线

目标：从静态网页 Reader 进入真正 local-first 客户端。

已有基础：

- [x] Service Worker app shell；
- [x] PWA 安装入口第一轮；
- [x] 阅读位置已可本地保存。

仍需：

- [ ] IndexedDB / OPFS storage abstraction；
- [ ] 最近阅读；
- [ ] 收藏 / 本地书架；
- [ ] 书签；
- [ ] 全局 `ReaderPreferences`；
- [ ] per-book preference override；
- [ ] 明确“保存离线”操作；
- [ ] EPUB 本地存储；
- [ ] 离线打开已保存 EPUB；
- [ ] catalog 离线策略；
- [ ] quota / storage error；
- [ ] 删除下载；
- [ ] 存储占用显示；
- [ ] 导出原始 EPUB。

原则：**不要自动缓存全部 EPUB。**

---

## 7. P5 — Modern Catalog

目标：接入持续更新的 `haodoo.org`，运行时仍保持无后端。

- [ ] WordPress posts 分页与新书筛选规则；
- [ ] 稳定书码提取；
- [ ] title / author / cover / EPUB / 发布时间解析；
- [ ] `sync-modern`；
- [ ] 全量 / 增量同步；
- [ ] Classic / Modern 合并；
- [ ] 冲突报告；
- [ ] GitHub Actions 定时同步；
- [ ] 无变化不制造 commit。

仍然放在 Reader 核心稳定之后，不提前抢占优先级。

---

## 8. 质量、PWA 与发布增强

这些能力横跨后续阶段，不再等到最后才统一处理。

### Reader / browser quality

- [ ] EPUB 回归样本集；
- [x] Chromium smoke test；
- [x] Firefox smoke test；
- [x] Android Via / 百度 WebView 实机兼容突破；
- [ ] iOS Safari 实机；
- [ ] 大 EPUB 内存占用；
- [ ] 性能基线；
- [ ] source URL fallback；
- [ ] 无障碍基础支持。

### PWA hardening

- [x] Chrome 原生安装；
- [x] Firefox Android 安装指导；
- [x] iOS Add to Home Screen 指导；
- [x] 安装后隐藏 Chrome install action；
- [ ] Service Worker 新版本更新 / reload UX；
- [ ] standalone safe-area / status-bar polish；
- [ ] offline / update 状态提示；
- [ ] diagnostics / about 显示版本信息；
- [ ] Firefox 安装 PWA task switch 黑预览问题调查。

---

## 9. 长期增强候选

当前不承诺时间：

- 阅读统计（仅本地）；
- 标注 / 笔记；
- 全文检索；
- 自定义 CSS；
- 用户字体；
- TTS；
- 更细 CJK 标点处理；
- 导出 / 导入书架和阅读进度；
- local metadata snapshot；
- 多 source fallback；
- catalog 历史快照。

---

## 10. 明确不进入当前路线

除非项目目标变化，否则不顺手加入：

- 登录；
- OAuth；
- 云数据库；
- 云阅读进度；
- 推荐流；
- 评论 / 社交；
- 内容上传；
- 管理后台；
- 付费；
- 广告；
- 自建 EPUB CDN。

---

## 11. 新会话的标准启动方式

新会话在没有额外用户指示时，应按下面顺序判断工作：

```text
先读 docs/plan.md
        ↓
确认当前是否仍在 P2.5
        ↓
读 docs/reader-compatibility-roadmap.md
        ↓
检查 main 最新代码 / CI
        ↓
推进 P2.5 当前最靠前未完成 Phase
        ↓
全部 P2.5 exit criteria 满足后
        ↓
才进入 P3
```

### 当前推荐的新会话任务描述

> 继续推进 `yushun1990/haodoo`。当前不是 P3，而是 P2.5 Reader 兼容性收口阶段。Chrome、Firefox、Via、百度浏览器已经能阅读真实 EPUB；Via / 百度的关键问题是 WebView 无法 `fetch(blob:)` 且 sandbox iframe 不能导航到 blob URL，但 `srcdoc`、`document.write`、CSS columns 与 Range geometry 正常。当前 fallback 已工作。先审计当前 reader、diagnostics、legacy WebView bootstrap 和 Foliate patches，然后推进 Phase B：抽离 `BrowserCapabilities`，让 `#diagnostics` 与 Reader 共用同一套 capability probes。重构必须保持 Chromium、Firefox、Via、百度行为不回退，不要开始 P3 中文排版功能。

---

## 12. 当前下一步

**下一步：Phase B — `BrowserCapabilities` extraction。**

在开始写代码前先做小范围 audit：

1. 当前 `src/reader/` 的职责；
2. `src/diagnostics/` 中现有 probes；
3. legacy WebView bootstrap；
4. `scripts/patch-foliate.mjs`；
5. `scripts/patch-foliate-legacy.mjs`。

然后只移动一项职责：把 capability probes 抽成可复用模块，并让 diagnostics 使用该模块。

不要同时重写 Reader、Section loader 和 Foliate patches。每次只移动一个边界，并在每一步保持 lint、typecheck、build、Chromium smoke、Firefox smoke 绿色。
