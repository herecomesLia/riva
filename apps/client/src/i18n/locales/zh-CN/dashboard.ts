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
    title: "前端工程师",
    context: "字节跳动 · 社招 · 技术岗位",
    metadata: "上海 · 3–5 年经验",
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
  developmentPreview: {
    title: "开发预览 · 当前目标",
    complete: "完整状态",
    missingJobDescription: "缺少 JD",
    missingProfile: "缺少档案",
    empty: "空状态",
  },
  empty: {
    title: "从建立求职档案开始",
    description: "补充简历和目标岗位后，Riva 会为你生成匹配分析与首轮训练建议。",
    action: "完善求职档案",
  },
  metrics: {
    eyebrow: "准备进度",
    noComparison: "暂无可比较数据",
    roleFit: {
      title: "岗位匹配度",
      comparison: "较上次岗位分析 {{value}}",
    },
    practiceTime: {
      title: "今日练习时间",
      comparison: "较昨日 {{value}}",
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
  },
  readiness: {
    eyebrow: "岗位准备度",
    title: "你正处于专项训练阶段",
    description: "完成薄弱项练习后，进入模拟面试检验整体表现。",
    completed: "已完成",
    current: "进行中",
    upcoming: "下一步",
    stages: {
      profile: "建立档案",
      role: "分析岗位",
      practice: "专项训练",
      interview: "模拟面试",
    },
  },
  recommendation: {
    eyebrow: "今日训练建议",
    title: "重练：项目难点与解决方案",
    description: "最近回答已经说清背景，但解决过程的取舍和成果量化仍可更具体。",
    type: "项目经历题",
    duration: "预计 8 分钟",
  },
  weaknesses: {
    eyebrow: "优先补强",
    title: "把薄弱项变成下一次的亮点",
    description: "根据近期训练反馈整理，建议按优先级完成练习。",
    items: {
      projectExpression: {
        title: "项目表达",
        description: "回答结构与关键取舍可以更清晰。",
        count: "建议练习 2 题",
      },
      quantifiedResults: {
        title: "量化结果",
        description: "补充可验证的业务影响与个人贡献。",
        count: "建议练习 2 题",
      },
      pressureResponse: {
        title: "压力场景应对",
        description: "更完整地说明行动、协作与复盘。",
        count: "建议练习 1 题",
      },
    },
  },
} as const
