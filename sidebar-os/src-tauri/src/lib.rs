#[cfg_attr(mobile, tauri::mobile_entry_point)]
use tauri::{Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, Position};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;
use serde::{Deserialize, Serialize};

#[tauri::command]
fn position_window_top_center(app: tauri::AppHandle) -> Result<(), String> {
  log::info!("position_window_top_center invoked");

  let window = app.get_webview_window("panel")
    .ok_or("Window not found")?;

  let monitor = window.current_monitor()
    .map_err(|e| e.to_string())?
    .ok_or("No monitor found")?;

  let monitor_size = monitor.size().to_owned();
  let monitor_position = monitor.position().to_owned();
  let window_size = window.outer_size()
    .map_err(|e| e.to_string())?;

  log::debug!(
    "monitor size={}x{}, pos=({}, {}), window size={}x{}",
    monitor_size.width,
    monitor_size.height,
    monitor_position.x,
    monitor_position.y,
    window_size.width,
    window_size.height
  );

  // macOS with Tao/Tauri reports positions with a top-left origin for the screen
  // coordinates. Using bottom-left origin here was placing the window near the
  // bottom. Force top-origin calculation for consistent "top-center" placement.
  let (final_x, final_y) = calculate_top_center_position(
    monitor_position,
    monitor_size,
    window_size,
    40,
    false,
  );

  log::debug!("final collapsed position resolved to ({}, {})", final_x, final_y);

  window
    .set_position(Position::Physical(PhysicalPosition { x: final_x, y: final_y }))
    .map_err(|e| e.to_string())?;

  let _ = window.show();
  let _ = window.set_always_on_top(true);
  let _ = window.set_focus();
  log::debug!("panel set visible and focused");

  Ok(())
}

fn calculate_top_center_position(
  monitor_position: PhysicalPosition<i32>,
  monitor_size: PhysicalSize<u32>,
  window_size: PhysicalSize<u32>,
  vertical_margin: i32,
  origin_bottom_left: bool,
) -> (i32, i32) {
  let available_width = monitor_size.width as i32 - window_size.width as i32;
  let desired_x = monitor_position.x + available_width / 2;
  let min_x = monitor_position.x;
  let max_x = monitor_position.x + available_width;
  let clamped_x = desired_x.clamp(min_x, max_x);

  let available_height = monitor_size.height as i32 - window_size.height as i32;
  let desired_y = if origin_bottom_left {
    monitor_position.y + available_height - vertical_margin
  } else {
    monitor_position.y + vertical_margin
  };
  let min_y = monitor_position.y;
  let max_y = monitor_position.y + available_height;
  let clamped_y = desired_y.clamp(min_y, max_y);

  (clamped_x, clamped_y)
}

#[tauri::command]
fn center_window(app: tauri::AppHandle) -> Result<(), String> {
  log::info!("center_window invoked");

  let window = app.get_webview_window("panel")
    .ok_or("Window not found")?;

  window.center()
    .map_err(|e| e.to_string())?;

  log::debug!("panel centered");
  Ok(())
}

#[tauri::command]
fn position_window_right_center(app: tauri::AppHandle, margin: Option<i32>) -> Result<(), String> {
  log::info!("position_window_right_center invoked");

  let window = app
    .get_webview_window("panel")
    .ok_or("Window not found")?;

  let monitor = window
    .current_monitor()
    .map_err(|e| e.to_string())?
    .ok_or("No monitor found")?;

  let monitor_size = monitor.size().to_owned();
  let monitor_position = monitor.position().to_owned();
  let window_size = window.outer_size().map_err(|e| e.to_string())?;

  let m = margin.unwrap_or(40);

  // top-left origin coordinates
  let desired_x = monitor_position.x + (monitor_size.width as i32 - window_size.width as i32) - m;
  let available_height = monitor_size.height as i32 - window_size.height as i32;
  let desired_y = monitor_position.y + available_height / 2; // vertical center

  let min_x = monitor_position.x;
  let max_x = monitor_position.x + (monitor_size.width as i32 - window_size.width as i32);
  let min_y = monitor_position.y;
  let max_y = monitor_position.y + available_height;

  let clamped_x = desired_x.clamp(min_x, max_x);
  let clamped_y = desired_y.clamp(min_y, max_y);

  window
    .set_position(Position::Physical(PhysicalPosition {
      x: clamped_x,
      y: clamped_y,
    }))
    .map_err(|e| e.to_string())?;

  let _ = window.show();
  let _ = window.set_always_on_top(true);
  let _ = window.set_focus();
  log::debug!("panel moved to right-center at ({}, {})", clamped_x, clamped_y);

  Ok(())
}

