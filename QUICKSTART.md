# Vizzy Quickstart

## What you just built

A minimal TUI that visualizes Claude Code's execution graph in real-time. Think of it as a time-series view of every message, tool call, and agent spawn.

## Try it now

```bash
make dev
```

This will:
1. Parse the current Claude Code session
2. Build a graph of all messages, tools, and agents
3. Launch an interactive TUI to navigate it

## Navigation

- `j` / `↓` : Next node
- `k` / `↑` : Previous node
- `q` : Quit

## What you'll see

```
[User] I want to create a visualizer...
  [Asst] This is a fascinating idea...
  [Tool] Task
    [Result] OK
  [Asst] Perfect! Now I have...
[User] ...
```

Each node shows:
- Type (User, Assistant, Tool, Result, Agent)
- Preview text
- Branch level (indentation for parallel agents)

Bottom panel shows full details for selected node.

## Architecture

Pure functional pipeline:

```
JSONL files → Parser → Graph Builder → State → TUI
```

- **Data layer**: Pure functions (watcher, parser, graph builder)
- **View layer**: Side effects (TUI rendering)

## Files

- `src/types.rs` - Core data structures
- `src/parser.rs` - JSONL → Nodes
- `src/graph.rs` - Nodes → Graph
- `src/watcher.rs` - File I/O
- `src/ui.rs` - TUI rendering
- `src/main.rs` - Entry point

## Data source

Reads from `~/.claude/projects/{project}/{sessionId}.jsonl`

Each line is a JSON event with:
- `uuid` - Unique ID
- `parentUuid` - Links to parent (builds tree)
- `type` - user/assistant/progress
- `message.content` - Text or tool calls
- `timestamp` - When it happened

## Next steps

1. **Real-time mode**: Watch files with `notify` crate
2. **Better layout**: Horizontal time-series with curves
3. **Search**: Filter by node type, tool name, etc.
4. **Fork**: Create new branches from any node
5. **Export**: Generate HTML/SVG/JSON

## The vision

This is the foundation for a sci-fi terminal interface where you can:
- See execution flow in real-time
- Navigate the decision tree
- Fork from any point
- Time-travel through the conversation
- Understand what Claude Code is doing

Clean, minimal, powerful.
