use crate::types::{Graph, Node};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoomLevel {
    Sessions,      // Level 0: All sessions
    Conversations, // Level 1: Major turns in a session
    Details,       // Level 2: Tool calls, agents, everything
    Focus,         // Level 3: Single node expanded inline
}

impl ZoomLevel {
    pub fn zoom_in(self) -> Self {
        match self {
            ZoomLevel::Sessions => ZoomLevel::Conversations,
            ZoomLevel::Conversations => ZoomLevel::Details,
            ZoomLevel::Details => ZoomLevel::Focus,
            ZoomLevel::Focus => ZoomLevel::Focus,
        }
    }

    pub fn zoom_out(self) -> Self {
        match self {
            ZoomLevel::Sessions => ZoomLevel::Sessions,
            ZoomLevel::Conversations => ZoomLevel::Sessions,
            ZoomLevel::Details => ZoomLevel::Conversations,
            ZoomLevel::Focus => ZoomLevel::Details,
        }
    }
}

pub struct ZoomState {
    pub level: ZoomLevel,
    pub selected_session: usize,
    pub selected_turn: usize,
}

impl ZoomState {
    pub fn new() -> Self {
        Self {
            level: ZoomLevel::Conversations,
            selected_session: 0,
            selected_turn: 0,
        }
    }

    pub fn zoom_in(&mut self) {
        self.level = self.level.zoom_in();
    }

    pub fn zoom_out(&mut self) {
        self.level = self.level.zoom_out();
    }
}

// Filter nodes based on zoom level
pub fn filter_by_zoom(nodes: &[Node], level: ZoomLevel) -> Vec<usize> {
    match level {
        ZoomLevel::Sessions => {
            // Show only first and last nodes as session markers
            if nodes.is_empty() {
                vec![]
            } else {
                vec![0, nodes.len() - 1]
            }
        }
        ZoomLevel::Conversations => {
            // Show only User and Assistant messages (major conversation beats)
            nodes.iter()
                .enumerate()
                .filter(|(_, n)| {
                    matches!(n.node_type,
                        crate::types::NodeType::UserMessage(_) |
                        crate::types::NodeType::AssistantMessage(_))
                })
                .map(|(i, _)| i)
                .collect()
        }
        ZoomLevel::Details | ZoomLevel::Focus => {
            // Show everything
            (0..nodes.len()).collect()
        }
    }
}

pub fn get_zoom_label(level: ZoomLevel) -> &'static str {
    match level {
        ZoomLevel::Sessions => "SESSIONS",
        ZoomLevel::Conversations => "CONVERSATIONS",
        ZoomLevel::Details => "DETAILS",
        ZoomLevel::Focus => "FOCUS",
    }
}
