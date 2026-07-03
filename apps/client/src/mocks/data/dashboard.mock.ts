import type { DashboardSummary } from '../../types/dashboard'

export const mockDashboardSummary: DashboardSummary = {
  hero: {
    eyebrow: '今日训练工作台',
    title: '把下一场面试准备得更有把握',
    description: 'Riva 已根据你的简历、目标岗位和最近练习表现整理出今天最值得推进的准备动作。',
  },
  progress: [
    { key: 'resumeCompletion', label: '简历完整度', value: '86%', detail: '项目经历还可补充结果数据' },
    { key: 'jobMatch', label: '岗位匹配度', value: '78%', detail: '业务理解与项目表达匹配较高' },
    { key: 'weeklyPractice', label: '本周练习', value: '4/6', detail: '还差 2 道题达成本周目标' },
    { key: 'averageScore', label: '平均评分', value: '7.6', detail: '结构清晰度较上次提升 12%' },
  ],
  currentRole: {
    id: 'job_001',
    title: '产品经理',
    company: 'Riva AI',
    status: '准备中',
    summary: '当前 JD 强调数据驱动、跨团队推进和 AI 产品落地。建议优先准备项目深挖与业务理解题。',
    keywords: ['数据驱动', '业务理解', '跨团队推进', 'AI 产品落地'],
    readiness: [
      { label: 'JD 解析', value: '已完成' },
      { label: '匹配分析', value: '可复盘' },
      { label: '推荐题卡', value: '12 道' },
    ],
  },
  recommendations: [
    {
      id: 'rec_001',
      title: '重练项目深挖题',
      reason: '上次回答缺少个人贡献和量化结果，建议用 STAR 结构重答。',
      actionLabel: '重练当前题',
      actionType: 'practice_question',
      targetId: 'question_001',
    },
    {
      id: 'rec_002',
      title: '进入业务理解专项',
      reason: '岗位高频关键词中「商业化」覆盖不足，先补 2 道业务题。',
      actionLabel: '开始专项',
      actionType: 'practice_topic',
      targetId: 'topic_business',
    },
    {
      id: 'rec_003',
      title: '本周末模拟一面',
      reason: '基础题表现稳定，可以进入连续问答场景检查节奏。',
      actionLabel: '安排模拟',
      actionType: 'mock_interview',
    },
  ],
  recentPractice: [
    { id: 'practice_001', title: '项目深挖 · 增长实验复盘', displayTime: '今天 10:30', score: 7.8, mode: 'single_question' },
    { id: 'practice_002', title: '行为面试 · 跨团队冲突', displayTime: '昨天 21:15', score: 7.2, mode: 'single_question' },
    { id: 'practice_003', title: '业务理解 · AI 产品落地', displayTime: '周二 19:40', score: 8.1, mode: 'topic_practice' },
  ],
}

export const mockEmptyDashboardSummary: DashboardSummary = {
  hero: mockDashboardSummary.hero,
  progress: [],
  currentRole: null,
  recommendations: [],
  recentPractice: [],
}
