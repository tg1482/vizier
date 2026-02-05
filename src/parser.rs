use crate::types::{Node, NodeType, SessionEvent};
use anyhow::Result;

pub fn parse_event_to_node(event: SessionEvent) -> Result<Vec<Node>> {
    let mut nodes = Vec::new();
    let branch_level = if event.is_sidechain.unwrap_or(false) { 1 } else { 0 };

    if let Some(message) = event.message {
        match message.role.as_str() {
            "user" => {
                let text = extract_text_content(&message.content);

                // Check if it's a tool result
                if let Some(tool_results) = extract_tool_results(&message.content) {
                    for (idx, (tool_use_id, output, is_error)) in tool_results.iter().enumerate() {
                        nodes.push(Node {
                            id: format!("{}:{}", event.uuid, idx),
                            parent_id: Some(tool_use_id.clone()),
                            node_type: NodeType::ToolResult {
                                output: output.clone(),
                                is_error: *is_error,
                            },
                            timestamp: event.timestamp,
                            branch_level,
                            agent_id: event.agent_id.clone(),
                        });
                    }
                } else if !text.is_empty() {
                    nodes.push(Node {
                        id: event.uuid.clone(),
                        parent_id: event.parent_uuid.clone(),
                        node_type: NodeType::UserMessage(text),
                        timestamp: event.timestamp,
                        branch_level,
                        agent_id: event.agent_id.clone(),
                    });
                }
            }
            "assistant" => {
                let text = extract_text_content(&message.content);

                // Create assistant message node if there's text
                if !text.is_empty() {
                    nodes.push(Node {
                        id: event.uuid.clone(),
                        parent_id: event.parent_uuid.clone(),
                        node_type: NodeType::AssistantMessage(text),
                        timestamp: event.timestamp,
                        branch_level,
                        agent_id: event.agent_id.clone(),
                    });
                }

                // Extract tool uses
                if let Some(tool_uses) = extract_tool_uses(&message.content) {
                    for (_idx, (tool_id, tool_name, tool_input)) in tool_uses.iter().enumerate() {
                        nodes.push(Node {
                            id: tool_id.clone(),
                            parent_id: Some(event.uuid.clone()),
                            node_type: NodeType::ToolUse {
                                name: tool_name.clone(),
                                input: tool_input.clone(),
                            },
                            timestamp: event.timestamp,
                            branch_level,
                            agent_id: event.agent_id.clone(),
                        });
                    }
                }
            }
            _ => {}
        }
    }

    // Handle progress events
    if event.event_type == "progress" {
        nodes.push(Node {
            id: event.uuid.clone(),
            parent_id: event.parent_uuid.clone(),
            node_type: NodeType::Progress("Progress update".to_string()),
            timestamp: event.timestamp,
            branch_level,
            agent_id: event.agent_id.clone(),
        });
    }

    Ok(nodes)
}

fn extract_text_content(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            arr.iter()
                .filter_map(|item| {
                    if let Some(obj) = item.as_object() {
                        if obj.get("type")?.as_str()? == "text" {
                            return obj.get("text")?.as_str().map(String::from);
                        }
                    }
                    None
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
        _ => String::new(),
    }
}

fn extract_tool_uses(content: &serde_json::Value) -> Option<Vec<(String, String, String)>> {
    let arr = content.as_array()?;
    let mut tools = Vec::new();

    for item in arr {
        let obj = item.as_object()?;
        if obj.get("type")?.as_str()? == "tool_use" {
            let id = obj.get("id")?.as_str()?.to_string();
            let name = obj.get("name")?.as_str()?.to_string();
            let input = serde_json::to_string_pretty(obj.get("input")?).ok()?;
            tools.push((id, name, input));
        }
    }

    if tools.is_empty() { None } else { Some(tools) }
}

fn extract_tool_results(content: &serde_json::Value) -> Option<Vec<(String, String, bool)>> {
    let arr = content.as_array()?;
    let mut results = Vec::new();

    for item in arr {
        let obj = item.as_object()?;
        if obj.get("type")?.as_str()? == "tool_result" {
            let tool_use_id = obj.get("tool_use_id")?.as_str()?.to_string();
            let content = obj.get("content")?.as_str().unwrap_or("").to_string();
            let is_error = obj.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
            results.push((tool_use_id, content, is_error));
        }
    }

    if results.is_empty() { None } else { Some(results) }
}
