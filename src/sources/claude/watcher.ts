import { watch as chokidarWatch, type FSWatcher } from "chokidar"
import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { join, extname, basename } from "path"
import type { SessionEvent, SessionInfo } from "../../core/types"
import { homedir } from "os"

export function getClaudeDir(): string {
  return join(homedir(), ".claude")
}

export function getProjectSlug(cwd: string): string {
  return cwd.replace(/\//g, "-")
}

function readJsonlFile(path: string): SessionEvent[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, "utf-8")
  const events: SessionEvent[] = []
  for (const line of content.split("\n")) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // skip malformed lines
    }
  }
  return events
}

export function readAllEvents(sessionFile: string, agentFiles: string[]): SessionEvent[] {
  const events = [
    ...readJsonlFile(sessionFile),
    ...agentFiles.flatMap(readJsonlFile),
  ]
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return events
}

export function discoverAgentFiles(claudeDir: string, project: string, sessionId: string): string[] {
  const agentDir = join(claudeDir, "projects", project, sessionId, "subagents")
  if (!existsSync(agentDir)) return []
  return readdirSync(agentDir)
    .filter(f => extname(f) === ".jsonl")
    .map(f => join(agentDir, f))
}

export function getSessionFile(claudeDir: string, project: string, sessionId: string): string {
  return join(claudeDir, "projects", project, `${sessionId}.jsonl`)
}

type WatchCallback = () => void

export function watchSession(
  claudeDir: string,
  project: string,
  sessionId: string,
  onChange: WatchCallback,
): FSWatcher {
  const sessionFile = getSessionFile(claudeDir, project, sessionId)
  const agentFiles = discoverAgentFiles(claudeDir, project, sessionId)
  const paths = [sessionFile, ...agentFiles]

  const watcher = chokidarWatch(paths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on("change", onChange)
  return watcher
}

export function listSessions(claudeDir: string, project: string): SessionInfo[] {
  const projectDir = join(claudeDir, "projects", project)
  if (!existsSync(projectDir)) return []

  const sessions: SessionInfo[] = []
  for (const entry of readdirSync(projectDir)) {
    if (extname(entry) !== ".jsonl") continue
    const path = join(projectDir, entry)
    const id = basename(entry, ".jsonl")

    const stat = statSync(path)
    const content = readFileSync(path, "utf-8")
    const lines = content.trim().split("\n").filter(Boolean)
    const nodeCount = lines.length

    const waitingForUser = false

    sessions.push({
      id,
      timestamp: stat.mtimeMs,
      nodeCount,
      waitingForUser,
      source: "claude",
    })
  }

  sessions.sort((a, b) => b.timestamp - a.timestamp)
  return sessions
}
