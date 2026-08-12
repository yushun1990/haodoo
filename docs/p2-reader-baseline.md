# P2 — Reader Baseline 实施记录

状态：**核心实现完成，真实浏览器 / 移动端回归待验收**

## 1. 目标

P2 只验证最短阅读链：

```text
Book
  ↓
BookPart
  ↓
选择横式 / 直式 EPUB
  ↓
打开 Reader
  ↓
目录 / 翻页 / 基础排版
  ↓
保存 CFI
  ↓
下次恢复位置
```

P2 不承担中文排版质量、字体、主题、简繁转换和离线存储，这些仍按 `docs/plan.md` 留给 P3 / P4。

## 2. EPUB 引擎选择

第一版采用 `foliate-js`，并且不允许 React UI 直接依赖 Foliate 私有实现。

当前边界：

```text
React ReaderPage
      ↓
ReaderEngine
      ↓
FoliateReaderEngine
      ↓
foliate-js
```

选择原因：

- 原生浏览器 EPUB 渲染；
- 可以直接打开远程 URL；
- 内置 EPUB CFI；
- 内置目录 / 页面前进后退；
- `relocate` 可以得到稳定阅读位置；
- paginator 本身考虑 horizontal / vertical writing；
- Foliate 桌面阅读器长期真实使用该渲染库。

同时明确接受一个风险：`foliate-js` 官方说明其 library API 仍可能变化。

因此 `ReaderEngine` 是硬边界；未来若 P3 证明竖排质量不满足要求，可以替换适配器，而不重写 Reader UI、路由和阅读位置上层契约。

## 3. 当前 ReaderEngine 契约

```ts
interface ReaderEngine {
  open(container, source, options): Promise<void>
  close(): void
  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: string): Promise<void>
  getToc(): ReaderTocItem[]
  setPreferences(preferences: ReaderPreferences): void
  onLocationChange(listener): () => void
}
```

永久位置第一版使用 EPUB CFI：

```ts
interface ReaderLocation {
  cfi: string
  fraction?: number
  chapter?: string
}
```

其中：

- `cfi` 是恢复位置的稳定主键；
- `fraction` 只用于 UI 进度显示；
- `chapter` 只用于当前章节显示；
- 不把页码作为永久位置。

## 4. BookPart 与资源版本

P1 已证明一个 `Book` 可以有多个 `BookPart`。

P2 进一步明确 Reader 打开的目标是：

```text
BookPart + ReaderResourceKind
```

当前：

```ts
type ReaderResourceKind = 'epub' | 'verticalEpub'
```

所以横式 EPUB 和好读原始直式 EPUB 的阅读位置分别保存，不会互相覆盖。

## 5. 阅读位置存储

P2 暂时使用 `localStorage`：

```text
haodoo.reader.position.v1:<source>:<book>:<part>:<resource-kind>
```

这是有意的临时实现。

P2 要验证的是：

> CFI 是否能够在真实好读 EPUB 中稳定保存和恢复。

P4 再把位置迁入 IndexedDB / 本地书架 storage abstraction。

如果 `localStorage` 不可用或 quota 写入失败，Reader 仍继续工作，只是不持久化本次位置。

## 6. 已实现功能

- `foliate-js` adapter；
- 远程 EPUB URL 打开；
- 横式 / 直式资源分别进入 Reader；
- 多册作品选择具体 `BookPart`；
- EPUB TOC 读取；
- 目录跳转；
- 上一页 / 下一页；
- PageUp / PageDown / Space 键盘翻页；
- Foliate 原生触控分页；
- CFI 位置监听；
- CFI 自动保存；
- 再次打开恢复上次 CFI；
- 当前章节 / 阅读百分比显示；
- 基础字号；
- 基础行距；
- 基础页面间距；
- 阅读工具栏隐藏 / 恢复；
- EPUB 原始文件 fallback；
- Reader 加载失败状态；
- Reader bundle 动态加载；
- CSP 阻止 EPUB 脚本执行。

## 7. 安全边界

EPUB 本质上包含 HTML / CSS，并可能包含脚本内容。

`foliate-js` 官方明确要求应用通过 CSP 阻止 EPUB 脚本执行。

当前 `index.html` 添加 CSP：

- `script-src 'self'`；
- EPUB 内容允许 `blob:` frame / image / font / style；
- 运行时网络只开放自身和 Classic GitHub Raw 数据；
- `object-src 'none'`。

P2 不开启 EPUB scripted content。

## 8. Bundle 边界

Reader adapter 使用动态 import：

```text
Catalog UI
   │
   └── 用户进入 Reader 时
            ↓
     FoliateReaderEngine
            ↓
       foliate-js chunks
```

2026-08-12 CI production build 已确认 Foliate 的 EPUB、paginator、view、zip 等代码均拆为独立 chunks，没有整体塞入首页同步加载路径。

## 9. 第一批真实回归样本

### A. `1756`《小王子》

用途：小体积单册基线。

官方 Classic 页面同时提供：

- 横式 EPUB；
- 直式 EPUB；
- 图片内容。

验证：

- 快速打开；
- 目录；
- 图片；
- 横式 / 直式资源都能进入 Reader；
- 保存 / 恢复位置。

### B. `0106`《基地系列》

用途：多册作品基线。

同一作品下面存在多个独立卷册，例如：

- 《基地》；
- 《基地與帝國》；
- 《第二基地》。

验证：

- `Book → BookPart` 路由是否正确；
- 不同卷册的位置不能互相覆盖；
- 横式 / 直式位置不能互相覆盖。

### C. `10Q5`《老人與海》

用途：传统长文本 EPUB 基线。

官方 Classic 页面同时存在横式 / 直式 EPUB。

验证：

- 连续翻页；
- 长章节中的 CFI 恢复；
- 字号 / 行距变化后当前位置不应跳回章节开头。

## 10. CI 状态

当前质量门槛：

```text
lint
  ↓
typecheck
  ↓
sync Classic catalog
  ↓
production build
```

P2 Reader 接入后该流程已全部通过。

构建已经实际打包：

- `FoliateReaderEngine`；
- EPUB parser；
- paginator；
- view；
- zip loader；
- 其他 Foliate lazy modules。

## 11. P2 尚未验收的事项

CI 成功不能证明 EPUB 在真实浏览器里排版正确。

P2 关闭前必须人工完成：

1. Desktop Chromium 打开至少 3 个回归样本；
2. Firefox 打开至少 1 个横式 EPUB；
3. Android Chromium 打开 / 翻页 / 恢复；
4. iOS Safari 打开 / 翻页 / 恢复；
5. 实际关闭页面后重新打开，确认 CFI 恢复；
6. 目录跳转后继续翻页；
7. 调整字号 / 行距后继续翻页；
8. 记录直式 EPUB 的明显排版问题，但不要在 P2 中展开修复。

这些通过后才把 P2 标记为完成。

## 12. P3 输入

P3 不重新选择产品路由或位置存储模型。

P3 的核心问题只有一个：

> `FoliateReaderEngine` 在真实中文横排 / 直排 EPUB 上的排版质量是否足以长期阅读？

如果答案是否定的，优先修改 / 替换 Reader adapter，而不是把补丁散落到 React UI。
