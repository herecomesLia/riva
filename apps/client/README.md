# Client 本地联调

接口契约以 server 运行时生成的 OpenAPI（`/openapi.json`）为准。下面只记录本地启动与代理方式。

## 启动 server

先在仓库根目录启动 PostgreSQL：

```bash
docker compose -f infra/local/docker-compose.yml up -d postgres
```

在 `apps/server/.env.local` 中配置本地环境。该文件已被仓库 `.gitignore` 忽略，不要提交真实密钥：

```dotenv
RIVA_DATABASE_URL=postgresql+asyncpg://riva:riva@127.0.0.1:5432/riva
RIVA_SESSION_DIGEST_KEY=<本地随机密钥>
RIVA_SESSION_COOKIE_SECURE=false
```

然后启动后端：

```bash
cd apps/server
uv sync
uv run riva db setup --env-file .env.local
uv run riva start --env-file .env.local --reload
```

默认监听 `http://127.0.0.1:7482`。`db setup` 只用于本地开发环境。

## 启动真实 API 模式 client

另开终端，在仓库根目录运行：

```bash
env MOCK=false pnpm client:dev
```

浏览器仍访问 Vite 自己的 origin。开发服务器会把 `/api` 代理到
`http://127.0.0.1:7482`，浏览器会自动发送正常的 `Origin` 和 session cookie，
不需要手工添加 `Origin` Header。

生产环境默认也请求相对路径 `/api`；只有 API 不在同一反向代理下时，才设置
`VITE_API_BASE_URL`。

Mock 模式仍使用：

```bash
pnpm client:dev:mock
```
