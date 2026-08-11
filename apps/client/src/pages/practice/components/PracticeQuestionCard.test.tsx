import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"
import { renderWithProviders } from "@/test/render"

import { PracticeQuestionCard } from "./PracticeQuestionCard"

describe("PracticeQuestionCard", () => {
  it("renders structured recommended materials by label without exposing IDs", () => {
    const response = createPracticeMockResponse("answeringQuestion")
    if (response.session.status !== "answering") throw new Error("Answering fixture required.")
    const material = response.session.question.recommendedMaterials[0]
    if (!material) throw new Error("Recommended material fixture required.")

    renderWithProviders(<PracticeQuestionCard question={response.session.question} />, {
      router: false,
    })

    expect(screen.getByText(material.label)).toBeInTheDocument()
    expect(screen.queryByText(material.id)).not.toBeInTheDocument()
    expect(screen.queryByText(material.reason)).not.toBeInTheDocument()
  })
})
