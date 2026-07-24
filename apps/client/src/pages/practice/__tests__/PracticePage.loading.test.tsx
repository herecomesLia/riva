import * as testing from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"

import "./practice-page-service-mock"
import * as api from "./practice-page-test-api"
import * as context from "./practice-page-test-utils"

describe("PracticePage: loading", () => {
  it("shows structured loading content while setup data is pending", async () => {
    vi.mocked(api.getPracticePage).mockReturnValue(new Promise(() => undefined))

    context.renderPracticePage()

    expect(
      await testing.screen.findByRole("heading", { name: i18n.t("practice.title") }),
    ).toBeInTheDocument()
    expect(
      testing.screen.getByRole("heading", { name: i18n.t("practice.setup.title") }),
    ).toBeInTheDocument()
    expect(testing.screen.getByTestId("practice-loading-state")).toBeInTheDocument()
  })

  it("shows a safe load error and retries", async () => {
    const user = userEvent.setup()
    vi.mocked(api.getPracticePage)
      .mockRejectedValueOnce(new Error("unsafe load details"))
      .mockResolvedValueOnce(api.createPracticeMockResponse("setupReady"))

    context.renderPracticePage()

    const alert = await testing.screen.findByRole("alert")
    expect(alert).toHaveTextContent(i18n.t("common.pageState.error.title"))
    expect(alert).not.toHaveTextContent("unsafe load details")
    await user.click(
      testing.screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )

    expect(await testing.screen.findByTestId("practice-setup-state")).toBeInTheDocument()
  })
})
