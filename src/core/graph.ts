import type { SessionEvent, Graph, SessionStats } from "./types"
import { parseEventToNodes } from "./parser"

function computeStats(events: SessionEvent[]): SessionStats {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheRead = 0
  let totalCacheCreation = 0
  let model: string | null = null

  for (const event of events) {
    const usage = event.message?.usage
    if (!usage) continue
    totalInputTokens += usage.input_tokens ?? 0
    totalOutputTokens += usage.output_tokens ?? 0
    totalCacheRead += usage.cache_read_input_tokens ?? 0
    totalCacheCreation += usage.cache_creation_input_tokens ?? 0
    if (event.message?.model) model = event.message.model
  }

  return { totalInputTokens, totalOutputTokens, totalCacheRead, totalCacheCreation, model }
}

export function buildGraph(events: SessionEvent[]): Graph {
  const nodes = events.flatMap(parseEventToNodes)
  const edges = nodes
    .filter(n => n.parentId)
    .map(n => ({
      from: n.parentId!,
      to: n.id,
      isBranch: n.branchLevel > 0,
    }))

  nodes.sort((a, b) => a.timestamp - b.timestamp)
  const stats = computeStats(events)

  return { nodes, edges, stats }
}
