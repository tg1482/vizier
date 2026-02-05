use crate::types::SessionEvent;
use anyhow::{Context, Result};
use notify::{Watcher, RecursiveMode, Event, EventKind};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::time::Duration;

pub struct SessionWatcher {
    pub session_file: PathBuf,
    pub agent_files: Vec<PathBuf>,
    pub watcher: Option<notify::RecommendedWatcher>,
    pub receiver: Option<Receiver<notify::Result<Event>>>,
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
            watcher: None,
            receiver: None,
        })
    }

    pub fn start_watching(&mut self) -> Result<()> {
        let (tx, rx) = channel();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = &res {
                // Only care about modify events
                if matches!(event.kind, EventKind::Modify(_)) {
                    let _ = tx.send(res);
                }
            }
        })?;

        // Watch the main session file
        watcher.watch(&self.session_file, RecursiveMode::NonRecursive)?;

        // Watch agent files if they exist
        for agent_file in &self.agent_files {
            watcher.watch(agent_file, RecursiveMode::NonRecursive)?;
        }

        self.watcher = Some(watcher);
        self.receiver = Some(rx);

        Ok(())
    }

    pub fn check_for_updates(&self) -> bool {
        if let Some(rx) = &self.receiver {
            match rx.try_recv() {
                Ok(_) => true,  // File changed!
                Err(TryRecvError::Empty) => false,  // No changes
                Err(TryRecvError::Disconnected) => false,  // Watcher died
            }
        } else {
            false
        }
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

    pub fn list_sessions(claude_dir: &PathBuf, project: &str) -> Result<Vec<crate::ui::SessionInfo>> {
        let project_dir = claude_dir.join("projects").join(project);
        let mut sessions = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&project_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                    if let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) {
                        // Get metadata
                        if let Ok(metadata) = std::fs::metadata(&path) {
                            if let Ok(modified) = metadata.modified() {
                                let timestamp: chrono::DateTime<chrono::Utc> = modified.into();

                                // Count lines as rough node count
                                let node_count = std::fs::read_to_string(&path)
                                    .map(|s| s.lines().count())
                                    .unwrap_or(0);

                                sessions.push(crate::ui::SessionInfo {
                                    id: session_id.to_string(),
                                    timestamp,
                                    node_count,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Sort by timestamp, newest first
        sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(sessions)
    }
}
