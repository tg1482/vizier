use crate::types::{Graph, Node, NodeType};
use crate::zoom::{ZoomLevel, ZoomState, filter_by_zoom, get_zoom_label, get_visual_branch};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

pub struct AppState {
    pub graph: Graph,
    pub current_level: usize,     // Which row we're on (0=User, 1=Asst, 2+=Tools/Agents)
    pub cursor_in_level: usize,   // Position within that level
    pub zoom: ZoomState,
    pub focused_node: Option<usize>, // Which node is zoomed/expanded (if any)
    pub blink_state: bool,        // Toggles for blinking effect
    pub session_id: String,       // Current session ID
    pub available_sessions: Vec<SessionInfo>, // All sessions in this project
    pub session_list_open: bool,  // Whether session picker is showing
    pub session_list_cursor: usize, // Cursor in session list
    pub timeline_open: bool,      // Whether timeline is showing
    pub details_open: bool,       // Whether details panel is showing
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub node_count: usize,
    pub waiting_for_user: bool, // True if last event is Assistant message
}

impl AppState {
    // Check if a node is actively running (tool without result yet)
    fn is_node_active(&self, idx: usize) -> bool {
        if let Some(node) = self.graph.nodes.get(idx) {
            // Check if it's a ToolUse
            if matches!(node.node_type, NodeType::ToolUse { .. }) {
                let tool_id = &node.id;
                // Look for a matching ToolResult after this node
                let has_result = self.graph.nodes.iter()
                    .skip(idx + 1)
                    .any(|n| {
                        if let Some(parent_id) = &n.parent_id {
                            parent_id == tool_id && matches!(n.node_type, NodeType::ToolResult { .. })
                        } else {
                            false
                        }
                    });
                return !has_result;
            }
        }
        false
    }

    pub fn new(graph: Graph, session_id: String, available_sessions: Vec<SessionInfo>) -> Self {
        // Find the last User message as starting point
        let last_user_idx = graph.nodes.iter()
            .rposition(|n| matches!(n.node_type, NodeType::UserMessage(_)))
            .unwrap_or(0);

        // Count how many user messages come before this
        let cursor_in_level = graph.nodes.iter()
            .take(last_user_idx + 1)
            .filter(|n| matches!(n.node_type, NodeType::UserMessage(_)))
            .count()
            .saturating_sub(1);

        Self {
            graph,
            current_level: 0,  // Start on User row
            cursor_in_level,
            zoom: ZoomState::new(),
            focused_node: None,
            blink_state: false,
            session_id,
            available_sessions,
            session_list_open: false,
            session_list_cursor: 0,
            timeline_open: true,      // Start with timeline visible
            details_open: false,      // Start with details hidden
        }
    }

    pub fn toggle_session_list(&mut self) {
        self.session_list_open = !self.session_list_open;
        if self.session_list_open {
            // Find current session in list
            self.session_list_cursor = self.available_sessions.iter()
                .position(|s| s.id == self.session_id)
                .unwrap_or(0);
        }
    }

    pub fn session_list_up(&mut self) {
        if self.session_list_cursor > 0 {
            self.session_list_cursor -= 1;
        }
    }

    pub fn session_list_down(&mut self) {
        if self.session_list_cursor < self.available_sessions.len().saturating_sub(1) {
            self.session_list_cursor += 1;
        }
    }

    pub fn get_selected_session(&self) -> Option<String> {
        self.available_sessions.get(self.session_list_cursor)
            .map(|s| s.id.clone())
    }

    // Toggle focus/zoom on current node
    pub fn toggle_focus(&mut self) {
        if let Some(node_idx) = self.get_current_node_index() {
            if self.focused_node == Some(node_idx) {
                self.focused_node = None;
            } else {
                self.focused_node = Some(node_idx);
            }
        }
    }

    // Move to next level down (User → Asst → Tools → etc.)
    pub fn level_down(&mut self) {
        let max_level = self.get_max_level();
        if self.current_level < max_level {
            // Get current timestamp before switching levels
            let current_timestamp = self.get_current_node_index()
                .and_then(|idx| self.graph.nodes.get(idx))
                .map(|n| n.timestamp);

            self.current_level += 1;

            // Find nearest node in new level by timestamp
            if let Some(ts) = current_timestamp {
                self.cursor_in_level = self.find_nearest_in_level(ts);
            } else {
                self.cursor_in_level = 0;
            }
        }
    }

