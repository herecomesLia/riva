# Riva

简体中文 | [English](README.md)

Riva 是一款面向求职者的 Web AI 面试训练助手。

它结合简历上下文、岗位描述理解、个性化面试题卡、专项练习、模拟面试、评分、复盘和后续训练建议，帮助用户为目标岗位做好准备。

## 产品范围

Riva 聚焦五个产品领域：

- **用户基础**：简历、教育经历、工作经历、项目经历、技能标签、目标岗位和求职方向。
- **岗位理解与匹配**：JD 解析、能力提取、关键词分析，以及简历与岗位的匹配报告。
- **面试训练能力**：个性化题卡、单题练习、动态追问、评分和复盘。
- **训练模式**：专项练习用于快速提升单题表现，模拟面试用于连续多题演练。
- **记录与建议**：回答历史、评分、复盘、薄弱项、收藏题目和后续训练建议。

## 文档入口

- [功能需求](docs/zh/product-requirements.md)
- [项目结构](docs/zh/project-structure.md)

## 开发

Riva 是一个使用 pnpm 和 uv 的 monorepo。除非另有说明，请在仓库根目录运行以下命令。

### 环境要求

- pnpm 11
- uv 和 Python 3.14 或更高版本
- 运行服务端或服务端集成测试时需要 Podman 或 Docker

安装 workspace 依赖：

```bash
pnpm install
uv sync --locked --directory apps/server
```

### 客户端开发

客户端目前在日常 UI 开发中使用 mock 服务：

```bash
pnpm client:dev:mock
```

Vite 会在 `http://localhost:5173` 提供客户端服务。需要连接已实现的服务端 API 时，请使用 `pnpm client:dev`。

### 服务端开发

创建本地环境文件，并按照文件中的说明设置本地开发所需的 Cookie 和 CORS 配置：

```bash
cp .env.example .env
```

启动 PostgreSQL：

```bash
podman compose -f infra/local/docker-compose.yml up -d
```

使用 Docker 的用户可以将 `podman compose` 替换为 `docker compose`。

创建数据库表，然后以源码热重载模式启动 FastAPI 服务：

```bash
uv run --locked --directory apps/server riva db setup --env-file ../../.env -y
uv run --locked --directory apps/server riva start --env-file ../../.env --reload
```

API 默认监听 `http://127.0.0.1:7482`。本地数据库不再使用时，可以运行：

```bash
podman compose -f infra/local/docker-compose.yml down
```

### 测试与检查

提交改动前，请运行相关检查：

```bash
pnpm client:lint
pnpm client:test
pnpm server:test
pnpm format:check
```

服务端测试会使用 Testcontainers 自动创建并删除临时 PostgreSQL 实例。运行测试时必须提供兼容 Docker 的容器运行时，但无需启动本地开发数据库。
