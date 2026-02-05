// Thin wrapper around @anthropic-ai/claude-agent-sdk
// SDK integration is deferred until the package is available.
// For now, these are typed stubs that will be wired to the real SDK.

export type SendMessageOpts = {
  onStream?: (text: string) => void
  abortController?: AbortController
}

export type ToolApprovalHandler = (toolName: string, input: unknown) => Promise<boolean>

export async function sendMessage(
  _sessionId: string,
  _prompt: string,
  _opts?: SendMessageOpts,
): Promise<void> {
  // TODO: wire to `query()` from @anthropic-ai/claude-agent-sdk
  // The SDK will write to the JSONL file, and our file watcher picks it up
}

export async function forkSession(
  _sessionId: string,
  _prompt: string,
): Promise<string> {
  // TODO: wire to `query({ resume: sessionId, forkSession: true })`
  // Returns new session ID
  return ""
}

export async function queryWithApproval(
  _sessionId: string,
  _prompt: string,
  _opts: { onToolApproval: ToolApprovalHandler },
): Promise<void> {
  // TODO: wire to `query()` with canUseTool callback
}
