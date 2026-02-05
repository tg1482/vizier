import React from "react"
import { Box, Text } from "ink"
import type { ZoomLevel } from "../core/zoom"
import { getZoomLabel } from "../core/zoom"

type Props = {
  levelName: string
  position: number
  total: number
  totalNodes: number
  zoom: ZoomLevel
  isLive: boolean
}

export function StatusBar({ levelName, position, total, totalNodes, zoom, isLive }: Props) {
  return (
    <Box>
      <Text dimColor>
        Level: {levelName} | Position: {position}/{total} | Total: {totalNodes} nodes | {getZoomLabel(zoom)}
      </Text>
      {isLive && <Text color="green" bold> LIVE</Text>}
    </Box>
  )
}
