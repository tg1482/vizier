mod graph;
mod parser;
mod types;
mod ui;
mod watcher;
mod zoom;

use anyhow::Result;
use clap::Parser as ClapParser;
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen, Clear, ClearType},
};
use graph::GraphBuilder;
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;
use ui::AppState;
use watcher::SessionWatcher;

#[derive(ClapParser)]
#[command(name = "vizzy")]
#[command(about = "Visualize Claude Code execution graphs")]
struct Args {
    #[arg(short, long, help = "Session ID to visualize")]
    session: Option<String>,

    #[arg(short, long, help = "Project path (defaults to current directory)")]
    project: Option<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let claude_dir = SessionWatcher::get_claude_dir()?;

    let project = args.project.clone().unwrap_or_else(|| {
        std::env::current_dir()
            .ok()
            .and_then(|p| p.to_str().map(String::from))
            .unwrap_or_else(|| String::from("unknown"))
    });

    let session_id = args.session.unwrap_or_else(|| {
        SessionWatcher::get_current_session_id()
            .unwrap_or_else(|e| {
                eprintln!("Could not determine current session: {}", e);
                eprintln!();
                eprintln!("Usage:");
                eprintln!("  vizzy --session <session-id> --project <project-path>");
                eprintln!();
                eprintln!("Available sessions in current project:");

                if let Ok(home) = std::env::var("HOME") {
                    let project_slug = SessionWatcher::get_project_slug(&project);
                    let sessions_dir = format!("{}/.claude/projects/{}", home, project_slug);

                    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
                        for entry in entries.filter_map(|e| e.ok()).take(5) {
                            let path = entry.path();
                            if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                                    eprintln!("  - {}", name);
                                }
                            }
                        }
                    }
                }

                std::process::exit(1);
            })
    });

    let project_slug = SessionWatcher::get_project_slug(&project);

    // Get all available sessions for this project
    let available_sessions = SessionWatcher::list_sessions(&claude_dir, &project_slug)?;

    let mut watcher = SessionWatcher::new(claude_dir.clone(), &project_slug, &session_id)?;
    let events = watcher.read_all_events()?;

    if events.is_empty() {
        eprintln!("No events found for session: {}", session_id);
        eprintln!("Project: {}", project_slug);
        std::process::exit(1);
    }

    let mut builder = GraphBuilder::new();
    let graph = builder.build_from_events(events)?.clone();

    // Start watching for file changes
    watcher.start_watching()?;

    run_tui(graph, watcher, session_id, available_sessions, claude_dir, project_slug)?;

    Ok(())
}

fn run_tui(
    initial_graph: types::Graph,
    mut watcher: SessionWatcher,
    session_id: String,
    available_sessions: Vec<ui::SessionInfo>,
    claude_dir: std::path::PathBuf,
    project_slug: String,
) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, Clear(ClearType::All), EnterAlternateScreen)?;

    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = AppState::new(initial_graph, session_id.clone(), available_sessions);
    let mut last_node_count = state.graph.nodes.len();
    let mut blink_counter = 0u32;

    loop {
        // Toggle blink state every 5 frames (500ms)
        blink_counter = blink_counter.wrapping_add(1);
        if blink_counter % 5 == 0 {
            state.blink_state = !state.blink_state;
        }
        // Check for file updates
        if watcher.check_for_updates() {
            // Reload the graph
            if let Ok(events) = watcher.read_all_events() {
                let mut builder = GraphBuilder::new();
                if let Ok(new_graph) = builder.build_from_events(events) {
                    let new_count = new_graph.nodes.len();
                    if new_count != last_node_count {
                        // Save current position/level before updating
                        let current_level = state.current_level;
                        let current_pos = state.cursor_in_level;
                        let old_max = state.get_nodes_in_current_level().saturating_sub(1);

                        // Check if cursor is at or near the end (within last 2 positions)
                        let is_at_end = current_pos >= old_max.saturating_sub(1);

                        // Update the graph
                        state.graph = new_graph.clone();
                        last_node_count = new_count;

                        // Restore position
                        state.current_level = current_level.min(state.get_max_level());
                        let new_max = state.get_nodes_in_current_level().saturating_sub(1);

                        // If user was at the end, follow new content. Otherwise stay put.
                        if is_at_end {
                            state.cursor_in_level = new_max;
                        } else {
                            state.cursor_in_level = current_pos.min(new_max);
                        }
                    }
                }
            }
        }

        terminal.draw(|f| ui::render(f, &state))?;

        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') => break,
                    KeyCode::Char('s') => state.toggle_session_list(),
                    KeyCode::Char('t') | KeyCode::Char('T') => {
                        state.timeline_open = !state.timeline_open;
                    }
                    KeyCode::Char('d') | KeyCode::Char('D') => {
                        state.details_open = !state.details_open;
                    }
                    KeyCode::Char('z') => state.toggle_focus(),
                    KeyCode::Char('h') | KeyCode::Left => {
                        if state.session_list_open {
                            // Ignore in session list
                        } else {
                            state.move_left();
                        }
                    }
                    KeyCode::Char('l') | KeyCode::Right => {
                        if state.session_list_open {
                            // Ignore in session list
                        } else {
                            state.move_right();
                        }
                    }
                    KeyCode::Char('j') | KeyCode::Down => {
                        if state.session_list_open {
                            state.session_list_down();
                        } else {
                            state.level_down();
                        }
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        if state.session_list_open {
                            state.session_list_up();
                        } else {
                            state.level_up();
                        }
                    }
                    KeyCode::Enter => {
                        if state.session_list_open {
                            // Switch session
                            if let Some(new_session_id) = state.get_selected_session() {
                                if new_session_id != state.session_id {
                                    // Load new session
                                    watcher = SessionWatcher::new(claude_dir.clone(), &project_slug, &new_session_id)?;
                                    let events = watcher.read_all_events()?;
                                    let mut builder = GraphBuilder::new();
                                    if let Ok(new_graph) = builder.build_from_events(events) {
                                        state.graph = new_graph.clone();
                                        state.session_id = new_session_id;
                                        last_node_count = state.graph.nodes.len();
                                        watcher.start_watching()?;
                                    }
                                }
                            }
                            state.session_list_open = false;
                            state.timeline_open = true; // Show timeline after switching
                        }
                    }
                    KeyCode::Char('g') => state.cursor_in_level = 0,
                    KeyCode::Char('G') => {
                        let max_pos = state.get_nodes_in_current_level().saturating_sub(1);
                        state.cursor_in_level = max_pos;
                    }
                    _ => {}
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    Ok(())
}
