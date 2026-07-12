export const common = {
  close: "关闭",
  pageState: {
    empty: {
      title: "暂无内容",
      description: "当前页面还没有可展示的内容。",
    },
    error: {
      title: "页面状态异常",
      description: "页面数据加载失败。",
      retry: "重新加载",
      retrying: "重新加载中...",
    },
    loading: {
      title: "正在加载",
      description: "页面数据正在准备中。",
    },
  },
  sidebar: {
    description: "显示移动端侧边栏。",
    title: "侧边栏",
    toggle: "切换侧边栏",
  },
} as const
