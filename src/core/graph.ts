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

import type { Node } from "./types"

// Merge tool_use + tool_result pairs into single tool_call nodes
function mergeToolCalls(nodes: Node[]): Node[] {
  // Index tool_results by their parentId (which is the tool_use id)
  const resultByToolId = new Map<string, Node>()
  for (const n of nodes) {
    if (n.nodeType.kind === "tool_result" && n.parentId) {
      resultByToolId.set(n.parentId, n)
    }
  }

  const merged: Node[] = []
  const consumedResults = new Set<string>()

  for (const n of nodes) {
    if (n.nodeType.kind === "tool_use") {
      const result = resultByToolId.get(n.id)
      if (result) consumedResults.add(result.id)
      merged.push({
        ...n,
        nodeType: {
          kind: "tool_call",
          name: n.nodeType.name,
          input: n.nodeType.input,
          output: result?.nodeType.kind === "tool_result" ? result.nodeType.output : null,
          isError: result?.nodeType.kind === "tool_result" ? result.nodeType.isError : false,
        },
      })
    } else if (n.nodeType.kind === "tool_result") {
      if (!consumedResults.has(n.id)) {
        // Orphan result with no matching tool_use — keep as-is
        merged.push(n)
      }
    } else {
      merged.push(n)
    }
  }

  return merged
}

export function buildGraph(events: SessionEvent[]): Graph {
  const rawNodes = events.flatMap(parseEventToNodes)
  rawNodes.sort((a, b) => a.timestamp - b.timestamp)
  const nodes = mergeToolCalls(rawNodes)

  const edges = nodes
    .filter(n => n.parentId)
    .map(n => ({
      from: n.parentId!,
      to: n.id,
      isBranch: n.branchLevel > 0,
    }))

  const stats = computeStats(events)

  return { nodes, edges, stats }
}
