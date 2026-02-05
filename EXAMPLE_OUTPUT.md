# Vizzy - Information Dense View

## What You Now See:

```
Timeline [h/l:node j/k:select f/b:page g/G:start/end q:quit]

    10:30:15        10:30:18        10:30:20        10:30:22        10:30:25

  │ [User] I want to create a visualizer plugin for clau...
  │ [Asst] This is a fascinating idea — visualizing Clau...
  ├─  [Tool:Task] explore
  │   [Result:OK] Found 5 Rust files in codebase
  ├─  [Agent:Explore] Start
  ├─    [Tool:Grep] *.jsonl
  ├─    [Tool:Read] ~/.claude/projects/...
  │     [Result:OK] (2000 lines)
  ├─  [Agent:Explore] End
  │ [Asst] Perfect! Now I understand the structure...
  │ [Tool:Write] src/types.rs
  │   [Result:OK]

Showing 1-10 of 375 nodes
```

## Key Improvements:

1. **Timestamps** - See exactly when each action happened
2. **Full Labels** - Know what each node is:
   - `[User]` - User messages with preview
   - `[Asst]` - Assistant messages with preview  
   - `[Tool:Name]` - Tool calls with parameters (file paths, commands, etc.)
   - `[Result:OK/ERROR]` - Results with preview
   - `[Agent:Type]` - Agent spawns and completions
   
3. **Parent-Child Lines** - Visual tree structure:
   - `│` - Continues from parent
   - `├─` - Branches to child
   - Indentation shows nesting level

4. **Navigation**:
   - `h/l` - Move one node at a time
   - `f/b` - Page forward/back (10 nodes)
   - `g/G` - Jump to start/end
   - `j/k` - Select nodes for details

5. **Window View** - Shows 8 nodes at a time for readability

## Example Session Flow:

```
10:30:15 [User] Create visualizer
         ↓
10:30:18 [Asst] Great idea! Let me explore...
         ↓
10:30:20 [Tool:Task] Start Explore agent
         ├─ 10:30:21 [Agent:Explore] Start
         │           ↓
         │  10:30:22 [Tool:Grep] Search codebase
         │           ↓  
         │  10:30:23 [Result:OK] Found files
         │           ↓
         │  10:30:24 [Agent:Explore] Done
         ↓
10:30:25 [Asst] Here's what I found...
```

Each node shows WHAT happened and WHEN, with clear parent-child relationships!
