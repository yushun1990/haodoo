# P1 — Classic Catalog 实施记录

状态：**完成**

## 1. 交付内容

P1 已建立第一个可运行的 Haodoo 客户端骨架：

- React + TypeScript + Vite；
- PWA manifest 与基础图标；
- `Book` / `BookPart` / `BookResource` / `BookSourceRef` 领域模型；
- Classic CSV 构建期同步脚本；
- `catalog.json` schema validation；
- 真实书目首页；
- 书名 / 作者 / 系列 / 卷册搜索；
- 分类筛选；
- 书籍详情页；
- 封面展示；
- 横排 / 竖排 EPUB 资源展示；
- GitHub Actions lint / typecheck / production build 验证。

## 2. 数据源

Classic catalog 来源：

```text
https://raw.githubusercontent.com/haodoo/haodoo-classic/main/Haodoo_Catalog_Table.csv
```

运行时不直接解析 CSV。

```text
Haodoo Classic CSV
        ↓
scripts/sync-classic.ts
        ↓
normalize + validate
        ↓
public/data/catalog.json
        ↓
React client
```

`catalog.json` 是构建派生物，不提交到仓库；`npm run dev` 和 `npm run build` 会先执行 `sync:classic`。

## 3. 重要领域模型修正

第一版实现曾假定：

```text
1 book_code = 1 catalog row = 1 EPUB
```

真实数据验证证明这个假设错误。

例如 `0106` 对应艾西莫夫《基地系列》，同一个作品书码下面包含多个独立卷册，例如《基地》《基地与帝国》《第二基地》，每册分别拥有自己的 EPUB 文件。

因此领域模型改为：

```text
Book
 ├─ metadata
 ├─ cover
 ├─ description
 └─ parts[]
      ├─ title / track
      ├─ epub
      └─ verticalEpub
```

`Book` 表示作品 / 合集层，`BookPart` 表示可独立阅读的卷册 / 文件层。

这个模型必须延续到 P2 Reader：Reader 打开的目标应当是一个具体 `BookPart`，而不是默认 `Book` 永远只有一个 EPUB。

## 4. 2026-08-12 实际基线

通过 GitHub Actions 对官方 Classic CSV 全量同步得到：

| 指标 | 数量 |
| --- | ---: |
| 作品（Book） | 4,220 |
| 卷册（BookPart） | 6,057 |
| 多册作品 | 153 |
| 有封面的作品 | 2,452 |
| 横排 EPUB | 4,394 |
| 竖排 EPUB | 3,987 |

这些数字来自构建期规范化后的数据，不等同于原始 CSV 行数含义。

竖排 EPUB 的覆盖量很高，因此竖排不是边缘兼容项；P3 必须把原始直式 EPUB 作为一等回归样本。

## 5. 当前数据契约

```ts
interface Book {
  id: string
  title: string
  author: string
  category?: string
  series?: BookSeries
  cover?: BookResource
  description?: BookResource
  parts: BookPart[]
  publishedAt?: string
  modifiedAt?: string
  source: BookSourceRef
}

interface BookPart {
  id: string
  track?: string
  title?: string
  epub?: BookResource
  verticalEpub?: BookResource
}
```

`BookPart.id` 在 Classic 中优先使用 EPUB 文件 stem，其次使用直式 EPUB 文件 stem、卷册编号 / 标题，最后回退到作品书码。

## 6. 质量门槛

CI 当前执行：

```text
npm install
    ↓
npm run lint
    ↓
npm run typecheck
    ↓
npm run build
        ↓
    sync:classic
        ↓
    schema validation
        ↓
    Vite production build
```

P1 完成时，上述流程全部通过。

## 7. P1 不解决的问题

P1 明确不处理：

- EPUB Reader；
- 阅读位置；
- 字体 / 排版设置；
- 简繁显示转换；
- 离线书架；
- Service Worker；
- Modern catalog；
- WordPress 增量同步。

这些继续按 `docs/plan.md` 进入 P2 以后处理。

## 8. P2 的直接输入

P2 不需要重新设计 catalog。

下一步应该从一个具体 `BookPart` 开始：

```text
搜索作品
   ↓
选择 Book
   ↓
单册：直接选择唯一 BookPart
多册：选择具体 BookPart
   ↓
选择横排 / 原始竖排 EPUB
   ↓
ReaderEngine.open(...)
```

第一轮 Reader Spike 应同时选择：

1. 一个普通单册横排 EPUB；
2. 一个同时有横排 / 竖排 EPUB 的单册作品；
3. 一个类似 `0106` 的多册作品。

这样能尽早验证 Reader 与 catalog 的边界是否正确。
