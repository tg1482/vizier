# Agents

Vizier visualizes Claude Code agent and subagent activity by merging agent JSONL files into the main session stream.

## Where Agent Data Lives

- Main session file: `~/.claude/projects/<project>/<sessionId>.jsonl`
- Agent files: `~/.claude/projects/<project>/<sessionId>/subagents/*.jsonl`

## How We Merge It

- We read the main session file and all agent files, then sort events by timestamp.
- Agent events carry an `agentId`, and progress entries include `data.type = "agent_progress"` with a `parentToolUseID`.
- The graph builder links the first agent node back to its parent tool call and assigns a branch level so parallel agents render on separate lanes.
