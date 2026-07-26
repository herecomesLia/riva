export const appShell = {
  language: {
    label: "界面语言",
    options: {
      en: "English",
      zhCN: "简体中文",
    },
    select: "选择界面语言",
  },
  theme: {
    label: "主题",
    options: {
      dark: "深色",
      light: "浅色",
      system: "跟随系统",
    },
    select: "选择主题",
  },
  nav: {
    dashboard: "工作台",
    history: "训练记录",
    interview: "模拟面试",
    practice: "专项练习",
    profile: "求职档案",
    roles: "目标岗位",
  },
  appDescription: "面试训练助手",
  preview: "预览版",
  openNavigation: "打开导航",
  signOut: "退出登录",
  user: {
    avatar: "",
    description: "候选人账号",
    fallback: "演",
    name: "演示用户",
  },
} as const
