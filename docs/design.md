# Haodoo 设计文档

## 1. 目标

Haodoo 是一个**非官方、静态部署、本地优先的好读 PWA 客户端**。

它只解决两件事情：

1. 更方便地发现、检索和管理好读书籍；
2. 提供真正适合手机和平板的 EPUB 阅读体验。

项目不建设新的内容平台，不要求账号，不依赖长期在线的自建后端。

---

## 2. 设计约束

### 2.1 硬约束

- 持续运行成本应尽量为 0；
- PWA 必须能够部署到免费静态托管服务；
- 不依赖自建数据库、VPS 或常驻 API 服务；
- 不重新托管 / 分发好读书籍作为项目运行前提；
- 浏览器端不得依赖绕过 CORS 的非标准手段；
- 阅读进度与偏好默认保存在用户本地；
- 源 EPUB 保持原样，任何繁简转换和排版处理都只作用于显示层。

### 2.2 产品约束

- 中文排版是一等能力；
- 中文必须支持横排与竖排；
- 中文应支持原文、繁体显示，并为简繁显示转换保留扩展能力；
- 英文只提供横排；
- 字体、字号、行距、字距、页边距、文字颜色、背景颜色和阅读主题是 Reader 的核心能力，不是后期装饰；
- 阅读器应该隐藏网站感，尽可能接近专用阅读设备的阅读体验。

---

## 3. 已验证的外部能力

截至项目初始化阶段，已完成以下浏览器实测：

| 来源 | 资源 | 浏览器跨域读取 |
|---|---|---|
| `haodoo-classic` / GitHub Raw | catalog | ✅ |
| `haodoo-classic` / GitHub Raw | EPUB | ✅ |
| `haodoo.org` | EPUB | ✅ |
| `haodoo.org` | cover | ✅ |
| `haodoo.org` | WordPress REST API | ❌ CORS |
| `haodoo.org` | Post HTML | ❌ CORS |

WordPress API 本身可以被 `curl` 等非浏览器客户端正常读取，因此适合放在构建 / 同步阶段使用。

这个边界决定了项目不需要 CORS Proxy。

---

## 4. 总体架构

```text
                           ┌──────────────────────┐
                           │   scheduled build    │
                           │   / GitHub Actions   │
                           └──────────┬───────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
              haodoo-classic                    haodoo.org
             catalog / files                  WordPress API
                       │                             │
                       └──────────────┬──────────────┘
                                      ▼
                              normalize + merge
                                      │
                                      ▼
                                catalog.json
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │       Haodoo PWA        │
                        └────────────┬────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
                 Catalog          Reader          Local Library
                                                     │
                                                     ▼
                                            IndexedDB / OPFS
```

核心思想：**动态源站在构建期归一化，运行时尽可能静态化。**

---

## 5. 模块边界

建议代码按能力而不是页面组织：

```text
src/
├── app/                 # 应用初始化、路由、PWA 生命周期
├── catalog/             # 统一书目模型、搜索、排序、过滤
├── sources/             # Classic / Modern 来源适配
├── reader/              # ReaderEngine 与阅读 UI
├── library/             # 本地书架、离线 EPUB、书签、进度
├── preferences/         # 阅读偏好与主题
├── storage/             # IndexedDB / OPFS 封装
└── shared/              # 通用类型与工具

scripts/
├── sync-classic.*
├── sync-modern.*
└── build-catalog.*

public/
└── data/
    └── catalog.json
```

具体目录可随实现调整，但以下三个边界应保持稳定：

1. **数据源不进入 Reader。**
2. **Reader 不直接理解 Haodoo URL 规则。**
3. **本地存储不直接绑定具体 UI 框架。**

---

## 6. 数据源设计

### 6.1 统一书籍模型

客户端只认识统一模型，不认识“一代页面”和“二代页面”。

示意：

```ts
interface Book {
  id: string;
  title: string;
  author?: string;
  category?: string;
  series?: string;
  seriesOrder?: number;

  cover?: ResourceLocation;
  epub: ResourceLocation[];

  publishedAt?: string;
  modifiedAt?: string;
  description?: string;

  sources: BookSourceRef[];
}

interface ResourceLocation {
  url: string;
  kind: "source" | "archive";
  format?: "epub" | "vertical-epub";
  priority: number;
}
```

`Book.id` 优先使用好读自身稳定书码；只有无法取得稳定书码时才退回 source-specific identity。

### 6.2 ClassicSource

Classic 的主输入是官方 `haodoo/haodoo-classic`：

- catalog CSV 用于 metadata；
- cover / description / EPUB 均为静态资源；
- 不依赖 `haodoo.net` SSR 页面；
- 构建时转换为项目统一 catalog 格式。

Classic 已基本封存，因此同步频率可以很低，但不应硬编码为“永不变化”。

### 6.3 ModernSource

Modern 的主输入是 `haodoo.org` WordPress 数据：

- WordPress API 在构建任务中读取；
- 从 Post / Product / rendered content 中提取书码、标题、作者、封面、EPUB、发布时间等；
- 浏览器运行时直接读取允许 CORS 的 EPUB 和 cover；
- PWA 不直接调用 WordPress API。

