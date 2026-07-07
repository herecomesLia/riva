import { mockEmptyResumeSetupGuide, mockResumeProfile, mockResumeSetupGuide } from '../data/resume.mock'
import type { ResumeProfileResult, ResumeSetupGuide } from '../../types/resume'
import { readPageScenario } from './url'
import type { PageScenario, PageStateResult } from './types'

function readResumeScenario(page: 'resumeProfile' | 'resumeSetup') {
  return readPageScenario({ page, aliases: ['resume'] })
}

export function getResumeSetupPageState(): PageStateResult<ResumeSetupGuide> {
  const scenario = readResumeScenario('resumeSetup')

  if (scenario === 'error') {
    return {
      scenario,
      errorMessage: '简历录入流程暂时不可用',
    }
  }

  if (scenario === 'empty' || scenario === 'firstTime') {
    return {
      scenario,
      data: mockEmptyResumeSetupGuide,
    }
  }

  if (scenario === 'incomplete') {
    return {
      scenario,
      data: {
        ...mockResumeSetupGuide,
        status: 'draft',
        profile: {
          ...mockResumeProfile,
          status: 'draft',
          completion: 42,
          education: [],
          projects: [],
          certificates: [],
        },
      },
    }
  }

  return {
    scenario,
    data: mockResumeSetupGuide,
  }
}

export function getResumeProfilePageState(): PageStateResult<ResumeProfileResult> {
  const scenario = readResumeScenario('resumeProfile')

  if (scenario === 'error') {
    return {
      scenario,
      errorMessage: '求职档案暂时不可用',
    }
  }

  if (scenario === 'empty' || scenario === 'firstTime') {
    return {
      scenario,
      data: { profile: null },
    }
  }

  if (scenario === 'incomplete') {
    return {
      scenario,
      data: {
        profile: {
          ...mockResumeProfile,
          status: 'draft',
          completion: 42,
          education: [],
          projects: [],
          certificates: [],
        },
      },
    }
  }

  return {
    scenario,
    data: { profile: mockResumeProfile },
  }
}

export function getResumeSubmitScenario(): PageScenario {
  return readPageScenario({ page: 'resumeSubmit', aliases: ['resume'] })
}
