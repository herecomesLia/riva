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
│       ├── prompts/
│       └── integrations/
├── tests/
└── migrations/
```

职责分层：

- `api/`：FastAPI 路由、请求校验和响应处理。
- `cli/`：Typer 命令定义和命令侧编排逻辑。
- `core/`：配置、日志、鉴权依赖和应用生命周期。
- `db/`：数据库连接、事务和迁移基础能力。
- `models/`：数据库模型，例如用户、简历、岗位、题卡、面试会话、复盘和 Agent 运行记录。
- `schemas/`：Pydantic 请求和响应结构。
- `services/`：业务服务，承载简历、岗位、匹配分析、题卡、面试和评分复盘等主要逻辑。
- `agents/`：Agent 和工作流。
- `prompts/`：Prompt 模板、评分标准和输出格式要求。
- `integrations/`：LLM Provider、对象存储、邮件和第三方 API 等外部服务适配。