### 6.4 Catalog 合并

Classic 与 Modern 可能包含同一本书。

合并原则：

1. 有稳定好读书码时按书码合并；
2. 保留所有有效资源位置，不因合并丢掉备用来源；
3. metadata 冲突时记录来源和更新时间，避免静默覆盖；
4. 构建脚本输出冲突报告，供人工检查；
5. 不按“某日期以前/以后”粗暴区分一代二代。

---

## 7. Catalog 与搜索

第一版不需要搜索服务端。

数千本级别书目可以直接下载静态索引，在浏览器本地完成：

- 书名搜索；
- 作者搜索；
- 分类过滤；
- 系列浏览；
- 最近更新；
- 拼音 / 模糊检索作为后续增强。

为了避免每次启动解析大型原始 CSV，构建阶段应生成精简 JSON。

后续如 catalog 继续增长，可以拆成：

```text
catalog-meta.json
catalog-index.json
catalog-details/*.json
```

但 MVP 不提前优化。

---

## 8. Reader Engine

### 8.1 抽象

EPUB 渲染引擎必须藏在项目自己的接口后面，避免整个应用绑定某一个库。

```ts
interface ReaderEngine {
  open(source: Blob | ArrayBuffer | string): Promise<void>;
  destroy(): void;

  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(target: ReadingTarget): Promise<void>;

  getToc(): Promise<TocItem[]>;
  getLocation(): ReadingLocation | undefined;

  applyLayout(layout: ReaderLayout): Promise<void>;
  applyTheme(theme: ReaderTheme): Promise<void>;
}
```

初始实现可以采用成熟的 Web EPUB 引擎，但应用层不能直接散落第三方引擎 API。

### 8.2 阅读位置

阅读进度应基于 EPUB 的稳定位置表示（例如引擎提供的 CFI / location），而不是页码。

原因：

- 改字号会改变页数；
- 横排切竖排会改变分页；
- 更换字体会改变分页；
- 手机旋转会改变分页。

因此“42%”是派生显示，稳定位置才是持久化数据。

---

## 9. 中文横排 / 竖排设计

### 9.1 横排

中文横排使用正常水平排版：

```css
writing-mode: horizontal-tb;
text-orientation: mixed;
```

### 9.2 竖排

中文竖排目标为传统的从右向左列进：

```css
writing-mode: vertical-rl;
text-orientation: mixed;
```

但竖排不能只靠加一条 CSS 后宣布完成。必须专项验证：

- EPUB 原有 CSS 与 Reader 注入 CSS 的优先级；
- 标点挤压与悬挂；
- 数字、英文、缩写方向；
- 图片尺寸与分页；
- `ruby` 注音；
- 章节标题；
- 纵向分页和手势方向；
- CJK 字体 fallback；
- iOS Safari 与 Android Chromium 的差异。

Reader 的布局模型至少应包含：

```ts
type WritingMode = "horizontal" | "vertical-rl";
```

英文内容强制 / 默认使用 `horizontal`，不提供英文竖排作为产品能力。

### 9.3 EPUB 自带竖排版本

如果好读本身提供独立的直式 EPUB，应优先保留它作为独立资源版本，而不是假设“横式 EPUB + CSS”总能完全等价。

用户可以选择：

- 原始横式 EPUB；
- 原始直式 EPUB（若存在）；
- Reader 显示层竖排。

具体 UI 在实现阶段再收敛。

---

## 10. 简繁显示

原则：**永远不修改源 EPUB。**

建议模型：

```ts
type ScriptMode =
  | "source"
  | "traditional"
  | "simplified";
```

MVP 可以先实现 `source`，随后增加 `traditional`；`simplified` 与其共享转换架构。

转换发生在渲染后的文本显示层，并满足：

- 不写回 EPUB；
- 不改变下载文件；
- 不改变永久书签位置；
- 可随时切回原文；
- 转换引擎延迟加载，避免无需求用户承担首屏体积。

需要注意：简繁转换并不总是字对字唯一映射，因此 UI 应称为“显示转换”，不能声称替代原版繁体文本。

---

## 11. 字体系统

### 11.1 原则

字体是阅读能力的一部分，但项目不应为了字体承担巨大的带宽与版权风险。

优先级：

1. 系统字体栈；
2. 已知本地字体 `local()`；
3. 许可证允许、体积可接受的开源字体；
4. 后续考虑用户自定义字体能力。

### 11.2 字体偏好

逻辑上不要把 UI 直接绑定具体字体文件：

```ts
interface FontChoice {
  id: string;
  label: string;
  family: string;
  language: "cjk" | "latin" | "mixed";
}
```

中文可提供如“宋体类 / 黑体类 / 楷体类”等逻辑选择，再映射到不同平台可用字体。

任何随项目分发的字体必须确认许可证允许 Web 分发。

---

## 12. 颜色与主题

所有阅读视觉参数集中到 ReaderTheme：

