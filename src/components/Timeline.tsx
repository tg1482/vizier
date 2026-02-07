import React from "react"
import { Box, Text } from "ink"
import type { Node, Graph } from "../core/types"
import type { ZoomLevel, CellMode } from "../core/zoom"
import { filterByZoom, getVisualBranch, getZoomLabel, getNodePreview, findStickyNode } from "../core/zoom"

type Props = {
  graph: Graph
  currentLevel: number
  cursorInLevel: number
  zoom: ZoomLevel
  cellMode: CellMode
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
    case "tool_call":
      if (node.nodeType.output === null) return { symbol: "\u2B22", color: "yellow" }  // ⬢ pending
      return node.nodeType.isError
        ? { symbol: "\u2717", color: "red" }                         // ✗ failed
        : { symbol: "\u2713", color: "green" }                       // ✓ success
    case "agent_start": return { symbol: "\u27D0", color: "magenta" } // ⟐
    case "agent_end": return { symbol: "\u27D0", color: "gray" }
    case "progress": return { symbol: "\u25CB", color: "gray" }      // ○
    case "reasoning": return { symbol: "\u25C7", color: "gray" }     // ◇
    case "patch": return { symbol: "\u25A0", color: "blue" }         // ■
  }
}

function isNodeActive(_graph: Graph, idx: number): boolean {
  const node = _graph.nodes[idx]
  if (node.nodeType.kind === "tool_call") return node.nodeType.output === null
  if (node.nodeType.kind === "tool_use") {
    return !_graph.nodes.slice(idx + 1).some(
      n => n.parentId === node.id && n.nodeType.kind === "tool_result"
    )
  }
  return false
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

function getRowLabel(row: number): string {
  if (row === 0) return "User "
  if (row === 1) return "Asst "
  if (row === 2) return "Tool "
  // Agent rows: pairs of (Asst, Tool) starting at row 3
  // Row 3,5,7,... = " Asst" (indented)
  // Row 4,6,8,... = " Tool" (indented)
  return (row - 3) % 2 === 0 ? " Asst" : " Tool"
}

// Column widths per cell mode
// Symbol: "──X" = 3 chars
// Preview: "──X preview text    " = 22 chars (same ── prefix, symbol, then padded text)
const COL_W_SYMBOL = 3
const COL_W_PREVIEW = 22
const PREVIEW_TEXT_W = COL_W_PREVIEW - 3  // 19 chars after "──X" for " preview text"

// Sticky column widths per mode
const STICKY_W_SYMBOL = 2           // "●│"
const STICKY_W_PREVIEW = COL_W_PREVIEW  // full width

function getColW(mode: CellMode): number {
  return mode === "preview" ? COL_W_PREVIEW : COL_W_SYMBOL
}

function getStickyW(mode: CellMode): number {
  return mode === "preview" ? STICKY_W_PREVIEW : STICKY_W_SYMBOL
}

// Detail line: only for node types where it adds info beyond the preview
function getNodeDetailLine(node: Node, maxLen: number): string {
  const trunc = (s: string) => {
    const clean = s.replace(/[\n\r]+/g, " ").trim()
    return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "\u2026" : clean
  }
  const t = node.nodeType
  switch (t.kind) {
    case "tool_call": return trunc(t.input)
    case "tool_use": return trunc(t.input)
    case "tool_result": return trunc(t.output)
    default: return ""
  }
}

// --- Peek: expanded preview for cursor node ---
const PEEK_BODY_LINES = 2

function getNodePeekLabel(node: Node): { text: string; color: string; usage: string } {
  let label = ""
  let color = "gray"
  const t = node.nodeType
  switch (t.kind) {
    case "user": label = "User"; color = "cyan"; break
    case "assistant": label = "Asst"; color = "green"; break
    case "tool_call": {
      const status = t.output === null ? "PENDING" : t.isError ? "ERROR" : "OK"
      label = `${t.name} [${status}]`
      color = t.output === null ? "yellow" : t.isError ? "red" : "green"
      break
    }
    case "tool_use": label = t.name; color = "yellow"; break
    case "tool_result": {
      label = t.isError ? "Result [ERROR]" : "Result [OK]"
      color = t.isError ? "red" : "green"
      break
    }
    case "agent_start": label = `Agent: ${t.agentType}`; color = "magenta"; break
    case "agent_end": label = "Agent End"; color = "gray"; break
    case "progress": label = "Progress"; color = "gray"; break
    case "reasoning": label = "Reasoning"; color = "gray"; break
    case "patch": label = `Patch: ${t.files.length} files`; color = "blue"; break
  }
  let usage = ""
  if (node.usage) {
    const u = node.usage
    const parts: string[] = []
    if (u.input_tokens || u.output_tokens) parts.push(`t:${(u.input_tokens ?? 0) + (u.output_tokens ?? 0)}`)
    if (u.cache_read_input_tokens) parts.push(`cr:${u.cache_read_input_tokens}`)
    if (u.cache_creation_input_tokens) parts.push(`cc:${u.cache_creation_input_tokens}`)
    usage = parts.join(" ")
  }
  return { text: label, color, usage }
}

function getNodePeekLines(node: Node, maxWidth: number, maxLines: number): string[] {
  const trunc = (s: string) => {
    const clean = s.replace(/\r/g, "")
    return clean.length > maxWidth ? clean.slice(0, maxWidth - 1) + "\u2026" : clean
  }

  let rawText = ""
  const t = node.nodeType
  switch (t.kind) {
    case "user": rawText = t.text; break
    case "assistant": rawText = t.text; break
    case "progress": rawText = t.text; break
    case "tool_call": rawText = t.input; break
    case "tool_use": rawText = t.input; break
    case "tool_result": rawText = t.output; break
    case "agent_start": rawText = `Type: ${t.agentType}  ID: ${t.agentId}`; break
    case "agent_end": rawText = `ID: ${t.agentId}`; break
    case "reasoning": rawText = t.text; break
    case "patch": rawText = t.files.join("\n"); break
  }

  // For tool inputs, try to format JSON as key: value pairs
  if (t.kind === "tool_call" || t.kind === "tool_use") {
    try {
      const parsed = JSON.parse(rawText)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const lines: string[] = []
        for (const [key, val] of Object.entries(parsed)) {
          if (lines.length >= maxLines) break
          const valStr = typeof val === "string"
            ? val.replace(/\n/g, " ").replace(/\r/g, "")
            : JSON.stringify(val)
          lines.push(trunc(`${key}: ${valStr}`))
        }
        return lines
      }
    } catch { /* fall through */ }
  }

  const lines: string[] = []
  for (const l of rawText.split("\n")) {
    if (lines.length >= maxLines) break
    lines.push(trunc(l))
  }
  return lines
}

