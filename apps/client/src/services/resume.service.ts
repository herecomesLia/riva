import { mockResumeProfile, mockResumeSetupGuide } from '../mocks/data/resume.mock'
import { getResumeProfilePageState, getResumeSetupPageState, getResumeSubmitScenario } from '../mocks/page-state'
import { MockStateError, waitForMockState } from '../mocks/runtime'
import type {
  ResumeParseInput,
  ResumeProfile,
  ResumeProfileResult,
  ResumeSetupGuide,
  SaveResumeProfileInput,
} from '../types/resume'

export async function getResumeSetup(): Promise<ResumeSetupGuide> {
  await waitForMockState()

  const pageState = getResumeSetupPageState()

  if (pageState.errorMessage) {
    throw new MockStateError(pageState.errorMessage)
  }

  return pageState.data ?? mockResumeSetupGuide
}

export async function parseResume(input: ResumeParseInput): Promise<ResumeProfileResult> {
  await waitForMockState(720)

  if (getResumeSubmitScenario() === 'submitError') {
    throw new MockStateError('简历提交暂时失败，请检查内容后重试')
  }

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

  const pageState = getResumeProfilePageState()

  if (pageState.errorMessage) {
    throw new MockStateError(pageState.errorMessage)
  }

  return pageState.data ?? { profile: mockResumeProfile }
}

export async function saveResumeProfile(input: SaveResumeProfileInput): Promise<{ profile: ResumeProfile }> {
  await waitForMockState()

  if (getResumeSubmitScenario() === 'submitError') {
    throw new MockStateError('档案保存暂时失败，请稍后重试')
  }

  return { profile: input.profile }
}
