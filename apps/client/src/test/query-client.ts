import { QueryClient } from "@tanstack/react-query"

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: Infinity,
        retry: false,

        // 测试中的请求应由用例显式触发，避免浏览器焦点、
        // 网络状态和组件重新挂载造成额外请求。
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}
