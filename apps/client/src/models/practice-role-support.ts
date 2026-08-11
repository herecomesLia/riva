import type { PracticeQuestionType } from "@/models/practice"
import type { TargetRole } from "@/models/roles"

const commonPracticeQuestionTypes: PracticeQuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
]

type PracticeRoleQuestionTypeInput = Pick<TargetRole, "title"> & {
  jobDescriptionAnalysis?: TargetRole["jobDescriptionAnalysis"]
}

const technicalTitlePatterns = [
  /\b(?:front[\s-]?end|back[\s-]?end|full[\s-]?stack)\b/,
  /\bsoftware\s+(?:development\s+)?(?:engineer|developer)\b/,
  /\b(?:java|go(?:lang)?|python|c\+\+|c#|rust|kotlin|swift)\s+(?:engineer|developer)\b/,
  /\b(?:android|ios)\s+(?:engineer|developer)\b/,
  /\b(?:data|machine learning|ml)\s+engineer\b/,
  /\b(?:devops|site reliability|test automation|qa automation)\s+engineer\b/,
  /(?:前端|后端|全栈|软件|算法|机器学习|测试开发)/,
  /数据(?:开发|工程|平台|仓库|基础设施)/,
  /(?:java|go|python|c\+\+|安卓|android|ios)(?:开发)?工程师/,
  /开发工程师/,
]

const nonTechnicalTitlePatterns = [
  /\b(?:sales|solutions?)\s+engineer\b/,
  /\b(?:product manager|product owner|business operations manager|operations manager)\b/,
  /\b(?:sales manager|marketing manager|human resources|hr business partner)\b/,
  /\b(?:designer|design manager)\b/,
  /产品(?:经理|负责人)/,
  /(?:业务)?运营(?:经理|负责人)/,
  /(?:销售|市场|人力|招聘|设计师|设计经理|设计负责人|商务拓展)/,
]

const technicalPlatformPattern = /\b(?:android|ios|linux|kubernetes|aws|azure|gcp)\b/
const technicalToolPattern = /\b(?:git|docker|kubernetes|terraform|jenkins)\b/
const technicalConceptPattern =
  /\b(?:machine learning|deep learning|algorithm|distributed systems?|software architecture|front[\s-]?end|back[\s-]?end)\b|(?:机器学习|深度学习|算法|分布式|软件架构|前端|后端|性能优化)/
const technicalOtherSkillPattern =
  /\b(?:java|go(?:lang)?|python|c\+\+|c#|javascript|typescript|react|vue|angular|node(?:\.js)?|spring|django|tensorflow|pytorch|sql)\b|(?:数据库|机器学习|算法|前端|后端)/

function includesMatchingSkill(skills: string[], pattern: RegExp): boolean {
  return skills.some((skill) => pattern.test(skill.trim().toLowerCase()))
}

function hasTechnicalRequiredSkills(
  analysis: TargetRole["jobDescriptionAnalysis"] | undefined,
): boolean {
  if (!analysis) return false

  const skills = analysis.requiredSkills
  return (
    skills.programmingLanguages.length > 0 ||
    skills.frameworksAndLibraries.length > 0 ||
    skills.databasesAndMiddleware.length > 0 ||
    includesMatchingSkill(skills.platforms, technicalPlatformPattern) ||
    includesMatchingSkill(skills.tools, technicalToolPattern) ||
    includesMatchingSkill(skills.conceptsAndMethods, technicalConceptPattern) ||
    includesMatchingSkill(skills.other, technicalOtherSkillPattern)
  )
}

export function derivePracticeSupportedQuestionTypes(
  role: PracticeRoleQuestionTypeInput,
): PracticeQuestionType[] {
  const normalizedTitle = role.title.trim().toLowerCase()
  const hasTechnicalTitle = technicalTitlePatterns.some((pattern) => pattern.test(normalizedTitle))
  const hasNonTechnicalTitle = nonTechnicalTitlePatterns.some((pattern) =>
    pattern.test(normalizedTitle),
  )
  const supportsTechnicalFoundation =
    hasTechnicalTitle ||
    (!hasNonTechnicalTitle && hasTechnicalRequiredSkills(role.jobDescriptionAnalysis))

  return supportsTechnicalFoundation
    ? [...commonPracticeQuestionTypes, "technicalFoundation"]
    : [...commonPracticeQuestionTypes]
}
