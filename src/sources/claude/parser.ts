import type { SessionEvent, Node, NodeType } from "../../core/types"

let counter = 0
function generateId(): string {
  return `generated-${counter++}`
}

export function parseEventToNodes(event: SessionEvent): Node[] {
  const nodes: Node[] = []
  const branchLevel = 0
  const ts = new Date(event.timestamp).getTime()
  const uuid = event.uuid || generateId()

  if (event.message) {
    const { role, content } = event.message

    if (role === "user") {
      const toolResults = extractToolResults(content)
      if (toolResults) {
        for (let i = 0; i < toolResults.length; i++) {
          const [toolUseId, output, isError] = toolResults[i]
          nodes.push({
            id: `${uuid}:${i}`,
            parentId: toolUseId,
            nodeType: { kind: "tool_result", output, isError },
            timestamp: ts,
            branchLevel,
            agentId: event.agentId,
          })
        }
      } else {
        const text = extractTextContent(content)
        if (text) {
          nodes.push({
            id: uuid,
            parentId: event.parentUuid,
            nodeType: { kind: "user", text },
            timestamp: ts,
            branchLevel,
            agentId: event.agentId,
          })
        }
      }
    }

    if (role === "assistant") {
      const text = extractTextContent(content)
      const hasTextNode = text.length > 0
      const model = event.message?.model
      const usage = event.message?.usage

      if (hasTextNode) {
        nodes.push({
          id: uuid,
          parentId: event.parentUuid,
          nodeType: { kind: "assistant", text },
          timestamp: ts,
          branchLevel,
          agentId: event.agentId,
          model,
          usage,
        })
      }

      const toolUses = extractToolUses(content)
      if (toolUses) {
        const toolParent = hasTextNode ? uuid : event.parentUuid
        for (const [toolId, name, input] of toolUses) {
          nodes.push({
            id: toolId,
            parentId: toolParent,
            nodeType: { kind: "tool_use", name, input },
            timestamp: ts,
            branchLevel,
            agentId: event.agentId,
            model,
            usage,
          })
        }
      }
    }
  }

  // Skip progress events — they're streaming noise, not meaningful turns

  return nodes
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((item: any) => item?.type === "text" && typeof item?.text === "string")
    .map((item: any) => item.text as string)
    .join(" ")
}

// Returns [toolId, name, prettyInput][]
function extractToolUses(content: unknown): [string, string, string][] | null {
  if (!Array.isArray(content)) return null
  const tools: [string, string, string][] = []
  for (const item of content) {
    if (item?.type === "tool_use") {
      const id = item.id as string
      const name = item.name as string
      const input = JSON.stringify(item.input, null, 2)
      tools.push([id, name, input])
    }
  }
  return tools.length > 0 ? tools : null
}

// Returns [toolUseId, output, isError][]
function extractToolResults(content: unknown): [string, string, boolean][] | null {
  if (!Array.isArray(content)) return null
  const results: [string, string, boolean][] = []
  for (const item of content) {
    if (item?.type === "tool_result") {
      const toolUseId = item.tool_use_id as string
      const output = typeof item.content === "string" ? item.content : ""
      const isError = item.is_error === true
      results.push([toolUseId, output, isError])
    }
  }
  return results.length > 0 ? results : null
}
