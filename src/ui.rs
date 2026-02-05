use crate::types::{Graph, Node, NodeType};
use crate::zoom::{ZoomLevel, ZoomState, filter_by_zoom, get_zoom_label};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

pub struct AppState {
    pub graph: Graph,
    pub cursor_index: usize,  // Index in the FILTERED list (zoom-dependent)
    pub zoom: ZoomState,
}

impl AppState {
    pub fn new(graph: Graph) -> Self {
        Self {
            graph,
            cursor_index: 0,
            zoom: ZoomState::new(),
        }
    }

    pub fn zoom_in(&mut self) {
        let old_level = self.zoom.level;
        self.zoom.zoom_in();
        // When zooming in, try to stay on the same actual node
        if self.zoom.level != old_level {
            self.cursor_index = 0; // Reset to start for simplicity
        }
    }

    pub fn zoom_out(&mut self) {
        let old_level = self.zoom.level;
        self.zoom.zoom_out();
        if self.zoom.level != old_level {
            self.cursor_index = 0;
        }
    }

    // Move right in the timeline (next node in filtered view)
    pub fn move_right(&mut self) {
        let visible = filter_by_zoom(&self.graph.nodes, self.zoom.level);
        if self.cursor_index < visible.len().saturating_sub(1) {
            self.cursor_index += 1;
        }
    }

    // Move left in the timeline (previous node in filtered view)
    pub fn move_left(&mut self) {
        if self.cursor_index > 0 {
            self.cursor_index -= 1;
        }
    }

    // Get the actual node index in the full graph
    pub fn get_actual_index(&self) -> usize {
        let visible = filter_by_zoom(&self.graph.nodes, self.zoom.level);
        *visible.get(self.cursor_index).unwrap_or(&0)
    }

    pub fn selected_node(&self) -> Option<&Node> {
        self.graph.nodes.get(self.get_actual_index())
    }

}

pub fn render(f: &mut Frame, state: &AppState) {
    // In FOCUS mode, give more space to timeline, less to details
    let constraints = if state.zoom.level == crate::zoom::ZoomLevel::Focus {
        [Constraint::Min(20), Constraint::Length(8)]
    } else {
        [Constraint::Min(15), Constraint::Length(12)]
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(f.area());

    render_timeline(f, chunks[0], state);

    // Only show details panel if not in FOCUS mode
    if state.zoom.level != crate::zoom::ZoomLevel::Focus {
        render_details(f, chunks[1], state);
    }
}

fn render_timeline(f: &mut Frame, area: Rect, state: &AppState) {
    let mut lines = Vec::new();

    // Title with zoom level
    let zoom_label = get_zoom_label(state.zoom.level);
    lines.push(Line::from(vec![
        Span::styled(
            format!("[{}] ", zoom_label),
            Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)
        ),
        Span::styled(
            "z/x:zoom  h/l:move  g/G:start/end  q:quit",
            Style::default().fg(Color::DarkGray)
        )
    ]));
    lines.push(Line::from(""));

    // Get filtered indices based on zoom level
    let visible_indices = filter_by_zoom(&state.graph.nodes, state.zoom.level);

    if visible_indices.is_empty() {
        lines.push(Line::from("No nodes at this zoom level"));
    } else {
        // CAMERA-CENTRIC: Center the view on the cursor
        let nodes_per_screen = ((area.width as usize).saturating_sub(10)) / 4;
        let half_screen = nodes_per_screen / 2;

        // Calculate window so cursor is centered
        let start = if state.cursor_index < half_screen {
            0
        } else if state.cursor_index + half_screen >= visible_indices.len() {
            visible_indices.len().saturating_sub(nodes_per_screen)
        } else {
            state.cursor_index.saturating_sub(half_screen)
        };

        let end = (start + nodes_per_screen).min(visible_indices.len());
        let window_indices = &visible_indices[start..end];

        // Timestamps
        let mut time_line = vec![Span::raw("Time  ")];
        for &idx in window_indices {
            let node = &state.graph.nodes[idx];
            let time = node.timestamp.format("%H:%M").to_string();
            time_line.push(Span::styled(
                format!("{:^6}", time),
                Style::default().fg(Color::DarkGray)
            ));
        }
        lines.push(Line::from(time_line));
        lines.push(Line::from(""));

        // Find max branch level in visible nodes
        let max_branch = window_indices.iter()
            .map(|&idx| state.graph.nodes[idx].branch_level)
            .max()
            .unwrap_or(0);

        // Render each branch level as a horizontal row
        for branch in 0..=max_branch.min(5) {
            let mut row_spans = vec![
                Span::styled(
                    format!("L{:<4}", branch),
                    Style::default().fg(Color::DarkGray)
                )
            ];

            for (pos, &idx) in window_indices.iter().enumerate() {
                let node = &state.graph.nodes[idx];
                let is_cursor = (start + pos) == state.cursor_index;

                if node.branch_level == branch {
                    let (symbol, _label, color) = get_compact_node_info(node);

                    let mut style = Style::default().fg(color);
                    if is_cursor {
                        style = style.bg(Color::White).fg(Color::Black).add_modifier(Modifier::BOLD);
                    }

                    row_spans.push(Span::styled(symbol, style));
                    row_spans.push(Span::styled("──", Style::default().fg(Color::DarkGray)));
                } else {
                    row_spans.push(Span::raw("   "));
                }
            }

            lines.push(Line::from(row_spans));
        }

        // Add labels row showing what each node is
        if state.zoom.level == crate::zoom::ZoomLevel::Details {
            lines.push(Line::from(""));
            let mut label_spans = vec![Span::raw("      ")];

            for &idx in window_indices {
                let node = &state.graph.nodes[idx];
                let (_, label, color) = get_compact_node_info(node);

                label_spans.push(Span::styled(
                    format!("{:<6}", truncate(&label, 6)),
                    Style::default().fg(color)
                ));
            }
            lines.push(Line::from(label_spans));
        }

        // FOCUS mode: Show expanded view of selected node inline
        if state.zoom.level == crate::zoom::ZoomLevel::Focus {
            if let Some(selected_node) = state.selected_node() {
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
        lines.push(Line::from(vec![
            Span::styled(
                format!("{} nodes | Cursor: {} | Showing {}-{} ",
                    visible_indices.len(),
                    state.cursor_index + 1,
                    start + 1,
                    end
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

    let visible = filter_by_zoom(&state.graph.nodes, state.zoom.level);
    let title = format!(" Node {}/{} ", state.cursor_index + 1, visible.len());

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
            for line in output.lines().take(5) {
                lines.push(Line::from(line.to_string()));
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
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
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
            for line_text in output.lines().take(5) {
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
