export const dashboard = {
  badge: "工作台",
  title: "工作台",
  greeting: {
    prefix: "很高兴见到你，",
    suffix: "！让我们把今天过得充实。",
  },
  actions: {
    adjustRole: "调整岗位",
    analyzeRole: "查看匹配分析",
    startMockInterview: "开始模拟面试",
    startPractice: "开始练习",
    viewHistory: "查看训练记录",
  },
  currentRole: {
    eyebrow: "当前目标",
    recruitmentTypes: {
      campus: "校招",
      experienced: "社招",
    },
    actions: {
      adjust: "调整岗位",
      analyze: "查看匹配分析",
      addJobDescription: "添加岗位 JD",
      completeProfile: "完善求职档案",
    },
    status: {
      profile: {
        complete: "档案已完善",
        incomplete: "待完善档案",
      },
      jobDescription: {
        complete: "JD 已添加",
        incomplete: "待添加 JD",
      },
    },
    empty: {
      title: "尚未设置目标岗位",
      description: "添加岗位信息后可获得匹配分析和个性化训练建议。",
      action: "添加目标岗位",
    },
  },
  empty: {
    title: "从建立求职档案开始",
    description: "补充简历和目标岗位后，Riva 会为你生成匹配分析与首轮训练建议。",
    action: "完善求职档案",
  },
  metrics: {
    eyebrow: "准备进度",
    noData: "暂无数据",
    noComparison: "暂无可比较数据",
    roleFit: {
      title: "岗位匹配度",
      comparison: "较上次岗位分析 {{value}}",
    },
    practiceTime: {
      title: "本统计周期训练时长",
      comparison: "较前 7 天 {{value}}",
    },
    targetedPractice: {
      title: "专项练习表现",
      comparison: "较上一次专项练习 {{value}}",
    },
    mockInterview: {
      title: "模拟面试分数",
      comparison: "较上一次模拟面试 {{value}}",
    },
    values: {
      percentage: "{{value}}%",
      duration: "{{value}} 分钟",
      durationUnit: "分钟",
      score: "{{value}} / 10",
    },
  },
  performanceTrend: {
    title: "表现趋势",
    description: "最近 10 次{{type}}的评分表现。",
    switchLabel: "训练类型",
    types: {
      targetedPractice: "专项练习",
      mockInterview: "模拟面试",
    },
    trainingDays: "训练天数",
    daysUnit: "天",
    highestScore: "最高分",
    averageScore: "平均分",
    score: "{{score}} / 10",
    session: "{{type}} 第{{count}}次",
    chartLabel: "最近 10 次{{type}}评分表现",
    empty: "暂无{{type}}记录。",
  },
  recommendation: {
    eyebrow: "今日训练建议",
    duration: "预计 {{minutes}} 分钟",
    actions: {
      retryQuestion: { title: "重试当前或同类问题" },
      targetedPractice: { title: "专项补强薄弱能力" },
      mockInterview: { title: "通过模拟面试检验能力" },
      none: { title: "本轮无需后续操作" },
    },
    empty: {
      title: "暂无训练建议",
      description: "完成更多训练后，我们会为你生成下一步建议。",
    },
  },
  weaknesses: {
    eyebrow: "优先补强",
    title: "把薄弱项变成下一次的亮点",
    description: "根据近期训练反馈整理，建议按优先级完成练习。",
    categories: {
      projectExpression: "项目表达",
      quantifiedResults: "量化结果",
      pressureResponse: "压力场景应对",
    },
    empty: "暂未发现需要优先补强的薄弱项。",
    recommendedPracticeCount: "建议练习 {{count}} 题",
  },
} as const
