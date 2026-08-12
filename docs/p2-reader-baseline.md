# P2 — Reader Baseline 实施记录

状态：**核心闭环已实现；Desktop Chromium 自动验收通过；跨浏览器 / 真机待验收**

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

中文排版质量、字体、主题、简繁转换和离线存储仍留给 P3 / P4。

## 2. EPUB 引擎

第一版采用 `foliate-js`，React UI 不直接依赖 Foliate 实现：

```text
React ReaderPage
      ↓
ReaderEngine
      ↓
FoliateReaderEngine
      ↓
foliate-js
```

`ReaderEngine` 是硬边界。若 P3 证明中文竖排质量不足，应优先替换或调整 adapter，而不是把 Foliate 私有 API 散落进 UI。

## 3. 阅读位置

永久位置第一版使用 EPUB CFI：

```ts
interface ReaderLocation {
  cfi: string
  fraction?: number
  chapter?: string
}
```

- `cfi`：恢复位置的稳定主键；
- `fraction`：仅用于阅读进度显示；
- `chapter`：仅用于当前章节显示；
- 不把页码作为永久位置。

P2 暂时保存到：

```text
haodoo.reader.position.v1:<source>:<book>:<part>:<resource-kind>
```

`BookPart + ReaderResourceKind` 才是实际阅读对象，因此横式 / 直式 EPUB、不同卷册的进度互不覆盖。P4 再迁移到 IndexedDB storage abstraction。

## 4. 已实现

- 远程 EPUB URL 打开；
- 横式 / 直式资源分别进入 Reader；
- 多册作品选择具体 `BookPart`；
- EPUB TOC 与目录跳转；
- 上一页 / 下一页；
- PageUp / PageDown / Space 键盘翻页；
- Foliate 原生触控分页；
- CFI 位置监听、自动保存和恢复；
- 当前章节 / 阅读百分比；
- 基础字号、行距、页面间距；
- 阅读工具栏隐藏 / 恢复；
- EPUB 原始文件 fallback；
- Reader 错误状态；
- Reader bundle 动态加载；
- CSP 阻止 EPUB scripted content。

## 5. 安全边界

EPUB 包含 HTML / CSS，也可能包含脚本。当前 `index.html` CSP：

- `script-src 'self'`；
- EPUB 内容允许必要的 `blob:` frame / image / font / style；
- 运行时网络只开放自身和 Classic GitHub Raw；
- `object-src 'none'`。

P2 不开启 EPUB scripted content。

## 6. Bundle 边界

Reader adapter 动态加载。2026-08-12 production build 已确认 Foliate 的 EPUB parser、paginator、view、zip 等均为独立 chunks，没有整体进入 Catalog 首页同步加载路径。

## 7. 回归样本

### `1756`《【小王子】》

小体积单册；同时有横式 / 直式 EPUB 和图片。用于验证打开、翻页、资源版本和 CFI 保存 / 恢复。

### `0106`《基地系列》

多册作品。用于验证 `Book → BookPart` 路由，以及不同卷册 / 横直版本的位置隔离。

### `10Q5`《老人與海》

传统长文本，同时有横式 / 直式 EPUB。用于验证连续翻页、长章节恢复，以及调整基础排版后的位置稳定性。

## 8. Chromium 自动 smoke

CI 现在会在 production build 后：

```text
启动 Vite preview
    ↓
系统 Chromium · 390×844
    ↓
搜索「小王子」
    ↓
精确进入《【小王子】》
    ↓
打开官方真实远程横式 EPUB
    ↓
等待 Reader relocate
    ↓
确认 CFI 已写入 localStorage
    ↓
下一页
    ↓
确认 CFI 发生变化
    ↓
返回书籍详情
    ↓
重新进入 Reader
    ↓
确认先前 CFI 被恢复
```

2026-08-12 CI 已实际通过该链路。

因此下列能力已经不是单纯的编译期假设：

- GitHub Raw EPUB 可由 production Reader 打开；
- 当前 CSP 不阻断 Foliate 正常渲染；
- `foliate-js` 在 Chromium runtime 可工作；
- `relocate → CFI → localStorage → lastLocation` 闭环成立；
- Reader 路由返回 / 重进后恢复成立。

## 9. 当前 CI 门槛

```text
lint
  ↓
typecheck
  ↓
sync Classic catalog
  ↓
production build
  ↓
real EPUB Chromium smoke
```

全部通过后 CI 才能为绿。

## 10. P2 尚未关闭的验收项

P2 还不能直接标记完成。剩余重点是浏览器 / 真机差异，而不是继续堆 Reader 功能：

1. Firefox 至少验证 1 个横式 EPUB；
2. Android Chromium 真机打开 / 触控翻页 / 关闭重开恢复；
3. iOS Safari 真机打开 / 触控翻页 / 关闭重开恢复；
4. 《基地系列》验证多 `BookPart` 进度隔离；
5. 《老人與海》连续翻页并改变字号 / 行距；
6. 直式 EPUB 只记录明显排版问题，P2 不展开修复。

上述通过后再把 P2 标记为完成。

## 11. P3 输入

P3 不重新设计路由或阅读位置模型。核心问题是：

> `FoliateReaderEngine` 在真实中文横排 / 直排 EPUB 上的排版质量是否足以长期阅读？

若答案是否定，优先调整 / 替换 Reader adapter，而不是污染 React UI。
