use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::auth::AuthStore;
use crate::barcode::{to_svg, BarcodeOptions};
use crate::db::Database;
use crate::updater::UpdateManager;

pub struct AppState {
    pub db: Mutex<Database>,
    pub auth: Mutex<AuthStore>,
    pub updater: Mutex<UpdateManager>,
}

impl AppState {
    pub fn new(data_dir: impl AsRef<Path>) -> Result<Self, String> {
        let dir = data_dir.as_ref();
        let db = Database::open(dir)?;
        let auth = AuthStore::new(dir);
        let updater = UpdateManager::new(dir, "4.0.0", "Hzifa33", "raff");

        Ok(Self {
            db: Mutex::new(db),
            auth: Mutex::new(auth),
            updater: Mutex::new(updater),
        })
    }

    pub fn check_admin(&self) -> Result<(), String> {
        let auth = self.auth.lock().map_err(|e| e.to_string())?;
        if auth.is_admin() {
            Ok(())
        } else {
            Err("هذه العملية تتطلب صلاحيات المسؤول".to_string())
        }
    }

    /// Unified command router shared between Tauri 2 IPC commands and CLI/test harnesses.
    pub fn dispatch(&self, cmd: &str, args: &Value) -> Result<Value, String> {
        match cmd {
            "get_all_books" => {
                let auth = self.auth.lock().map_err(|e| e.to_string())?;
                let is_admin = auth.is_admin();
                drop(auth);
                let db = self.db.lock().map_err(|e| e.to_string())?;
                if !is_admin {
                    return serde_json::to_value(db.get_public_books()?)
                        .map_err(|e| e.to_string());
                }
                serde_json::to_value(db.get_all_books()?).map_err(|e| e.to_string())
            }
            "get_public_books" => {
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_public_books()?).map_err(|e| e.to_string())
            }
            "add_book" => {
                self.check_admin()?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                let payload = args.get("payload").unwrap_or(args);
                serde_json::to_value(db.add_book(payload)?).map_err(|e| e.to_string())
            }
            "update_book" => {
                self.check_admin()?;
                let id = args
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "id is required".to_string())?;
                let patch = args.get("patch").unwrap_or(args);
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.update_book(id, patch)?).map_err(|e| e.to_string())
            }
            "set_reference_number" => {
                self.check_admin()?;
                let id = args
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "id is required".to_string())?;
                let ref_num = args
                    .get("referenceNumber")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.set_reference_number(id, ref_num)?)
                    .map_err(|e| e.to_string())
            }
            "remove_book" => {
                self.check_admin()?;
                let id = args
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "id is required".to_string())?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.remove_book(id)?).map_err(|e| e.to_string())
            }
            "restore_book" => {
                self.check_admin()?;
                let id = args
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "id is required".to_string())?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.restore_book(id)?).map_err(|e| e.to_string())
            }
            "get_trash" => {
                self.check_admin()?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_trash()?).map_err(|e| e.to_string())
            }
            "purge_trash" => {
                self.check_admin()?;
                let id = args.get("id").and_then(|v| v.as_str());
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.purge_trash(id)?).map_err(|e| e.to_string())
            }
            "archive_book" => {
                self.check_admin()?;
                let id = args
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "id is required".to_string())?;
                let archived = args
                    .get("archived")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.archive_book(id, archived)?).map_err(|e| e.to_string())
            }
            "borrow_copy" => {
                self.check_admin()?;
                let book_id = args
                    .get("bookId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "bookId is required".to_string())?;
                let payload = args.get("borrower").unwrap_or(args);
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.borrow_copy(book_id, payload)?).map_err(|e| e.to_string())
            }
            "return_loan" => {
                self.check_admin()?;
                let book_id = args
                    .get("bookId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "bookId is required".to_string())?;
                let loan_id = args.get("loanId").and_then(|v| v.as_str());
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.return_loan(book_id, loan_id)?).map_err(|e| e.to_string())
            }
            "return_loan_parts" => {
                self.check_admin()?;
                let book_id = args
                    .get("bookId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "bookId is required".to_string())?;
                let loan_id = args
                    .get("loanId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "loanId is required".to_string())?;
                let vols: Vec<u32> = args
                    .get("volumes")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|x| x.as_u64().map(|n| n as u32))
                            .collect()
                    })
                    .unwrap_or_default();
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.return_loan_parts(book_id, loan_id, &vols)?)
                    .map_err(|e| e.to_string())
            }
            "bulk_update" => {
                self.check_admin()?;
                let ids: Vec<String> = args
                    .get("bookIds")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                let patch = args.get("patch").cloned().unwrap_or_else(|| json!({}));
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                db.bulk_update(&ids, &patch)
            }
            "get_settings" => {
                let auth = self.auth.lock().map_err(|e| e.to_string())?;
                let is_admin = auth.is_admin();
                drop(auth);
                let db = self.db.lock().map_err(|e| e.to_string())?;
                if !is_admin {
                    return db.get_public_settings();
                }
                serde_json::to_value(db.get_settings()?).map_err(|e| e.to_string())
            }
            "update_settings" => {
                self.check_admin()?;
                let patch = args.get("patch").unwrap_or(args);
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.update_settings(patch)?).map_err(|e| e.to_string())
            }
            "apply_loan_duration_to_open_loans" => {
                self.check_admin()?;
                let days = args
                    .get("durationDays")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32);
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                db.apply_loan_duration_to_open_loans(days)
            }
            "peek_next_reference_number" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                Ok(Value::String(db.peek_next_reference_number()?))
            }
            "find_possible_duplicates" => {
                self.check_admin()?;
                let payload = args.get("payload").unwrap_or(args);
                let exclude = args.get("excludeId").and_then(|v| v.as_str());
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.find_possible_duplicates(payload, exclude)?)
                    .map_err(|e| e.to_string())
            }
            "get_stats" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_stats()?).map_err(|e| e.to_string())
            }
            "get_meta" => {
                let auth = self.auth.lock().map_err(|e| e.to_string())?;
                let is_admin = auth.is_admin();
                drop(auth);
                let db = self.db.lock().map_err(|e| e.to_string())?;
                if !is_admin {
                    return db.get_public_meta();
                }
                serde_json::to_value(db.get_meta()?).map_err(|e| e.to_string())
            }
            "get_borrowers_directory" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_borrowers_directory()?).map_err(|e| e.to_string())
            }
            "get_loan_center" => {
                self.check_admin()?;
                let filter = args.get("filter").and_then(|v| v.as_str()).unwrap_or("open");
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_loan_center(filter)?).map_err(|e| e.to_string())
            }
            "get_activity" => {
                self.check_admin()?;
                let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(200) as usize;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_activity(limit)?).map_err(|e| e.to_string())
            }
            "create_backup" => {
                self.check_admin()?;
                let reason = args
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("manual");
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.create_backup(reason)?).map_err(|e| e.to_string())
            }
            "list_backups" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.list_backups()?).map_err(|e| e.to_string())
            }
            "get_recovery_state" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.get_recovery_state()?).map_err(|e| e.to_string())
            }
            "restore_backup_file" => {
                self.check_admin()?;
                let file_path = args
                    .get("filePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "filePath is required".to_string())?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                let backups = db.list_backups()?;
                let found = backups
                    .iter()
                    .find(|b| b.file_path == file_path || b.name == file_path)
                    .ok_or_else(|| "النسخة الاحتياطية المطلوبة غير موجودة".to_string())?;
                let raw = fs::read_to_string(&found.file_path)
                    .map_err(|e| format!("Failed to read backup file: {e}"))?;
                db.restore_json(&raw)
            }
            "integrity_check" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.integrity_check()?).map_err(|e| e.to_string())
            }
            "repair_integrity" => {
                self.check_admin()?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                serde_json::to_value(db.repair_integrity()?).map_err(|e| e.to_string())
            }
            "export_data" => {
                self.check_admin()?;
                let format = args
                    .get("format")
                    .and_then(|v| v.as_str())
                    .unwrap_or("json");
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                let content = match format {
                    "csv" => db.export_csv(None)?,
                    "overdue-csv" => db.export_overdue_csv()?,
                    "txt" => db.export_txt()?,
                    "html" => db.build_printable_html()?,
                    _ => db.export_json()?,
                };
                if let Some(target_path) = args.get("filePath").and_then(|v| v.as_str()) {
                    fs::write(target_path, &content)
                        .map_err(|e| format!("Failed to write export file: {e}"))?;
                    Ok(json!({ "saved": true, "path": target_path }))
                } else {
                    Ok(json!({ "saved": true, "content": content }))
                }
            }
            "import_json" => {
                self.check_admin()?;
                let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("merge");
                let raw = if let Some(content) = args.get("content").and_then(|v| v.as_str()) {
                    content.to_string()
                } else if let Some(path) = args.get("filePath").and_then(|v| v.as_str()) {
                    fs::read_to_string(path)
                        .map_err(|e| format!("Failed to read import file: {e}"))?
                } else {
                    return Err("content or filePath is required".to_string());
                };
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                let res = if mode == "replace" {
                    db.restore_json(&raw)?
                } else {
                    db.merge_json(&raw)?
                };
                Ok(json!({
                    "imported": true,
                    "mode": mode,
                    "added": res.get("added"),
                    "skipped": res.get("skipped"),
                    "reassignedRefs": res.get("reassignedRefs"),
                    "total": res.get("total")
                }))
            }
            "reset_all" => {
                self.check_admin()?;
                let mut db = self.db.lock().map_err(|e| e.to_string())?;
                db.reset_all()
            }
            "render_barcode_svg" => {
                let value = args.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let color = args
                    .get("color")
                    .and_then(|v| v.as_str())
                    .unwrap_or("#111111");
                let background = args
                    .get("background")
                    .and_then(|v| v.as_str())
                    .unwrap_or("#ffffff");
                let opts = BarcodeOptions {
                    height: args.get("height").and_then(|v| v.as_f64()).unwrap_or(52.0),
                    module_width: args.get("barWidth").and_then(|v| v.as_f64()).unwrap_or(1.8),
                    margin: args
                        .get("quietZone")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(10.0),
                    show_text: args
                        .get("displayValue")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    text_size: 13.0,
                    color,
                    background,
                    font_family: "monospace",
                };
                let svg = to_svg(value, &opts)?;
                Ok(Value::String(svg))
            }
            "auth_get_state" => {
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                let s = auth.get_state();
                Ok(json!({
                    "enabled": s.configured,
                    "configured": s.configured,
                    "username": "admin",
                    "publicModeEnabled": s.start_in_public_mode,
                    "recoveryConfigured": !s.recovery_question.is_empty(),
                    "recoveryQuestion": s.recovery_question,
                    "failedAttempts": s.failed_attempts,
                    "remainingAttempts": s.attempts_remaining,
                    "maxFailedAttempts": s.max_attempts,
                    "lockedOut": s.locked_for_ms > 0,
                    "lockoutRemainingMs": s.locked_for_ms,
                    "unlocked": s.mode == "admin",
                    "mode": s.mode
                }))
            }
            "auth_login" => {
                let password = args.get("password").and_then(|v| v.as_str()).unwrap_or("");
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                let res = auth.login(password);
                serde_json::to_value(res).map_err(|e| e.to_string())
            }
            "auth_logout_to_public" => {
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                let _ = auth.logout();
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "auth_setup" => {
                self.check_admin()?;
                let password = args.get("password").and_then(|v| v.as_str()).unwrap_or("");
                let question = args
                    .get("recoveryQuestion")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let answer = args
                    .get("recoveryAnswer")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let public_mode = args
                    .get("publicModeEnabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                auth.configure(password, question, answer, public_mode)?;
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "auth_update_credentials" => {
                self.check_admin()?;
                let pw = args.get("newPassword").and_then(|v| v.as_str());
                let q = args.get("recoveryQuestion").and_then(|v| v.as_str());
                let a = args.get("recoveryAnswer").and_then(|v| v.as_str());
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                auth.change_credentials(pw, q, a)?;
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "auth_set_public_mode" => {
                self.check_admin()?;
                let enabled = args
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                let _ = auth.update_preferences(Some(enabled));
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "auth_disable" => {
                self.check_admin()?;
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                auth.remove_protection()?;
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "auth_recover" => {
                let answer = args.get("answer").and_then(|v| v.as_str()).unwrap_or("");
                let new_pw = args
                    .get("newPassword")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let mut auth = self.auth.lock().map_err(|e| e.to_string())?;
                let res = auth.reset_password(answer, new_pw);
                if !res.ok {
                    return Err(res.error.unwrap_or_else(|| "فشل الاسترداد".to_string()));
                }
                drop(auth);
                self.dispatch("auth_get_state", &json!({}))
            }
            "updater_get_state" => {
                let updater = self.updater.lock().map_err(|e| e.to_string())?;
                Ok(updater.get_status())
            }
            "updater_check_now" => {
                let mut updater = self.updater.lock().map_err(|e| e.to_string())?;
                Ok(updater.mark_manual_check())
            }
            "updater_set_preferences" => {
                self.check_admin()?;
                let mut updater = self.updater.lock().map_err(|e| e.to_string())?;
                if let Some(enabled) = args.get("autoCheck").and_then(|v| v.as_bool()) {
                    return Ok(updater.set_auto_check_enabled(enabled));
                }
                if let Some(hours) = args.get("postponeHours").and_then(|v| v.as_i64()) {
                    return Ok(updater.postpone(hours));
                }
                Ok(updater.get_status())
            }
            "fs_get_roots" => {
                self.check_admin()?;
                let db = self.db.lock().map_err(|e| e.to_string())?;
                let data_dir = db.data_dir().to_string_lossy().to_string();
                let home = std::env::var("HOME")
                    .or_else(|_| std::env::var("USERPROFILE"))
                    .unwrap_or_else(|_| data_dir.clone());
                Ok(json!({
                    "defaultDir": home,
                    "roots": [
                        { "id": "home", "label": "المجلد الرئيسي", "icon": "folder", "path": home },
                        { "id": "data", "label": "بيانات مكتبة رف", "icon": "database", "path": data_dir }
                    ]
                }))
            }
            "fs_list_dir" => {
                self.check_admin()?;
                let dir_path = args
                    .get("dirPath")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".");
                let target = PathBuf::from(dir_path);
                let resolved = fs::canonicalize(&target).unwrap_or(target);
                let parent = resolved
                    .parent()
                    .map(|p| p.to_string_lossy().to_string());
                let mut items = Vec::new();
                if let Ok(entries) = fs::read_dir(&resolved) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') {
                            continue;
                        }
                        if let Ok(meta) = entry.metadata() {
                            items.push(json!({
                                "name": name,
                                "path": entry.path().to_string_lossy().to_string(),
                                "isDirectory": meta.is_dir(),
                                "size": if meta.is_dir() { 0 } else { meta.len() }
                            }));
                        }
                    }
                }
                Ok(json!({
                    "path": resolved.to_string_lossy().to_string(),
                    "parent": parent,
                    "items": items
                }))
            }
            _ => Err(format!("Unknown command: {cmd}")),
        }
    }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn raff_invoke(
    state: tauri::State<'_, AppState>,
    cmd: String,
    args: Value,
) -> Result<Value, String> {
    state.dispatch(&cmd, &args)
}
