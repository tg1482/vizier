import React from "react"
import { Box, Text } from "ink"
import type { Node, Graph } from "../core/types"
import type { ZoomLevel } from "../core/zoom"
import { filterByZoom, getVisualBranch, getZoomLabel } from "../core/zoom"

type Props = {
  graph: Graph
  currentLevel: number
  cursorInLevel: number
  zoom: ZoomLevel
  blinkState: boolean
  termWidth: number
}

function getNodeInfo(node: Node): { symbol: string; color: string } {
  switch (node.nodeType.kind) {
    case "user": return { symbol: "\u25CF", color: "cyan" }          // ●
    case "assistant": return { symbol: "\u25C9", color: "green" }    // ◉
    case "tool_use": return { symbol: "\u2B22", color: "yellow" }    // ⬢
    case "tool_result":
      return node.nodeType.isError
        ? { symbol: "\u2717", color: "red" }                         // ✗
        : { symbol: "\u2713", color: "green" }                       // ✓
    case "agent_start": return { symbol: "\u27D0", color: "magenta" } // ⟐
    case "agent_end": return { symbol: "\u27D0", color: "gray" }
    case "progress": return { symbol: "\u25CB", color: "gray" }      // ○
  }
}

function isNodeActive(graph: Graph, idx: number): boolean {
  const node = graph.nodes[idx]
  if (node.nodeType.kind !== "tool_use") return false
  const toolId = node.id
  return !graph.nodes.slice(idx + 1).some(
    n => n.parentId === toolId && n.nodeType.kind === "tool_result"
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

const ROW_LABELS: Record<number, string> = {
  0: "User ",
  1: "Asst ",
  2: "Tool ",
  3: "Tool\u00B2",
  4: "Tool\u00B3",
  5: "Tool\u2074",
}

// Column width for each node slot — matches Rust's 3-char cells (──X)
const COL_W = 3

export function Timeline({ graph, currentLevel, cursorInLevel, zoom, blinkState, termWidth }: Props) {
  const visibleIndices = filterByZoom(graph.nodes, zoom)
  if (visibleIndices.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text dimColor>No nodes at this zoom level</Text>
      </Box>
    )
  }

  // Find nodes in current level and cursor's global position
  const currentLevelPositions: number[] = []
  for (let i = 0; i < visibleIndices.length; i++) {
    if (getVisualBranch(graph.nodes[visibleIndices[i]], zoom) === currentLevel) {
      currentLevelPositions.push(i)
    }
  }
  const cursorGlobalPos = currentLevelPositions[cursorInLevel] ?? 0

  // Camera-centric windowing
  const labelW = 5 // "User " = 5 chars, matching Rust's {:<5}
  const nodesPerScreen = Math.max(1, Math.floor((termWidth - labelW - 4) / COL_W))
  const halfScreen = Math.floor(nodesPerScreen / 2)

  let start: number
  if (cursorGlobalPos < halfScreen) {
    start = 0
  } else if (cursorGlobalPos + halfScreen >= visibleIndices.length) {
    start = Math.max(0, visibleIndices.length - nodesPerScreen)
  } else {
    start = cursorGlobalPos - halfScreen
  }
  const end = Math.min(start + nodesPerScreen, visibleIndices.length)
  const windowIndices = visibleIndices.slice(start, end)
  const numCols = windowIndices.length

  // Max visual branch across ALL visible nodes (not just window) for stable height
  let maxBranch = 0
  for (const idx of visibleIndices) {
    const b = getVisualBranch(graph.nodes[idx], zoom)
    if (b > maxBranch) maxBranch = b
  }
  maxBranch = Math.min(maxBranch, 6)

  // Pre-compute connectors: when the visual branch changes between consecutive
  // nodes, place │ at the arriving column through all intermediate gap rows.
  const connectorGaps: Set<number>[] = Array.from({ length: maxBranch }, () => new Set())
  let prevBranch: number | null = null
  for (let col = 0; col < numCols; col++) {
    const branch = getVisualBranch(graph.nodes[windowIndices[col]], zoom)
    if (branch > maxBranch) continue
    if (prevBranch !== null && prevBranch !== branch) {
      const lo = Math.min(prevBranch, branch)
      const hi = Math.max(prevBranch, branch)
      for (let gap = lo; gap < hi; gap++) {
        connectorGaps[gap].add(col)
      }
    }
    prevBranch = branch
  }

  // --- Build timestamp row as spans ---
  const timeSpans: React.ReactNode[] = []
  let lastShownTime: number | null = null
  let skipNext = 0
  for (let col = 0; col < numCols; col++) {
    if (skipNext > 0) {
      skipNext--
      timeSpans.push(<Text key={`t${col}`}>{pad(COL_W)}</Text>)
      continue
    }
    const node = graph.nodes[windowIndices[col]]
    const shouldShow = lastShownTime === null
      || col % 5 === 0
      || (node.timestamp - lastShownTime) >= 60000

    if (shouldShow) {
      const t = formatTime(node.timestamp)
      // time is 5 chars, padded to COL_W * 2 across two columns
      timeSpans.push(<Text key={`t${col}`} dimColor>{t.padEnd(COL_W * 2)}</Text>)
      lastShownTime = node.timestamp
      skipNext = 1 // next col is consumed by this timestamp's width
    } else {
      timeSpans.push(<Text key={`t${col}`}>{pad(COL_W)}</Text>)
    }
  }

  // --- Build branch rows ---
  const rows: React.ReactNode[] = []
  for (let vb = 0; vb <= maxBranch; vb++) {
    const label = ROW_LABELS[vb] ?? "Tool\u207A"
    const isCurrentRow = vb === currentLevel

    // Build this row's cells as inline spans inside one <Text>
    const cellSpans: React.ReactNode[] = []
    for (let col = 0; col < numCols; col++) {
      const idx = windowIndices[col]
      const node = graph.nodes[idx]
      const nodeBranch = getVisualBranch(node, zoom)

      if (nodeBranch === vb) {
        const { symbol, color } = getNodeInfo(node)
        const isCursor = isCurrentRow && (start + col) === cursorGlobalPos
        const active = isNodeActive(graph, idx)
        const displaySymbol = active ? (blinkState ? "\u25D0" : "\u25D1") : symbol

        // Each cell: "──X" = 3 chars (connector + symbol)
        if (isCursor) {
          cellSpans.push(
            <Text key={col}>
              <Text dimColor>{"──"}</Text>
              <Text backgroundColor="white" color="black" bold>{displaySymbol}</Text>
            </Text>
          )
        } else if (active) {
          cellSpans.push(
            <Text key={col}>
              <Text dimColor>{"──"}</Text>
              <Text color="yellow" bold>{displaySymbol}</Text>
            </Text>
          )
        } else {
          cellSpans.push(
            <Text key={col}>
              <Text dimColor>{"──"}</Text>
              <Text color={color}>{displaySymbol}</Text>
            </Text>
          )
        }
      } else {
        cellSpans.push(<Text key={col}>{pad(COL_W)}</Text>)
      }
    }

    rows.push(
      <Text key={`row-${vb}`}>
        <Text color={isCurrentRow ? "yellow" : undefined} bold={isCurrentRow} dimColor={!isCurrentRow}>
          {label.padEnd(labelW)}
        </Text>
        {cellSpans}
      </Text>
    )

    // Connector row between branch rows — always present to keep height stable
    if (vb < maxBranch) {
      const connSpans: React.ReactNode[] = []
      for (let col = 0; col < numCols; col++) {
        if (connectorGaps[vb].has(col)) {
          // "│  " — connector at start of cell (3 chars), visually adjacent to prev symbol
          connSpans.push(<Text key={col} dimColor>{"\u2502  "}</Text>)
        } else {
          connSpans.push(<Text key={col}>{pad(COL_W)}</Text>)
        }
      }
      rows.push(
        <Text key={`conn-${vb}`}>
          {pad(labelW)}
          {connSpans}
        </Text>
      )
    }
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text>
        <Text color="magenta" bold>[{getZoomLabel(zoom)}] </Text>
        <Text color="green" bold>{"\u25CF"} LIVE </Text>
        <Text dimColor>h/l:nav j/k:level t:timeline d:details s:sessions z:focus i:input q:quit</Text>
      </Text>
      <Text>{" "}</Text>
      <Text>
        {"Time".padEnd(labelW)}
        {timeSpans}
      </Text>
      <Text>{" "}</Text>
      {rows}
    </Box>
  )
}

function pad(n: number): string {
  return " ".repeat(n)
}
