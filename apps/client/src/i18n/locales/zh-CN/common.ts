export const common = {
  close: "关闭",
  trainingEntry: {
    available: {
      title: "历史训练配置完整可用",
      description: "已按原岗位和训练设置恢复，本次没有调整。",
    },
    adjusted: {
      title: "部分历史配置已调整",
      description: "原岗位仍可训练，但以下设置当前已不可用。",
      confirm: "确认使用调整后的配置",
      confirmed: "已确认调整后的配置，可以开始训练。",
    },
    adjustments: {
      practiceQuestionTypeUnsupported: "原专项训练题型已不受支持，已选择当前支持的题型。",
      interviewRoundUnsupported: "原模拟面试轮次已不受支持，已选择当前支持的轮次。",
      difficultyUnavailable: "原训练难度已不可用，已选择当前可用难度。",
      durationUnavailable: "原面试时长已不可用，已选择当前可用时长。",
    },
    roleUnavailable: {
      title: "历史岗位当前不可用",
      reasons: {
        roleDeleted: "原目标岗位已删除，请主动选择其他岗位后继续。",
        roleArchived: "原目标岗位已归档，请主动选择仍在准备中的岗位后继续。",
        rolePrerequisiteUnavailable: "原岗位当前不满足训练前置条件，请选择满足条件的岗位后继续。",
      },
    },
    failed: {
      title: "历史训练配置准备失败",
      description: "未继续旧 session，也未使用替代配置。请重试入口准备。",
      retry: "重新准备",
      retrying: "正在重新准备",
    },
    selectRole: "请选择目标岗位",
  },
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
    resize: "调整侧边栏宽度",
  },
} as const
