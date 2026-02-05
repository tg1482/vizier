import React from "react"
import { Box, Text } from "ink"
import type { SessionInfo } from "../core/types"

type Props = {
  sessions: SessionInfo[]
  currentSessionId: string
  cursor: number
}

export function SessionList({ sessions, currentSessionId, cursor }: Props) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold> Sessions (Enter to switch, s to close) </Text>
      {sessions.map((session, idx) => {
        const isCurrent = session.id === currentSessionId
        const isSelected = idx === cursor
        const prefix = isSelected ? "> " : "  "
        const shortId = session.id.slice(0, 8)
        const time = new Date(session.timestamp).toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
        const currentMarker = isCurrent ? " (current)" : ""
        const waitingMarker = session.waitingForUser ? " \u23F8" : ""

        const color = session.waitingForUser ? "yellow" : isCurrent ? "green" : undefined

        return (
          <Text key={session.id} color={color} bold={isSelected}>
            {prefix}{shortId} | {time} | {String(session.nodeCount).padStart(4)} events{currentMarker}{waitingMarker}
          </Text>
        )
      })}
    </Box>
  )
}
