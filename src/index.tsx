#!/usr/bin/env bun
import React from "react"
import { render } from "ink"
import { App } from "./app"
import { buildGraph } from "./core/graph"
import {
  getClaudeDir,
  getProjectSlug,
  getCurrentSessionId,
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

  let sessionId = args.session || getCurrentSessionId()
  if (!sessionId) {
    console.error("Could not determine current session.")
    console.error("\nUsage: vizzy --session <session-id> --project <project-path>")
    console.error("\nAvailable sessions:")
    for (const s of listSessions(claudeDir, project).slice(0, 5)) {
      console.error(`  - ${s.id}`)
    }
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

  // Clear screen before starting
  process.stdout.write("\x1b[2J\x1b[H")

  const { waitUntilExit } = render(
    <App
      initialGraph={graph}
      sessionId={sessionId}
      claudeDir={claudeDir}
      project={project}
    />,
    { exitOnCtrlC: true }
  )
  await waitUntilExit()

  // Clear screen on exit
  process.stdout.write("\x1b[2J\x1b[H")
}

main()
