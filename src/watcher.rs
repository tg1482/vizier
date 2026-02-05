use crate::types::SessionEvent;
use anyhow::{Context, Result};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

pub struct SessionWatcher {
    pub session_file: PathBuf,
    pub agent_files: Vec<PathBuf>,
}

impl SessionWatcher {
    pub fn new(claude_dir: PathBuf, project: &str, session_id: &str) -> Result<Self> {
        let project_dir = claude_dir
            .join("projects")
            .join(project);

        let session_file = project_dir.join(format!("{}.jsonl", session_id));

        let agent_dir = project_dir.join(session_id).join("subagents");
        let mut agent_files = Vec::new();

        if agent_dir.exists() {
            for entry in std::fs::read_dir(&agent_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                    agent_files.push(path);
                }
            }
        }

        Ok(Self {
            session_file,
            agent_files,
        })
    }

    pub fn read_all_events(&self) -> Result<Vec<SessionEvent>> {
        let mut events = Vec::new();

        // Read main session file
        events.extend(self.read_file(&self.session_file)?);

        // Read agent files
        for agent_file in &self.agent_files {
            events.extend(self.read_file(agent_file)?);
        }

        // Sort by timestamp
        events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        Ok(events)
    }

    fn read_file(&self, path: &PathBuf) -> Result<Vec<SessionEvent>> {
        let file = File::open(path)
            .with_context(|| format!("Failed to open {}", path.display()))?;
        let reader = BufReader::new(file);
        let mut events = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<SessionEvent>(&line) {
                Ok(event) => events.push(event),
                Err(e) => {
                    eprintln!("Failed to parse line: {}", e);
                    continue;
                }
            }
        }

        Ok(events)
    }

    pub fn get_current_session_id() -> Result<String> {
        let claude_dir = Self::get_claude_dir()?;
        let history_file = claude_dir.join("history.jsonl");

        let file = File::open(&history_file)
            .context("Failed to open history file")?;
        let mut reader = BufReader::new(file);

        // Read last line
        let mut last_line = String::new();
        let mut buffer = String::new();

        while let Ok(bytes_read) = reader.read_line(&mut buffer) {
            if bytes_read == 0 { break; }
            if !buffer.trim().is_empty() {
                last_line = buffer.clone();
            }
            buffer.clear();
        }

        // Parse session ID from last line
        let event: SessionEvent = serde_json::from_str(&last_line)
            .context("Failed to parse last history entry")?;

        event.session_id.context("No session ID in history entry")
    }

    pub fn get_claude_dir() -> Result<PathBuf> {
        let home = std::env::var("HOME")
            .context("HOME environment variable not set")?;
        Ok(PathBuf::from(home).join(".claude"))
    }

    pub fn get_project_slug(cwd: &str) -> String {
        cwd.replace('/', "-")
    }
}
