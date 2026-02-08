#!/usr/bin/env bun
import React from "react"
import { render } from "ink"
import { App } from "./app"
import { createOpenCodeSource, storageExists } from "./sources/opencode/index"
import { createClaudeSource, getClaudeDir, getProjectSlug } from "./sources/claude/index"
import { createMultiSource } from "./sources/multi/index"
import type { Source } from "./core/types"

function parseArgs(): { session?: string; project?: string; source?: string; server?: string } {
  const args = process.argv.slice(2)
  const result: { session?: string; project?: string; source?: string; server?: string } = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && args[i + 1]) result.session = args[++i]
    if (args[i] === "--project" && args[i + 1]) result.project = args[++i]
    if (args[i] === "--source" && args[i + 1]) result.source = args[++i]
    if (args[i] === "--server" && args[i + 1]) result.server = args[++i]
  }
  return result
}

async function main() {
  const args = parseArgs()

  // Determine source
  let sourceKind = args.source
  if (!sourceKind) {
    // Auto-detect: prefer combined when opencode exists, fall back to claude
    sourceKind = storageExists() ? "multi" : "claude"
  }

  let source: Source

  if (sourceKind === "opencode") {
    const projectPath = args.project || process.cwd()
    source = createOpenCodeSource(projectPath)

    // If server URL provided, wire up online capabilities
    if (args.server) {
      const { connectToServer } = await import("./sources/opencode/server")
      const server = connectToServer(args.server)
      source.sendMessage = server.sendMessage.bind(server)
      source.abortSession = server.abortSession.bind(server)
    }
  } else if (sourceKind === "claude") {
    const claudeDir = getClaudeDir()
    const projectPath = args.project || process.cwd()
    const project = getProjectSlug(projectPath)
    source = createClaudeSource(claudeDir, project)
  } else {
    const entries: { kind: string; source: Source }[] = []
    if (storageExists()) {
      const projectPath = args.project || process.cwd()
      const oc = createOpenCodeSource(projectPath)
      if (args.server) {
        const { connectToServer } = await import("./sources/opencode/server")
        const server = connectToServer(args.server)
        oc.sendMessage = server.sendMessage.bind(server)
        oc.abortSession = server.abortSession.bind(server)
      }
      entries.push({ kind: "opencode", source: oc })
    }
    const claudeDir = getClaudeDir()
    const projectPath = args.project || process.cwd()
    const project = getProjectSlug(projectPath)
    const cl = createClaudeSource(claudeDir, project)
    entries.push({ kind: "claude", source: cl })
    source = createMultiSource(entries)
  }

  // Find session
  const sessions = await source.listSessions()
  let sessionId = args.session

  if (!sessionId) {
    if (sessions.length === 0) {
      console.error(`No sessions found for source: ${sourceKind}`)
      console.error("\nUsage: vizier [--source opencode|claude|multi] [--session <id>] [--project <path>] [--server <url>]")
      process.exit(1)
    }
    sessionId = sessions[0].id
  } else if (!sessions.some(s => s.id === sessionId)) {
    console.error(`Session not found: ${sessionId}`)
    console.error("Opening session list...")
  }

  const graph = await source.readGraph(sessionId)
  const openSessionListOnStart = graph.nodes.length === 0

  // Enter alternate screen buffer (like vim/less/htop)
  process.stdout.write("\x1b[?1049h\x1b[H")

  const { waitUntilExit } = render(
    <App
      initialGraph={graph}
      sessionId={sessionId}
      initialSessionListOpen={openSessionListOnStart}
      source={source}
    />,
    { exitOnCtrlC: true }
  )
  await waitUntilExit()

  // Leave alternate screen buffer — restores previous terminal content
  process.stdout.write("\x1b[?1049l")
}

main()
