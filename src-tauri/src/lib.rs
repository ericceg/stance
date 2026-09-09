use std::sync::Mutex;

#[cfg(not(debug_assertions))]
use std::{
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};

use tauri::{webview::WebviewWindowBuilder, AppHandle, Manager, RunEvent, WebviewUrl};
use tauri_plugin_shell::process::CommandChild;

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg(not(debug_assertions))]
fn available_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

#[cfg(not(debug_assertions))]
fn wait_for_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("the local Stance server did not start within 30 seconds".into())
}

fn create_window(app: &AppHandle, port: u16) -> tauri::Result<()> {
    let url = format!("http://127.0.0.1:{port}")
        .parse()
        .expect("valid local URL");
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Stance")
        .inner_size(1280.0, 860.0)
        .min_inner_size(900.0, 650.0)
        .build()?;
    Ok(())
}

#[cfg(debug_assertions)]
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    create_window(app.handle(), 3000)?;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let port = available_port()?;
    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;

    let database_path = app_data.join("stance.db");
    let resource_dir = app.path().resource_dir()?;
    let server_path = resource_dir.join("next-server");
    let migrations_path = resource_dir.join("prisma/migrations");
    let launcher_path = resource_dir.join("desktop/server.mjs");

    let arguments = [
        launcher_path.to_string_lossy().into_owned(),
        "--server".to_owned(),
        server_path.to_string_lossy().into_owned(),
        "--migrations".to_owned(),
        migrations_path.to_string_lossy().into_owned(),
        "--database".to_owned(),
        database_path.to_string_lossy().into_owned(),
    ];
    let (mut events, child) = app
        .shell()
        .sidecar("stance-node")?
        .args(arguments)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .spawn()?;

    app.manage(ServerProcess(Mutex::new(Some(child))));

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    println!("[stance-server] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("[stance-server] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    wait_for_server(port)?;
    create_window(app.handle(), port)?;
    Ok(())
}

fn stop_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<ServerProcess>() {
        if let Ok(mut process) = state.0.lock() {
            if let Some(child) = process.take() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("error while building the Stance desktop app");

    app.run(|app, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            stop_server(app);
        }
    });
}
