import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Box, useInput, useStdout, useApp } from "ink"
import type { Graph, SessionInfo, Source } from "./core/types"
import type { ZoomLevel, CellMode } from "./core/zoom"
import { getVisualBranch } from "./core/zoom"
import { Timeline } from "./components/Timeline"
import { DetailsPanel } from "./components/DetailsPanel"
import { SessionList } from "./components/SessionList"
import { StatusBar } from "./components/StatusBar"
import { CommandInput } from "./components/CommandInput"

type Mode = "normal" | "input"

type Props = {
  initialGraph: Graph
  sessionId: string
  source: Source
  initialSessionListOpen?: boolean
}

// Get the nth node at a given level (returns global index)
function getNthNodeInLevel(graph: Graph, level: number, zoom: ZoomLevel, nth: number): number | null {
  let count = 0
  for (let i = 0; i < graph.nodes.length; i++) {
    if (getVisualBranch(graph.nodes[i], zoom) === level) {
      if (count === nth) return i
      count++
    }
  }
  return null
}

// Find max visual branch in graph
function getMaxLevel(graph: Graph, zoom: ZoomLevel): number {
  let max = 0
  for (const n of graph.nodes) {
    const b = getVisualBranch(n, zoom)
    if (b > max) max = b
  }
  return Math.max(max, 1)
}

// Find nearest node in level by timestamp
function findNearestInLevel(graph: Graph, level: number, zoom: ZoomLevel, targetTs: number): number {
  let bestPos = 0
  let bestDiff = Infinity
  let pos = 0
  for (const n of graph.nodes) {
    if (getVisualBranch(n, zoom) === level) {
      const diff = Math.abs(n.timestamp - targetTs)
      if (diff < bestDiff) {
        bestDiff = diff
        bestPos = pos
      }
      pos++
    }
  }
  return bestPos
}

// Move to the next/prev node chronologically across all levels
// Returns { level, pos } for the target node, or null if at boundary
function stepChronological(
  graph: Graph, zoom: ZoomLevel, currentNodeIdx: number | null, direction: 1 | -1
): { level: number; pos: number } | null {
  if (currentNodeIdx === null) return null
  const nextIdx = currentNodeIdx + direction
  if (nextIdx < 0 || nextIdx >= graph.nodes.length) return null
  const node = graph.nodes[nextIdx]
  const level = getVisualBranch(node, zoom)
  let pos = 0
  for (let i = 0; i < nextIdx; i++) {
    if (getVisualBranch(graph.nodes[i], zoom) === level) pos++
  }
  return { level, pos }
}

const DETAILS_HEIGHT = 20

// Find the last node's visual branch and position within that branch
function getLatestNodePosition(graph: Graph, zoom: ZoomLevel): { level: number; pos: number } {
  if (graph.nodes.length === 0) return { level: 0, pos: 0 }
  const lastNode = graph.nodes[graph.nodes.length - 1]
  const level = getVisualBranch(lastNode, zoom)
  let pos = 0
  for (const n of graph.nodes) {
    if (getVisualBranch(n, zoom) === level) pos++
  }
  return { level, pos: Math.max(0, pos - 1) }
}

