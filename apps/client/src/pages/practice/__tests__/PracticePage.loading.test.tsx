import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import "./practice-page-service-mock"
import { i18n } from "@/i18n/i18n"
import * as api from "./practice-page-test-api"
import { renderPracticePage } from "./practice-page-test-utils"

describe("PracticePage: loading", () => {
  it("shows structured loading content while active-session discovery is pending", async () => {
    vi.mocked(api.getActivePractice).mockReturnValue(new Promise(() => undefined))
    renderPracticePage()
    expect(await screen.findByTestId("practice-loading-state")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: i18n.t("practice.setup.title") }),
    ).toBeInTheDocument()
  })
  it("shows a safe load error and retries the read", async () => {
    vi.mocked(api.getActivePractice).mockRejectedValueOnce(new Error("unsafe details"))
    renderPracticePage()
    expect(await screen.findByRole("alert")).not.toHaveTextContent("unsafe details")
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }),
    )
    expect(await screen.findByTestId("practice-setup-state")).toBeInTheDocument()
    expect(api.createPractice).not.toHaveBeenCalled()
  })
})
