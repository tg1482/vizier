import { describe, it, expect } from "bun:test"
import { computeStats, emptyStats } from "../src/core/stats"

describe("computeStats", () => {
  it("returns zeros for empty input", () => {
    const s = computeStats([])
    expect(s.totalInputTokens).toBe(0)
    expect(s.totalOutputTokens).toBe(0)
    expect(s.totalCacheRead).toBe(0)
    expect(s.totalCacheCreation).toBe(0)
    expect(s.model).toBeNull()
    expect(s.totalCost).toBeUndefined()
    expect(s.totalReasoningTokens).toBeUndefined()
  })

  it("aggregates tokens from multiple items", () => {
    const s = computeStats([
      { usage: { input_tokens: 100, output_tokens: 50 } },
      { usage: { input_tokens: 200, output_tokens: 75 } },
    ])
    expect(s.totalInputTokens).toBe(300)
    expect(s.totalOutputTokens).toBe(125)
  })

  it("aggregates cache and reasoning tokens", () => {
    const s = computeStats([
      { usage: { cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, reasoning_tokens: 200 } },
      { usage: { cache_read_input_tokens: 2000, reasoning_tokens: 300 } },
    ])
    expect(s.totalCacheRead).toBe(3000)
    expect(s.totalCacheCreation).toBe(500)
    expect(s.totalReasoningTokens).toBe(500)
  })

  it("tracks model as last-wins", () => {
    const s = computeStats([
      { model: "claude-3-opus" },
      { model: "claude-3-sonnet" },
    ])
    expect(s.model).toBe("claude-3-sonnet")
  })

  it("aggregates cost, omits when zero", () => {
    const s0 = computeStats([{ cost: 0 }, {}])
    expect(s0.totalCost).toBeUndefined()

    const s1 = computeStats([{ cost: 0.05 }, { cost: 0.03 }])
    expect(s1.totalCost).toBeCloseTo(0.08)
  })

  it("handles items with no usage gracefully", () => {
    const s = computeStats([
      {},
      { usage: { input_tokens: 10 } },
      { model: "gpt-4" },
    ])
    expect(s.totalInputTokens).toBe(10)
    expect(s.totalOutputTokens).toBe(0)
    expect(s.model).toBe("gpt-4")
  })
})

describe("emptyStats", () => {
  it("returns all zeros with null model", () => {
    const s = emptyStats()
    expect(s.totalInputTokens).toBe(0)
    expect(s.model).toBeNull()
  })
})
