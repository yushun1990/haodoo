# Haodoo

> 一个非官方、开源、面向移动阅读体验的好读（Haodoo）PWA 客户端。

Haodoo 的目标很简单：**更方便地找书，更舒服地读书。**

本项目不重新运营电子书站点，也不试图替代好读。它只作为一个轻量、开放、本地优先的阅读客户端，使用好读公开提供的书目、封面和 EPUB 资源，为手机、平板和桌面浏览器提供更现代的检索与阅读体验。

> [!IMPORTANT]
> 本项目为非官方项目，与好读官方无隶属关系。书籍内容及相关权利归原作者、出版方及好读原始贡献者所有。本项目不主张对书籍内容拥有任何权利。

## 为什么做这个项目

好读积累了非常丰富的中文电子书资源，但现有站点的移动阅读体验并不是为今天的手机和平板设计的。

Haodoo 希望只解决客户端这一层的问题：

- 更快的书名、作者、分类和系列检索；
- 更适合移动设备的书籍详情与书架；
- 基于 EPUB 的现代阅读体验；
- 阅读进度、书签与偏好保存在本地；
- 可安装为 PWA，并支持离线阅读；
- 不要求用户注册账号；
- 不依赖自建服务器、数据库或付费基础设施。

## 阅读体验原则

中文阅读不是英文阅读器的附属模式，而是本项目的一等公民。

计划支持：

- 中文横排；
- 中文竖排（`vertical-rl`）；
- 简体与繁体显示；
- 多种中文与西文字体；
- 字号、行高、字距、页边距调整；
- 文字颜色与背景颜色；
- 明亮、暗色、暖色 / 护眼等阅读主题；
- 英文横排阅读；
- 每本书可保存独立阅读进度，阅读偏好可全局复用或按书覆盖。

繁简转换仅作为**显示层能力**：原始 EPUB 永远保持不变，避免破坏原文与用户下载的文件。

## 数据来源

当前计划把好读内容分为两个来源适配，但在客户端统一为一种 `Book` 模型。

### Classic

旧版好读的完整资料已公开在 `haodoo/haodoo-classic` GitHub 仓库中，包括书目、封面、简介以及 EPUB 等文件。

客户端不需要解析旧版 SSR 页面，可直接使用公开静态资料生成索引。

### Modern

新版 `haodoo.org` 继续发布新书：

- EPUB 文件允许浏览器跨域读取；
- 封面允许浏览器跨域读取；
- WordPress REST API 与文章 HTML 可访问，但浏览器端受 CORS 限制。

因此新版书目计划在**构建 / 同步阶段**由 GitHub Actions 等非浏览器任务读取，再生成项目自己的静态 `catalog.json`。运行中的 PWA 不需要代理服务器。

## 初步架构

```text
                        build / sync time

haodoo-classic ───────────────┐
                              ├──> normalized catalog
haodoo.org WordPress API ─────┘           │
                                          ▼
                                     catalog.json
                                          │
                                          │ static
                                          ▼
                                  ┌────────────────┐
                                  │   Haodoo PWA   │
                                  └───────┬────────┘
                                          │
                         ┌────────────────┼───────────────┐
                         ▼                ▼               ▼
                      catalog          cover            EPUB
                      (static)      (source URL)      (source URL)
                                                           │
                                                           ▼
                                                      Reader Engine
                                                           │
                                                           ▼
                                                  IndexedDB / OPFS
```

详细设计见 [`docs/design.md`](docs/design.md)。当前 Reader / WebView 兼容架构与下一阶段重构路线见 [`docs/reader-compatibility-roadmap.md`](docs/reader-compatibility-roadmap.md)。

## 项目原则

1. **客户端优先**：不建设新的电子书内容平台。
2. **零持续成本优先**：优先采用静态托管、GitHub Actions 和浏览器本地存储。
3. **本地优先**：阅读状态、偏好、离线书籍尽量留在用户设备上。
4. **源内容不修改**：显示转换与排版调整不改变原 EPUB。
5. **数据源可替换**：Reader 不直接依赖具体好读站点 URL 结构。
6. **中文排版是一等能力**：横排、竖排、繁体和字体不能作为最后阶段的 UI 装饰补丁。
7. **对源站友好**：避免每个客户端重复抓取 WordPress 书目；增量索引由构建任务集中完成。
8. **不锁定托管平台**：PWA 应可以部署在 GitHub Pages、Cloudflare Pages 或其他免费静态托管服务上。

## 当前非目标

第一阶段不会实现：

- 用户账号；
- 云同步；
- 社交 / 评论；
- 推荐算法；
- 自建电子书镜像服务；
- 付费基础设施；
- DRM 处理；
- 对所有 EPUB 的 100% 兼容承诺。

## 文档

- [设计文档](docs/design.md)
- [推进计划](docs/plan.md)
- [Reader / WebView 兼容架构与后续路线](docs/reader-compatibility-roadmap.md)

## 状态

项目已经进入 **Reader 兼容性收口与架构重构准备阶段**。

目前已验证：

- Classic catalog 已可构建并在静态 PWA 中检索、浏览；
- Chrome / Chromium 与 Firefox 可打开并阅读真实好读 EPUB；
- Android 百度浏览器 WebView 与 Via 已可打开 EPUB 正文；
- 已确认部分 Android WebView 可以创建 `blob:` URL，但不能 `fetch(blob:)`，sandbox iframe 也不能可靠导航到 `blob:`；
- 当前兼容方案会保留 Foliate 改写后的章节 HTML，并在 blob iframe 不可用时改走 `srcdoc` / `document.write`；
- `#diagnostics` 可检测 JS、blob、iframe、CSS columns、Range geometry、ResizeObserver 等 Reader 关键能力；
- PWA manifest、Service Worker、跨浏览器安装入口与安装图标已经可用；
- Chromium 与 Firefox Reader smoke tests 已纳入 CI。

下一步不是继续堆浏览器特例，而是先完成真实设备回归，再把 `BrowserCapabilities`、`SectionDocumentLoader`、`BlobTextRegistry` 和 Foliate compatibility adapter 正式拆分。详细顺序见 [`docs/reader-compatibility-roadmap.md`](docs/reader-compatibility-roadmap.md)。
