# P3 — 中文排版专项实施记录

状态：**第一轮横排 / 竖排架构 Spike 已进入实现；真机与竖排细节仍待验收**

## 1. 本阶段目标

P3 的目的不是一次做完所有阅读设置，而是尽早回答 ReaderEngine 的第二个关键问题：

> 同一个好读 EPUB，能否在不污染 React UI、不破坏 CFI 阅读位置的前提下，在横排与竖排之间可靠重分页？

如果这个问题不成立，字体、主题、简繁转换继续往上堆都没有意义。

## 2. 第一轮切片

本轮只进入以下能力：

- `ReaderPreferences.writingMode`：`source | horizontal | vertical`；
- `source` 保留 EPUB 自带书写方向；
- `horizontal` 强制 `writing-mode: horizontal-tb`；
- `vertical` 强制 `writing-mode: vertical-rl`；
- 中文字号、行距、字距、页边距；
- `line-break: strict` 中文换行基线；
- 横竖排切换后恢复当前 CFI；
- Chromium / Firefox 真实 EPUB 自动回归。

本轮不把字体、主题、简繁显示转换一起塞进来。

## 3. 为什么仍由 ReaderEngine 负责

当前结构继续保持：

```text
React ReaderPage
      ↓
ReaderEngine
      ↓
FoliateReaderEngine
      ↓
foliate-js
```

React 只表达“用户想要横排还是竖排”，不知道 Foliate 如何重分页。

`FoliateReaderEngine` 负责：

1. 在 EPUB section 的 `load` 时机注入 Haodoo 阅读样式；
2. 让 Foliate 在布局前读取到最终 `writing-mode`；
3. 普通字号 / 行距 / 字距变化直接更新当前文档；
4. `writingMode` 变化时重新打开当前资源；
5. 使用最近一次 `ReaderLocation.cfi` 恢复位置。

这样如果 P3 后续证明 Foliate 竖排质量不够，替换 adapter 时 React 页面不需要重新设计。

## 4. Foliate 1.0.1 的关键行为

Foliate paginator 在 section 加载时的顺序是：

```text
section document load
      ↓
onLoad callback
      ↓
getComputedStyle(body).writingMode
      ↓
决定 vertical / horizontal pagination axis
      ↓
render
```

Haodoo 现有的 `load` hook 位于这个窗口内，因此可以在不 fork paginator 的前提下，让 `vertical-rl` 参与第一次分页布局。

但是已经完成布局后，仅修改 CSS 不会让 Foliate 重新计算内部的 vertical flag。因此运行时横竖排切换必须重新布局，不能简单改一条 CSS 后继续使用旧 paginator 状态。

## 5. 阅读位置约束

横竖排属于“显示方式”，不是新的永久阅读对象。

因此切换版式时：

- 不创建新的 reading-position key；
- 不修改 `BookPart + ReaderResourceKind` 的位置隔离规则；
- 重分页前记录最近 CFI；
- 重开后用同一 CFI 恢复；
- 新分页产生的 fraction 可以变化，但永久位置仍以 CFI 为准。

这也为后续简繁显示转换提供同一原则：显示层变化不得改变永久阅读位置模型。

## 6. 自动回归范围

现有三本真实 EPUB smoke 继续保留，并在《老人與海》场景增加：

```text
横式 EPUB
  ↓
修改字号 / 行距 / 字距
  ↓
继续翻页
  ↓
强制 vertical-rl
  ↓
读取当前 section computed writing-mode
  ↓
继续下一页并确认 CFI 更新
  ↓
强制 horizontal-tb
  ↓
再次确认 computed writing-mode
```

测试直接读取 `foliate-view.renderer.getContents()` 返回的当前 section document，不以设置按钮的 React state 代替真实排版结果。

## 7. 当前明确未完成

### 7.1 竖排手势

Foliate 1.0.1 的 paginated vertical 路径使用纵向分页轴，原生 touch gesture 也按 `dy` 计算。

这证明“竖排分页”与“符合传统竖排阅读直觉的横向翻页手势”是两个问题。

P3 后续必须单独验证：

- 左右滑动应该如何映射上一页 / 下一页；
- 是否需要 adapter 层手势覆盖；
- 是否会与 Foliate 内部 touch handler 冲突；
- iOS Safari 与 Android Chromium 行为是否一致。

在真机验证之前，不把竖排手势标记完成。

### 7.2 竖排细节

仍待逐项回归：

- 中文标点位置；
- 数字；
- 英文与 URL；
- `text-orientation`；
- 图片尺寸与分页；
- `ruby`；
- 章节标题；
- 好读原始直式 EPUB 与“横式 EPUB 强制竖排”的差异。

### 7.3 真机

Desktop Chromium / Firefox 的移动视口只能作为自动化门槛，不能代替：

- Android Chromium 真机；
- iOS Safari 真机。

## 8. 偏好持久化边界

P3 仍沿用 P2 的 session state，不提前建立完整偏好存储。

全局 ReaderPreferences、per-book override 与 IndexedDB storage abstraction 仍属于 P4。P3 先把“哪些偏好存在、哪些会触发结构性重分页”定义清楚，再持久化。

## 9. 下一小刀

第一轮自动回归稳定后，优先继续 P3.2，而不是跳去字体或主题：

1. 真实竖排标点 / 英数 / ruby / 图片回归；
2. 明确横向翻页手势策略；
3. Android / iOS 真机验证；
4. 再进入简繁显示层；
5. 最后补字体与主题。

这样可以尽早决定 Foliate adapter 是否真的足以支撑 Haodoo 的长期竖排阅读目标。
