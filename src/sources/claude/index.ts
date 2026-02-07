import type { Source, SessionInfo, Graph } from "../../core/types"
import { buildGraph } from "./graph"
import {
  getClaudeDir,
  getProjectSlug,
  getSessionFile,
  discoverAgentFiles,
  readAllEvents,
  listSessions as listClaudeSessions,
  watchSession,
} from "./watcher"

export function createClaudeSource(claudeDir: string, project: string): Source {
  return {
    kind: "claude",

    async listSessions(): Promise<SessionInfo[]> {
      return listClaudeSessions(claudeDir, project)
    },

    async readGraph(sessionId: string): Promise<Graph> {
      const sessionFile = getSessionFile(claudeDir, project, sessionId)
      const agentFiles = discoverAgentFiles(claudeDir, project, sessionId)
      const events = readAllEvents(sessionFile, agentFiles)
      return buildGraph(events)
    },

    watch(sessionId: string, onUpdate: (graph: Graph) => void): () => void {
      const watcher = watchSession(claudeDir, project, sessionId, () => {
        const sessionFile = getSessionFile(claudeDir, project, sessionId)
        const agentFiles = discoverAgentFiles(claudeDir, project, sessionId)
        const events = readAllEvents(sessionFile, agentFiles)
        const graph = buildGraph(events)
        onUpdate(graph)
      })
      return () => { watcher.close() }
    },
  }
}

export { getClaudeDir, getProjectSlug }