export function App({ initialGraph, sessionId: initialSessionId, source, initialSessionListOpen }: Props) {
  const { stdout } = useStdout()
  const { exit } = useApp()
  const termWidth = stdout?.columns ?? 120
  const termHeight = stdout?.rows ?? 40

  const [graph, setGraph] = useState<Graph>(initialGraph)
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [currentLevel, setCurrentLevel] = useState(0)
  const [cursorInLevel, setCursorInLevel] = useState(() => {
    // Start on last user message
    let count = 0
    let lastUserPos = 0
    for (const n of initialGraph.nodes) {
      if (getVisualBranch(n, "details") === 0) {
        if (n.nodeType.kind === "user") lastUserPos = count
        count++
      }
    }
    return lastUserPos
  })
  const [zoom, setZoom] = useState<ZoomLevel>("details")
  const [cellMode, setCellMode] = useState<CellMode>("symbol")
  const [blinkState, setBlinkState] = useState(false)

  const [timelineOpen, setTimelineOpen] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [sessionListOpen, setSessionListOpen] = useState(
    initialSessionListOpen ?? initialGraph.nodes.length === 0
  )
  const [sessionListCursor, setSessionListCursor] = useState(0)
  const [sessions, setSessions] = useState<SessionInfo[]>([])

  const [detailsScroll, setDetailsScroll] = useState(0)
  const [follow, setFollow] = useState(false)
  const followRef = useRef(false)
  const [mode, setMode] = useState<Mode>("normal")

  // Load sessions on mount
  useEffect(() => {
    source.listSessions().then(setSessions)
  }, [source])

  // Only blink when the session is still running (last node is a pending tool call)
  const hasActiveNodes = useMemo(() => {
    if (graph.nodes.length === 0) return false
    const last = graph.nodes[graph.nodes.length - 1]
    return last.nodeType.kind === "tool_call" && last.nodeType.output === null
  }, [graph])

  useEffect(() => {
    if (!hasActiveNodes) {
      setBlinkState(false)
      return
    }
    const interval = setInterval(() => setBlinkState(b => !b), 500)
    return () => clearInterval(interval)
  }, [hasActiveNodes])

  // File watcher via source
  useEffect(() => {
    const cleanup = source.watch(sessionId, (newGraph) => {
      setGraph(prev => {
        if (followRef.current) {
          const latest = getLatestNodePosition(newGraph, zoom)
          setCurrentLevel(latest.level)
          setCursorInLevel(latest.pos)
        } else {
          const oldCount = prev.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
          const newCount = newGraph.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
          const isAtEnd = cursorInLevel >= oldCount - 2
          if (isAtEnd && newCount > oldCount) {
            setCursorInLevel(Math.max(0, newCount - 1))
          }
        }
        return newGraph
      })
      source.listSessions().then(setSessions)
    })
    return cleanup
  }, [sessionId, source])

  // Derived values
  const nodesInLevel = graph.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
  const currentNodeIdx = getNthNodeInLevel(graph, currentLevel, zoom, cursorInLevel)
  const currentNode = currentNodeIdx !== null ? graph.nodes[currentNodeIdx] : null
  const levelName = currentLevel === 0 ? "User" : currentLevel === 1 ? "Asst" : "Tools"

  // Reset detail scroll when selected node changes — only if scrolled and details open
  const prevNodeRef = useRef<string | null>(null)
  const currentNodeId = currentNode?.id ?? null
  if (currentNodeId !== prevNodeRef.current) {
    prevNodeRef.current = currentNodeId
    if (detailsOpen && detailsScroll !== 0) setDetailsScroll(0)
  }

  // Switch session helper
  const switchSession = useCallback(async (newSessionId: string) => {
    const newGraph = await source.readGraph(newSessionId)
    setGraph(newGraph)
    setSessionId(newSessionId)
    setCurrentLevel(0)
    setCursorInLevel(0)
    setSessionListOpen(false)
    setTimelineOpen(true)
  }, [source])

  const canSendMessage = !!source.sendMessage

  useInput((input, key) => {
    if (mode === "input") {
      if (key.escape) setMode("normal")
      return
    }

    // Normal mode
    if (input === "q") {
      exit()
      return
    }

    if (input === "s") {
      setSessionListOpen(prev => !prev)
      if (!sessionListOpen) {
        const idx = sessions.findIndex(s => s.id === sessionId)
        setSessionListCursor(idx >= 0 ? idx : 0)
      }
      return
    }

    if (input === "t") { setTimelineOpen(prev => !prev); return }
    if (input === "d") { setDetailsOpen(prev => !prev); return }
    if (input === "w") { setCellMode(prev => prev === "symbol" ? "preview" : "symbol"); return }

    if (input === "f") {
      setFollow(prev => {
        const next = !prev
        followRef.current = next
        if (next) {
          const latest = getLatestNodePosition(graph, zoom)
          setCurrentLevel(latest.level)
          setCursorInLevel(latest.pos)
        }
        return next
      })
      return
    }

    if (input === "i" && canSendMessage) {
      setMode("input")
      return
    }

    if (input === "x" && source.abortSession) {
      source.abortSession(sessionId)
      return
    }

    // Detail scroll (Shift+J / Shift+K)
    if (detailsOpen && input === "J") {
      setDetailsScroll(prev => prev + 1)
      return
    }
    if (detailsOpen && input === "K") {
      setDetailsScroll(prev => Math.max(0, prev - 1))
      return
    }

    // Session list navigation
    if (sessionListOpen) {
      if (input === "j" || key.downArrow) {
        setSessionListCursor(prev => Math.min(prev + 1, sessions.length - 1))
        return
      }
      if (input === "k" || key.upArrow) {
        setSessionListCursor(prev => Math.max(prev - 1, 0))
        return
      }
      if (key.return) {
        const selected = sessions[sessionListCursor]
        if (selected && selected.id !== sessionId) {
          switchSession(selected.id)
        }
        setSessionListOpen(false)
        return
      }
      return
    }

    // Timeline navigation — any manual nav disables follow

    // Shift+arrow: stay within current level
    if (key.shift && key.leftArrow) {
      setFollow(false); followRef.current = false
      setCursorInLevel(prev => Math.max(prev - 1, 0))
      return
    }
    if (key.shift && key.rightArrow) {
      setFollow(false); followRef.current = false
      setCursorInLevel(prev => Math.min(prev + 1, nodesInLevel - 1))
      return
    }

    // h/l/arrows: chronological — move to next/prev node across all levels
    if (input === "h" || key.leftArrow) {
      setFollow(false); followRef.current = false
      const target = stepChronological(graph, zoom, currentNodeIdx, -1)
      if (target) {
        setCurrentLevel(target.level)
        setCursorInLevel(target.pos)
      }
      return
    }
    if (input === "l" || key.rightArrow) {
      setFollow(false); followRef.current = false
      const target = stepChronological(graph, zoom, currentNodeIdx, 1)
      if (target) {
        setCurrentLevel(target.level)
        setCursorInLevel(target.pos)
      }
      return
    }
    if (input === "j" || key.downArrow) {
      setFollow(false); followRef.current = false
      const maxLevel = getMaxLevel(graph, zoom)
      if (currentLevel < maxLevel) {
        const ts = currentNode?.timestamp
        setCurrentLevel(prev => prev + 1)
        if (ts) setCursorInLevel(findNearestInLevel(graph, currentLevel + 1, zoom, ts))
        else setCursorInLevel(0)
      }
      return
    }
    if (input === "k" || key.upArrow) {
      setFollow(false); followRef.current = false
      if (currentLevel > 0) {
        const ts = currentNode?.timestamp
        setCurrentLevel(prev => prev - 1)
        if (ts) setCursorInLevel(findNearestInLevel(graph, currentLevel - 1, zoom, ts))
        else setCursorInLevel(0)
      }
      return
    }
    if (input === "g") {
      setFollow(false); followRef.current = false
      setCursorInLevel(0)
      return
    }
    if (input === "G") {
      setFollow(false); followRef.current = false
      setCursorInLevel(Math.max(0, nodesInLevel - 1))
      return
    }
  })

  const handleCommandSubmit = useCallback((text: string) => {
    if (source.sendMessage) {
      source.sendMessage(sessionId, text)
      setFollow(true)
      followRef.current = true
    }
    setMode("normal")
  }, [source, sessionId])

  // Use termHeight - 1 so Ink uses eraseLines (with output diff) instead of
  // clearTerminal (full screen flash). Ink triggers clearTerminal when
  // outputHeight >= stdout.rows, which causes visible flicker in iTerm.
  return (
    <Box flexDirection="column" width={termWidth} height={termHeight - 1}>
      {sessionListOpen && (
        <SessionList
          sessions={sessions}
          currentSessionId={sessionId}
          cursor={sessionListCursor}
        />
      )}
      {timelineOpen && (
        <Timeline
          graph={graph}
          currentLevel={currentLevel}
          cursorInLevel={cursorInLevel}
          zoom={zoom}
          cellMode={cellMode}
          blinkState={blinkState}
          termWidth={termWidth}
        />
      )}
      {detailsOpen && (
        <DetailsPanel
          node={currentNode}
          levelName={levelName}
          position={cursorInLevel + 1}
          total={nodesInLevel}
          height={DETAILS_HEIGHT}
          scrollOffset={detailsScroll}
        />
      )}
      {mode === "input" && (
        <CommandInput
          onSubmit={handleCommandSubmit}
          onCancel={() => setMode("normal")}
        />
      )}
      <Box flexGrow={1} />
      <StatusBar
        levelName={levelName}
        position={cursorInLevel + 1}
        total={nodesInLevel}
        totalNodes={graph.nodes.length}
        zoom={zoom}
        isLive={true}
        follow={follow}
        stats={graph.stats}
      />
    </Box>
  )
}
