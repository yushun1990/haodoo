# Haodoo 推进计划

## 1. 推进原则

Haodoo 不按“功能越多越完整”的方式推进，而按一条最短用户链收敛：

```text
找到一本书
    ↓
打开书籍
    ↓
舒服地阅读
    ↓
下次回来继续读
```

第一阶段只围绕这条链工作。

长期约束：

- 零持续成本优先；
- 静态部署优先；
- 不引入账号系统；
- 不自建内容服务器；
- 中文横排 / 竖排与繁体显示必须在 Reader 架构中提前考虑；
- 每阶段都要有可运行结果，不积累大量“先设计以后再验证”的内容。

---

## 2. 当前已完成

### P0 — 可行性验证

- [x] 确认 Classic 官方 GitHub 仓库包含 catalog；
- [x] 确认 Classic GitHub 包含 EPUB 实体文件；
- [x] 确认 Classic GitHub 包含封面 / 书籍资料；
- [x] 浏览器验证 GitHub Raw catalog CORS 可用；
- [x] 浏览器验证 GitHub Raw EPUB CORS 可用；
- [x] 浏览器验证 `haodoo.org` EPUB CORS 可用；
- [x] 浏览器验证 `haodoo.org` cover CORS 可用；
- [x] 确认 `haodoo.org` WordPress API 可被非浏览器客户端读取；
- [x] 确认 WordPress API / Post HTML 浏览器端缺少 CORS；
- [x] 确认无需常驻 CORS Proxy；
- [x] 创建项目仓库；
- [x] 建立初始 README / design / plan。

阶段结论：**纯静态 PWA + 构建期 catalog 同步路线成立。**

---

## 3. P1 — 项目骨架与 Classic Catalog

目标：跑起来第一个真正可浏览的书目页面。

### 工作项

- [ ] 初始化 TypeScript + React + Vite；
- [ ] 配置基础 lint / format / typecheck；
- [ ] 配置 PWA manifest；
- [ ] 建立 `Book` / `ResourceLocation` / `BookSourceRef` 领域模型；
- [ ] 编写 `sync-classic`；
- [ ] 读取官方 Classic CSV；
- [ ] 归一化为项目自己的 `catalog.json`；
- [ ] 正确处理书名、作者、分类、系列、封面、横式 / 直式 EPUB；
- [ ] 做最基本的 catalog schema validation；
- [ ] 首页显示真实好读书籍；
- [ ] 支持书名 / 作者搜索；
- [ ] 支持分类浏览；
- [ ] 支持书籍详情页。

### 验收

用户打开项目后，可以：

1. 搜索一本 Classic 书籍；
2. 看到正确作者、封面和基本信息；
3. 点击后得到可用 EPUB 资源地址。

### 暂不做

- Modern；
- 离线；
- 书签；
- 完整 Reader 设置；
- 动画和复杂 UI。

---

## 4. P2 — Reader Baseline

目标：真正把一本好读 EPUB 在移动浏览器里读起来。

### 工作项

- [ ] 定义 `ReaderEngine`；
- [ ] 选定第一版 EPUB Web 引擎并封装适配器；
- [ ] 支持从远程 URL 打开 EPUB；
- [ ] 支持目录；
- [ ] 上一页 / 下一页；
- [ ] 跳转章节；
- [ ] 获取并保存稳定阅读位置；
- [ ] 恢复上次阅读位置；
- [ ] 基础字号、行距、页边距；
- [ ] 阅读时隐藏非必要导航 UI；
- [ ] 手机触控交互可用；
- [ ] 选择一批真实好读 EPUB 做回归样本。

### 验收

在手机浏览器中完成：

```text
搜索 → 打开 EPUB → 阅读几页 → 关闭 → 再打开 → 回到原位置
```

这条链必须稳定。

---

## 5. P3 — 中文排版专项

目标：让“中文阅读是一等公民”从文档约束变成真实能力。

这个阶段不能拖到项目末尾，因为它会反过来验证 ReaderEngine 抽象是否成立。

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
- [ ] 对比好读原始直式 EPUB。

如果当前 EPUB 引擎无法可靠完成竖排，这一阶段就要明确记录能力边界，而不是继续堆 UI。

### P3.3 简繁显示

- [ ] 保留 `source` 原文模式；
- [ ] 设计显示层繁体转换；
- [ ] 确认转换不会改变永久阅读位置；
- [ ] 转换模块 lazy-load；
- [ ] 支持随时切回原文；
- [ ] 后续复用同一机制支持简体显示转换。

### P3.4 字体

- [ ] 定义 FontChoice；
- [ ] 系统宋体类；
- [ ] 系统黑体类；
- [ ] 楷体类可用性调查；
- [ ] 西文字体选项；
- [ ] 字体 fallback；
- [ ] 不引入未经授权的字体文件；
- [ ] 评估用户自定义字体的后续方案。

### P3.5 主题

- [ ] Light；
- [ ] Dark；
- [ ] Warm；
- [ ] 低对比 / 护眼风格；
- [ ] 自定义文字色；
- [ ] 自定义背景色。

### 验收

至少选择：

- 1 本繁体中文书；
- 1 本简体中文书；
- 1 本好读原始直式 EPUB；
- 1 本中英混排 EPUB；
- 1 本英文 EPUB；

完成横排 / 竖排 / 字体 / 主题回归。

---

## 6. P4 — 本地书架与离线

