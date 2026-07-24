export const interview = {
  title: "模拟面试",
  description: "按真实面试节奏完成连续问答，并在结束后获得整场复盘和下一步训练建议。",
  setup: {
    title: "配置本次面试",
    description: "选择目标岗位、面试轮次和难度，Riva 将据此准备本次模拟面试。",
    fields: {
      targetRole: "目标岗位",
      round: "面试轮次",
      difficulty: "面试难度",
    },
  },
  rounds: {
    hr: "HR 面",
    firstBusiness: "业务一面",
    technical: "技术面",
    manager: "主管面",
    final: "终面",
    comprehensive: "综合模拟",
  },
  difficulty: {
    basic: "基础",
    pressure: "高压",
  },
  actions: {
    start: "开始模拟面试",
    starting: "正在准备面试",
    addRole: "添加目标岗位",
    retry: "重试",
  },
  empty: {
    title: "暂无可用的目标岗位",
    description: "请先添加一个目标岗位，再回来配置模拟面试。",
  },
  errors: {
    loadTitle: "无法加载模拟面试配置",
    loadDescription: "配置暂时加载失败，请检查网络后重试。",
    startTitle: "暂时无法开始面试",
    startDescription: "本次配置已保留，你可以直接重试。",
  },
  sessionPlaceholder: {
    badge: "模拟面试",
    title: "面试已准备完成",
    description: "正式面试内容将在下一步接入。",
  },
} as const
