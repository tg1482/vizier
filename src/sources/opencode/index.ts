import { watch as chokidarWatch } from "chokidar"
import { existsSync } from "fs"
import type { Source, SessionInfo, Graph } from "../../core/types"
import {
  storageExists,
  listAllSessions,
  readMessages,
  getMessageDir,
  getPartDir,
} from "./reader"
import { buildOpenCodeGraph } from "./graph"

export function createOpenCodeSource(): Source {
  return {
    kind: "opencode",

    async listSessions(): Promise<SessionInfo[]> {
      const sessions = listAllSessions()
      return sessions
        .map(s => ({
          id: s.id,
          timestamp: s.time.updated,
          nodeCount: 0, // Computed lazily — counting messages is cheap enough
          waitingForUser: false,
          title: s.title,
          slug: s.slug,
          directory: s.directory,
          summary: s.summary,
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
    },

    async readGraph(sessionId: string): Promise<Graph> {
      return buildOpenCodeGraph(sessionId)
    },

    watch(sessionId: string, onUpdate: (graph: Graph) => void): () => void {
      const messageDir = getMessageDir(sessionId)
      const paths = [messageDir]

      // Also watch all existing part dirs for messages in this session
      const messages = readMessages(sessionId)
      for (const msg of messages) {
        const partDir = getPartDir(msg.id)
        if (existsSync(partDir)) {
          paths.push(partDir)
        }
      }

      const watcher = chokidarWatch(paths, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        // Watch for new directories (new message part dirs)
        depth: 1,
      })

      let debounceTimer: ReturnType<typeof setTimeout> | null = null

      const rebuild = () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          const graph = buildOpenCodeGraph(sessionId)
          onUpdate(graph)

          // Watch any newly created part dirs
          const currentMessages = readMessages(sessionId)
          for (const msg of currentMessages) {
            const partDir = getPartDir(msg.id)
            if (existsSync(partDir)) {
              watcher.add(partDir)
            }
          }
        }, 150)
      }

      watcher.on("add", rebuild)
      watcher.on("change", rebuild)

      return () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        watcher.close()
      }
    },
  }
}

export { storageExists }