```ts
interface ReaderTheme {
  foreground: string;
  background: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  pageMargin: number;
}
```

预设主题只是配置：

- Light；
- Dark；
- Warm；
- Low Contrast / 护眼风格。

“护眼”仅表示视觉主题名称，不做医学效果承诺。

用户还可后续自定义文字色与背景色。

---

## 13. 本地优先存储

本地数据分为三类：

### Settings

- 全局阅读偏好；
- 主题；
- 字体；
- 书写方向；
- 简繁显示模式。

### Reading State

- 最近阅读；
- 阅读位置；
- 书签；
- 每本书局部覆盖设置。

### Offline Book

- EPUB 原始 Blob；
- metadata snapshot；
- 下载时间；
- source URL / version metadata。

建议：

- IndexedDB 保存结构化 metadata、设置和阅读状态；
- EPUB Blob 初期可直接存在 IndexedDB；
- 如实际浏览器支持与实现收益明确，再使用 OPFS 存大文件；
- 不把离线 EPUB 仅依赖普通 HTTP cache。

用户应最终具备导出已下载 EPUB 的能力，避免内容被锁死在浏览器私有存储中。

---

## 14. PWA 与离线策略

Service Worker 负责：

- app shell；
- 静态 catalog；
- 图标和必要资源；
- 应用版本更新。

Service Worker 不承担：

- 绕过 CORS；
- 充当远程内容代理；
- 永久保存用户 EPUB 的唯一机制。

离线能力目标：

```text
无网络
  ├── 已安装应用可启动
  ├── 已缓存 catalog 可搜索
  ├── 已下载书籍可阅读
  └── 阅读进度继续保存在本地
```

---

## 15. 数据更新

### Classic

低频同步即可。

### Modern

GitHub Actions 定期执行：

```text
fetch posts modified after last sync
        ↓
extract / normalize
        ↓
merge catalog
        ↓
validate URLs / identities
        ↓
commit generated catalog when changed
```

构建任务应支持：

- 全量重建；
- 增量同步；
- 幂等执行；
- 冲突报告；
- 不因单一本异常书籍破坏全部 catalog。

同步频率不需要高。书籍发布不是实时业务，一天一次甚至更低都足够。

---

## 16. 源站失效与长期保存

Reader 不假设任何远程 Source 永远存在。

因此：

- catalog 保存源 URL 与可选备用 location；
- 用户下载后的 EPUB 可独立离线阅读；
- 项目自己的 metadata catalog 可以形成历史快照；
- 不把项目运行绑定到 `haodoo.net` SSR；
- 若未来官方提供新的 GitHub archive，只需新增 / 调整 Source Adapter。

项目本身暂不自动镜像所有二代 EPUB。长期归档应尽量与好读维护者协作，而不是无声地把客户端演变成另一个内容分发站。

---

## 17. 安全与隐私

默认不需要账号，因此天然减少大量隐私面：

- 不上传阅读历史；
- 不上传书签；
- 不上传阅读偏好；
- 不做用户画像；
- 不依赖第三方分析服务作为核心功能。

如未来引入可选同步，需要单独设计，不得破坏本地优先默认值。

---

## 18. 技术栈原则

初始实现建议保持普通、成熟：

- TypeScript；
- React；
- Vite；
- 标准 Web App Manifest + Service Worker；
- IndexedDB；
- EPUB 引擎通过 `ReaderEngine` 适配。

这些是实现选择，不是项目身份。若未来替换 UI 框架或 EPUB 引擎，不应影响 catalog、storage 和领域模型。

---

## 19. 非目标

当前不设计：

- 用户体系；
- 云端书架；
- 跨设备同步；
- 评论 / 社区；
- 推荐系统；
- 自建搜索服务器；
- 自建 EPUB CDN；
- DRM；
- 原生 App；
- 全格式电子书阅读器。

先把 EPUB + 好读 + 移动中文阅读做好。

---

## 20. 关键风险

### R1. Modern metadata 结构变化

WordPress 文章格式未来可能改变。

**应对：** 构建期 adapter + validation，不让 HTML 解析规则进入客户端。

### R2. EPUB 兼容性

不同年代和制作人的 EPUB CSS 质量不一致。

**应对：** ReaderEngine 隔离；建立真实好读样本集做回归。

### R3. 竖排分页

这是 Reader 中最容易被低估的技术风险之一。

**应对：** 在 Reader MVP 后立刻做专项 Spike，不拖到项目末期。

### R4. 字体体积 / 授权

完整 CJK WebFont 非常大，且字体许可证各异。

**应对：** 系统字体优先，开源字体按需引入。

### R5. 浏览器存储被清理

PWA 本地存储并非永久介质。

**应对：** 支持 EPUB 导出；未来考虑书架备份文件，不承诺浏览器存储永久可靠。

---

## 21. 判断项目是否保持健康

每增加一个功能都问三个问题：

1. 它是否直接改善“找书或读书”？
2. 它是否迫使我们引入长期服务器成本？
3. 它是否可以留在用户设备上完成？

如果第一个答案是否，而后两个答案是，就应该非常谨慎。
