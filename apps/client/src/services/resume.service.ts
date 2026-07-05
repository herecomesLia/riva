import { mockEmptyResumeSetupGuide, mockResumeProfile, mockResumeSetupGuide } from '../mocks/data/resume.mock'
import { getMockPageState, MockStateError, waitForMockState } from '../mocks/runtime'
import type {
  ResumeParseInput,
  ResumeProfile,
  ResumeProfileResult,
  ResumeSetupGuide,
  SaveResumeProfileInput,
} from '../types/resume'

export async function getResumeSetup(): Promise<ResumeSetupGuide> {
  await waitForMockState()

  const state = getMockPageState('resumeSetup')

  if (state === 'error') {
    throw new MockStateError('简历录入流程暂时不可用')
  }

  return state === 'empty' ? mockEmptyResumeSetupGuide : mockResumeSetupGuide
}

export async function parseResume(input: ResumeParseInput): Promise<ResumeProfileResult> {
  await waitForMockState(720)

  if (!input.text && !input.fileName) {
    throw new MockStateError('请先上传简历文件或粘贴简历文本')
  }

  if (input.text?.includes('parse-error')) {
    throw new MockStateError('简历内容识别失败，请补充更多经历信息后重试')
  }

  return { profile: mockResumeProfile }
}

export async function getResumeProfile(): Promise<ResumeProfileResult> {
  await waitForMockState()

  const state = getMockPageState('resumeProfile')

  if (state === 'error') {
    throw new MockStateError('求职档案暂时不可用')
  }

  return { profile: state === 'empty' ? null : mockResumeProfile }
}

export async function saveResumeProfile(input: SaveResumeProfileInput): Promise<{ profile: ResumeProfile }> {
  await waitForMockState()

  return { profile: input.profile }
}
