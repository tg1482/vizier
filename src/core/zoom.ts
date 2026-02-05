import type { Node } from "./types"

export type ZoomLevel = "sessions" | "conversations" | "details" | "focus"

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
        .map((n, i) => (n.nodeType.kind === "user" || n.nodeType.kind === "assistant") ? i : -1)
        .filter(i => i >= 0)
    case "details":
    case "focus":
      return nodes.map((_, i) => i)
  }
}

export function getVisualBranch(node: Node, level: ZoomLevel): number {
  switch (level) {
    case "conversations":
      switch (node.nodeType.kind) {
        case "user": return 0
        case "assistant": return 1
        default: return 2
      }
    case "details":
    case "focus":
      switch (node.nodeType.kind) {
        case "user": return 0
        case "assistant": return 1
        default: return 2 + node.branchLevel
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
