use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEvent {
    #[serde(default = "default_uuid")]
    pub uuid: String,
    #[serde(rename = "parentUuid")]
    pub parent_uuid: Option<String>,
    #[serde(rename = "isSidechain")]
    pub is_sidechain: Option<bool>,
    #[serde(rename = "agentId")]
    pub agent_id: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub message: Option<Message>,
    #[serde(default = "default_timestamp")]
    pub timestamp: DateTime<Utc>,
}

fn default_uuid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!("generated-{}", COUNTER.fetch_add(1, Ordering::SeqCst))
}

fn default_timestamp() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: serde_json::Value,
    pub model: Option<String>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum NodeType {
    UserMessage(String),
    AssistantMessage(String),
    ToolUse { name: String, input: String },
    ToolResult { output: String, is_error: bool },
    AgentStart { agent_id: String, agent_type: String },
    AgentEnd { agent_id: String },
    Progress(String),
}

#[derive(Debug, Clone)]
pub struct Node {
    pub id: String,
    pub parent_id: Option<String>,
    pub node_type: NodeType,
    pub timestamp: DateTime<Utc>,
    pub branch_level: u32,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub is_branch: bool,
}

#[derive(Debug, Default, Clone)]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub active_branches: Vec<String>,
}

impl Graph {
    pub fn add_node(&mut self, node: Node) {
        if let Some(parent_id) = &node.parent_id {
            self.edges.push(Edge {
                from: parent_id.clone(),
                to: node.id.clone(),
                is_branch: node.branch_level > 0,
            });
        }
        self.nodes.push(node);
    }

    pub fn sort_by_time(&mut self) {
        self.nodes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    }
}
