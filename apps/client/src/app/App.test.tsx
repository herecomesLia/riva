import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthBootstrap } from "@/app/App"
import { getCurrentUser } from "@/services/auth"
import { i18n } from "@/i18n/i18n"
import { renderWithProviders } from "@/test/render"

vi.mock("@/services/auth", () => ({
  getCurrentUser: vi.fn(),
}))

const getCurrentUserMock = vi.mocked(getCurrentUser)

function createDeferred() {
  let resolve!: (value: null) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<null>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function renderBootstrap() {
  return renderWithProviders(
    <StrictMode>
      <AuthBootstrap>
        <div>App router</div>
      </AuthBootstrap>
    </StrictMode>,
    { router: false },
  )
}

describe("AuthBootstrap", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
  })

  it("holds the router until the startup session restore completes", async () => {
    const request = createDeferred()
    getCurrentUserMock.mockReturnValue(request.promise)

    renderBootstrap()

    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("common.pageState.loading.title"))
    expect(screen.queryByText("App router")).not.toBeInTheDocument()
    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalledTimes(1))

    await act(async () => request.resolve(null))

    expect(await screen.findByText("App router")).toBeInTheDocument()
  })

  it("shows a safe retry state when restoration fails", async () => {
    const user = userEvent.setup()
    const retry = createDeferred()
    getCurrentUserMock
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockReturnValueOnce(retry.promise)

    renderBootstrap()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("common.pageState.error.title"),
    )
    expect(screen.queryByText("database unavailable")).not.toBeInTheDocument()
    expect(screen.queryByText("App router")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: i18n.t("common.pageState.error.retry") }))

    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    await act(async () => retry.resolve(null))

    expect(await screen.findByText("App router")).toBeInTheDocument()
    expect(getCurrentUserMock).toHaveBeenCalledTimes(2)
  })
})
