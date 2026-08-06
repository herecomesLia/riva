# Riva

简体中文 | [English](README.md)

Riva 是一个基于 Web 的 AI 面试训练助理，面向正在准备求职面试的用户。

Riva 结合用户简历、目标岗位 JD 和历史练习表现，提供岗位理解、简历匹配、个性化题卡、专项练习、模拟面试、评分复盘和后续训练推荐，帮助用户更有针对性地准备面试并持续提升表达质量。

## 产品范围

Riva 主要覆盖五类能力：

- **用户基础信息**：维护简历、教育经历、工作经历、项目经历、技能标签、目标岗位和求职方向。
- **岗位理解与匹配**：解析目标岗位 JD，提取能力要求、高频关键词，并生成简历与岗位的匹配分析。
- **面试训练基础能力**：以题卡为最小训练单元，支持个性化题卡、单题训练、动态追问、评分和复盘。
- **训练模式**：提供专项练习和模拟面试，分别支持单题快速改进和多题连续演练。
- **训练记录与推荐**：记录回答、追问、评分、复盘、薄弱项、收藏题目和下一步训练建议。

## 文档入口

- [功能需求](docs/zh/product-requirements.md)
- [项目结构](docs/zh/project-structure.md)

## 开发

`main` 是稳定集成分支。前端、后端和文档工作可以使用独立的长期分支：

```text
main      稳定集成
client    前端开发
server    后端开发
docs      文档
```

日常改动使用任务分支，并通过正常评审流程合入。

JavaScript/TypeScript 包使用 `pnpm` 管理，Python 服务使用 `uv` 管理。

### 本地 API 与 Worker

先启动 PostgreSQL 并初始化数据库表，再在两个独立终端中运行 API 和 Worker：

```bash
podman compose -f infra/local/docker-compose.yml up -d postgres
uv run --directory apps/server riva db setup --env-file "$PWD/.env"
uv run --directory apps/server riva start --env-file "$PWD/.env"
uv run --directory apps/server riva worker --env-file "$PWD/.env"
```

未配置 `RIVA_LLM_PROVIDER` 时，Worker 会使用空 Handler Registry 启动。完整配置
Qwen（`RIVA_LLM_PROVIDER=qwen`、model、API Key 和 base URL）后，会注册
`job-description-parser` 和 `matching-analyzer`，启动日志中的 `handler_count` 应为
`2`。API 已暴露 JD parsing lifecycle 和 Matching analysis lifecycle；前端真实 API
接入将在后续完成。简历解析成功后，API 还提供可审阅的导入 Draft 和显式应用接口：

- `GET /api/profile/resumes/{resumeId}/import-draft` 查看当前 Draft；
- `POST /api/profile/resumes/{resumeId}/import-draft/apply`，提交
  `{"draftVersion": 1}` 应用指定版本。

查看 Draft 不会修改 Profile；重复应用已应用 Draft 是幂等的。应用后的 Profile
仍通过现有 `CareerProfile` GET 接口读取。

默认自动化测试只使用 Fake Provider，不会请求 Qwen。真实 Qwen 验收需由开发者准备
本地 `.env` 后显式执行。
