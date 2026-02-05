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
            level: ZoomLevel::Details,  // Start at DETAILS so you can see tools/agents
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

// Filter nodes based on zoom level - but DON'T filter for CONVERSATIONS anymore!
// The filtering now happens in the DISPLAY layer by branch assignment
pub fn filter_by_zoom(nodes: &[Node], level: ZoomLevel) -> Vec<usize> {
    match level {
        ZoomLevel::Sessions => {
            // Show only first and last nodes as session markers (for future multi-session view)
            if nodes.is_empty() {
                vec![]
            } else {
                vec![0, nodes.len() - 1]
            }
        }
        ZoomLevel::Conversations => {
            // Show ALL User and Assistant messages - full conversation flow
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
        ZoomLevel::Details => {
            // Show everything - tools, agents, results
            (0..nodes.len()).collect()
        }
        ZoomLevel::Focus => {
            // Focus mode shows everything but will expand one node inline
            (0..nodes.len()).collect()
        }
    }
}

// NEW: Assign visual branch for rendering based on node type and zoom level
pub fn get_visual_branch(node: &Node, zoom_level: ZoomLevel) -> usize {
    match zoom_level {
        ZoomLevel::Conversations => {
            // Separate User from Assistant for clear causality
            match &node.node_type {
                crate::types::NodeType::UserMessage(_) => 0,
                crate::types::NodeType::AssistantMessage(_) => 1,
                _ => 2, // Shouldn't appear in CONVERSATIONS mode
            }
        }
        ZoomLevel::Details | ZoomLevel::Focus => {
            // Use actual branch level, but offset User/Asst
            match &node.node_type {
                crate::types::NodeType::UserMessage(_) => 0,
                crate::types::NodeType::AssistantMessage(_) => 1,
                _ => {
                    // Tools and agents appear below their branch level + 2
                    2 + node.branch_level as usize
                }
            }
        }
        ZoomLevel::Sessions => 0,
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
