import type { SessionEvent, Graph } from "./types"
import { parseEventToNodes } from "./parser"

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

  return { nodes, edges }
}