目标：PWA 从“网页阅读器”变成真正可长期使用的个人阅读客户端。

### 工作项

- [ ] IndexedDB storage abstraction；
- [ ] 最近阅读；
- [ ] 收藏 / 本地书架；
- [ ] 阅读位置；
- [ ] 书签；
- [ ] 全局 ReaderPreferences；
- [ ] per-book preferences override；
- [ ] EPUB 下载到本地；
- [ ] 离线打开已下载书籍；
- [ ] Service Worker app shell；
- [ ] catalog 离线缓存；
- [ ] PWA 安装体验；
- [ ] 浏览器存储空间 / quota 异常处理；
- [ ] 导出原始 EPUB。

### 验收

设备断网后：

- PWA 能启动；
- 能看到缓存书目；
- 已下载书籍能正常阅读；
- 阅读进度能继续保存。

---

## 7. P5 — Modern Catalog

目标：接入持续更新的 `haodoo.org`，同时保持运行时无后端。

### 工作项

- [ ] 调研 WordPress posts 分页结构；
- [ ] 找出稳定的新书筛选条件；
- [ ] 从 Post 中提取稳定好读书码；
- [ ] 解析作者 / 标题；
- [ ] 解析 cover；
- [ ] 解析横式 EPUB；
- [ ] 解析直式 EPUB（若有）；
- [ ] 解析发布时间 / 修改时间；
- [ ] 编写 `sync-modern`；
- [ ] 全量同步；
- [ ] 增量同步；
- [ ] Classic / Modern 按稳定书码合并；
- [ ] 冲突报告；
- [ ] GitHub Actions 定时执行；
- [ ] 无变化时不制造无意义 commit。

### 为什么放在 P5

Modern 数据同步很重要，但它不应该阻塞 Reader 核心体验。

Classic 已经足够提供大量真实 EPUB 样本，可以先把阅读器做对；等 Reader 可用，再接入持续更新源，能够避免“书目同步做了一堆，但还不能舒服读书”的失衡。

### 验收

好读发布一篇新书后，无需修改 PWA 代码：

```text
haodoo.org 发布
      ↓
GitHub Action 下一次同步
      ↓
catalog 更新
      ↓
静态站发布
      ↓
用户看到新书并可直接阅读
```

---

## 8. P6 — 质量与兼容性

目标：从“我能用”提升到“别人也能放心用”。

### 工作项

- [ ] 建立 EPUB 回归样本集；
- [ ] 异常 EPUB 错误页；
- [ ] EPUB 加载失败后允许下载原文件；
- [ ] iOS Safari；
- [ ] Android Chrome / Chromium；
- [ ] Desktop Chrome / Firefox；
- [ ] PWA 更新流程；
- [ ] catalog schema version；
- [ ] source URL 失效 fallback；
- [ ] 基本无障碍支持；
- [ ] 性能基线；
- [ ] 首屏与 Reader bundle 拆分；
- [ ] 繁简转换模块延迟加载；
- [ ] 大 EPUB 内存占用测试。

---

## 9. P7 — 长期增强候选

以下需求记录下来，但当前不承诺实现时间：

### 阅读能力

- 阅读统计（仅本地）；
- 标注 / 笔记；
- 全文检索；
- 自定义 CSS；
- 用户字体；
- TTS；
- 更细致的 CJK 标点处理。

### 数据可移植性

- 导出书架；
- 导出阅读进度；
- 导入备份；
- 本地 metadata snapshot。

### 长期保存

- Classic archive mirror；
- 与好读维护者沟通 Modern archive；
- 多 source fallback；
- catalog 历史快照。

任何“归档二代完整 EPUB”的方案都应优先与好读维护者沟通，不默认把客户端变成公开镜像站。

---

## 10. 明确不进入当前路线的功能

除非项目目标发生变化，否则不要因为“做起来不难”就顺手加入：

- 登录；
- OAuth；
- 云数据库；
- 云阅读进度；
- 推荐流；
- 评论；
- 关注作者；
- 消息通知；
- 内容上传；
- 管理后台；
- 付费；
- 广告；
- 自建 EPUB CDN。

这些功能都会把一个客户端逐渐拖成内容平台。

---

## 11. 推荐的实际推进顺序

近期只做：

```text
P1 Classic Catalog
        ↓
P2 Reader Baseline
        ↓
P3 中文排版专项
        ↓
P4 本地 / 离线
        ↓
P5 Modern 自动同步
```

其中最关键的两个技术检查点是：

### Checkpoint A

**真实好读 EPUB 能否在 ReaderEngine 中稳定阅读并恢复位置？**

如果不能，先修 Reader，不继续扩展产品功能。

### Checkpoint B

**竖排能否在目标移动浏览器上达到可长期阅读的质量？**

如果不能，要在 P3 就重新评估 EPUB 引擎或竖排实现策略，不允许拖到发布前。

---

## 12. 第一轮 Codex 任务建议

第一次真正进入代码实现时，任务应控制在一个很小的闭环：

> 初始化 TypeScript + React + Vite PWA 项目，建立最小 `Book` 领域模型；实现 Classic catalog 构建脚本，把 `haodoo-classic` CSV 转换为本地静态 JSON；首页只展示真实书籍并支持书名 / 作者搜索。不要实现 Reader、ModernSource、账号、云服务或额外产品功能。

完成后先复审数据模型和生成结果，再进入 Reader。
