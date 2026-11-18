# AI 起名平台（练习三）

按《实验操作文档：AI起名平台（豆包项目模式）》实现。前端提供需求、风格和模型选择；后端通过 OpenAI 兼容接口流式调用大模型；起名记录写入 Supabase。

## 项目结构

```text
ai-naming-platform/
├── api/
│   ├── name.js        # 流式起名接口，统一调用 modelConfigMap 中的模型
│   └── history.js     # 查询 Supabase 中的起名历史
├── sql/
│   └── name_history.sql
├── index.html         # 前端页面
├── package.json
├── .env.example       # 环境变量示例，可提交
└── .env.local         # 本地真实配置，已被 .gitignore 排除
```

## 本地运行

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量示例并填写真实密钥：

```bash
cp .env.example .env.local
```

需要填写：

- `SUPABASE_URL`、`SUPABASE_ANON_KEY`
- 至少一个模型的 `API_KEY` 和 `MODEL`
- 豆包模型需要填写方舟接入点模型 ID；DeepSeek、通义千问、Kimi 可使用默认模型名，如平台模型名有变动以官方文档为准

3. 在 Supabase SQL Editor 执行：

```bash
sql/name_history.sql
```

4. 启动本地预览：

```bash
node server.js
```

默认地址：`http://localhost:3000`。

## 多模型配置

`api/name.js` 中的 `modelConfigMap` 保存四个模型的 `baseURL`、`apiKey`、`model` 和显示名称。后端只有一套调用逻辑，前端下拉框提交模型 key 后，从配置表读取对应平台参数。

## 平替部署：Render Web Service

GitHub Pages 只能托管静态 HTML/CSS/JS，不能运行本项目的 Node 后端接口；因此练习三不能像练习一、练习二那样直接用 Pages 平替。

1. 确认 `.env`、`.env.local` 已在 `.gitignore` 中，密钥不能提交 GitHub。
2. 将代码推送到 Git 仓库。
3. 在 Render 新建 Web Service，连接该仓库。
4. 构建命令填 `npm install`，启动命令填 `node server.js`。
5. 在 Render 环境变量中填写和本地 `.env.local` 一致的变量。
6. 部署完成后访问 Render 分配的公网地址。

项目根目录的 `render.yaml` 已给出免费 Web Service 的参考配置；如果 Dashboard 手动创建服务，按上面的命令填写即可。

## 权限说明

课程演示 SQL 临时开放匿名读取和插入。正式上线时应启用用户登录，只允许本人读取和插入自己的历史记录；不要长期保留所有匿名可写策略。

## 常见问题

- 看不到历史记录：检查 `name_history` 表是否创建成功、Supabase URL/Key 是否正确、RLS 策略是否允许读取。
- 通义千问必须使用 `compatible-mode` 地址。
- 模型报错时先核对平台地址、Bearer 鉴权、模型 ID 和余额/权限。