#[tauri::command]
fn position_window_left_center(app: tauri::AppHandle, margin: Option<i32>) -> Result<(), String> {
  log::info!("position_window_left_center invoked");

  let window = app
    .get_webview_window("panel")
    .ok_or("Window not found")?;

  let monitor = window
    .current_monitor()
    .map_err(|e| e.to_string())?
    .ok_or("No monitor found")?;

  let monitor_size = monitor.size().to_owned();
  let monitor_position = monitor.position().to_owned();
  let window_size = window.outer_size().map_err(|e| e.to_string())?;

  let m = margin.unwrap_or(40);

  // top-left origin coordinates; left edge + margin
  let desired_x = monitor_position.x + m;
  let available_height = monitor_size.height as i32 - window_size.height as i32;
  let desired_y = monitor_position.y + available_height / 2; // vertical center

  let min_x = monitor_position.x;
  let max_x = monitor_position.x + (monitor_size.width as i32 - window_size.width as i32);
  let min_y = monitor_position.y;
  let max_y = monitor_position.y + available_height;

  let clamped_x = desired_x.clamp(min_x, max_x);
  let clamped_y = desired_y.clamp(min_y, max_y);

  window
    .set_position(Position::Physical(PhysicalPosition {
      x: clamped_x,
      y: clamped_y,
    }))
    .map_err(|e| e.to_string())?;

  let _ = window.show();
  let _ = window.set_always_on_top(true);
  let _ = window.set_focus();
  log::debug!("panel moved to left-center at ({}, {})", clamped_x, clamped_y);

  Ok(())
}

#[tauri::command]
fn debug_log(level: String, message: String) {
  let trimmed = message.trim();
  match level.to_lowercase().as_str() {
    "error" => log::error!(target: "webview", "{trimmed}"),
    "warn" => log::warn!(target: "webview", "{trimmed}"),
    "debug" => log::debug!(target: "webview", "{trimmed}"),
    "trace" => log::trace!(target: "webview", "{trimmed}"),
    _ => log::info!(target: "webview", "{trimmed}"),
  }
}

// Position storage structures
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowPos {
  x: i32,
  y: i32,
}

#[tauri::command]
fn save_custom_position(app: tauri::AppHandle, mode: String, x: i32, y: i32) -> Result<(), String> {
  log::info!("save_custom_position: mode={}, x={}, y={}", mode, x, y);

  let store = app.store("settings.json").map_err(|e| e.to_string())?;
  let key = format!("custom_position_{}", mode);
  let pos = WindowPos { x, y };

  let value = serde_json::to_value(&pos).map_err(|e| e.to_string())?;
  store.set(key, value);
  store.save().map_err(|e| e.to_string())?;

  log::info!("Custom position saved for mode: {}", mode);
  Ok(())
}

#[tauri::command]
fn get_custom_position(app: tauri::AppHandle, mode: String) -> Result<Option<(i32, i32)>, String> {
  log::info!("get_custom_position: mode={}", mode);

  let store = app.store("settings.json").map_err(|e| e.to_string())?;
  let key = format!("custom_position_{}", mode);

  match store.get(key) {
    Some(value) => {
      let pos: WindowPos = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
      log::info!("Custom position found for mode {}: ({}, {})", mode, pos.x, pos.y);
      Ok(Some((pos.x, pos.y)))
    }
    None => {
      log::info!("No custom position found for mode: {}", mode);
      Ok(None)
    }
  }
}

#[tauri::command]
fn clear_custom_position(app: tauri::AppHandle, mode: String) -> Result<(), String> {
  log::info!("clear_custom_position: mode={}", mode);

  let store = app.store("settings.json").map_err(|e| e.to_string())?;
  let key = format!("custom_position_{}", mode);

  store.delete(key);
  store.save().map_err(|e| e.to_string())?;

  log::info!("Custom position cleared for mode: {}", mode);
  Ok(())
}

