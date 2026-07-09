import { env } from "@/app/env"
import { userMock, type UserMock } from "@/mocks/data/user.mock"
import { defaultScenario, getPageStateScenario, type PageStateScenario } from "@/mocks/page-state"

export type PageViewState = "loading" | "empty" | "error" | "success"

export type DashboardViewModel = {
  scenario: PageStateScenario
  state: PageViewState
  user: UserMock
}

export type ResumeProfileViewModel = {
  scenario: PageStateScenario
  state: PageViewState
  user: UserMock
}

const viewModelDelayMs = 240

function resolvePageState(scenario: PageStateScenario): PageViewState {
  if (scenario === "loading" || scenario === "submitting") {
    return "loading"
  }

  if (scenario === "empty" || scenario === "firstTime" || scenario === "incomplete") {
    return "empty"
  }

  if (scenario === "error" || scenario === "submitError") {
    return "error"
  }

  return "success"
}

function getScenario(page: string) {
  return env.mock ? getPageStateScenario(page) : defaultScenario
}

function waitForViewModel() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, viewModelDelayMs)
  })
}

async function getUserPageViewModel(page: string) {
  const scenario = getScenario(page)

  await waitForViewModel()

  return {
    scenario,
    state: resolvePageState(scenario),
    user: userMock,
  }
}

export async function getDashboardViewModel(): Promise<DashboardViewModel> {
  return getUserPageViewModel("dashboard")
}

export async function getResumeProfileViewModel(): Promise<ResumeProfileViewModel> {
  return getUserPageViewModel("resume")
}
