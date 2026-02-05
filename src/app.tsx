import React, { useState, useEffect, useCallback } from "react"
import { Box, useInput, useStdout, useApp } from "ink"
import type { Graph, SessionInfo } from "./core/types"
import type { ZoomLevel } from "./core/zoom"
import { getVisualBranch } from "./core/zoom"
import { buildGraph } from "./core/graph"
import {
  watchSession,
  readAllEvents,
  getSessionFile,
  discoverAgentFiles,
  listSessions,
} from "./core/watcher"
import { Timeline } from "./components/Timeline"
import { DetailsPanel } from "./components/DetailsPanel"
import { SessionList } from "./components/SessionList"
import { StatusBar } from "./components/StatusBar"
import { CommandInput } from "./components/CommandInput"

type Mode = "normal" | "input"

type Props = {
  initialGraph: Graph
  sessionId: string
  claudeDir: string
  project: string
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

const DETAILS_HEIGHT = 20

export function App({ initialGraph, sessionId: initialSessionId, claudeDir, project }: Props) {
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
  const [blinkState, setBlinkState] = useState(false)
  const [focusedNode, setFocusedNode] = useState<number | null>(null)

  const [timelineOpen, setTimelineOpen] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [sessionListOpen, setSessionListOpen] = useState(false)
  const [sessionListCursor, setSessionListCursor] = useState(0)
  const [sessions, setSessions] = useState<SessionInfo[]>(() => listSessions(claudeDir, project))

  const [detailsScroll, setDetailsScroll] = useState(0)
  const [mode, setMode] = useState<Mode>("normal")

  // Blink timer
  useEffect(() => {
    const interval = setInterval(() => setBlinkState(b => !b), 500)
    return () => clearInterval(interval)
  }, [])

  // File watcher
  useEffect(() => {
    const watcher = watchSession(claudeDir, project, sessionId, () => {
      const sessionFile = getSessionFile(claudeDir, project, sessionId)
      const agentFiles = discoverAgentFiles(claudeDir, project, sessionId)
      const events = readAllEvents(sessionFile, agentFiles)
      const newGraph = buildGraph(events)
      setGraph(prev => {
        // Smart cursor tracking: if at end, follow new content
        const oldCount = prev.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
        const newCount = newGraph.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
        const isAtEnd = cursorInLevel >= oldCount - 2
        if (isAtEnd && newCount > oldCount) {
          setCursorInLevel(Math.max(0, newCount - 1))
        }
        return newGraph
      })
      setSessions(listSessions(claudeDir, project))
    })
    return () => { watcher.close() }
  }, [sessionId, claudeDir, project])

  // Reset detail scroll when selected node changes
  useEffect(() => { setDetailsScroll(0) }, [currentLevel, cursorInLevel])

  // Derived values
  const nodesInLevel = graph.nodes.filter(n => getVisualBranch(n, zoom) === currentLevel).length
  const currentNodeIdx = getNthNodeInLevel(graph, currentLevel, zoom, cursorInLevel)
  const currentNode = currentNodeIdx !== null ? graph.nodes[currentNodeIdx] : null
  const levelName = currentLevel === 0 ? "User" : currentLevel === 1 ? "Asst" : "Tools"

  // Switch session helper
  const switchSession = useCallback((newSessionId: string) => {
    const sessionFile = getSessionFile(claudeDir, project, newSessionId)
    const agentFiles = discoverAgentFiles(claudeDir, project, newSessionId)
    const events = readAllEvents(sessionFile, agentFiles)
    const newGraph = buildGraph(events)
    setGraph(newGraph)
    setSessionId(newSessionId)
    setCurrentLevel(0)
    setCursorInLevel(0)
    setSessionListOpen(false)
    setTimelineOpen(true)
  }, [claudeDir, project])

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

    if (input === "z") {
      if (currentNodeIdx !== null) {
        setFocusedNode(prev => prev === currentNodeIdx ? null : currentNodeIdx)
      }
      return
    }

    if (input === "i") {
      setMode("input")
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

    // Timeline navigation
    if (input === "h" || key.leftArrow) {
      setCursorInLevel(prev => Math.max(prev - 1, 0))
      return
    }
    if (input === "l" || key.rightArrow) {
      setCursorInLevel(prev => Math.min(prev + 1, nodesInLevel - 1))
      return
    }
    if (input === "j" || key.downArrow) {
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
      if (currentLevel > 0) {
        const ts = currentNode?.timestamp
        setCurrentLevel(prev => prev - 1)
        if (ts) setCursorInLevel(findNearestInLevel(graph, currentLevel - 1, zoom, ts))
        else setCursorInLevel(0)
      }
      return
    }
    if (input === "g") {
      setCursorInLevel(0)
      return
    }
    if (input === "G") {
      setCursorInLevel(Math.max(0, nodesInLevel - 1))
      return
    }
  })

  const handleCommandSubmit = useCallback((_text: string) => {
    // SDK integration: will be wired in Phase 3
    setMode("normal")
  }, [])

  // Fixed-height layout so Ink always redraws the same number of lines
  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
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
      />
    </Box>
  )
}
