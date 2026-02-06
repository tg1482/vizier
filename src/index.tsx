#!/usr/bin/env bun
import React from "react"
import { render } from "ink"
import { App } from "./app"
import { buildGraph } from "./core/graph"
import {
  getClaudeDir,
  getProjectSlug,
  getLatestSessionId,
  getSessionFile,
  discoverAgentFiles,
  readAllEvents,
  listSessions,
} from "./core/watcher"

function parseArgs(): { session?: string; project?: string } {
  const args = process.argv.slice(2)
  const result: { session?: string; project?: string } = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" && args[i + 1]) result.session = args[++i]
    if (args[i] === "--project" && args[i + 1]) result.project = args[++i]
  }
  return result
}

async function main() {
  const args = parseArgs()
  const claudeDir = getClaudeDir()
  const projectPath = args.project || process.cwd()
  const project = getProjectSlug(projectPath)

  let sessionId = args.session || getLatestSessionId(claudeDir, project)
  if (!sessionId) {
    console.error(`No sessions found for project: ${projectPath}`)
    console.error("\nUsage: vizier --session <session-id> --project <project-path>")
    process.exit(1)
  }

  const sessionFile = getSessionFile(claudeDir, project, sessionId)
  const agentFiles = discoverAgentFiles(claudeDir, project, sessionId)
  const events = readAllEvents(sessionFile, agentFiles)

  if (events.length === 0) {
    console.error(`No events found for session: ${sessionId}`)
    console.error(`Project: ${project}`)
    process.exit(1)
  }

  const graph = buildGraph(events)

  // Enter alternate screen buffer (like vim/less/htop)
  process.stdout.write("\x1b[?1049h\x1b[H")

  const { waitUntilExit } = render(
    <App
      initialGraph={graph}
      sessionId={sessionId}
      claudeDir={claudeDir}
      project={project}
      projectPath={projectPath}
    />,
    { exitOnCtrlC: true }
  )
  await waitUntilExit()

  // Leave alternate screen buffer — restores previous terminal content
  process.stdout.write("\x1b[?1049l")
}

main()
