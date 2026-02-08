import React from "react"
import { Box, Text, useStdout } from "ink"
import type { SessionInfo } from "../core/types"
import stringWidth from "string-width"

const DEBUG_LIST = process.env.VIZIER_DEBUG_LIST === "1"

type Props = {
  sessions: SessionInfo[]
  currentSessionId: string
  cursor: number
}

export function SessionList({ sessions, currentSessionId, cursor }: Props) {
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 120
  const termHeight = stdout?.rows ?? 40
  const lineWidth = Math.max(40, termWidth - 4)
  const maxRows = Math.max(5, termHeight - 6) // header + borders + spacing

  const fitToWidth = (text: string, width: number): string => {
    if (stringWidth(text) <= width) return text
    let out = ""
    let w = 0
    for (const ch of text) {
      const cw = stringWidth(ch)
      if (w + cw > width - 1) break
      out += ch
      w += cw
    }
    return out + "…"
  }

  const padToWidth = (text: string, width: number): string => {
    const trimmed = fitToWidth(text, width)
    const w = stringWidth(trimmed)
    return w >= width ? trimmed : trimmed + " ".repeat(width - w)
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold> Sessions (Enter to switch, s to close) </Text>
      {DEBUG_LIST && (
        <Text color="yellow">
          dbg: rows={maxRows} total={sessions.length} cursor={cursor} w={termWidth} h={termHeight}
        </Text>
      )}
      {(() => {
        const total = sessions.length
        const start = Math.max(0, Math.min(total - maxRows, cursor - Math.floor(maxRows / 2)))
        const visible = sessions.slice(start, start + maxRows)

        const idxWidth = DEBUG_LIST ? 5 : 0
        const prefixWidth = 2
        const sourceWidth = 10
        const idWidth = 8
        const timeWidth = 16
        const eventsWidth = 10
        const separatorsWidth = 1 + 3 + 3 // space before id, " | ", " | "
        const fixedWidth = idxWidth + prefixWidth + sourceWidth + separatorsWidth + idWidth + timeWidth + eventsWidth
        const titleWidth = Math.max(0, lineWidth - fixedWidth)

        return visible.map((session, i) => {
          const idx = start + i
          const isCurrent = session.id === currentSessionId
          const isSelected = idx === cursor
          const prefix = isSelected ? "> " : "  "
          const sourceLabel = session.source ? `[${session.source}]` : ""
          const displayId = session.source && session.id.startsWith(`${session.source}:`)
            ? session.id.slice(session.source.length + 1)
            : session.id
          const shortId = displayId.slice(0, 8)
          const time = new Date(session.timestamp).toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
          const currentMarker = isCurrent ? " (current)" : ""

          const color = isCurrent ? "green" : undefined

          const prefixCol = padToWidth(prefix, prefixWidth)
          const sourceCol = padToWidth(sourceLabel, sourceWidth)
          const idCol = padToWidth(shortId, idWidth)
          const timeCol = padToWidth(time, timeWidth)
          const eventsCol = padToWidth(`${String(session.nodeCount).padStart(4)} events`, eventsWidth)
          const titleStr = session.title ? ` ${session.title}` : ""
          const titleCol = padToWidth(`${titleStr}${currentMarker}`, titleWidth)
          const idxLabel = DEBUG_LIST ? padToWidth(`${String(idx).padStart(4)} `, idxWidth) : ""

          return (
            <Box
              key={`${session.id}:${session.timestamp}:${i}`}
              flexDirection="row"
              width={lineWidth}
              flexShrink={0}
            >
              {DEBUG_LIST && (
                <Box width={idxWidth} flexShrink={0}>
                  <Text color={color} bold={isSelected} wrap="truncate">{idxLabel}</Text>
                </Box>
              )}
              <Box width={prefixWidth} flexShrink={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{prefixCol}</Text>
              </Box>
              <Box width={sourceWidth} flexShrink={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{sourceCol}</Text>
              </Box>
              <Text color={color} bold={isSelected}> </Text>
              <Box width={idWidth} flexShrink={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{idCol}</Text>
              </Box>
              <Text color={color} bold={isSelected}> | </Text>
              <Box width={timeWidth} flexShrink={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{timeCol}</Text>
              </Box>
              <Text color={color} bold={isSelected}> | </Text>
              <Box width={eventsWidth} flexShrink={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{eventsCol}</Text>
              </Box>
              <Box flexGrow={1} minWidth={0}>
                <Text color={color} bold={isSelected} wrap="truncate">{titleCol}</Text>
              </Box>
            </Box>
          )
        })
      })()}
    </Box>
  )
}