#[tauri::command]
fn has_custom_position(app: tauri::AppHandle, mode: String) -> Result<bool, String> {
  let store = app.store("settings.json").map_err(|e| e.to_string())?;
  let key = format!("custom_position_{}", mode);
  Ok(store.has(key))
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(win) = app.get_webview_window("panel") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("panel-should-expand", ());
      }
    }))
    .invoke_handler(tauri::generate_handler![
      position_window_top_center,
      center_window,
      position_window_right_center,
      position_window_left_center,
      debug_log,
      save_custom_position,
      get_custom_position,
      clear_custom_position,
      has_custom_position
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            // In dev, crank log level to Debug so we capture bridge/api events in the Tauri console.
            .level(log::LevelFilter::Debug)
            .targets([
              Target::new(TargetKind::Stdout),
              Target::new(TargetKind::LogDir { file_name: None })
            ])
            .build(),
        )?;
      }

      // Prevent default close behavior that hides the window
      if let Some(window) = app.get_webview_window("panel") {
        let _ = window.listen("tauri://close-requested", |_event| {
          log::info!("Close requested event received, preventing default behavior");
          // Don't call event.window().close() - this prevents the window from closing
        });
      }

      let app_handle = app.handle();
      // Auto-show panel on launch for first-run convenience
      if let Some(w) = app.get_webview_window("panel") {
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit("panel-should-expand", ());
      }
      // Register tray icon with menu
      let show_item = tauri::menu::MenuItemBuilder::with_id("show", "Show Window").build(app)?;
      let quit_item = tauri::menu::MenuItemBuilder::with_id("quit", "Quit").build(app)?;
      let menu = tauri::menu::MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&quit_item)
        .build()?;

      let tray = tauri::tray::TrayIconBuilder::with_id("tray")
        .icon(app_handle.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|tray, event| {
          match event.id.as_ref() {
            "show" => {
              let app = tray.app_handle();
              if let Some(w) = app.get_webview_window("panel") {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.set_always_on_top(true);
                let _ = app.emit("panel-should-expand", ());
              }
            }
            "quit" => {
              log::info!("quit menu item selected; exiting");
              std::process::exit(0);
            }
            _ => {}
          }
        })
        .on_tray_icon_event(|tray, event| {
          // Click always shows window
          if let tauri::tray::TrayIconEvent::Click { .. } = event {
            let app = tray.app_handle();
            if let Some(w) = app.get_webview_window("panel") {
              let _ = w.show();
              let _ = w.set_focus();
              let _ = w.set_always_on_top(true);
              let _ = app.emit("panel-should-expand", ());
            }
          }
        })
        .build(app)?;
      let _ = tray.set_tooltip(Some("Demo AI - Click to Show"));

      // Global hotkeys to always show panel (not toggle)
      let app_handle2 = app.handle().clone();
      for hotkey in ["Alt+Cmd+Space", "Ctrl+Space", "Cmd+Shift+Space"] {
        let app_handle2 = app_handle2.clone();
        let _ = app_handle
          .global_shortcut()
          .on_shortcut(hotkey, move |_id, _shortcut, _event| {
          log::info!("global hotkey {} triggered; focusing panel", hotkey);
          if let Some(w) = app_handle2.get_webview_window("panel") {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = w.set_always_on_top(true);
            let _ = app_handle2.emit("panel-should-expand", ());
          }
          });
      }

      // Handle Cmd+1 key to toggle collapsed state
      let app_handle3 = app.handle().clone();

      let _ = app_handle
        .global_shortcut()
        .on_shortcut("Cmd+1", move |_id, _shortcut, _event| {
          log::info!("Cmd+1 key pressed via global shortcut");

          // Verify panel window exists
          if let Some(w) = app_handle3.get_webview_window("panel") {
            log::info!("✓ Panel window found, emitting toggle-collapse event");

            // Emit directly to the panel; fall back to window.emit if that fails
            match app_handle3.emit_to("panel", "toggle-collapse", ()) {
              Ok(_) => {
                log::info!("✅ Event emitted successfully via emit_to()");
              }
              Err(e) => {
                log::error!("❌ Failed to emit via emit_to(): {}", e);
                match w.emit("toggle-collapse", ()) {
                  Ok(_) => log::info!("✅ Event emitted via window.emit() fallback"),
                  Err(e2) => log::error!("❌ Failed to emit via window.emit(): {}", e2),
                }
              }
            }

            // Also try eval to directly call JavaScript
            let _ = w.eval("console.log('🔥 DIRECT EVAL FROM RUST: Cmd+1 pressed!')");
          } else {
            log::error!("❌ Panel window not found! Cannot emit event.");
          }
        });

      // Block ESC key from closing the window
      let _ = app_handle
        .global_shortcut()
        .on_shortcut("Escape", move |_id, _shortcut, _event| {
          log::info!("ESC key intercepted and blocked");
          // Do nothing - this prevents ESC from closing the window
        });

      // macOS all-workspaces will be added later using appropriate APIs
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn calculate_position_top_origin_places_near_top() {
    let pos = PhysicalPosition { x: 0, y: 0 };
    let monitor = PhysicalSize { width: 1920, height: 1080 };
    let window = PhysicalSize { width: 420, height: 110 };

    let (x, y) = calculate_top_center_position(pos, monitor, window, 40, false);

    assert_eq!(x, 750);
    assert_eq!(y, 40);
  }

  #[test]
  fn calculate_position_bottom_origin_places_near_top_edge() {
    let pos = PhysicalPosition { x: 0, y: 0 };
    let monitor = PhysicalSize { width: 1920, height: 1080 };
    let window = PhysicalSize { width: 420, height: 110 };

    let (x, y) = calculate_top_center_position(pos, monitor, window, 40, true);

    assert_eq!(x, 750);
    assert_eq!(y, 930);
  }

  #[test]
  fn clamps_when_margin_exceeds_bounds() {
    let pos = PhysicalPosition { x: 100, y: 50 };
    let monitor = PhysicalSize { width: 400, height: 200 };
    let window = PhysicalSize { width: 380, height: 150 };

    let (x, y) = calculate_top_center_position(pos, monitor, window, 200, true);

    assert_eq!(x, 110);
    assert_eq!(y, 50);
  }
}