    // Move to previous level up
    pub fn level_up(&mut self) {
        if self.current_level > 0 {
            // Get current timestamp before switching levels
            let current_timestamp = self.get_current_node_index()
                .and_then(|idx| self.graph.nodes.get(idx))
                .map(|n| n.timestamp);

            self.current_level -= 1;

            // Find nearest node in new level by timestamp
            if let Some(ts) = current_timestamp {
                self.cursor_in_level = self.find_nearest_in_level(ts);
            } else {
                self.cursor_in_level = 0;
            }
        }
    }

    // Find the nearest node in current level to a given timestamp
    fn find_nearest_in_level(&self, target_timestamp: chrono::DateTime<chrono::Utc>) -> usize {
        let level_nodes: Vec<(usize, chrono::DateTime<chrono::Utc>)> = self.graph.nodes.iter()
            .enumerate()
            .filter(|(_, n)| {
                let visual_branch = get_visual_branch(n, self.zoom.level);
                visual_branch == self.current_level
            })
            .map(|(idx, n)| (idx, n.timestamp))
            .collect();

        if level_nodes.is_empty() {
            return 0;
        }

        // Find the node with closest timestamp
        level_nodes.iter()
            .enumerate()
            .min_by_key(|(_, (_, ts))| {
                let diff = if *ts > target_timestamp {
                    (*ts - target_timestamp).num_seconds()
                } else {
                    (target_timestamp - *ts).num_seconds()
                };
                diff.abs()
            })
            .map(|(pos, _)| pos)
            .unwrap_or(0)
    }

    // Move right within current level
    pub fn move_right(&mut self) {
        let nodes_in_level = self.get_nodes_in_current_level();
        if self.cursor_in_level < nodes_in_level.saturating_sub(1) {
            self.cursor_in_level += 1;
        }
    }

    // Move left within current level
    pub fn move_left(&mut self) {
        if self.cursor_in_level > 0 {
            self.cursor_in_level -= 1;
        }
    }

    // Get nodes that belong to the current level
    pub fn get_nodes_in_current_level(&self) -> usize {
        self.graph.nodes.iter()
            .filter(|n| {
                let visual_branch = get_visual_branch(n, self.zoom.level);
                visual_branch == self.current_level
            })
            .count()
    }

    // Get the actual node index in the graph for current cursor position
    pub fn get_current_node_index(&self) -> Option<usize> {
        self.graph.nodes.iter()
            .enumerate()
            .filter(|(_, n)| {
                let visual_branch = get_visual_branch(n, self.zoom.level);
                visual_branch == self.current_level
            })
            .nth(self.cursor_in_level)
            .map(|(idx, _)| idx)
    }

    pub fn selected_node(&self) -> Option<&Node> {
        self.get_current_node_index()
            .and_then(|idx| self.graph.nodes.get(idx))
    }

    pub fn get_max_level(&self) -> usize {
        self.graph.nodes.iter()
            .map(|n| get_visual_branch(n, self.zoom.level))
            .max()
            .unwrap_or(1)
    }

}

pub fn render(f: &mut Frame, state: &AppState) {
    // Build layout based on what panels are open
    let mut constraints = Vec::new();
    let mut panels = Vec::new();

    if state.session_list_open {
        constraints.push(Constraint::Min(10));
        panels.push("sessions");
    }

    if state.timeline_open {
        constraints.push(Constraint::Min(10));
        panels.push("timeline");
    }

    if state.details_open {
        constraints.push(Constraint::Min(15));
        panels.push("details");
    }

    // If nothing is open, default to timeline
    if constraints.is_empty() {
        constraints.push(Constraint::Min(10));
        panels.push("timeline");
    }

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(f.area());

    // Render each panel
    let mut chunk_idx = 0;
    for panel in panels {
        match panel {
            "sessions" => render_session_list(f, chunks[chunk_idx], state),
            "timeline" => render_timeline(f, chunks[chunk_idx], state),
            "details" => render_details(f, chunks[chunk_idx], state),
            _ => {}
        }
        chunk_idx += 1;
    }
}

