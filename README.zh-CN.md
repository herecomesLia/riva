# RIVA

简体中文 | [English](README.md)

RIVA 是一个基于 Web 的 AI Agent 应用。

## 文档入口

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
