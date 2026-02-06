import type { Node } from "./types"

export type ZoomLevel = "sessions" | "conversations" | "details" | "focus"
export type CellMode = "symbol" | "preview"

// Extract first N words from text, truncated to maxLen chars
function firstWords(text: string, n: number, maxLen: number): string {
  const words = text.trim().split(/\s+/).slice(0, n).join(" ")
  return words.length <= maxLen ? words : words.slice(0, maxLen - 1) + "…"
}

// Short content preview for a node — pure function, no IO
export function getNodePreview(node: Node, maxLen = 18): string {
  switch (node.nodeType.kind) {
    case "user": return firstWords(node.nodeType.text, 5, maxLen)
    case "assistant": return firstWords(node.nodeType.text, 5, maxLen)
    case "tool_call": return node.nodeType.name
    case "tool_use": return node.nodeType.name
    case "tool_result": return node.nodeType.isError ? "error" : "ok"
    case "agent_start": return node.nodeType.agentType
    case "agent_end": return "end"
    case "progress": return firstWords(node.nodeType.text, 3, maxLen)
  }
}

// For each branch row, find the most recent node at or before `beforeGlobalCol`
// Returns the node index into graph.nodes, or null if none exists
export function findStickyNode(
  nodes: Node[],
  visibleIndices: number[],
  branch: number,
  beforeGlobalCol: number,
  zoom: ZoomLevel,
): number | null {
  let best: number | null = null
  for (let i = 0; i < beforeGlobalCol && i < visibleIndices.length; i++) {
    const idx = visibleIndices[i]
    if (getVisualBranch(nodes[idx], zoom) === branch) {
      best = idx
    }
  }
  return best
}

export function zoomIn(level: ZoomLevel): ZoomLevel {
  switch (level) {
    case "sessions": return "conversations"
    case "conversations": return "details"
    case "details": return "focus"
    case "focus": return "focus"
  }
}

export function zoomOut(level: ZoomLevel): ZoomLevel {
  switch (level) {
    case "sessions": return "sessions"
    case "conversations": return "sessions"
    case "details": return "conversations"
    case "focus": return "details"
  }
}

export function filterByZoom(nodes: Node[], level: ZoomLevel): number[] {
  switch (level) {
    case "sessions":
      return nodes.length === 0 ? [] : [0, nodes.length - 1]
    case "conversations":
      return nodes
        .map((n, i) => {
          // Main session: user + assistant only
          if (n.branchLevel === 0) {
            return (n.nodeType.kind === "user" || n.nodeType.kind === "assistant") ? i : -1
          }
          // Agent: assistant only (tools filtered via getVisualBranch returning -1)
          return n.nodeType.kind === "assistant" ? i : -1
        })
        .filter(i => i >= 0)
    case "details":
    case "focus":
      return nodes.map((_, i) => i)
  }
}

export function getVisualBranch(node: Node, level: ZoomLevel): number {
  switch (level) {
    case "conversations":
      if (node.branchLevel > 0) {
        // Show agent assistant nodes on offset rows, skip tools
        if (node.nodeType.kind === "assistant") {
          return 2 + node.branchLevel
        }
        return -1 // filtered out by caller
      }
      switch (node.nodeType.kind) {
        case "user": return 0
        case "assistant": return 1
        default: return 2
      }
    case "details":
    case "focus":
      if (node.branchLevel > 0) {
        // Each agent gets 2 rows: asst + tool
        // Agent 1 (branchLevel=1) → rows 3,4
        // Agent 2 (branchLevel=2) → rows 5,6
        const base = 3 + (node.branchLevel - 1) * 2
        return node.nodeType.kind === "assistant" ? base : base + 1
      }
      // Main session unchanged
      switch (node.nodeType.kind) {
        case "user": return 0
        case "assistant": return 1
        default: return 2
      }
    case "sessions":
      return 0
  }
}

export function getZoomLabel(level: ZoomLevel): string {
  switch (level) {
    case "sessions": return "SESSIONS"
    case "conversations": return "CONVERSATIONS"
    case "details": return "DETAILS"
    case "focus": return "FOCUS"
  }
}
