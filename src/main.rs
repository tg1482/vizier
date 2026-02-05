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

    let mut watcher = SessionWatcher::new(claude_dir, &project_slug, &session_id)?;
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

    run_tui(graph, watcher)?;

    Ok(())
}

fn run_tui(initial_graph: types::Graph, mut watcher: SessionWatcher) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, Clear(ClearType::All), EnterAlternateScreen)?;

    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = AppState::new(initial_graph);
    let mut last_node_count = state.graph.nodes.len();

    loop {
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
                    KeyCode::Char('z') => state.toggle_focus(),
                    KeyCode::Char('h') | KeyCode::Left => state.move_left(),
                    KeyCode::Char('l') | KeyCode::Right => state.move_right(),
                    KeyCode::Char('j') | KeyCode::Down => state.level_down(),
                    KeyCode::Char('k') | KeyCode::Up => state.level_up(),
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
