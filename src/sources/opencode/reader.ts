import { readFileSync, readdirSync, existsSync } from "fs"
import { join, basename, extname } from "path"
import { homedir } from "os"

// Storage root
export const STORAGE = join(homedir(), ".local/share/opencode/storage")
const SESSIONS_DIR = join(STORAGE, "session")
const MESSAGES_DIR = join(STORAGE, "message")
const PARTS_DIR = join(STORAGE, "part")
const PROJECTS_DIR = join(STORAGE, "project")

// On-disk types matching OpenCode's JSON format
export type OCProject = {
  id: string
  worktree: string
  vcs?: string
  time: { created: number; updated: number }
}

export type OCSession = {
  id: string
  slug: string
  version: string
  projectID: string
  directory: string
  title: string
  time: { created: number; updated: number }
  summary?: { additions: number; deletions: number; files: number }
}

export type OCMessage = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: { created: number; completed?: number }
  parentID?: string
  modelID?: string
  providerID?: string
  agent?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
  finish?: string
  model?: { providerID: string; modelID: string }
  summary?: { title?: string; diffs?: unknown[] }
}

export type OCToolState = {
  status: "completed" | "error" | "pending"
  input?: Record<string, unknown>
  output?: string
  error?: string
  time?: { start: number; end: number }
}

export type OCPart = {
  id: string
  sessionID: string
  messageID: string
  type: string
  // text parts
  text?: string
  // tool parts
  callID?: string
  tool?: string
  state?: OCToolState
  // patch parts
  hash?: string
  files?: string[]
  // step-start/finish
  snapshot?: string
  reason?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
  // timing for reasoning parts
  time?: { start?: number; end?: number }
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return null
  }
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return []
  const results: T[] = []
  for (const entry of readdirSync(dir)) {
    if (extname(entry) !== ".json") continue
    const data = readJsonFile<T>(join(dir, entry))
    if (data) results.push(data)
  }
  return results
}

export function storageExists(): boolean {
  return existsSync(STORAGE)
}

export function discoverProjects(): OCProject[] {
  return readJsonDir<OCProject>(PROJECTS_DIR)
}

export function listSessionsForProject(projectID: string): OCSession[] {
  const dir = join(SESSIONS_DIR, projectID)
  return readJsonDir<OCSession>(dir)
}

export function listAllSessions(): OCSession[] {
  if (!existsSync(SESSIONS_DIR)) return []
  const sessions: OCSession[] = []
  for (const projectDir of readdirSync(SESSIONS_DIR)) {
    const dir = join(SESSIONS_DIR, projectDir)
    sessions.push(...readJsonDir<OCSession>(dir))
  }
  return sessions
}

export function readSession(projectID: string, sessionID: string): OCSession | null {
  const path = join(SESSIONS_DIR, projectID, `${sessionID}.json`)
  return readJsonFile<OCSession>(path)
}

export function readMessages(sessionID: string): OCMessage[] {
  const dir = join(MESSAGES_DIR, sessionID)
  return readJsonDir<OCMessage>(dir)
}

export function readParts(messageID: string): OCPart[] {
  const dir = join(PARTS_DIR, messageID)
  return readJsonDir<OCPart>(dir)
}

export function getMessageDir(sessionID: string): string {
  return join(MESSAGES_DIR, sessionID)
}

export function getPartDir(messageID: string): string {
  return join(PARTS_DIR, messageID)
}
