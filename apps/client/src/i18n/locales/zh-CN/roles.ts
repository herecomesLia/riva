export const roles = {
  title: "目标岗位",
  description: "集中管理正在准备和已归档的岗位，并查看 JD 与匹配分析状态。",
  actions: {
    add: "添加目标岗位",
    archive: "归档岗位",
    delete: "删除岗位",
    edit: "编辑信息",
    pause: "暂停准备",
    resume: "继续准备",
    retry: "重新加载",
    setCurrent: "设为当前岗位",
  },
  editor: {
    create: {
      title: "添加目标岗位",
      description: "保存岗位基础信息。第一个岗位会自动成为当前岗位。",
    },
    edit: {
      title: "编辑岗位信息",
      description: "更新岗位基础信息，不会隐式改变当前岗位。",
    },
    fields: {
      title: "岗位名称",
      company: "公司名称",
      recruitmentType: "招聘类型",
      location: "地点",
      minYears: "最低经验年限",
      maxYears: "最高经验年限",
      preparationStatus: "准备状态",
    },
    options: { unspecified: "未填写" },
    validation: {
      required: "请填写岗位名称。",
      nonNegative: "经验年限必须是非负整数。",
      experienceRange: "最低经验年限不能大于最高经验年限。",
    },
    cancel: "取消",
    save: "保存",
    saving: "正在保存",
  },
  dialog: {
    archiveTitle: "归档这个岗位？",
    archiveDescription: "归档后，该岗位不能成为当前岗位，但仍会保留在岗位列表中。",
    deleteTitle: "永久删除这个岗位？",
    deleteDescription: "此操作无法撤销。岗位及其 JD 和匹配分析数据都会被删除。",
    cancel: "取消",
    discardDraftTitle: "放弃未保存的修改？",
    discardDraftDescription: "关闭后，本次尚未保存的岗位信息将不会保留。",
    stayEditing: "继续编辑",
    discardChanges: "放弃修改",
    leavePageTitle: "离开并放弃修改？",
    leavePageDescription: "当前岗位表单仍有未保存的修改。",
    leavePage: "离开页面",
  },
  errors: {
    actionTitle: "操作未完成",
    requestFailed: "暂时无法保存本次修改，请稍后重试。表单和现有岗位数据均已保留。",
    versionConflict: "岗位已在其他位置更新。请关闭表单，查看最新内容后再试。",
  },
  jd: {
    cardDescription: "粘贴岗位 JD，并查看结构化解析结果。",
    actions: {
      add: "粘贴岗位 JD",
      replace: "编辑或替换 JD",
      retry: "重试解析",
      resynchronize: "重新同步状态",
    },
    editor: {
      addTitle: "粘贴岗位 JD",
      replaceTitle: "编辑或替换岗位 JD",
      description: "第一版仅支持粘贴文本。保存后将开始结构化解析。",
      fieldLabel: "岗位 JD 原文",
      placeholder: "在这里粘贴完整的岗位职责、任职要求和加分项……",
      required: "请粘贴岗位 JD 文本。",
      save: "保存并解析",
      saving: "正在保存",
    },
    failed: {
      title: "JD 解析未完成",
    },
    synchronization: {
      title: "暂时无法获取解析结果",
      description: "JD 已保存并仍处于解析中。可以重新同步，不会重复创建解析任务。",
    },
    analysis: {
      summary: "核心要求总结",
      responsibilities: "岗位职责",
      requiredSkills: "必备技能",
      preferredSkills: "加分技能",
      experienceRequirements: "经验要求",
      softSkills: "软能力",
      businessDomains: "业务领域",
      keywords: "高频关键词",
    },
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
