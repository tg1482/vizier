# Vizzy Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         User Layer                          │
│                                                             │
│  Terminal → Interactive TUI (ratatui + crossterm)          │
│             - Navigation (j/k/arrows)                      │
│             - Selection highlighting                       │
│             - Detail panel                                 │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                     │
│                                                             │
│  UI Renderer (src/ui.rs)                                   │
│  - format_node() → Visual representation                   │
│  - format_node_details() → Detail view                     │
│  - AppState → Selection + scroll state                     │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                       Core Logic Layer                      │
│                      (Pure Functions)                       │
│                                                             │
│  Graph Builder (src/graph.rs)                              │
│  - build_from_events() → Graph                             │
│  - Maintains nodes + edges                                 │
│  - Sorts by timestamp                                      │
│                                                             │
│  Parser (src/parser.rs)                                    │
│  - parse_event_to_node() → Node[]                          │
│  - extract_text_content()                                  │
│  - extract_tool_uses()                                     │
│  - extract_tool_results()                                  │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                        Data Layer                           │
│                     (Side Effects)                          │
│                                                             │
│  Session Watcher (src/watcher.rs)                          │
│  - read_all_events() → SessionEvent[]                      │
│  - Reads JSONL files                                       │
│  - Aggregates main session + agent files                   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                       Storage Layer                         │
│                                                             │
│  ~/.claude/projects/{project}/{sessionId}.jsonl            │
│  ~/.claude/projects/{project}/{sessionId}/subagents/*.jsonl│
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Read Path (Initialization)

```
1. User runs: vizzy
   ↓
2. SessionWatcher.get_current_session_id()
   → Read ~/.claude/history.jsonl (last line)
   ↓
3. SessionWatcher.new(project, session_id)
   → Find main session file + agent files
   ↓
4. watcher.read_all_events()
   → Parse JSONL → SessionEvent[]
   ↓
5. GraphBuilder.build_from_events(events)
   → For each event:
      - parse_event_to_node() → Node[]
      - graph.add_node(node)
   → Sort by timestamp
   ↓
6. AppState::new(graph)
   → Initialize TUI state
   ↓
7. run_tui(graph)
   → Enter interactive mode
```

### Render Loop

```
loop {
    1. terminal.draw(|f| ui::render(f, &state))
       ↓
    2. render_graph() - Top panel
       - Filter visible nodes by scroll offset
       - Format each node (prefix, text, color)
       - Apply selection highlighting
       ↓
    3. render_details() - Bottom panel
       - Get selected node
       - format_node_details()
       - Show full content
       ↓
    4. Handle input events
       - j/k → state.next() / state.previous()
       - q → break
}
```

## Data Structures

### Core Types (src/types.rs)

```rust
SessionEvent (from JSONL)
├─ uuid: String
├─ parent_uuid: Option<String>
├─ is_sidechain: bool         // true = agent branch
├─ agent_id: Option<String>
├─ message: Option<Message>
│  ├─ role: "user" | "assistant"
│  └─ content: Value          // text or tool calls
└─ timestamp: DateTime<Utc>

       ↓ parse_event_to_node()

Node (internal representation)
├─ id: String
├─ parent_id: Option<String>  // builds tree
├─ node_type: NodeType
│  ├─ UserMessage(text)
│  ├─ AssistantMessage(text)
│  ├─ ToolUse { name, input }
│  ├─ ToolResult { output, is_error }
│  ├─ AgentStart { agent_id, agent_type }
│  ├─ AgentEnd { agent_id }
│  └─ Progress(msg)
├─ timestamp: DateTime<Utc>
└─ branch_level: u32          // 0=main, 1+=agents

       ↓ graph.add_node()

Graph
├─ nodes: Vec<Node>           // sorted by time
├─ edges: Vec<Edge>           // parent→child links
└─ active_branches: Vec<String>
```

## Key Design Principles

### 1. Unix Philosophy

- **Do one thing well**: Visualize execution graph
- **Simple data structures**: JSONL → Nodes → Graph
- **Composable**: Each layer is independent

### 2. Functional Core

Parser and Graph Builder are **pure functions**:
- Input: SessionEvent[]
- Output: Graph
- No side effects
- Easy to test

### 3. Side Effects at Edges

I/O isolated to:
- `watcher.rs` - File reading
- `main.rs` - TUI setup
- `ui.rs` - Terminal rendering

### 4. Data-Driven

Everything is data transformation:
```
JSONL → Events → Nodes → Graph → UI State → Rendered
```

## Future Extensions

### Real-time Mode

```rust
use notify::{Watcher, RecursiveMode};

let (tx, rx) = channel();
let mut watcher = notify::watcher(tx, Duration::from_millis(100))?;

watcher.watch(&session_file, RecursiveMode::NonRecursive)?;

loop {
    match rx.try_recv() {
        Ok(event) => {
            // New JSONL line detected
            let new_events = read_new_lines();
            graph_builder.add_events(new_events);
        }
        Err(_) => {
            // Render as usual
        }
    }
}
```

### Horizontal Layout

Current: Vertical list (time flows down)
Future: Horizontal flow (time flows right)

```
Time →

Main:    [User] → [Asst] → [Tool:Read] → [Result] → [Asst]
                    ↓
Agent:             [Start] → [Grep] → [Result] → [End]
                                ↓
SubAgent:                      [Task] → [Done]
```

### Search/Filter

```rust
impl Graph {
    pub fn filter(&self, predicate: impl Fn(&Node) -> bool) -> Graph {
        let filtered_nodes: Vec<Node> = self.nodes
            .iter()
            .filter(|n| predicate(n))
            .cloned()
            .collect();

        // Rebuild edges
        ...
    }
}

// Usage:
graph.filter(|n| matches!(n.node_type, NodeType::ToolUse { .. }))
```

### Fork from Node

```rust
impl Node {
    pub fn fork(&self) -> Result<SessionId> {
        // 1. Create new session
        // 2. Copy conversation up to this node
        // 3. Start new conversation from here
        // 4. Launch Claude Code with new session
    }
}
```

## Performance Considerations

### Current Scale

- Typical session: 100-1000 nodes
- Parse time: <10ms
- Render time: ~1ms
- Memory: <10MB

### Future Optimizations

If sessions get huge (10k+ nodes):

1. **Lazy loading**: Only parse visible range
2. **Virtual scrolling**: Don't render off-screen nodes
3. **Incremental parsing**: Stream JSONL instead of loading all
4. **Indexing**: Build timestamp index for fast seeks

## Dependencies

Minimal, battle-tested crates:

- `ratatui` - TUI framework (pure Rust, composable)
- `crossterm` - Terminal control (cross-platform)
- `serde_json` - JSON parsing (standard)
- `notify` - File watching (future)
- `chrono` - Datetime handling
- `clap` - CLI args
- `anyhow` - Error handling

No heavy frameworks, no unnecessary abstractions.

## Testing Strategy

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_user_message() {
        let event = SessionEvent { /* ... */ };
        let nodes = parse_event_to_node(event).unwrap();
        assert_eq!(nodes[0].node_type, NodeType::UserMessage(_));
    }

    #[test]
    fn test_graph_sorts_by_time() {
        let mut builder = GraphBuilder::new();
        // Add nodes out of order
        // Assert they're sorted after build
    }
}
```

### Integration Tests

```bash
# Test with real session data
cargo test --test integration -- --test-threads=1
```

## Conclusion

Clean separation of concerns:
- **Data** (types.rs)
- **Logic** (parser.rs, graph.rs)
- **I/O** (watcher.rs)
- **UI** (ui.rs)

Pure functions in the middle, side effects at the edges.

This is the unix way.
