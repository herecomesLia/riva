import { describe, expect, it } from "vitest"

import { parseBulletItems } from "./text"

describe("parseBulletItems", () => {
  it("parses explicit multiline bullet and numbered lists", () => {
    expect(parseBulletItems("• 负责前端架构\n2. 维护组件库\n- 推动无障碍规范")).toEqual([
      "负责前端架构",
      "维护组件库",
      "推动无障碍规范",
    ])
  })

  it("parses multiple lines, semicolons, and sentence endings", () => {
    expect(parseBulletItems("第一项；第二项;第三项")).toEqual(["第一项", "第二项", "第三项"])
    expect(parseBulletItems("负责架构设计。维护组件库！推动性能优化？")).toEqual([
      "负责架构设计",
      "维护组件库",
      "推动性能优化",
    ])
    expect(parseBulletItems("Build the platform. Improve accessibility.")).toEqual([
      "Build the platform",
      "Improve accessibility",
    ])
  })

  it("does not split periods in technology names or numbers and keeps ambiguous text intact", () => {
    expect(parseBulletItems("React.js 1.2 is used for the product")).toEqual([
      "React.js 1.2 is used for the product",
    ])
    expect(parseBulletItems("负责商家工作台前端架构设计，维护组件库")).toEqual([
      "负责商家工作台前端架构设计，维护组件库",
    ])
  })

  it("normalizes whitespace and removes exact duplicates without changing order", () => {
    expect(parseBulletItems("-  第一项\n- 第一项\n-  第二项  ")).toEqual(["第一项", "第二项"])
  })
})
