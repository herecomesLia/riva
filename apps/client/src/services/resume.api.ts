import { request } from './http'
import type {
  ResumeParseRequest,
  ResumeProfileResponse,
  ResumeSetupGuide,
  SaveResumeProfileRequest,
} from '../types/resume'

export function getResumeSetup() {
  return request<ResumeSetupGuide>('/api/resume/setup')
}

export function parseResume(body: ResumeParseRequest) {
  return request<ResumeProfileResponse>('/api/resume/parse', {
    method: 'POST',
    body,
  })
}

export function getResumeProfile() {
  return request<ResumeProfileResponse>('/api/resume/profile')
}

export function saveResumeProfile(body: SaveResumeProfileRequest) {
  return request<ResumeProfileResponse>('/api/resume/profile', {
    method: 'PUT',
    body,
  })
}
