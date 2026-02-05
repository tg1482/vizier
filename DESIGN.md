# Vizzy - Claude Code Execution Visualizer

## Vision
A minimal, interactive TUI that visualizes Claude Code's execution tree as a time-series graph. Think git graph meets htop meets sci-fi terminal aesthetic.

## Core Concept

```
Time flows left → right
Parallel execution shown vertically

Main Branch:  [User] → [Assistant] → [Tool:Read] → [Assistant] → [User]
                              ↓
Agent Branch:                [Agent Start] → [Explore] → [Read] → [Agent Done]
                                                ↓
Sub-Agent:                                    [Task] → [Complete]
```

## Data Source
Claude Code stores execution data in JSONL files:
- Main conversation: `~/.claude/projects/{project}/{sessionId}.jsonl`
- Agent execution: `~/.claude/projects/{project}/{sessionId}/subagents/agent-{id}.jsonl`
- Tasks: `~/.claude/tasks/{sessionId}/{taskId}.json`

Each line is a JSON object with:
- `uuid`: Unique message ID
- `parentUuid`: Links to parent message (builds tree)
- `type`: user|assistant|progress
- `isSidechain`: true for agent branches
- `message.content`: Text or tool calls
- `timestamp`: ISO-8601

## Architecture

### 1. Data Layer (Pure)
```
Watcher → Parser → GraphBuilder → State
```

- **Watcher**: Tail JSONL files, emit new lines
- **Parser**: JSONL → structured events
- **GraphBuilder**: Events → graph nodes/edges
- **State**: Immutable graph structure

### 2. View Layer (Side-effects)
```
State → Renderer → TUI
```

- **Renderer**: Graph → visual layout
- **TUI**: Draw to terminal, handle input

### 3. Node Types
```rust
enum NodeType {
    UserMessage(text),
    AssistantMessage(text),
    ToolUse(name, input),
    ToolResult(output),
    AgentStart(agentId, type),
    AgentEnd(agentId),
    Progress(message),
}
```

### 4. Graph Structure
```rust
struct Node {
    id: uuid,
    parent_id: Option<uuid>,
    node_type: NodeType,
    timestamp: DateTime,
    branch_level: u32,  // 0=main, 1=agent, 2=sub-agent
}

struct Graph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    active_branches: Vec<BranchId>,
}
```

## Visual Design

### Node Rendering
```
[User]  →  [Asst]  →  [Read:file.rs]  →  [Result:OK]
                 ↓
                [Agent:Explore]  →  [Grep:*.ts]  →  [Done]
```

### Colors (minimal palette)
- User messages: Cyan
- Assistant messages: Green
- Tool calls: Yellow
- Agents: Magenta
- Errors: Red
- Complete: Dim gray

### Layout Algorithm
1. Sort nodes by timestamp
2. Group by branch (main=0, agents=1+)
3. Position x=timestamp, y=branch_level
4. Draw edges parent→child with curves for branches

## Interaction

### Navigation
- `j/k` or arrow keys: Move through nodes
- `Enter`: Expand node details
- `f`: Fork from selected node (future)
- `q`: Quit
- `/`: Search nodes

### Node Details Panel
```
┌─ Node Details ─────────────────┐
│ Type: Tool Use                 │
│ Name: Read                     │
│ Time: 2026-02-05 10:30:45     │
│                                │
│ Input:                         │
│ { "file_path": "/path/file" } │
│                                │
│ Result: (150 lines)           │
│ [View Full Output]            │
└────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Data Pipeline (Core)
- [ ] JSONL file watcher
- [ ] Event parser
- [ ] Graph builder
- [ ] State management

### Phase 2: Basic Rendering
- [ ] TUI setup (ratatui)
- [ ] Node rendering
- [ ] Edge drawing
- [ ] Scrolling viewport

### Phase 3: Interaction
- [ ] Node navigation
- [ ] Detail panel
- [ ] Search

### Phase 4: Polish
- [ ] Real-time updates
- [ ] Performance optimization
- [ ] Config file

## Tech Stack

- **Language**: Rust (performance, TUI ecosystem)
- **TUI**: ratatui (minimal, composable)
- **File watching**: notify
- **JSON parsing**: serde_json
- **CLI**: clap

## Usage

```bash
# Watch current session
vizzy

# Watch specific session
vizzy --session <session-id>

# Replay from start
vizzy --replay

# Export to HTML
vizzy --export graph.html
```

## Data Flow Example

```
1. User: "Read main.rs"
   → Node: [User:"Read main.rs"]

2. Assistant: "Let me read that file" + Tool(Read, main.rs)
   → Node: [Asst:"Let me read..."]
   → Node: [Tool:Read main.rs]

3. Tool Result: (file contents)
   → Node: [Result:OK]

4. Assistant: "I see it's a binary" + Tool(Task, explore)
   → Node: [Asst:"I see..."]
   → Node: [Tool:Task explore]

5. Agent Start (Explore)
   → Branch: level=1
   → Node: [Agent:Explore Start]

6. Agent: Uses Grep
   → Node: [Tool:Grep *.rs]
   → Node: [Result:5 files]

7. Agent: Complete
   → Node: [Agent:Explore Done]

8. Back to main branch
   → Node: [Asst:"Found 5 Rust files..."]
```

## Future Ideas

- Fork execution from any node
- Diff between branches
- Export to various formats
- Integration with Claude Code CLI
- Time-travel debugging
- Collapse/expand branches
- Filter by node type
- Cost tracking (tokens)

## Visual Update - Horizontal Timeline

Inspired by modern CI/CD pipeline visualizations, Vizzy now uses a horizontal timeline:

```
Timeline [h/l scroll, j/k select, q quit]

L0 ●──◉──⬢──✓──◉──⬢──✓──●──
L1      └──⟐──⬢──⬢──✓──⟐
L2             └──○──✓

Legend:
● User message     ◉ Assistant      ⬢ Tool use
✓ Success         ✗ Error          ⟐ Agent
○ Progress
```

### Features:
- **Horizontal flow**: Time flows left→right
- **Branch levels**: L0 (main), L1+ (agents/subprocesses)
- **Symbol-based nodes**: Quick visual scanning
- **Scroll**: h/l to pan timeline, j/k to select nodes
- **Color coding**: Cyan (user), Green (success), Yellow (tools), Red (errors), Magenta (agents)

### Inspired by:
- Git graph visualizations
- CI/CD pipeline runners
- Temporal workflow diagrams
- Sci-fi terminal aesthetics

