import type { SessionStats, Usage } from "./types"

export type TokenInput = {
  usage?: Usage
  model?: string
  cost?: number
}

export function computeStats(items: TokenInput[]): SessionStats {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheRead = 0
  let totalCacheCreation = 0
  let totalReasoningTokens = 0
  let totalCost = 0
  let model: string | null = null

  for (const item of items) {
    const u = item.usage
    if (u) {
      totalInputTokens += u.input_tokens ?? 0
      totalOutputTokens += u.output_tokens ?? 0
      totalCacheRead += u.cache_read_input_tokens ?? 0
      totalCacheCreation += u.cache_creation_input_tokens ?? 0
      totalReasoningTokens += u.reasoning_tokens ?? 0
    }
    if (item.cost) totalCost += item.cost
    if (item.model) model = item.model
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheRead,
    totalCacheCreation,
    model,
    totalCost: totalCost || undefined,
    totalReasoningTokens: totalReasoningTokens || undefined,
  }
}

export function emptyStats(): SessionStats {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    model: null,
  }
}
