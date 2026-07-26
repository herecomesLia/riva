import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LocalizedMonthPicker } from "@/components/ui/month-picker"
import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { renderWithProviders } from "@/test/render"

function renderPicker({
  disabled = false,
  onChange = vi.fn(),
  value = "2014-09",
}: {
  disabled?: boolean
  onChange?: (value: string) => void
  value?: string
} = {}) {
  return {
    onChange,
    ...renderWithProviders(
      <LocalizedMonthPicker
        disabled={disabled}
        id="test-month"
        onChange={onChange}
        value={value}
      />,
      { router: false },
    ),
  }
}

async function chooseMonth(year: string, month: string) {
  const user = userEvent.setup()

  await user.click(screen.getByLabelText(i18n.t("profile.monthPicker.year")))
  await user.click(await screen.findByRole("option", { name: year }))
  await user.click(screen.getByLabelText(i18n.t("profile.monthPicker.month")))
  await user.click(await screen.findByRole("option", { name: month }))
}

describe("LocalizedMonthPicker", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("formats a selected month in Chinese", () => {
    renderPicker()

    expect(screen.getByRole("button", { name: /2014年9月/ })).toBeInTheDocument()
  })

  it("formats a selected month in English", async () => {
    await i18n.changeLanguage("en")
    renderPicker()

    expect(screen.getByRole("button", { name: /September 2014/ })).toBeInTheDocument()
  })

  it("renders the localized placeholder for an empty value", async () => {
    const { rerender } = renderPicker({ value: "" })

    expect(screen.getByRole("button", { name: "选择月份" })).toBeInTheDocument()

    await i18n.changeLanguage("en")
    rerender(<LocalizedMonthPicker id="test-month" onChange={vi.fn()} value="" />)
    expect(screen.getByRole("button", { name: "Select month" })).toBeInTheDocument()
  })

  it("returns YYYY-MM after selecting a year and month", async () => {
    await i18n.changeLanguage("en")
    const user = userEvent.setup()
    const { onChange } = renderPicker({ value: "" })

    await user.click(screen.getByRole("button", { name: "Select month" }))
    await chooseMonth("2014", "September")

    expect(onChange).toHaveBeenCalledWith("2014-09")
  })

  it("clears the value and closes the popover", async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker()

    await user.click(screen.getByRole("button", { name: /2014年9月/ }))
    await user.click(screen.getByRole("button", { name: i18n.t("profile.monthPicker.clear") }))

    expect(onChange).toHaveBeenCalledWith("")
    expect(screen.queryByText(i18n.t("profile.monthPicker.year"))).not.toBeInTheDocument()
  })

  it("does not change the value when the popover is only opened", async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker()

    await user.click(screen.getByRole("button", { name: /2014年9月/ }))

    expect(screen.getByText(i18n.t("profile.monthPicker.year"))).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("does not open or change when disabled", async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({ disabled: true })
    const trigger = screen.getByRole("button", { name: /2014年9月/ })

    expect(trigger).toBeDisabled()
    await user.click(trigger)
    expect(screen.queryByText(i18n.t("profile.monthPicker.year"))).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("reformats on language change without changing the underlying value", async () => {
    const { onChange } = renderPicker()

    expect(screen.getByRole("button", { name: /2014年9月/ })).toBeInTheDocument()
    await i18n.changeLanguage("en")
    expect(await screen.findByRole("button", { name: /September 2014/ })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
