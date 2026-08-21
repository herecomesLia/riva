import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import {
  createInterviewSetupResponseMock,
  interviewSetupResponseMock,
} from "@/mocks/data/interview"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { createRolesMockResponse } from "@/mocks/data/roles"
import type { InterviewConfiguration, InterviewSetupResponse } from "@/models/interview"
import { renderWithProviders } from "@/test/render"

import { InterviewView } from "./InterviewView"

function renderReadyView(
  onStart: (input: InterviewConfiguration) => Promise<void> = vi.fn(async () => undefined),
  isStarting = false,
  setup: InterviewSetupResponse = interviewSetupResponseMock,
) {
  return {
    onStart,
    ...renderWithProviders(
      <InterviewView
        isStarting={isStarting}
        onStart={onStart}
        setup={structuredClone(setup)}
        status="ready"
      />,
      { router: { initialEntries: ["/interview"] } },
    ),
  }
}

describe("InterviewView", () => {
  it("renders service-provided roles, rounds, difficulties, and duration preferences", async () => {
    renderReadyView()

    expect(await screen.findByText("Senior Frontend Engineer · ByteDance")).toBeInTheDocument()
    for (const round of interviewSetupResponseMock.targetRoles[0].supportedRounds) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.rounds.${round}`) }),
      ).toBeVisible()
    }
    for (const difficulty of interviewSetupResponseMock.availableDifficulties) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.difficulty.${difficulty}`) }),
      ).toBeVisible()
    }
    for (const durationMinutes of interviewSetupResponseMock.availableDurationMinutes) {
      expect(
        screen.getByRole("button", {
          name: i18n.t("interview.setup.durationMinutes", { minutes: durationMinutes }),
        }),
      ).toBeVisible()
    }
  })

  it("updates available rounds when the selected service role changes", async () => {
    const user = userEvent.setup()
    renderReadyView(
      undefined,
      false,
      createInterviewSetupResponseMock(
        createRolesMockResponse("multipleRolesReady"),
        createProfileMockSnapshot(),
      ),
    )

    await user.click(await screen.findByTestId("interview-target-role-trigger"))
    await user.click(await screen.findByRole("option", { name: "Product Manager · Meituan" }))

    expect(
      screen.queryByRole("button", { name: i18n.t("interview.rounds.technical") }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: i18n.t("interview.rounds.hr") })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("submits the duration preference without converting it into a question count", async () => {
    const user = userEvent.setup()
    const { onStart } = renderReadyView()

    await user.click(
      await screen.findByRole("button", {
        name: i18n.t("interview.setup.durationMinutes", { minutes: 45 }),
      }),
    )
    await user.click(screen.getByRole("button", { name: i18n.t("interview.actions.start") }))

    expect(onStart).toHaveBeenCalledWith({
      ...interviewSetupResponseMock.defaultConfiguration,
      durationMinutes: 45,
    })
  })

  it("disables all setup controls while starting", async () => {
    renderReadyView(undefined, true)

    expect(
      await screen.findByRole("button", { name: i18n.t("interview.actions.starting") }),
    ).toBeDisabled()
    expect(screen.getByRole("combobox")).toBeDisabled()
    for (const round of interviewSetupResponseMock.targetRoles[0].supportedRounds) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.rounds.${round}`) }),
      ).toBeDisabled()
    }
    for (const difficulty of interviewSetupResponseMock.availableDifficulties) {
      expect(
        screen.getByRole("button", { name: i18n.t(`interview.difficulty.${difficulty}`) }),
      ).toBeDisabled()
    }
    for (const durationMinutes of interviewSetupResponseMock.availableDurationMinutes) {
      expect(
        screen.getByRole("button", {
          name: i18n.t("interview.setup.durationMinutes", { minutes: durationMinutes }),
        }),
      ).toBeDisabled()
    }
  })
})
