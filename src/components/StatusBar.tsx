import React from "react"
import { Box, Text } from "ink"
import type { ZoomLevel } from "../core/zoom"
import type { SessionStats } from "../core/types"
import { getZoomLabel } from "../core/zoom"

type Props = {
  levelName: string
  position: number
  total: number
  totalNodes: number
  zoom: ZoomLevel
  isLive: boolean
  follow: boolean
  stats: SessionStats
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function StatusBar({ levelName, position, total, totalNodes, zoom, isLive, follow, stats }: Props) {
  const tokenStr = `in:${formatTokens(stats.totalInputTokens)} out:${formatTokens(stats.totalOutputTokens)} cache:${formatTokens(stats.totalCacheRead)}`
  const costStr = stats.totalCost ? ` $${stats.totalCost.toFixed(2)}` : ""

  return (
    <Box>
      <Text dimColor>
        {levelName} {position}/{total} | {totalNodes} nodes | {getZoomLabel(zoom)}
      </Text>
      {stats.model && <Text dimColor> | {stats.model}</Text>}
      <Text dimColor> | {tokenStr}</Text>
      {costStr && <Text dimColor> |{costStr}</Text>}
      {isLive && <Text color="green" bold> LIVE</Text>}
      {follow && <Text color="yellow" bold> FOLLOW</Text>}
    </Box>
  )
}