fn render_timeline(f: &mut Frame, area: Rect, state: &AppState) {
    let mut lines = Vec::new();

    // Title with zoom level and live indicator
    let zoom_label = get_zoom_label(state.zoom.level);
    lines.push(Line::from(vec![
        Span::styled(
            format!("[{}] ", zoom_label),
            Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)
        ),
        Span::styled("● LIVE ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        Span::styled(
            "h/l:nav j/k:level t:timeline d:details s:sessions q:quit",
            Style::default().fg(Color::DarkGray)
        )
    ]));
    lines.push(Line::from(""));

    // Get filtered indices based on zoom level
    let visible_indices = filter_by_zoom(&state.graph.nodes, state.zoom.level);

    if visible_indices.is_empty() {
        lines.push(Line::from("No nodes at this zoom level"));
    } else {
        // Get nodes in current level for centering
        let current_level_nodes: Vec<usize> = visible_indices.iter()
            .enumerate()
            .filter(|(_, &idx)| {
                let node = &state.graph.nodes[idx];
                get_visual_branch(node, state.zoom.level) == state.current_level
            })
            .map(|(i, _)| i)
            .collect();

        // Find the actual position of cursor in the full timeline
        let cursor_global_pos = current_level_nodes.get(state.cursor_in_level).copied().unwrap_or(0);

        // CAMERA-CENTRIC: Center the view on the cursor
        let nodes_per_screen = ((area.width as usize).saturating_sub(10)) / 4;
        let half_screen = nodes_per_screen / 2;

        // Calculate window so cursor is centered
        let start = if cursor_global_pos < half_screen {
            0
        } else if cursor_global_pos + half_screen >= visible_indices.len() {
            visible_indices.len().saturating_sub(nodes_per_screen)
        } else {
            cursor_global_pos.saturating_sub(half_screen)
        };

        let end = (start + nodes_per_screen).min(visible_indices.len());
        let window_indices = &visible_indices[start..end];

        // Timestamps row - show smartly: every 4th node or when time changes significantly
        let mut time_line = vec![Span::raw("Time  ")];
        let mut last_shown_time: Option<chrono::DateTime<chrono::Utc>> = None;
        let mut skip_next = 0;

        for (pos, &idx) in window_indices.iter().enumerate() {
            let node = &state.graph.nodes[idx];

            if skip_next > 0 {
                skip_next -= 1;
                time_line.push(Span::raw("   "));
                continue;
            }

            // Decide if we should show this timestamp
            let should_show = if let Some(last_time) = last_shown_time {
                // Show if: 1) Every 5th position, OR 2) Time changed by 1+ minutes
                pos % 5 == 0 || (node.timestamp - last_time).num_seconds() >= 60
            } else {
                true // Always show first
            };

            if should_show {
                let time = node.timestamp.format("%H:%M").to_string();
                // Time is 5 chars, node is 3, so it spans ~2 nodes
                time_line.push(Span::styled(
                    time,
                    Style::default().fg(Color::DarkGray)
                ));
                last_shown_time = Some(node.timestamp);
                skip_next = 1; // Skip next node to give time space
            } else {
                time_line.push(Span::raw("   "));
            }
        }
        lines.push(Line::from(time_line));
        lines.push(Line::from(""));

        // Calculate max visual branch (not actual branch level!)
        let max_visual_branch = window_indices.iter()
            .map(|&idx| get_visual_branch(&state.graph.nodes[idx], state.zoom.level))
            .max()
            .unwrap_or(1);

        // Build column-position lookup: node_id -> column index in window
        let node_id_to_col: std::collections::HashMap<&str, usize> = window_indices.iter()
            .enumerate()
            .map(|(col, &idx)| (state.graph.nodes[idx].id.as_str(), col))
            .collect();

        // Pre-compute connector columns for each gap between adjacent rows.
        // Walk the timeline: when the visual branch changes between consecutive
        // nodes, place a │ at the transition column through all intermediate gaps.
        let max_branch = max_visual_branch.min(6);
        let num_cols = window_indices.len();
        let mut connector_gaps: Vec<std::collections::HashSet<usize>> = vec![std::collections::HashSet::new(); max_branch];

        let mut prev_branch: Option<usize> = None;
        for (col, &idx) in window_indices.iter().enumerate() {
            let branch = get_visual_branch(&state.graph.nodes[idx], state.zoom.level);
            if branch > max_branch { continue; }

            if let Some(pb) = prev_branch {
                if pb != branch {
                    let (lo, hi) = if pb < branch { (pb, branch) } else { (branch, pb) };
                    // Place connector at the arriving node's column
                    for gap in lo..hi {
                        connector_gaps[gap].insert(col);
                    }
                }
            }
            prev_branch = Some(branch);
        }

        // Render each visual branch row + connector row
        for visual_branch in 0..=max_branch {
            let row_label = match state.zoom.level {
                ZoomLevel::Conversations => {
                    match visual_branch {
                        0 => "User ",
                        1 => "Asst ",
                        _ => "     ",
                    }
                }
                _ => {
                    match visual_branch {
                        0 => "User ",
                        1 => "Asst ",
                        2 => "Tool ",
                        3 => "Tool²",
                        4 => "Tool³",
                        5 => "Tool⁴",
                        _ => "Tool⁺",
                    }
                }
            };

            let label_style = if visual_branch == state.current_level {
                Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };

            let mut row_spans = vec![
                Span::styled(format!("{:<5}", row_label), label_style)
            ];

            for (pos, &idx) in window_indices.iter().enumerate() {
                let node = &state.graph.nodes[idx];
                let node_visual_branch = get_visual_branch(node, state.zoom.level);

                if node_visual_branch == visual_branch {
                    let (symbol, _label, color) = get_compact_node_info(node);

                    let is_cursor = visual_branch == state.current_level
                        && (start + pos) == cursor_global_pos;

                    let is_active = state.is_node_active(idx);

                    let mut style = Style::default().fg(color);
                    let display_symbol = if is_active {
                        if state.blink_state { "◐" } else { "◑" }
                    } else {
                        symbol
                    };

                    if is_cursor {
                        style = style.bg(Color::White).fg(Color::Black).add_modifier(Modifier::BOLD);
                    } else if is_active {
                        style = style.fg(Color::Yellow).add_modifier(Modifier::BOLD);
                    }

                    row_spans.push(Span::styled("──", Style::default().fg(Color::DarkGray)));
                    row_spans.push(Span::styled(display_symbol, style));
                } else {
                    row_spans.push(Span::raw("   "));
                }
            }

            lines.push(Line::from(row_spans));

            // Draw connector row for this gap
            if visual_branch < max_branch {
                let gap_cols = &connector_gaps[visual_branch];
                if !gap_cols.is_empty() {
                    let conn_style = Style::default().fg(Color::DarkGray);
                    let mut cells: Vec<[char; 3]> = vec![[' ', ' ', ' ']; num_cols];

                    for &c in gap_cols {
                        if c < num_cols {
                            cells[c][0] = '│';
                        }
                    }

                    let mut conn_spans = vec![Span::raw("     ")];
                    for c in 0..num_cols {
                        let s: String = cells[c].iter().collect();
                        conn_spans.push(Span::styled(s, conn_style));
                    }
                    lines.push(Line::from(conn_spans));
                }
            }
        }


        // FOCUS: Show expanded view if a node is focused
        if let Some(focused_idx) = state.focused_node {
            if let Some(selected_node) = state.graph.nodes.get(focused_idx) {
                lines.push(Line::from(""));
                lines.push(Line::from(""));

                // Draw box around focused node content
                let box_lines = render_node_box(selected_node);
                for box_line in box_lines {
                    lines.push(box_line);
                }
            }
        }

        lines.push(Line::from(""));

        let level_name = match state.current_level {
            0 => "User",
            1 => "Asst",
            _ => "Tools",
        };

        lines.push(Line::from(vec![
            Span::styled(
                format!("Level: {} | Position: {}/{} | Total: {} nodes ",
                    level_name,
                    state.cursor_in_level + 1,
                    state.get_nodes_in_current_level(),
                    visible_indices.len()
                ),
                Style::default().fg(Color::DarkGray)
            )
        ]));
    }

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::Cyan)));

    f.render_widget(paragraph, area);
}

