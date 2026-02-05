use crate::parser::parse_event_to_node;
use crate::types::{Graph, SessionEvent};
use anyhow::Result;

pub struct GraphBuilder {
    graph: Graph,
}

impl GraphBuilder {
    pub fn new() -> Self {
        Self {
            graph: Graph::default(),
        }
    }

    pub fn build_from_events(&mut self, events: Vec<SessionEvent>) -> Result<&Graph> {
        for event in events {
            let nodes = parse_event_to_node(event)?;
            for node in nodes {
                self.graph.add_node(node);
            }
        }

        self.graph.sort_by_time();
        Ok(&self.graph)
    }

    pub fn graph(&self) -> &Graph {
        &self.graph
    }
}
