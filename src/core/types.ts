// Session event from JSONL files (camelCase matches JSON schema)
export type SessionEvent = {
  uuid: string
  parentUuid?: string
  isSidechain?: boolean
  agentId?: string
  sessionId?: string
  type: string
  message?: Message
  timestamp: string // ISO 8601
  data?: { agentId?: string; type?: string }
  parentToolUseID?: string
}

export type Message = {
  role: string
  content: unknown // string | array of content blocks
  model?: string
  usage?: Usage
}

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  reasoning_tokens?: number
}

// Parsed node types — discriminated union
export type NodeType =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool_use"; name: string; input: string }
  | { kind: "tool_result"; output: string; isError: boolean }
  | { kind: "tool_call"; name: string; input: string; output: string | null; isError: boolean }
  | { kind: "agent_start"; agentId: string; agentType: string }
  | { kind: "agent_end"; agentId: string }
  | { kind: "progress"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "patch"; files: string[]; hash: string }

export type Node = {
  id: string
  parentId?: string
  nodeType: NodeType
  timestamp: number // epoch ms for fast comparison
  branchLevel: number
  agentId?: string
  model?: string
  usage?: Usage
  source?: string       // "opencode" | "claude"
  cost?: number          // OpenCode tracks per-message cost
  turnId?: string        // groups nodes belonging to same user turn
}

export type Edge = {
  from: string
  to: string
  isBranch: boolean
}

export type SessionStats = {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheRead: number
  totalCacheCreation: number
  model: string | null
  totalCost?: number
  totalReasoningTokens?: number
}

export type Graph = {
  nodes: Node[]
  edges: Edge[]
  stats: SessionStats
}

export type SessionInfo = {
  id: string
  timestamp: number
  nodeCount: number
  waitingForUser: boolean
  title?: string
  slug?: string
  directory?: string
  summary?: { additions: number; deletions: number; files: number }
}

// Source interface — abstracts over OpenCode and Claude data sources
export interface Source {
  kind: string
  listSessions(): Promise<SessionInfo[]>
  readGraph(sessionId: string): Promise<Graph>
  watch(sessionId: string, onUpdate: (graph: Graph) => void): () => void
  // Online-only capabilities (present when server is connected)
  sendMessage?(sessionId: string, text: string): Promise<void>
  abortSession?(sessionId: string): Promise<void>
}
