# 博士申请机会追踪网站

这是一个无需数据库即可运行的静态申请追踪器，同时附带 GitHub Actions 每日自动检索脚本。适合追踪欧洲实验 AMO / Rydberg / neutral-atom quantum computing / quantum hardware PhD。

## 已实现功能

- 个人申请背景：申请类型、研究方向、关键词、教育背景、科研经历、目标国家/组、参考网站。
- 机会卡片：项目、机构、国家/城市、导师/实验室、方向、deadline、首次检索、匹配度。
- 详情页：项目说明、要求、申请状态、原始来源及来源核验状态。
- 申请进度：感兴趣 → 准备联系导师 → 已联系导师 → 准备申请材料 → 已提交 → 等待结果 → Offer / Rejected / 放弃申请。
- 浏览器本地保存：你修改的申请状态不会因自动更新数据文件而丢失。
- JSON 导入 / 导出备份。
- 每日自动更新脚本：搜索、验链、提取、去重、开放状态更新、检索日志。
- 真实性规则：自动新增条目必须存在可访问的来源 URL；无法从来源确认的字段统一写为 `来源未说明`。

## 最快打开方式

直接双击 `index.html` 即可。数据通过普通 `<script>` 文件加载，因此不要求本地 Web Server。

如果想在本机用服务器访问：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000`。

## 部署为真正的在线网站 + 每日自动更新

1. 新建一个 GitHub repository，把本文件夹中的所有内容上传到仓库根目录。
2. GitHub → **Settings → Pages** → Source 选择 `Deploy from a branch` → `main` / root。
3. GitHub → **Actions**，确认 `Daily PhD opportunity update` 工作流启用。
4. 工作流默认每天 `00:25 UTC` 运行（北京时间 08:25，日本时间 09:25），也可在 Actions 页面手动运行。
5. 可选：添加 `SERPER_API_KEY` repository secret。存在该 key 时，脚本优先使用 Serper/Google 搜索；未配置时自动回退到 Bing RSS 搜索。

> 注意：搜索引擎可能偶尔限制自动请求。即使发现功能暂时失败，脚本仍会继续验证已有的官方来源链接并写检索日志。

## 匹配度

匹配度是用于**排序**的启发式分数，不是录取概率。规则偏向：

- Rydberg / neutral atom / optical tweezer / quantum computing 核心词；
- experimental AMO / laser / optics / atomic physics / hardware；
- 个人配置中的关键词、目标国家和目标组。

在网页“个人申请背景”中修改信息后，可以立即重新计算全部机会的匹配度。

## 数据真实性与不确定性

自动检索遵循以下规则：

1. 必须保存原始网页 URL。
2. URL 可访问后才会成为自动新增条目。
3. 没有从来源中提取到 deadline、导师、机构、城市等信息时，不猜测，填 `来源未说明`。
4. 明确出现 “applications closed / position filled”等内容才标记已关闭。
5. 来源链接连续两次返回 404/410 才标为链接失效，以减少网络波动造成的误判。
6. 自动摘要是关键词附近的原网页句子清理结果；正式申请前始终应打开原始来源核对。

## 个人隐私

网页中的个人申请背景默认保存在浏览器 `localStorage`。`config/search_profile.json` 只需要放自动检索所需的通用研究背景和关键词，不必写姓名、邮箱、电话等身份信息。

如果仓库是公开的，请不要把私人材料、推荐人联系方式或成绩单放进仓库。

## 修改自动检索范围

编辑：

- `config/search_profile.json`：研究方向与检索关键词；
- `config/sources.json`：重点监控网站与官方页面；
- `scripts/update_opportunities.py`：抽取、去重和评分逻辑。

## 当前已预置状态

初始化数据已经包含当前已处理的主要机会，例如：TU/e（已提交）、ETH Viebahn（已提交）、Wenchao Xu / Simon Fölling / Aidelsburger / Meinert / Zeiher / Browaeys（已联系），以及 Tübingen Christian Groß、Strathclyde Jonathan Pritchard、Durham Simon Cornish、Bonn Hofferberth、LENS 等待处理机会。
