import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@/i18n/i18n"
import { defaultLanguage } from "@/i18n/resources"
import { createProfileMockSnapshot } from "@/mocks/data/profile"
import { ProfileHeader } from "@/pages/profile/components/ProfileHeader"
import { renderWithProviders } from "@/test/render"

function profileWithResume(resume: "legacy" | "none") {
  const profile = createProfileMockSnapshot("complete").profile!
  return { ...profile, resume: resume === "legacy" ? profile.resume : null }
}

describe("ProfileHeader", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows Upload resume when hasResume is false", () => {
    renderWithProviders(
      <ProfileHeader
        hasResume={false}
        onOpenResume={vi.fn()}
        profile={profileWithResume("none")}
      />,
      { router: false },
    )

    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.uploadResume") }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).not.toBeInTheDocument()
  })

  it("shows Update resume for a ResumeDocument even when profile.resume is null", () => {
    renderWithProviders(
      <ProfileHeader hasResume onOpenResume={vi.fn()} profile={profileWithResume("none")} />,
      { router: false },
    )

    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.actions.uploadResume") }),
    ).not.toBeInTheDocument()
  })

  it("obeys hasResume=false even when legacy profile.resume exists", () => {
    renderWithProviders(
      <ProfileHeader
        hasResume={false}
        onOpenResume={vi.fn()}
        profile={profileWithResume("legacy")}
      />,
      { router: false },
    )

    expect(
      screen.getByRole("button", { name: i18n.t("profile.actions.uploadResume") }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.actions.updateResume") }),
    ).not.toBeInTheDocument()
  })
})