fn render_details(f: &mut Frame, area: Rect, state: &AppState) {
    let content = if let Some(node) = state.selected_node() {
        format_node_details(node)
    } else {
        vec![Line::from("No node selected")]
    };

    let title = format!(" {} {}/{} ",
        match state.current_level {
            0 => "User",
            1 => "Asst",
            _ => "Tool",
        },
        state.cursor_in_level + 1,
        state.get_nodes_in_current_level()
    );

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray))
                .title(title)
        )
        .wrap(Wrap { trim: true });

    f.render_widget(paragraph, area);
}

fn get_compact_node_info(node: &Node) -> (&'static str, String, Color) {
    match &node.node_type {
        NodeType::UserMessage(text) => {
            let preview = truncate(text, 15);
            ("●", preview, Color::Cyan)
        }
        NodeType::AssistantMessage(text) => {
            let preview = truncate(text, 15);
            ("◉", preview, Color::Green)
        }
        NodeType::ToolUse { name, .. } => {
            ("⬢", name.clone(), Color::Yellow)
        }
        NodeType::ToolResult { is_error, .. } => {
            if *is_error {
                ("✗", "ERR".to_string(), Color::Red)
            } else {
                ("✓", "OK".to_string(), Color::Green)
            }
        }
        NodeType::AgentStart { agent_type, .. } => {
            ("⟐", format!("{}↓", agent_type), Color::Magenta)
        }
        NodeType::AgentEnd { .. } => {
            ("⟐", "↑".to_string(), Color::DarkGray)
        }
        NodeType::Progress(_) => {
            ("○", "...".to_string(), Color::Gray)
        }
    }
}

