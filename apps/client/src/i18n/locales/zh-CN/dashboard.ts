export const dashboard = {
  badge: "工作台",
  title: "训练概览",
  description: "主工作区路由的轻量占位页面。",
  cards: {
    currentRole: {
      title: "当前岗位",
      description: "前端工程师",
      badge: "进行中",
    },
    nextSession: {
      title: "下一次训练",
      description: "行为面试练习",
      badge: "今天",
    },
    recommendation: {
      title: "训练建议",
      description: "重试一个薄弱回答",
      badge: "建议",
    },
  },
} as const
