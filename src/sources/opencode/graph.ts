import type { Graph, Node, Edge, SessionStats, Usage } from "../../core/types"
import { readMessages, readParts } from "./reader"
import type { OCMessage, OCPart } from "./reader"

function mapTokens(msg: OCMessage): Usage | undefined {
  const t = msg.tokens
  if (!t) return undefined
  return {
    input_tokens: t.input,
    output_tokens: t.output,
    cache_read_input_tokens: t.cache?.read ?? 0,
    cache_creation_input_tokens: t.cache?.write ?? 0,
    reasoning_tokens: t.reasoning ?? 0,
  }
}

function getModelId(msg: OCMessage): string | undefined {
  return msg.modelID ?? msg.model?.modelID
}

// Sort parts by ID (lexicographic = creation order since IDs are time-based)
function sortParts(parts: OCPart[]): OCPart[] {
  return [...parts].sort((a, b) => a.id.localeCompare(b.id))
}

export function buildOpenCodeGraph(sessionID: string): Graph {
  const messages = readMessages(sessionID)
  if (messages.length === 0) {
    return { nodes: [], edges: [], stats: emptyStats() }
  }

  // Sort messages by created time
  messages.sort((a, b) => a.time.created - b.time.created)

  // Identify turns: group by anchor user message
  // User messages with no parentID are turn anchors
  // Assistant messages point to their anchor via parentID
  const userMessages: OCMessage[] = []
  const assistantByParent = new Map<string, OCMessage[]>()

  for (const msg of messages) {
    if (msg.role === "user") {
      userMessages.push(msg)
    } else if (msg.role === "assistant" && msg.parentID) {
      const list = assistantByParent.get(msg.parentID) ?? []
      list.push(msg)
      assistantByParent.set(msg.parentID, list)
    }
  }

  // Sort user messages by timestamp
  userMessages.sort((a, b) => a.time.created - b.time.created)

  // Build ordered list of messages per turn
  type Turn = { user: OCMessage; assistants: OCMessage[] }
  const turns: Turn[] = []
  for (const user of userMessages) {
    const assistants = assistantByParent.get(user.id) ?? []
    assistants.sort((a, b) => a.time.created - b.time.created)
    turns.push({ user, assistants })
  }

  // Convert to nodes
  const nodes: Node[] = []
  let prevNodeId: string | undefined

  for (const turn of turns) {
    const turnId = turn.user.id

    // User message parts
    const userParts = sortParts(readParts(turn.user.id))
    const userTextParts = userParts.filter(p => p.type === "text")
    const userText = userTextParts.map(p => p.text ?? "").join("\n").trim()

    if (userText) {
      const nodeId = turn.user.id
      nodes.push({
        id: nodeId,
        parentId: prevNodeId,
        nodeType: { kind: "user", text: userText },
        timestamp: turn.user.time.created,
        branchLevel: 0,
        source: "opencode",
        turnId,
        model: getModelId(turn.user),
      })
      prevNodeId = nodeId
    }

    // Assistant messages in this turn
    for (const asst of turn.assistants) {
      const parts = sortParts(readParts(asst.id))
      const usage = mapTokens(asst)
      const model = getModelId(asst)
      const cost = asst.cost

      for (const part of parts) {
        // Skip metadata parts
        if (part.type === "step-start" || part.type === "step-finish" || part.type === "snapshot" || part.type === "compaction") {
          continue
        }

        let node: Node | null = null

        if (part.type === "text" && part.text) {
          node = {
            id: part.id,
            parentId: prevNodeId,
            nodeType: { kind: "assistant", text: part.text },
            timestamp: part.time?.start ?? asst.time.created,
            branchLevel: 0,
            model,
            usage,
            source: "opencode",
            cost,
            turnId,
          }
        } else if (part.type === "reasoning" && part.text) {
          node = {
            id: part.id,
            parentId: prevNodeId,
            nodeType: { kind: "reasoning", text: part.text },
            timestamp: part.time?.start ?? asst.time.created,
            branchLevel: 0,
            model,
            source: "opencode",
            turnId,
          }
        } else if (part.type === "tool" && part.tool && part.state) {
          const input = part.state.input ? JSON.stringify(part.state.input, null, 2) : "{}"
          const output = part.state.status === "error"
            ? (part.state.error ?? "Unknown error")
            : (part.state.output ?? null)
          node = {
            id: part.id,
            parentId: prevNodeId,
            nodeType: {
              kind: "tool_call",
              name: part.tool,
              input,
              output,
              isError: part.state.status === "error",
            },
            timestamp: part.state.time?.start ?? asst.time.created,
            branchLevel: 0,
            model,
            usage,
            source: "opencode",
            cost,
            turnId,
          }
        } else if (part.type === "patch" && part.files && part.hash) {
          node = {
            id: part.id,
            parentId: prevNodeId,
            nodeType: { kind: "patch", files: part.files, hash: part.hash },
            timestamp: asst.time.created,
            branchLevel: 0,
            source: "opencode",
            turnId,
          }
        }

        if (node) {
          nodes.push(node)
          prevNodeId = node.id
        }
      }
    }
  }

  // Build edges
  const edges: Edge[] = nodes
    .filter(n => n.parentId)
    .map(n => ({ from: n.parentId!, to: n.id, isBranch: false }))

  // Compute stats
  const stats = computeStats(messages)

  return { nodes, edges, stats }
}

function computeStats(messages: OCMessage[]): SessionStats {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheRead = 0
  let totalCacheCreation = 0
  let totalReasoningTokens = 0
  let totalCost = 0
  let model: string | null = null

  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    const t = msg.tokens
    if (t) {
      totalInputTokens += t.input ?? 0
      totalOutputTokens += t.output ?? 0
      totalCacheRead += t.cache?.read ?? 0
      totalCacheCreation += t.cache?.write ?? 0
      totalReasoningTokens += t.reasoning ?? 0
    }
    if (msg.cost) totalCost += msg.cost
    const mid = msg.modelID ?? msg.model?.modelID
    if (mid) model = mid
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheRead,
    totalCacheCreation,
    model,
    totalCost: totalCost || undefined,
    totalReasoningTokens: totalReasoningTokens || undefined,
  }
}

function emptyStats(): SessionStats {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    model: null,
  }
}
