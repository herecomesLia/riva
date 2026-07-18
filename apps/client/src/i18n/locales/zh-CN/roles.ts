export const roles = {
  title: "目标岗位",
  description: "集中管理正在准备和已归档的岗位，并查看 JD 与匹配分析状态。",
  actions: {
    add: "添加目标岗位",
    retry: "重新加载",
  },
  list: {
    title: "已保存岗位",
    description: "选择岗位可查看详情，不会改变当前默认岗位。",
  },
  details: {
    title: "岗位详情",
    description: "查看岗位基础信息、JD 解析和匹配分析状态。",
    fields: {
      company: "公司",
      recruitmentType: "招聘类型",
      location: "工作地点",
      experience: "经验要求",
    },
    sections: {
      basics: "岗位信息",
      jobDescription: "岗位 JD",
      matchingAnalysis: "匹配分析",
    },
  },
  badges: {
    current: "当前岗位",
    selected: "正在查看",
  },
  preparationStatus: {
    preparing: "准备中",
    paused: "已暂停",
    archived: "已归档",
  },
  recruitmentType: {
    campus: "校招",
    experienced: "社招",
  },
  jobDescriptionStatus: {
    missing: {
      label: "未添加",
      description: "尚未保存岗位 JD。",
    },
    parsing: {
      label: "解析中",
      description: "正在提取职责、技能和业务要求。",
    },
    ready: {
      label: "已解析",
      description: "JD 已完成结构化解析。",
    },
    failed: {
      label: "解析失败",
      description: "JD 原文已保留，可稍后重试解析。",
    },
  },
  matchingAnalysisStatus: {
    none: {
      label: "未生成",
      description: "当前岗位还没有匹配分析。",
    },
    generating: {
      label: "生成中",
      description: "正在结合求职档案与 JD 生成分析。",
    },
    current: {
      label: "当前有效",
      description: "分析基于当前求职档案与 JD。",
    },
    stale: {
      label: "需要更新",
      description: "档案或 JD 已变化，当前展示的是上次分析结果。",
    },
    failed: {
      label: "生成失败",
      description: "分析未生成，岗位和 JD 数据未受影响。",
    },
  },
  experience: {
    range: "{{min}}–{{max}} 年",
    minimum: "{{min}} 年以上",
    maximum: "不超过 {{max}} 年",
    unspecified: "未填写",
  },
  empty: {
    title: "还没有目标岗位",
    description: "添加第一个目标岗位后，可继续补充 JD 并生成匹配分析。",
  },
  noSelection: {
    title: "请选择一个岗位",
    description: "从岗位列表中选择一项以查看详细信息。",
  },
  noCurrentRole: "尚未设置当前默认岗位",
  fallbackValue: "未填写",
} as const
