import type { Source, SessionInfo, Graph } from "../../core/types"

type SourceEntry = {
  kind: string
  source: Source
}

function encodeSessionId(kind: string, id: string): string {
  return `${kind}:${id}`
}

function decodeSessionId(id: string): { kind: string; id: string } | null {
  const idx = id.indexOf(":")
  if (idx <= 0) return null
  return { kind: id.slice(0, idx), id: id.slice(idx + 1) }
}

export function createMultiSource(entries: SourceEntry[]): Source {
  const byKind = new Map(entries.map(e => [e.kind, e.source]))

  return {
    kind: "multi",

    async listSessions(): Promise<SessionInfo[]> {
      const all: SessionInfo[] = []
      for (const entry of entries) {
        const sessions = await entry.source.listSessions()
        for (const s of sessions) {
          all.push({
            ...s,
            id: encodeSessionId(entry.kind, s.id),
            source: entry.kind,
          })
        }
      }
      all.sort((a, b) => b.timestamp - a.timestamp)
      return all
    },

    async readGraph(sessionId: string): Promise<Graph> {
      const decoded = decodeSessionId(sessionId)
      if (!decoded) return { nodes: [], edges: [], stats: { totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreation: 0, model: null } }
      const source = byKind.get(decoded.kind)
      if (!source) return { nodes: [], edges: [], stats: { totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreation: 0, model: null } }
      return source.readGraph(decoded.id)
    },

    watch(sessionId: string, onUpdate: (graph: Graph) => void): () => void {
      const decoded = decodeSessionId(sessionId)
      if (!decoded) return () => {}
      const source = byKind.get(decoded.kind)
      if (!source) return () => {}
      return source.watch(decoded.id, onUpdate)
    },

    sendMessage: async (sessionId: string, text: string) => {
      const decoded = decodeSessionId(sessionId)
      if (!decoded) return
      const source = byKind.get(decoded.kind)
      if (!source?.sendMessage) return
      return source.sendMessage(decoded.id, text)
    },

    abortSession: async (sessionId: string) => {
      const decoded = decodeSessionId(sessionId)
      if (!decoded) return
      const source = byKind.get(decoded.kind)
      if (!source?.abortSession) return
      return source.abortSession(decoded.id)
    },
  }
}
