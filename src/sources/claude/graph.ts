import type { SessionEvent, Graph, SessionStats } from "../../core/types"
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

import type { Node } from "../../core/types"

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
  // 1. Scan progress events to build agentId → parentToolUseId mapping
  const agentToParentToolUse = new Map<string, string>()
  for (const event of events) {
    if (event.type === "progress" && event.data?.type === "agent_progress" && event.data.agentId && event.parentToolUseID) {
      agentToParentToolUse.set(event.data.agentId, event.parentToolUseID)
    }
  }

  // 2. Pack agents into lanes — sequential agents share a lane,
  //    only parallel agents get separate branchLevels
  const agentSpans = new Map<string, { start: number; end: number }>()
  for (const event of events) {
    const aid = event.agentId
    if (!aid) continue
    const ts = new Date(event.timestamp).getTime()
    const span = agentSpans.get(aid)
    if (!span) {
      agentSpans.set(aid, { start: ts, end: ts })
    } else {
      if (ts < span.start) span.start = ts
      if (ts > span.end) span.end = ts
    }
  }

  // Sort agents by start time, then greedily assign lowest non-overlapping lane
  const sorted = [...agentSpans.entries()].sort((a, b) => a[1].start - b[1].start)
  const lanes: { end: number }[] = [] // lanes[i].end = latest end time in lane i
  const agentToBranch = new Map<string, number>()
  for (const [aid, span] of sorted) {
    let assigned = -1
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].end <= span.start) {
        assigned = i
        lanes[i].end = span.end
        break
      }
    }
    if (assigned < 0) {
      assigned = lanes.length
      lanes.push({ end: span.end })
    }
    agentToBranch.set(aid, assigned + 1) // branchLevel 1-based
  }

  const rawNodes = events.flatMap(parseEventToNodes)
  rawNodes.sort((a, b) => a.timestamp - b.timestamp)
  const merged = mergeToolCalls(rawNodes)

  // 3. Set branchLevel for agent nodes, filter out agent user nodes,
  //    and link first agent node to parent tool_use
  const linkedAgents = new Set<string>()
  const nodes: Node[] = []
  for (const node of merged) {
    if (!node.agentId) {
      nodes.push(node)
      continue
    }
    // Skip agent user nodes — redundant with Task tool_call input
    if (node.nodeType.kind === "user") continue

    const bl = agentToBranch.get(node.agentId) ?? 0
    const updated = { ...node, branchLevel: bl }

    // Link first node of each agent to its parent tool_use
    if (!linkedAgents.has(node.agentId)) {
      linkedAgents.add(node.agentId)
      const parentToolId = agentToParentToolUse.get(node.agentId)
      if (parentToolId) {
        updated.parentId = parentToolId
      }
    }

    nodes.push(updated)
  }

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
