# P2 — Reader Baseline 实施记录

状态：**核心闭环已实现；Desktop Chromium 自动验收通过；Firefox / Android / iOS 待验收**

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

第一版采用 `foliate-js@1.0.1`，React UI 不直接依赖 Foliate 实现：

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
- Foliate 原生触控分页能力接入；
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

小体积单册；同时有横式 / 直式 EPUB 和图片。自动验证：

- 横式真实远程 EPUB 打开；
- 翻页；
- CFI 保存；
- 返回详情后重新进入并恢复同一 CFI；
- 原始直式 EPUB 可以独立打开；
- 横式 / 直式使用不同阅读位置 key。

### `0106`《基地系列》

多册作品。自动验证：

- 从实际具备横式 EPUB 的 `BookPart` 中选择两册；
- 两个卷册均可进入 Reader；
- 不同 `BookPart` 的阅读位置 key 相互隔离。

### `10Q5`《老人與海》

传统长文本。自动验证：

- 横式 EPUB 打开；
- 连续翻页；
- 翻页后 CFI 变化；
- 运行时修改字号 / 行距；
- 修改排版后 Reader 仍可继续翻页并保存位置。

## 8. Chromium 自动 smoke

CI 在 production build 后使用系统 Chromium，以移动视口运行真实 EPUB smoke：

```text
Vite production preview
        ↓
Chromium 390 × 844
mobile + touch context
        ↓
《【小王子】》
横式打开 → 翻页 → CFI 保存 → 重开恢复
        ↓
《【小王子】》原始直式 EPUB
独立打开 → 独立位置 key
        ↓
《基地系列》
两个可读 BookPart → 位置隔离
        ↓
《老人與海》
翻页 → 字号 / 行距修改 → 继续翻页
```

测试同时监听浏览器 `pageerror`；任何未捕获 runtime error 都直接使 CI 失败，不允许仅因 UI 看起来还能工作就放行。

因此下列能力已经经过真实 Chromium runtime 验证，而不是编译期假设：

- GitHub Raw EPUB 可由 production Reader 打开；
- 当前 CSP 不阻断 Foliate 正常渲染；
- `relocate → CFI → localStorage → lastLocation` 闭环成立；
- Reader 路由返回 / 重进后恢复成立；
- 横式 / 直式进度隔离成立；
- 多 `BookPart` 进度隔离成立；
- 基础排版运行时修改不会让 Reader 失效。

## 9. foliate-js #150 生命周期兼容补丁

三样本 smoke 在快速切换《基地系列》卷册时捕获到一个间歇性未捕获异常：

```text
TypeError: Cannot destructure property 'style' of 'e' as it is null.
    at setStylesImportant
    at View.columnize
    at View.render
    at Paginator.render
    at ResizeObserver callback
```

稳定性复跑确认该错误可重复出现。

随后确认 foliate-js 上游已有开放 issue **#150 — `Paginator's ResizeObserver can render against a detached or bodyless section document`**，其根因和我们的堆栈一致：旧 section iframe 被关闭 / 切换后，已排队的 `ResizeObserver` 仍可能执行，此时 `contentDocument.body` 已不存在。

上游建议在 `Paginator.render()` 入口直接跳过无有效 `document.body` 的渲染：

```js
if (!this.#view?.document?.body) return
```

当前 `foliate-js@1.0.1` 尚未包含该修复，因此项目增加：

```text
npm install
    ↓
postinstall
    ↓
scripts/patch-foliate.mjs
    ↓
精确检查 1.0.1 paginator 源码
    ↓
应用 #150 guard
```

补丁不是模糊字符串替换：如果未来 Foliate 源码不再匹配 `1.0.1` 的已知结构，安装会直接失败并要求人工重新审查，避免升级后静默打错补丁。

补丁前，同一 smoke 已出现“一次成功、一次生命周期竞争失败”；补丁后完整 CI + 三样本 smoke 连续两次通过。

这个补丁应在上游正式发布等价修复后删除，而不是长期形成私有 fork。

## 10. 当前 CI 门槛

```text
npm install
  ↓
foliate #150 compatibility patch
  ↓
lint
  ↓
typecheck
  ↓
sync Classic catalog
  ↓
production build
  ↓
3-book real EPUB Chromium smoke
  ↓
zero pageerror
```

全部通过后 CI 才能为绿。

## 11. P2 尚未关闭的验收项

P2 还不能直接标记完成。Desktop Chromium 侧的核心链已经自动化，剩余重点是浏览器 / 真机差异：

1. Firefox 至少验证 1 个横式 EPUB；
2. Android Chromium 真机打开 / 触控翻页 / 关闭重开恢复；
3. iOS Safari 真机打开 / 触控翻页 / 关闭重开恢复；
4. 真实设备观察原始直式 EPUB 的明显排版问题，但 P2 不展开排版修复。

《基地系列》的多 `BookPart` 隔离、《老人與海》的连续翻页 / 基础排版调整已经进入自动回归，不再列为人工 P2 阻塞项。

## 12. P3 输入

P3 不重新设计路由或阅读位置模型。核心问题是：

> `FoliateReaderEngine` 在真实中文横排 / 直排 EPUB 上的排版质量是否足以长期阅读？

若答案是否定，优先调整 / 替换 Reader adapter，而不是污染 React UI。
