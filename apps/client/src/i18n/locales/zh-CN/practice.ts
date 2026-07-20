export const practice = {
  title: "专项练习",
  description: "围绕一道题集中训练，获得即时反馈并快速改进回答。",
  setup: {
    title: "练习设置",
    description: "选择本次练习的岗位和题目方向，Riva 将据此生成一道针对性问题。",
    fields: {
      targetRole: "目标岗位",
      questionType: "题目类型",
      difficulty: "难度",
      source: "题目来源",
      prioritizeWeaknesses: "优先练习薄弱项",
    },
    weaknessDescription: "结合近期表现，优先生成需要加强的题目。",
  },
  questionTypes: {
    projectDeepDive: "项目深挖",
    behavioral: "行为面试",
    businessUnderstanding: "业务理解",
    motivation: "求职动机",
    technicalFoundation: "技术基础",
  },
  difficulty: {
    basic: "基础",
    pressure: "高压",
  },
  sources: {
    personalized: "个性化题目",
    saved: "收藏题目",
    history: "历史重练",
  },
  actions: {
    start: "开始练习",
    starting: "正在开始",
    retryGeneration: "重新生成",
    retryingGeneration: "正在重新生成",
    usePersonalized: "切换到个性化题目",
    manageRoles: "前往目标岗位",
  },
  availability: {
    saved: {
      title: "暂无可练习的收藏题",
      description: "当前岗位和题型下没有符合条件的收藏题，可以切换到个性化题目。",
    },
    history: {
      title: "暂无可重练的历史题",
      description: "当前岗位和题型下没有符合条件的历史题，可以切换到个性化题目。",
    },
  },
  noRoles: {
    title: "请先添加目标岗位",
    description: "专项练习需要目标岗位作为出题上下文。添加岗位后即可开始单题训练。",
  },
  loading: {
    cardDescription: "正在加载岗位和可用题目来源。",
  },
  errors: {
    startTitle: "暂时无法开始练习",
    startDescription: "本次设置已保留，请稍后重试。",
    generationTitle: "题目生成未完成",
    generationDescription: "你的练习设置已保留，可以直接重新生成，不会重复提交旧任务。",
  },
  generation: {
    title: "正在生成本题",
    description: "Riva 正在结合目标岗位、题型和难度准备一道针对性问题。",
    progress: "通常只需要片刻，请保持此页面打开。",
  },
  ready: {
    title: "题目已生成",
    description: "答题区将在专项练习下一步中实现。",
  },
  summary: {
    targetRole: "目标岗位",
    questionType: "题目类型",
    difficulty: "难度",
    source: "题目来源",
  },
} as const
