# 项目结构

本文档说明 Riva 仓库的目标组织方式。

## 顶层结构

```text
riva/
├── apps/
│   ├── client/      # React Web 客户端
│   └── server/      # FastAPI 后端服务
├── packages/        # 共享 Workspace 包
│   └── contracts/   # 前后端使用的 API contract 包
├── docs/            # 产品、架构和开发文档
├── scripts/         # 开发和自动化脚本
└── infra/           # 部署和基础设施配置
```

## 前端架构

`apps/client/` 是 Riva 的前端应用，负责用户交互、路由和界面展示。

前端目录结构：

```text
apps/client/
├── public/          # 由 Vite 直接服务的静态资源
├── src/
│   ├── app/
│   ├── i18n/
│   ├── models/
│   ├── mocks/
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── routes/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── assets/
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

职责分层：

- `app/`：应用初始化、全局 Provider 和全局配置。
- `i18n/`：多语言资源、本地化配置、语言切换逻辑和日期、数字等国际化格式处理。
- `models/`：业务相关数据模型和应用级类型定义。
- `mocks/`：页面状态 mock 以及早期前端开发使用的 mock 数据。
- `pages/`：对应应用路由的页面。
- `components/`：可复用 UI 区块和组合组件。
- `hooks/`：组合客户端状态、服务调用和界面交互流程的 React Hooks。
- `services/`：API 客户端、Server-Sent Events 流式连接、WebSocket 连接和上传客户端。
- `routes/`：路由定义。
- `stores/`：UI、会话和缓存状态。
- `styles/`：全局样式、主题和设计变量。
- `types/`：跨模块共享的全局类型、环境类型和第三方补充声明；领域内类型声明应就近放在对应模块中。
- `assets/`：静态资源。

## 后端架构

`apps/server/` 是 Riva 的 FastAPI 后端服务。

后端目录结构：

```text
apps/server/
├── pyproject.toml
├── uv.lock
├── src/
│   └── riva/
│       ├── api/
│       ├── cli/
│       ├── core/
│       ├── db/
│       ├── models/
│       ├── schemas/
│       ├── services/
│       ├── agents/
│       └── integrations/
└── tests/
```

服务端的 HTTP 入口和领域 workflow 按产品领域归组，跨领域的 API 组合逻辑保留在 `api/`
根目录：

```text
src/riva/
├── api/
│   ├── auth.py        # 认证和账户接口
│   ├── dashboard.py   # Dashboard 接口
│   ├── health.py      # 健康检查接口
│   ├── interview.py   # 面试接口
│   ├── jobs.py        # 岗位和 JD 接口
│   ├── practice.py    # 练习会话和题目接口
│   ├── profile.py     # Profile 接口
│   ├── resumes.py     # 简历接口
│   ├── training.py    # 训练、能力和记录接口
│   ├── dependencies.py
│   ├── errors.py
│   ├── cookies.py
│   └── routes.py      # 只负责 router 组合
├── services/
│   ├── auth.py
│   ├── profile/
│   ├── resumes/
│   ├── jobs/
│   ├── practice/
│   ├── interview/
│   ├── training/
│   └── dashboard/
└── integrations/
    ├── llm/
    └── storage/
```

职责分层：

- `api/`：每个业务领域一个 FastAPI 路由文件；跨领域的依赖注入、错误映射、Cookie 和 router
  组合逻辑保留在 `api/` 根目录文件中。
- `cli/`：Typer 命令定义和命令侧编排逻辑。
- `core/`：配置、日志、安全、language helper 和应用生命周期。
- `db/`：数据库连接、事务和基于 Model 的 schema 管理能力。
- `models/`：数据库模型，例如用户、简历、岗位、题卡、面试会话、复盘和业务结果。
- `schemas/`：只保留 HTTP Request、Response 和 API contract。
- `services/`：业务服务按领域归组；`profile/`、`resumes/`、`jobs/`、`practice/`、
  `interview/`、`training/`、`dashboard/` 保留领域目录，职责较小的认证服务集中在
  `auth.py`。Service 的领域输入和结果投影使用各领域旁边的普通 Pydantic model，
  不直接使用 HTTP schema。
- `agents/`：按领域归组，每个领域都使用局部子包；Agent 实现及其输入输出 contract、Prompt
  和校验逻辑保持就近。
- `integrations/`：按 `llm/` 和 `storage/` 归组的外部适配；业务层依赖抽象而不是传输实现。

预期依赖方向是 `api → services → agents/integrations/db`。Service 不导入 FastAPI、
Starlette、API error、Cookie 或 `riva.schemas`；API 负责把 HTTP contract 转换为领域输入，
把领域异常映射为 HTTP 状态，并把领域结果序列化为 response contract。

## Interaction Language Contract

RIVA 的公共语言类型是 `InteractionLanguage`，当前值只有 `zh-CN` 和 `en`，默认值为
`zh-CN`。前端的 `SupportedLanguage` 与它一一对应；所有 language normalization 必须复用
公共 helper，不得在 Resume、Roles、Practice 或 Interview 模块中各自实现一套规则。

语言来源必须区分为三层：

- **UI language**：当前界面语言，可以随时切换。真实 API 请求默认携带
  `Accept-Language`，并在发送请求时从 i18next 的当前 resolved language 读取，避免首屏竞态。
- **Artifact language**：一次 Resume Parsing、JD Parsing、Matching Analysis 或未来独立
  QuestionCard 生成任务的语言。调用 Agent 时从当前 UI language 捕获，并随业务结果保存；
  Service 将它直接传给 Agent。未来 QuestionCard
  model 也必须显式暴露 `language: InteractionLanguage`，不能依赖文本猜测。
- **Session language**：PracticeSession 或 InterviewSession 创建时冻结的语言。Session
  子操作（题目、追问、评分、复盘和推荐）必须继承 `Session.language`，不能重新读取浏览器语言。
  UI chrome 可以切换，但活动 Session 的 AI 内容不迁移语言。

任何新的用户可见 AI workflow 都必须在设计和代码中声明语言来源：独立 artifact 使用
Agent 调用的 `interactionLanguage`，Session 子操作使用所属 Session 的 `language`。
禁止以“检测 JD、简历或用户回答的主要语言并据此决定输出语言”作为主策略。

公司名、学校名、项目名、产品名、技能名、编程语言、框架、数据库、协议、标准和 URL 等
技术实体应尽量保留原文；只翻译自然语言描述，不能为了语言一致性增删或改变事实。用户
原始简历、原始 JD、回答和历史 AI artifact 不因 UI 切换而自动翻译。