fn get_node_label(node: &Node) -> (String, Color) {
    match &node.node_type {
        NodeType::UserMessage(text) => {
            let preview = truncate(text, 50);
            (format!("[User] {}", preview), Color::Cyan)
        }
        NodeType::AssistantMessage(text) => {
            let preview = truncate(text, 50);
            (format!("[Asst] {}", preview), Color::Green)
        }
        NodeType::ToolUse { name, input } => {
            // Extract key info from input
            let preview = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(input) {
                if let Some(path) = parsed.get("file_path").and_then(|v| v.as_str()) {
                    format!(" {}", path)
                } else if let Some(pattern) = parsed.get("pattern").and_then(|v| v.as_str()) {
                    format!(" {}", pattern)
                } else if let Some(cmd) = parsed.get("command").and_then(|v| v.as_str()) {
                    format!(" {}", truncate(cmd, 30))
                } else {
                    String::new()
                }
            } else {
                String::new()
            };
            (format!("[Tool:{}]{}", name, preview), Color::Yellow)
        }
        NodeType::ToolResult { is_error, output } => {
            let status = if *is_error { "ERROR" } else { "OK" };
            let preview = truncate(output, 30);
            (
                format!("[Result:{}] {}", status, preview),
                if *is_error { Color::Red } else { Color::Green }
            )
        }
        NodeType::AgentStart { agent_id, agent_type } => {
            (format!("[Agent:{}] Start", agent_type), Color::Magenta)
        }
        NodeType::AgentEnd { agent_id } => {
            (format!("[Agent] End"), Color::DarkGray)
        }
        NodeType::Progress(msg) => {
            (format!("[Progress] {}", truncate(msg, 40)), Color::Gray)
        }
    }
}

fn format_node_details(node: &Node) -> Vec<Line> {
    let mut lines = vec![
        Line::from(vec![
            Span::styled("ID: ", Style::default().fg(Color::Gray)),
            Span::raw(node.id.clone()),
        ]),
        Line::from(vec![
            Span::styled("Time: ", Style::default().fg(Color::Gray)),
            Span::raw(node.timestamp.format("%Y-%m-%d %H:%M:%S").to_string()),
        ]),
        Line::from(vec![
            Span::styled("Branch Level: ", Style::default().fg(Color::Gray)),
            Span::raw(node.branch_level.to_string()),
        ]),
        Line::from(""),
    ];

    match &node.node_type {
        NodeType::UserMessage(text) => {
            lines.push(Line::from(Span::styled("User Message:", Style::default().fg(Color::Cyan))));
            lines.push(Line::from(text.clone()));
        }
        NodeType::AssistantMessage(text) => {
            lines.push(Line::from(Span::styled("Assistant Message:", Style::default().fg(Color::Green))));
            lines.push(Line::from(text.clone()));
        }
        NodeType::ToolUse { name, input } => {
            lines.push(Line::from(Span::styled(format!("Tool: {}", name), Style::default().fg(Color::Yellow))));
            lines.push(Line::from(""));
            lines.push(Line::from("Input:"));
            for line in input.lines().take(5) {
                lines.push(Line::from(line.to_string()));
            }
        }
        NodeType::ToolResult { output, is_error } => {
            let color = if *is_error { Color::Red } else { Color::Green };
            lines.push(Line::from(Span::styled("Tool Result:", Style::default().fg(color))));
            lines.push(Line::from(""));
            if output.trim().is_empty() {
                lines.push(Line::from(Span::styled("(empty result)", Style::default().fg(Color::DarkGray))));
            } else {
                for line in output.lines().take(20) {
                    lines.push(Line::from(line.to_string()));
                }
            }
        }
        NodeType::AgentStart { agent_id, agent_type } => {
            lines.push(Line::from(Span::styled("Agent Start:", Style::default().fg(Color::Magenta))));
            lines.push(Line::from(format!("Type: {}", agent_type)));
            lines.push(Line::from(format!("ID: {}", agent_id)));
        }
        NodeType::AgentEnd { agent_id } => {
            lines.push(Line::from(Span::styled("Agent End:", Style::default().fg(Color::DarkGray))));
            lines.push(Line::from(format!("ID: {}", agent_id)));
        }
        NodeType::Progress(msg) => {
            lines.push(Line::from(Span::styled("Progress:", Style::default().fg(Color::Gray))));
            lines.push(Line::from(msg.clone()));
        }
    }

    lines
}