export function Timeline({ graph, currentLevel, cursorInLevel, zoom, cellMode, blinkState, termWidth }: Props) {
  const isPreview = cellMode === "preview"
  const colW = getColW(cellMode)
  const stickyW = getStickyW(cellMode)
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

  // Peek: cursor node for expanded preview
  const peekNodeGlobalIdx = cursorGlobalPos < visibleIndices.length ? visibleIndices[cursorGlobalPos] : undefined
  const cursorNode = peekNodeGlobalIdx !== undefined ? graph.nodes[peekNodeGlobalIdx] : null
  const peekLabel = cursorNode ? getNodePeekLabel(cursorNode) : null
  const peekMaxW = termWidth - 10
  const peekLines = cursorNode ? getNodePeekLines(cursorNode, peekMaxW, PEEK_BODY_LINES) : []

  // Camera-centric windowing — reserve space for sticky column
  const labelW = 5
  const availW = termWidth - labelW - 4 - stickyW
  const nodesPerScreen = Math.max(1, Math.floor(availW / colW))
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
  maxBranch = Math.min(maxBranch, 14) // 3 main rows + up to ~5 parallel agents × 2 rows

  // Pre-compute connectors: │ at the start of the cell (position 0)
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

  // --- Sticky: for each branch, find the most recent node before the window ---
  // Only for main session rows (0-2) — agent rows don't need sticky context
  const stickyNodes: Map<number, number> = new Map()
  for (let vb = 0; vb <= Math.min(maxBranch, 2); vb++) {
    let hasVisibleNode = false
    for (let col = 0; col < numCols; col++) {
      if (getVisualBranch(graph.nodes[windowIndices[col]], zoom) === vb) {
        hasVisibleNode = true
        break
      }
    }
    if (!hasVisibleNode) {
      const sticky = findStickyNode(graph.nodes, visibleIndices, vb, start, zoom)
      if (sticky !== null) stickyNodes.set(vb, sticky)
    }
  }
  const hasAnyStickyNode = stickyNodes.size > 0

  // --- Build timestamp row ---
  const timeSpans: React.ReactNode[] = []
  let lastShownTime: number | null = null
  let skipNext = 0
  const timeInterval = isPreview ? 1 : 5
  for (let col = 0; col < numCols; col++) {
    if (skipNext > 0) {
      skipNext--
      timeSpans.push(<Text key={`t${col}`}>{pad(colW)}</Text>)
      continue
    }
    const node = graph.nodes[windowIndices[col]]
    const shouldShow = lastShownTime === null
      || col % timeInterval === 0
      || (node.timestamp - lastShownTime) >= 60000

    if (shouldShow) {
      const t = formatTime(node.timestamp)
      if (isPreview) {
        timeSpans.push(<Text key={`t${col}`} dimColor>{t.padEnd(colW)}</Text>)
        lastShownTime = node.timestamp
      } else {
        timeSpans.push(<Text key={`t${col}`} dimColor>{t.padEnd(colW * 2)}</Text>)
        lastShownTime = node.timestamp
        skipNext = 1
      }
    } else {
      timeSpans.push(<Text key={`t${col}`}>{pad(colW)}</Text>)
    }
  }

  // --- Render a node cell (both modes) ---
  function renderNodeCell(
    node: Node, idx: number, isCursor: boolean, key: string | number,
  ): React.ReactNode {
    const { symbol, color } = getNodeInfo(node)
    const active = isNodeActive(graph, idx)
    const displaySymbol = active ? (blinkState ? "\u25D0" : "\u25D1") : symbol

    // Preview: "──● preview text    " — same ── prefix, then text fills remaining space
    const previewTail = isPreview
      ? (" " + getNodePreview(node, PREVIEW_TEXT_W - 1)).padEnd(PREVIEW_TEXT_W)
      : ""

    if (isCursor) {
      return (
        <Text key={key}>
          <Text dimColor>{"──"}</Text>
          <Text backgroundColor="white" color="black" bold>{displaySymbol}</Text>
          {previewTail && <Text backgroundColor="white" color="black">{previewTail}</Text>}
        </Text>
      )
    }
    if (active) {
      return (
        <Text key={key}>
          <Text dimColor>{"──"}</Text>
          <Text color="yellow" bold>{displaySymbol}</Text>
          {previewTail && <Text color="yellow">{previewTail}</Text>}
        </Text>
      )
    }
    return (
      <Text key={key}>
        <Text dimColor>{"──"}</Text>
        <Text color={color}>{displaySymbol}</Text>
        {previewTail && <Text dimColor>{previewTail}</Text>}
      </Text>
    )
  }

  // --- Render a sticky cell ---
  function renderStickyCell(nodeIdx: number, key: string): React.ReactNode {
    const node = graph.nodes[nodeIdx]
    const { symbol, color } = getNodeInfo(node)

    if (isPreview) {
      const preview = getNodePreview(node, PREVIEW_TEXT_W - 1)
      return (
        <Text key={key}>
          <Text color={color}>{symbol}</Text>
          <Text dimColor>{" " + preview.padEnd(stickyW - 3)}</Text>
          <Text dimColor>{"\u2502"}</Text>
        </Text>
      )
    }
    return (
      <Text key={key}>
        <Text color={color}>{symbol}</Text>
        <Text dimColor>{"\u2502"}</Text>
      </Text>
    )
  }

  // --- Render sticky connector (between branch rows) ---
  function renderStickyConnector(vb: number, key: string): React.ReactNode {
    const hasSticky = stickyNodes.has(vb) || stickyNodes.has(vb + 1)
    if (!hasSticky) return <Text key={key}>{pad(stickyW)}</Text>
    if (isPreview) {
      return <Text key={key} dimColor>{pad(stickyW - 1) + "\u2502"}</Text>
    }
    return <Text key={key} dimColor>{" \u2502"}</Text>
  }

  // --- Build branch rows ---
  const rows: React.ReactNode[] = []
  for (let vb = 0; vb <= maxBranch; vb++) {
    const label = getRowLabel(vb)
    const isCurrentRow = vb === currentLevel
    const sticky = stickyNodes.get(vb)

    const cellSpans: React.ReactNode[] = []

    // Sticky column first
    if (hasAnyStickyNode) {
      if (sticky !== undefined) {
        cellSpans.push(renderStickyCell(sticky, `sticky-${vb}`))
      } else {
        cellSpans.push(<Text key={`sticky-${vb}`}>{pad(stickyW)}</Text>)
      }
    }

    for (let col = 0; col < numCols; col++) {
      const idx = windowIndices[col]
      const node = graph.nodes[idx]
      const nodeBranch = getVisualBranch(node, zoom)

      if (nodeBranch === vb) {
        const isCursor = isCurrentRow && (start + col) === cursorGlobalPos
        cellSpans.push(renderNodeCell(node, idx, isCursor, col))
      } else {
        cellSpans.push(<Text key={col}>{pad(colW)}</Text>)
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

    // Detail row (preview mode only) — shows input/content below nodes that have extra info
    if (isPreview) {
      // Check if any node on this branch in the window has a detail line
      let hasAnyDetail = false
      for (let col = 0; col < numCols; col++) {
        const idx = windowIndices[col]
        const node = graph.nodes[idx]
        if (getVisualBranch(node, zoom) === vb && getNodeDetailLine(node, PREVIEW_TEXT_W - 1)) {
          hasAnyDetail = true
          break
        }
      }

      if (hasAnyDetail) {
        const detailSpans: React.ReactNode[] = []

        if (hasAnyStickyNode) {
          const hasSticky = stickyNodes.has(vb) || stickyNodes.has(vb + 1)
          if (hasSticky) {
            detailSpans.push(<Text key={`sdetail-${vb}`} dimColor>{pad(stickyW - 1) + "\u2502"}</Text>)
          } else {
            detailSpans.push(<Text key={`sdetail-${vb}`}>{pad(stickyW)}</Text>)
          }
        }

        for (let col = 0; col < numCols; col++) {
          const idx = windowIndices[col]
          const node = graph.nodes[idx]
          const nodeBranch = getVisualBranch(node, zoom)

          if (nodeBranch === vb) {
            const detail = getNodeDetailLine(node, PREVIEW_TEXT_W - 1)
            detailSpans.push(<Text key={col} dimColor>{"   " + detail.padEnd(colW - 3)}</Text>)
          } else if (vb < maxBranch && connectorGaps[vb].has(col)) {
            detailSpans.push(<Text key={col} dimColor>{"\u2502" + pad(colW - 1)}</Text>)
          } else {
            detailSpans.push(<Text key={col}>{pad(colW)}</Text>)
          }
        }

        rows.push(
          <Text key={`detail-${vb}`}>
            {pad(labelW)}
            {detailSpans}
          </Text>
        )
      }
    }

    // Connector row
    if (vb < maxBranch) {
      const connSpans: React.ReactNode[] = []
      if (hasAnyStickyNode) {
        connSpans.push(renderStickyConnector(vb, `sconn-${vb}`))
      }
      for (let col = 0; col < numCols; col++) {
        if (connectorGaps[vb].has(col)) {
          connSpans.push(<Text key={col} dimColor>{"\u2502" + pad(colW - 1)}</Text>)
        } else {
          connSpans.push(<Text key={col}>{pad(colW)}</Text>)
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

  const timeStickyPad = hasAnyStickyNode ? pad(stickyW) : ""

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text>
        <Text color="magenta" bold>[{getZoomLabel(zoom)}] </Text>
        {isPreview && <Text color="blue" bold>[PREVIEW] </Text>}
        <Text color="green" bold>{"\u25CF"} LIVE </Text>
        <Text dimColor>h/l:chrono shift+arrow:level j/k:row w:preview t:timeline d:details s:sessions f:follow q:quit</Text>
      </Text>
      <Text>{" "}</Text>
      <Text>
        {"Time".padEnd(labelW)}
        {timeStickyPad}
        {timeSpans}
      </Text>
      <Text>{" "}</Text>
      {rows}
      {cursorNode && peekLabel && (
        <>
          <Text dimColor>{pad(labelW) + "\u2500".repeat((hasAnyStickyNode ? stickyW : 0) + numCols * colW)}</Text>
          <Text>
            <Text bold color={peekLabel.color as any}>{" \u25B8 " + peekLabel.text}</Text>
            {peekLabel.usage ? <Text dimColor>{" " + peekLabel.usage}</Text> : null}
          </Text>
          {peekLines.map((line, i) => (
            <Text key={`peek-${i}`} dimColor>{"   " + line}</Text>
          ))}
        </>
      )}
    </Box>
  )
}

function pad(n: number): string {
  return " ".repeat(n)
}
