import type { ResumeProfile, ResumeSetupGuide } from '../../types/resume'

export const mockResumeProfile: ResumeProfile = {
  id: 'resume_001',
  status: 'completed',
  completion: 86,
  updatedAt: '2026-07-02 21:18',
  basicInfo: {
    name: '梁一',
    email: 'liang@example.com',
    phone: '138 0000 1024',
    location: '上海',
    yearsOfExperience: '3 年',
    targetTitle: '产品经理',
    jobDirection: 'AI 产品 / B 端增长',
  },
  education: [
    {
      id: 'edu_001',
      title: '软件工程',
      degree: '本科',
      organization: '华东理工大学',
      period: '2018.09 - 2022.06',
      description: '主修产品设计、数据结构、数据库系统和人机交互，参与校园创新项目。',
    },
    {
      id: 'edu_002',
      title: '智能产品设计',
      degree: '硕士',
      organization: '上海交通大学',
      period: '2024.09 - 2026.06',
      description:
        '研究 AI 产品体验、用户行为分析和人机协同流程设计，核心课程包括智能交互系统设计、服务设计方法、机器学习产品化、实验研究方法、数据驱动决策、服务蓝图设计、可用性评估与实验设计。曾获研究生学业奖学金，参与智能招聘方向课题，完成面向候选人体验的对话式辅助系统研究，并在校内创新项目中负责需求拆解、原型验证和用户测试。硕士阶段还持续参与校企联合研究，围绕多轮对话体验、候选人反馈质量和 AI 辅助决策可信度输出阶段性报告，多次在课程答辩和学术沙龙中展示研究成果，并协助整理研究样本、访谈纪要和实验复盘材料。',
    },
  ],
  workExperience: [
    {
      id: 'work_001',
      title: '产品经理',
      organization: 'Riva AI',
      period: '2023.04 - 至今',
      description: '负责 AI 面试训练工作台、题卡推荐和复盘链路，推动训练转化率提升。',
      sourceText:
        '公司：Riva AI\n职位：产品经理\n时间：2023.04 - 至今\n负责 AI 面试训练工作台、题卡推荐和复盘链路，推动训练转化率提升。围绕简历解析、个性化题卡生成、模拟面试复盘和训练推荐设计核心流程，协调算法、前端和运营完成多轮迭代。',
    },
    {
      id: 'work_002',
      title: '产品运营',
      organization: 'Blue Lake Labs',
      period: '2022.07 - 2023.03',
      description: '维护用户反馈闭环，搭建数据看板，支持增长实验和内容策略迭代。',
      sourceText:
        '公司：Blue Lake Labs\n职位：产品运营\n时间：2022.07 - 2023.03\n维护用户反馈闭环，搭建数据看板，支持增长实验和内容策略迭代。负责整理用户访谈、竞品观察和运营数据，协助产品团队定位高频问题并推动小版本优化。',
    },
    {
      id: 'work_003',
      title: '产品实习生',
      organization: 'Moka Studio',
      period: '2021.09 - 2022.06',
      description: '参与招聘 SaaS 候选人管理模块设计，整理竞品分析和用户访谈纪要。',
      sourceText:
        '公司：Moka Studio\n职位：产品实习生\n时间：2021.09 - 2022.06\n参与招聘 SaaS 候选人管理模块设计，整理竞品分析和用户访谈纪要。协助输出流程图、低保真原型和需求说明，支持候选人列表筛选与状态流转体验优化。',
    },
  ],
  projects: [
    {
      id: 'project_001',
      name: '智能题卡推荐系统',
      period: '2024.01 - 2024.06',
      role: '产品负责人',
      summary: '基于简历、目标 JD 和练习结果生成个性化面试题卡。',
      highlights: ['梳理推荐策略与埋点口径', '将次日留存提升 12%', '沉淀 6 类面试题标签体系'],
      sourceText:
        '负责基于用户简历、目标 JD 和历史练习表现生成个性化面试题卡。梳理推荐策略、题型标签和埋点口径，推动题卡生成链路从通用推荐升级为按岗位和弱项动态推荐。上线后次日留存提升 12%，沉淀 6 类面试题标签体系。',
    },
    {
      id: 'project_002',
      name: '模拟面试复盘',
      period: '2024.07 - 2024.12',
      role: '核心设计',
      summary: '将连续问答过程拆解为结构、证据、岗位匹配和表达节奏四类评分。',
      highlights: ['设计复盘报告信息架构', '降低用户理解成本', '支持下一步训练推荐'],
      sourceText:
        '负责模拟面试后的复盘报告设计，将连续问答过程拆解为结构、证据、岗位匹配和表达节奏四类评分。设计复盘报告信息架构，突出答题优点、主要问题和下一步训练建议，降低用户理解成本，并支持系统给出下一步训练推荐。',
    },
    {
      id: 'project_003',
      name: '岗位匹配分析看板',
      period: '2025.01 - 2025.05',
      role: '策略设计',
      summary: '整合简历要点、目标岗位和训练记录，输出差距拆解和准备优先级。',
      highlights: ['定义匹配评分维度', '设计差距解释组件', '提升岗位分析完成率 18%'],
      sourceText:
        '整合用户简历要点、目标岗位 JD 和训练记录，输出岗位匹配差距拆解和准备优先级。定义匹配评分维度，设计差距解释组件，让用户能看到强匹配、缺失能力和表达不足的经历。上线后岗位分析完成率提升 18%。',
    },
  ],
  skills: ['需求分析', '数据分析', '用户访谈', 'A/B 实验', 'AI 产品设计', 'PRD', 'SQL'],
  certificates: [],
  targetJob: '产品经理',
  jobDirection: 'AI 产品 / B 端增长',
}

export const mockResumeSetupGuide: ResumeSetupGuide = {
  status: 'parsed',
  acceptedFormats: ['PDF', 'DOCX', 'TXT', '直接粘贴文本'],
  sampleText:
    '梁一，3 年产品经验，曾负责 AI 面试训练工作台、题卡推荐系统和模拟面试复盘。擅长需求分析、数据分析、用户访谈和 AI 产品设计，目标岗位为产品经理。',
  steps: [
    {
      id: 'upload',
      title: '上传或粘贴简历',
      description: '支持常见文档格式，也可以直接粘贴纯文本。',
      status: 'done',
    },
    {
      id: 'parse',
      title: 'Riva 识别结构化信息',
      description: '自动抽取基础信息、经历、项目、技能和求职方向。',
      status: 'current',
    },
    {
      id: 'confirm',
      title: '确认并补充档案',
      description: '检查识别结果，补充缺失内容后保存为求职档案。',
      status: 'todo',
    },
  ],
  profile: mockResumeProfile,
}

export const mockEmptyResumeSetupGuide: ResumeSetupGuide = {
  ...mockResumeSetupGuide,
  status: 'not_started',
  steps: mockResumeSetupGuide.steps.map((step, index) => ({
    ...step,
    status: index === 0 ? 'current' : 'todo',
  })),
  profile: null,
}