fn truncate(s: &str, max_len: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max_len {
        s.to_string()
    } else {
        let truncate_at = max_len.saturating_sub(3);
        let truncated: String = s.chars().take(truncate_at).collect();
        format!("{}...", truncated)
    }
}

fn render_node_box(node: &Node) -> Vec<Line> {
    let mut lines = Vec::new();
    let box_width = 80;

    // Top border
    lines.push(Line::from(vec![
        Span::raw("      "),
        Span::styled(
            format!("┌{}┐", "─".repeat(box_width - 2)),
            Style::default().fg(Color::Cyan)
        )
    ]));

    // Node type header
    let (header, color) = match &node.node_type {
        NodeType::UserMessage(_) => (String::from("USER MESSAGE"), Color::Cyan),
        NodeType::AssistantMessage(_) => (String::from("ASSISTANT MESSAGE"), Color::Green),
        NodeType::ToolUse { name, .. } => (format!("TOOL: {}", name), Color::Yellow),
        NodeType::ToolResult { is_error, .. } => {
            if *is_error {
                (String::from("RESULT: ERROR"), Color::Red)
            } else {
                (String::from("RESULT: SUCCESS"), Color::Green)
            }
        }
        NodeType::AgentStart { agent_type, .. } => (format!("AGENT: {}", agent_type), Color::Magenta),
        NodeType::AgentEnd { .. } => (String::from("AGENT END"), Color::DarkGray),
        NodeType::Progress(_) => (String::from("PROGRESS"), Color::Gray),
    };

    let header_len = header.len();
    lines.push(Line::from(vec![
        Span::raw("      "),
        Span::styled("│ ", Style::default().fg(Color::Cyan)),
        Span::styled(header, Style::default().fg(color).add_modifier(Modifier::BOLD)),
        Span::raw(" ".repeat(box_width - header_len - 4)),
        Span::styled("│", Style::default().fg(Color::Cyan)),
    ]));

    lines.push(Line::from(vec![
        Span::raw("      "),
        Span::styled(format!("│{}│", "─".repeat(box_width - 2)), Style::default().fg(Color::DarkGray))
    ]));

    // Content
    match &node.node_type {
        NodeType::UserMessage(text) | NodeType::AssistantMessage(text) | NodeType::Progress(text) => {
            for line_text in text.lines().take(5) {
                let truncated = truncate(line_text, box_width - 6);
                let padding = box_width - truncated.len() - 4;
                lines.push(Line::from(vec![
                    Span::raw("      "),
                    Span::styled("│ ", Style::default().fg(Color::Cyan)),
                    Span::raw(truncated),
                    Span::raw(" ".repeat(padding)),
                    Span::styled("│", Style::default().fg(Color::Cyan)),
                ]));
            }
        }
        NodeType::ToolUse { name, input } => {
            // Parse input JSON and show key fields
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(input) {
                if let Some(obj) = parsed.as_object() {
                    for (key, value) in obj.iter().take(4) {
                        let value_str = match value {
                            serde_json::Value::String(s) => truncate(s, 50),
                            _ => value.to_string(),
                        };
                        let line_text = format!("{}: {}", key, value_str);
                        let truncated = truncate(&line_text, box_width - 6);
                        let padding = box_width - truncated.len() - 4;
                        let key_clone = key.clone();
                        let value_part = if truncated.len() > key.len() + 2 {
                            truncated[(key.len() + 2)..].to_string()
                        } else {
                            String::new()
                        };
                        lines.push(Line::from(vec![
                            Span::raw("      "),
                            Span::styled("│ ", Style::default().fg(Color::Cyan)),
                            Span::styled(key_clone, Style::default().fg(Color::Yellow)),
                            Span::raw(": "),
                            Span::raw(value_part),
                            Span::raw(" ".repeat(padding)),
                            Span::styled("│", Style::default().fg(Color::Cyan)),
                        ]));
                    }
                }
            }
        }
        NodeType::ToolResult { output, is_error } => {
            if output.trim().is_empty() {
                let empty_msg = "(empty result)";
                let padding = box_width - empty_msg.len() - 4;
                lines.push(Line::from(vec![
                    Span::raw("      "),
                    Span::styled("│ ", Style::default().fg(Color::Cyan)),
                    Span::styled(empty_msg, Style::default().fg(Color::DarkGray)),
                    Span::raw(" ".repeat(padding)),
                    Span::styled("│", Style::default().fg(Color::Cyan)),
                ]));
            } else {
                for line_text in output.lines().take(10) {
                    let truncated = truncate(line_text, box_width - 6);
                    let padding = box_width - truncated.len() - 4;
                    let text_color = if *is_error { Color::Red } else { Color::Gray };
                    lines.push(Line::from(vec![
                        Span::raw("      "),
                        Span::styled("│ ", Style::default().fg(Color::Cyan)),
                        Span::styled(truncated, Style::default().fg(text_color)),
                        Span::raw(" ".repeat(padding)),
                        Span::styled("│", Style::default().fg(Color::Cyan)),
                    ]));
                }
            }
        }
        NodeType::AgentStart { agent_id, .. } | NodeType::AgentEnd { agent_id } => {
            let line_text = format!("Agent ID: {}", agent_id);
            let truncated = truncate(&line_text, box_width - 6);
            let padding = box_width - truncated.len() - 4;
            lines.push(Line::from(vec![
                Span::raw("      "),
                Span::styled("│ ", Style::default().fg(Color::Cyan)),
                Span::raw(truncated),
                Span::raw(" ".repeat(padding)),
                Span::styled("│", Style::default().fg(Color::Cyan)),
            ]));
        }
    }

    // Bottom border
    lines.push(Line::from(vec![
        Span::raw("      "),
        Span::styled(
            format!("└{}┘", "─".repeat(box_width - 2)),
            Style::default().fg(Color::Cyan)
        )
    ]));

    lines
}


fn render_session_list(f: &mut Frame, area: Rect, state: &AppState) {
    let mut lines = vec![];

    for (idx, session) in state.available_sessions.iter().enumerate() {
        let is_current = session.id == state.session_id;
        let is_selected = idx == state.session_list_cursor;

        let prefix = if is_selected { "> " } else { "  " };
        let current_marker = if is_current { " (current)" } else { "" };

        // Check if session is waiting (last event is Assistant message)
        let waiting_marker = if session.waiting_for_user { " ⏸" } else { "" };

        let time_str = session.timestamp.format("%m-%d %H:%M").to_string();
        let short_id = if session.id.len() > 8 {
            &session.id[..8]
        } else {
            &session.id
        };

        let text = format!(
            "{}{} | {} | {:4} events{}{}",
            prefix, short_id, time_str, session.node_count, current_marker, waiting_marker
        );

        let mut style = Style::default();
        if session.waiting_for_user {
            style = style.fg(Color::Yellow); // Highlight waiting sessions
        } else if is_current {
            style = style.fg(Color::Green);
        }
        if is_selected {
            style = style.add_modifier(Modifier::BOLD);
        }

        lines.push(Line::from(Span::styled(text, style)));
    }

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Cyan))
                .title(" Sessions (Enter to switch, s to close) ")
        )
        .wrap(Wrap { trim: true });

    f.render_widget(paragraph, area);
}
