use chrono::{DateTime, Duration, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::book_status::{
    compute_book_availability, get_loan_outstanding_volumes, get_loan_returned_volumes,
    get_loan_volumes, is_loan_open as is_loan_active, is_loan_overdue, loan_overdue_days,
    loan_scope_label_with_mode as loan_scope_label,
};
use crate::models::*;
use crate::normalize::*;

pub struct Database {
    conn: Connection,
    data_dir: PathBuf,
    db_path: PathBuf,
    legacy_json_path: PathBuf,
    backups_dir: PathBuf,
    recovery_notice: Option<RecoveryNotice>,
    migrated_from_v3: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityIssue {
    pub r#type: String,
    pub severity: String,
    pub book_id: Option<String>,
    pub loan_id: Option<String>,
    pub title: Option<String>,
    pub reference_number: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub ok: bool,
    pub total_books: usize,
    pub checked_at: String,
    pub issue_count: usize,
    pub issues: Vec<IntegrityIssue>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    pub repaired: usize,
    pub changes: Vec<String>,
    pub backup_path: Option<String>,
    pub after: IntegrityReport,
}

impl Database {
    pub fn open(data_dir: impl AsRef<Path>) -> Result<Self, String> {
        let data_dir = data_dir.as_ref().to_path_buf();
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
        let backups_dir = data_dir.join("backups");
        fs::create_dir_all(&backups_dir)
            .map_err(|e| format!("Failed to create backups dir: {e}"))?;

        let db_path = data_dir.join("raff-library.sqlite");
        let legacy_json_path = data_dir.join("raff-library.json");

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {e}"))?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -16000;",
        )
        .map_err(|e| format!("Failed to configure SQLite pragmas: {e}"))?;

        let mut db = Self {
            conn,
            data_dir,
            db_path,
            legacy_json_path,
            backups_dir,
            recovery_notice: None,
            migrated_from_v3: false,
        };

        db.init_schema()?;
        db.maybe_migrate_from_v3_json()?;
        let _ = db.purge_expired_trash();
        Ok(db)
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn legacy_json_path(&self) -> &Path {
        &self.legacy_json_path
    }

    fn init_schema(&mut self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS books (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    publisher TEXT NOT NULL,
                    reference_number TEXT NOT NULL,
                    reference_identity TEXT NOT NULL,
                    category TEXT NOT NULL,
                    edition TEXT NOT NULL,
                    publish_year TEXT NOT NULL,
                    copies_total INTEGER NOT NULL DEFAULT 1,
                    volumes INTEGER NOT NULL DEFAULT 1,
                    price REAL,
                    series TEXT NOT NULL DEFAULT '',
                    series_order TEXT NOT NULL DEFAULT '',
                    keywords_json TEXT NOT NULL DEFAULT '[]',
                    condition TEXT NOT NULL DEFAULT 'جيدة',
                    acquisition TEXT NOT NULL DEFAULT '',
                    shelf TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    language TEXT NOT NULL DEFAULT 'العربية',
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    search_blob TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS loans (
                    id TEXT PRIMARY KEY,
                    book_id TEXT NOT NULL,
                    borrower_name TEXT NOT NULL,
                    loan_type TEXT NOT NULL DEFAULT 'full',
                    volumes_json TEXT NOT NULL DEFAULT '[]',
                    volume INTEGER,
                    borrowed_at TEXT NOT NULL,
                    due_at TEXT NOT NULL,
                    contact TEXT NOT NULL DEFAULT '',
                    note TEXT NOT NULL DEFAULT '',
                    volume_returns_json TEXT NOT NULL DEFAULT '{}',
                    returned_at TEXT,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS trash (
                    id TEXT PRIMARY KEY,
                    deleted_at TEXT NOT NULL,
                    book_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS activity (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_books_ref_identity ON books(reference_identity);
                CREATE INDEX IF NOT EXISTS idx_books_ref_number ON books(reference_number);
                CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
                CREATE INDEX IF NOT EXISTS idx_books_publisher ON books(publisher);
                CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
                CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
                CREATE INDEX IF NOT EXISTS idx_books_archived ON books(archived_at);
                CREATE INDEX IF NOT EXISTS idx_loans_book_id ON loans(book_id, sort_order);
                CREATE INDEX IF NOT EXISTS idx_loans_returned ON loans(returned_at);
                CREATE INDEX IF NOT EXISTS idx_loans_due ON loans(due_at);",
            )
            .map_err(|e| format!("Schema initialization failed: {e}"))?;

        if self.get_meta_string("schema_version")?.is_none() {
            self.set_meta_string("schema_version", &SCHEMA_VERSION.to_string())?;
        }
        if self.get_meta_string("next_ref_seq")?.is_none() {
            self.set_meta_string("next_ref_seq", "1")?;
        }
        if self.get_meta_string("settings")?.is_none() {
            let default_settings = serde_json::to_string(&Settings::default())
                .map_err(|e| format!("Failed to serialize default settings: {e}"))?;
            self.set_meta_string("settings", &default_settings)?;
        }
        Ok(())
    }

    fn get_meta_string(&self, key: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row("SELECT value FROM meta WHERE key = ?1", params![key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| format!("Failed to read meta {key}: {e}"))
    }

    fn set_meta_string(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO meta (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(|e| format!("Failed to write meta {key}: {e}"))?;
        Ok(())
    }

    pub fn get_next_ref_seq(&self) -> u64 {
        self.get_meta_string("next_ref_seq")
            .ok()
            .flatten()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(1)
            .max(1)
    }

    fn set_next_ref_seq(&self, seq: u64) -> Result<(), String> {
        self.set_meta_string("next_ref_seq", &seq.max(1).to_string())
    }

    /// Safe, non-destructive migration from RAFF 3.0.0 (`raff-library.json`) to RAFF 4.0.0 (`raff-library.sqlite`).
    /// - Never deletes or overwrites `raff-library.json`.
    /// - Creates a timestamped backup in `backups/` before migrating.
    /// - Rejects future schema versions (`> 8`).
    pub fn maybe_migrate_from_v3_json(&mut self) -> Result<Option<MigrationReport>, String> {
        if self.get_meta_string("migrated_v3_done")?.as_deref() == Some("true") {
            self.migrated_from_v3 = true;
            return Ok(None);
        }

        let existing_books: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        if existing_books > 0 {
            return Ok(None);
        }

        if !self.legacy_json_path.exists() {
            return Ok(None);
        }

        let raw_bytes = fs::read_to_string(&self.legacy_json_path)
            .map_err(|e| format!("Failed to read v3 raff-library.json: {e}"))?;

        let parsed: Value = match serde_json::from_str(&raw_bytes) {
            Ok(v) => v,
            Err(err) => {
                // Corrupt legacy file: preserve it untouched and record recovery notice
                let stamp = Self::file_stamp();
                let corrupt_copy = self
                    .data_dir
                    .join(format!("raff-library.corrupt-{stamp}.json"));
                let _ = fs::copy(&self.legacy_json_path, &corrupt_copy);
                self.recovery_notice = Some(RecoveryNotice {
                    reason: "corrupt".to_string(),
                    message: format!("تعذر قراءة ملف البيانات السابق ({err}). تم الاحتفاظ بنسخة كاملة منه ويمكنك استعادة أحدث نسخة احتياطية."),
                    corrupt_path: Some(corrupt_copy.to_string_lossy().to_string()),
                });
                return Ok(None);
            }
        };

        let raw_version = parsed
            .get("schemaVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;
        if raw_version > SCHEMA_VERSION {
            return Err(format!(
                "ملف البيانات أُنشئ بإصدار أحدث من رف (schemaVersion={raw_version} > {SCHEMA_VERSION}). يرجى تحديث البرنامج أولاً؛ لن يتم تعديل الملف."
            ));
        }

        // Create pre-migration backup of the original JSON without touching the original file
        let stamp = Self::file_stamp();
        let backup_path = self
            .backups_dir
            .join(format!("raff-backup-{stamp}-pre-v4-migration.json"));
        fs::write(&backup_path, &raw_bytes)
            .map_err(|e| format!("Failed to write pre-migration backup: {e}"))?;

        let report = self.import_legacy_payload(&parsed, Some(backup_path.to_string_lossy().to_string()))?;
        self.set_meta_string("migrated_v3_done", "true")?;
        self.migrated_from_v3 = true;
        Ok(Some(report))
    }

    fn import_legacy_payload(
        &mut self,
        payload: &Value,
        backup_path: Option<String>,
    ) -> Result<MigrationReport, String> {
        let settings_val = payload.get("settings").cloned().unwrap_or_else(|| json!({}));
        let settings = Self::sanitize_settings_value(&settings_val, None);
        let default_loan_days = settings.loan_duration_days as i64;

        let mut next_seq: u64 = payload
            .get("nextRefSeq")
            .and_then(|v| v.as_u64())
            .unwrap_or(1)
            .max(1);

        let raw_books = payload
            .get("books")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        // First pass: observe canonical reference numbers so auto-generated refs never collide
        let mut used_identities = HashSet::new();
        for b in &raw_books {
            if let Some(ref_str) = b.get("referenceNumber").and_then(|v| v.as_str()) {
                let norm = normalize_reference_for_storage(ref_str);
                let id = reference_identity(&norm);
                if !id.is_empty() {
                    used_identities.insert(id);
                }
                if let Some(seq) = canonical_ref_seq(&norm) {
                    if seq >= next_seq {
                        next_seq = seq + 1;
                    }
                }
            }
        }

        let mut books_to_insert: Vec<Book> = Vec::with_capacity(raw_books.len());
        let mut total_loans = 0usize;

        for b in &raw_books {
            let book = Self::migrate_legacy_book(
                b,
                default_loan_days,
                &mut next_seq,
                &mut used_identities,
            );
            total_loans += book.loans.len();
            books_to_insert.push(book);
        }

        let raw_trash = payload
            .get("trash")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut trash_items = Vec::new();
        for t in &raw_trash {
            if let Some(book_val) = t.get("book") {
                let book = Self::migrate_legacy_book(
                    book_val,
                    default_loan_days,
                    &mut next_seq,
                    &mut used_identities,
                );
                let id = t
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| book.id.clone());
                let deleted_at = t
                    .get("deletedAt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(Self::now_iso);
                trash_items.push(TrashItem {
                    id,
                    deleted_at,
                    book,
                });
            }
        }

        let raw_activity = payload
            .get("activity")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut activity_items = Vec::new();
        for a in raw_activity.into_iter().take(MAX_ACTIVITY) {
            let id = a
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| new_uuid());
            let r#type = a
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("info")
                .to_string();
            let message = a
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let details = a.get("details").cloned().unwrap_or_else(|| json!({}));
            let created_at = a
                .get("createdAt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(Self::now_iso);
            activity_items.push(ActivityItem {
                id,
                r#type,
                message,
                details,
                created_at,
            });
        }

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Failed to start SQLite migration transaction: {e}"))?;

        tx.execute("DELETE FROM loans", [])
            .map_err(|e| format!("Failed to clear loans: {e}"))?;
        tx.execute("DELETE FROM books", [])
            .map_err(|e| format!("Failed to clear books: {e}"))?;
        tx.execute("DELETE FROM trash", [])
            .map_err(|e| format!("Failed to clear trash: {e}"))?;
        tx.execute("DELETE FROM activity", [])
            .map_err(|e| format!("Failed to clear activity: {e}"))?;

        for book in &books_to_insert {
            Self::insert_book_on_tx(&tx, book)?;
        }

        for item in &trash_items {
            let book_json = serde_json::to_string(&item.book)
                .map_err(|e| format!("Failed to serialize trash book: {e}"))?;
            tx.execute(
                "INSERT INTO trash (id, deleted_at, book_json) VALUES (?1, ?2, ?3)",
                params![item.id, item.deleted_at, book_json],
            )
            .map_err(|e| format!("Failed to insert trash item: {e}"))?;
        }

        // Insert activity in reverse so newest gets highest seq or order by created_at DESC
        for item in activity_items.iter().rev() {
            let details_json = serde_json::to_string(&item.details).unwrap_or_else(|_| "{}".into());
            tx.execute(
                "INSERT INTO activity (id, type, message, details_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    item.id,
                    item.r#type,
                    item.message,
                    details_json,
                    item.created_at
                ],
            )
            .map_err(|e| format!("Failed to insert activity item: {e}"))?;
        }

        let settings_json = serde_json::to_string(&settings)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('settings', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![settings_json],
        )
        .map_err(|e| format!("Failed to save settings in transaction: {e}"))?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![next_seq.to_string()],
        )
        .map_err(|e| format!("Failed to save next_ref_seq: {e}"))?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| format!("Failed to save schema_version: {e}"))?;

        tx.commit()
            .map_err(|e| format!("Failed to commit migration transaction: {e}"))?;

        Ok(MigrationReport {
            migrated: true,
            books_migrated: books_to_insert.len(),
            loans_migrated: total_loans,
            trash_migrated: trash_items.len(),
            activity_migrated: activity_items.len(),
            backup_path,
            source_json_preserved: self.legacy_json_path.exists(),
        })
    }

    fn migrate_legacy_book(
        b: &Value,
        default_loan_days: i64,
        next_seq: &mut u64,
        used_identities: &mut HashSet<String>,
    ) -> Book {
        let id = b
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| new_uuid());

        let copies_total = b
            .get("copiesTotal")
            .and_then(|v| v.as_u64())
            .or_else(|| b.get("copies").and_then(|v| v.as_u64()))
            .unwrap_or(1)
            .max(1) as u32;

        let volumes = b
            .get("volumes")
            .and_then(|v| v.as_u64())
            .unwrap_or(1)
            .max(1) as u32;

        let mut loans: Vec<Loan> = Vec::new();
        if let Some(arr) = b.get("loans").and_then(|v| v.as_array()) {
            for l in arr {
                let borrower_name = l
                    .get("borrowerName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if borrower_name.is_empty() {
                    continue;
                }
                let borrowed_at = l
                    .get("borrowedAt")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .unwrap_or_else(Self::now_iso);
                let due_at = l
                    .get("dueAt")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| Self::add_days_iso(&borrowed_at, default_loan_days));

                let mut vols: Vec<u32> = l
                    .get("volumes")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_u64().map(|n| n as u32))
                            .filter(|&n| n >= 1 && n <= volumes)
                            .collect::<BTreeSet<_>>()
                            .into_iter()
                            .collect()
                    })
                    .unwrap_or_default();

                let single_vol = l.get("volume").and_then(|v| v.as_u64()).map(|n| n as u32);
                if vols.is_empty() {
                    if let Some(sv) = single_vol {
                        if sv >= 1 && sv <= volumes {
                            vols.push(sv);
                        }
                    }
                }

                let raw_type = l.get("type").and_then(|v| v.as_str()).unwrap_or("full");
                let loan_type = if raw_type == "partial" && !vols.is_empty() {
                    "partial".to_string()
                } else {
                    "full".to_string()
                };

                let mut volume_returns = BTreeMap::new();
                if loan_type == "partial" {
                    if let Some(vr_obj) = l.get("volumeReturns").and_then(|v| v.as_object()) {
                        for (k, v) in vr_obj {
                            if let (Ok(vn), Some(ts)) = (k.parse::<u32>(), v.as_str()) {
                                if vols.contains(&vn) && !ts.is_empty() {
                                    volume_returns.insert(vn.to_string(), ts.to_string());
                                }
                            }
                        }
                    }
                }

                let mut returned_at = l
                    .get("returnedAt")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string());

                if loan_type == "partial"
                    && returned_at.is_none()
                    && !vols.is_empty()
                    && vols
                        .iter()
                        .all(|vn| volume_returns.contains_key(&vn.to_string()))
                {
                    returned_at = volume_returns.values().max().cloned();
                }

                loans.push(Loan {
                    id: l
                        .get("id")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| new_uuid()),
                    borrower_name,
                    r#type: loan_type.clone(),
                    volume: if loan_type == "partial" && vols.len() == 1 {
                        Some(vols[0])
                    } else {
                        None
                    },
                    volumes: if loan_type == "partial" {
                        vols
                    } else {
                        Vec::new()
                    },
                    borrowed_at,
                    due_at,
                    contact: l
                        .get("contact")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string(),
                    note: l
                        .get("note")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string(),
                    volume_returns,
                    returned_at,
                });
            }
        } else if let Some(borrower) = b.get("borrower").and_then(|v| v.as_object()) {
            // Migrate v1/v2 single-borrower format
            if let Some(name) = borrower
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                let count = b
                    .get("copiesBorrowed")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1)
                    .max(1) as u32;
                let borrowed_at = borrower
                    .get("borrowedAt")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .unwrap_or_else(Self::now_iso);
                let due_at = Self::add_days_iso(&borrowed_at, default_loan_days);
                for _ in 0..count.min(copies_total) {
                    loans.push(Loan {
                        id: new_uuid(),
                        borrower_name: name.to_string(),
                        r#type: "full".to_string(),
                        volumes: Vec::new(),
                        volume: None,
                        borrowed_at: borrowed_at.clone(),
                        due_at: due_at.clone(),
                        contact: String::new(),
                        note: String::new(),
                        volume_returns: BTreeMap::new(),
                        returned_at: None,
                    });
                }
            }
        }

        let raw_ref = b
            .get("referenceNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut reference_number = normalize_reference_for_storage(raw_ref);
        if reference_number.is_empty() {
            loop {
                let candidate = format!("raf-{:0>4}", *next_seq);
                *next_seq += 1;
                let id_key = reference_identity(&candidate);
                if !used_identities.contains(&id_key) {
                    used_identities.insert(id_key);
                    reference_number = candidate;
                    break;
                }
            }
        } else {
            let id_key = reference_identity(&reference_number);
            used_identities.insert(id_key);
            if let Some(seq) = canonical_ref_seq(&reference_number) {
                if seq >= *next_seq {
                    *next_seq = seq + 1;
                }
            }
        }

        let keywords: Vec<String> = match b.get("keywords") {
            Some(Value::Array(arr)) => sanitize_keywords(
                &arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>(),
            ),
            Some(Value::String(s)) => sanitize_keywords(&[s.clone()]),
            _ => Vec::new(),
        };

        let price = b
            .get("price")
            .and_then(|v| v.as_f64().or_else(|| v.as_str()?.trim().parse::<f64>().ok()));
        let created_at = b
            .get("createdAt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(Self::now_iso);
        let updated_at = b
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| created_at.clone());

        Book {
            id,
            title: b
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            author: b
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            publisher: b
                .get("publisher")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            reference_number,
            category: b
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            edition: b
                .get("edition")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            publish_year: b
                .get("publishYear")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_u64().map(|n| n.to_string()))
                })
                .unwrap_or_default()
                .trim()
                .to_string(),
            copies_total,
            volumes,
            price: sanitize_price(price),
            series: b
                .get("series")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            series_order: b
                .get("seriesOrder")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_u64().map(|n| n.to_string()))
                })
                .unwrap_or_default()
                .trim()
                .to_string(),
            keywords,
            condition: sanitize_condition(
                b.get("condition")
                    .and_then(|v| v.as_str())
                    .unwrap_or("جيدة"),
            ),
            acquisition: b
                .get("acquisition")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            shelf: b
                .get("shelf")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            loans,
            notes: b
                .get("notes")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            language: b
                .get("language")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("العربية")
                .trim()
                .to_string(),
            archived_at: b
                .get("archivedAt")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            created_at,
            updated_at,
        }
    }

    fn build_search_blob(book: &Book) -> String {
        let raw = format!(
            "{} {} {} {} {} {} {} {} {}",
            book.title,
            book.author,
            book.publisher,
            book.reference_number,
            book.category,
            book.series,
            book.shelf,
            book.keywords.join(" "),
            book.notes
        );
        normalize_arabic(&raw)
    }

    fn insert_book_on_tx(tx: &rusqlite::Transaction<'_>, book: &Book) -> Result<(), String> {
        let ref_identity = reference_identity(&book.reference_number);
        let keywords_json =
            serde_json::to_string(&book.keywords).unwrap_or_else(|_| "[]".to_string());
        let search_blob = Self::build_search_blob(book);

        tx.execute(
            "INSERT INTO books (
                id, title, author, publisher, reference_number, reference_identity,
                category, edition, publish_year, copies_total, volumes, price,
                series, series_order, keywords_json, condition, acquisition,
                shelf, notes, language, archived_at, created_at, updated_at, search_blob
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24
            )",
            params![
                book.id,
                book.title,
                book.author,
                book.publisher,
                book.reference_number,
                ref_identity,
                book.category,
                book.edition,
                book.publish_year,
                book.copies_total,
                book.volumes,
                book.price,
                book.series,
                book.series_order,
                keywords_json,
                book.condition,
                book.acquisition,
                book.shelf,
                book.notes,
                book.language,
                book.archived_at,
                book.created_at,
                book.updated_at,
                search_blob
            ],
        )
        .map_err(|e| format!("Failed to insert book {}: {e}", book.id))?;

        Self::replace_book_loans_on_tx(tx, &book.id, &book.loans)?;
        Ok(())
    }

    fn replace_book_loans_on_tx(
        tx: &rusqlite::Transaction<'_>,
        book_id: &str,
        loans: &[Loan],
    ) -> Result<(), String> {
        tx.execute("DELETE FROM loans WHERE book_id = ?1", params![book_id])
            .map_err(|e| format!("Failed to delete old loans for {book_id}: {e}"))?;

        for (idx, loan) in loans.iter().enumerate() {
            let volumes_json =
                serde_json::to_string(&loan.volumes).unwrap_or_else(|_| "[]".to_string());
            let vr_json =
                serde_json::to_string(&loan.volume_returns).unwrap_or_else(|_| "{}".to_string());
            tx.execute(
                "INSERT INTO loans (
                    id, book_id, borrower_name, loan_type, volumes_json, volume,
                    borrowed_at, due_at, contact, note, volume_returns_json, returned_at, sort_order
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    loan.id,
                    book_id,
                    loan.borrower_name,
                    loan.r#type,
                    volumes_json,
                    loan.volume,
                    loan.borrowed_at,
                    loan.due_at,
                    loan.contact,
                    loan.note,
                    vr_json,
                    loan.returned_at,
                    idx as i64
                ],
            )
            .map_err(|e| format!("Failed to insert loan {}: {e}", loan.id))?;
        }
        Ok(())
    }

    pub fn get_all_books(&self) -> Result<Vec<Book>, String> {
        let mut loans_by_book: HashMap<String, Vec<Loan>> = HashMap::new();
        {
            let mut loan_stmt = self
                .conn
                .prepare(
                    "SELECT id, book_id, borrower_name, loan_type, volumes_json, volume,
                            borrowed_at, due_at, contact, note, volume_returns_json, returned_at
                     FROM loans
                     ORDER BY sort_order ASC",
                )
                .map_err(|e| format!("Failed to prepare loans query: {e}"))?;

            let rows = loan_stmt
                .query_map([], |row| {
                    let book_id: String = row.get(1)?;
                    let volumes_json: String = row.get(4)?;
                    let vr_json: String = row.get(10)?;
                    let volumes: Vec<u32> = serde_json::from_str(&volumes_json).unwrap_or_default();
                    let volume_returns: BTreeMap<String, String> =
                        serde_json::from_str(&vr_json).unwrap_or_default();
                    Ok((
                        book_id,
                        Loan {
                            id: row.get(0)?,
                            borrower_name: row.get(2)?,
                            r#type: row.get(3)?,
                            volumes,
                            volume: row.get(5)?,
                            borrowed_at: row.get(6)?,
                            due_at: row.get(7)?,
                            contact: row.get(8)?,
                            note: row.get(9)?,
                            volume_returns,
                            returned_at: row.get(11)?,
                        },
                    ))
                })
                .map_err(|e| format!("Failed to read loans: {e}"))?;

            for r in rows {
                let (book_id, loan) = r.map_err(|e| format!("Loan row error: {e}"))?;
                loans_by_book.entry(book_id).or_default().push(loan);
            }
        }

        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, title, author, publisher, reference_number, category, edition,
                        publish_year, copies_total, volumes, price, series, series_order,
                        keywords_json, condition, acquisition, shelf, notes, language,
                        archived_at, created_at, updated_at
                 FROM books
                 ORDER BY rowid ASC",
            )
            .map_err(|e| format!("Failed to prepare books query: {e}"))?;

        let book_rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let keywords_json: String = row.get(13)?;
                let keywords: Vec<String> =
                    serde_json::from_str(&keywords_json).unwrap_or_default();
                Ok(Book {
                    loans: loans_by_book.remove(&id).unwrap_or_default(),
                    id,
                    title: row.get(1)?,
                    author: row.get(2)?,
                    publisher: row.get(3)?,
                    reference_number: row.get(4)?,
                    category: row.get(5)?,
                    edition: row.get(6)?,
                    publish_year: row.get(7)?,
                    copies_total: row.get(8)?,
                    volumes: row.get(9)?,
                    price: row.get(10)?,
                    series: row.get(11)?,
                    series_order: row.get(12)?,
                    keywords,
                    condition: row.get(14)?,
                    acquisition: row.get(15)?,
                    shelf: row.get(16)?,
                    notes: row.get(17)?,
                    language: row.get(18)?,
                    archived_at: row.get(19)?,
                    created_at: row.get(20)?,
                    updated_at: row.get(21)?,
                })
            })
            .map_err(|e| format!("Failed to query books: {e}"))?;

        let mut books = Vec::new();
        for b in book_rows {
            books.push(b.map_err(|e| format!("Book row error: {e}"))?);
        }
        Ok(books)
    }

    pub fn get_book_by_id(&self, book_id: &str) -> Result<Option<Book>, String> {
        let mut loan_stmt = self
            .conn
            .prepare(
                "SELECT id, borrower_name, loan_type, volumes_json, volume,
                        borrowed_at, due_at, contact, note, volume_returns_json, returned_at
                 FROM loans
                 WHERE book_id = ?1
                 ORDER BY sort_order ASC",
            )
            .map_err(|e| format!("Failed to prepare book loans query: {e}"))?;

        let loans = loan_stmt
            .query_map(params![book_id], |row| {
                let volumes_json: String = row.get(3)?;
                let vr_json: String = row.get(9)?;
                Ok(Loan {
                    id: row.get(0)?,
                    borrower_name: row.get(1)?,
                    r#type: row.get(2)?,
                    volumes: serde_json::from_str(&volumes_json).unwrap_or_default(),
                    volume: row.get(4)?,
                    borrowed_at: row.get(5)?,
                    due_at: row.get(6)?,
                    contact: row.get(7)?,
                    note: row.get(8)?,
                    volume_returns: serde_json::from_str(&vr_json).unwrap_or_default(),
                    returned_at: row.get(10)?,
                })
            })
            .map_err(|e| format!("Failed to read book loans: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Loan collect error: {e}"))?;

        self.conn
            .query_row(
                "SELECT id, title, author, publisher, reference_number, category, edition,
                        publish_year, copies_total, volumes, price, series, series_order,
                        keywords_json, condition, acquisition, shelf, notes, language,
                        archived_at, created_at, updated_at
                 FROM books WHERE id = ?1",
                params![book_id],
                |row| {
                    let keywords_json: String = row.get(13)?;
                    Ok(Book {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        author: row.get(2)?,
                        publisher: row.get(3)?,
                        reference_number: row.get(4)?,
                        category: row.get(5)?,
                        edition: row.get(6)?,
                        publish_year: row.get(7)?,
                        copies_total: row.get(8)?,
                        volumes: row.get(9)?,
                        price: row.get(10)?,
                        series: row.get(11)?,
                        series_order: row.get(12)?,
                        keywords: serde_json::from_str(&keywords_json).unwrap_or_default(),
                        condition: row.get(14)?,
                        acquisition: row.get(15)?,
                        shelf: row.get(16)?,
                        loans,
                        notes: row.get(17)?,
                        language: row.get(18)?,
                        archived_at: row.get(19)?,
                        created_at: row.get(20)?,
                        updated_at: row.get(21)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to load book {book_id}: {e}"))
    }

    pub fn get_public_books(&self) -> Result<Vec<Value>, String> {
        let books = self.get_all_books()?;
        let now_ms = Utc::now().timestamp_millis();
        let mut out = Vec::with_capacity(books.len());
        for b in books {
            if b.archived_at.is_some() {
                continue;
            }
            let avail = compute_book_availability(&b, now_ms);
            // Strip personal borrower names, contacts, notes, and internal prices/notes in public kiosk mode
            // while keeping anonymous loan availability counts so computeBookAvailability works on the frontend.
            let redacted_loans: Vec<Value> = b
                .loans
                .iter()
                .filter(|l| is_loan_active(l))
                .map(|l| {
                    json!({
                        "id": l.id,
                        "type": l.r#type,
                        "volumes": l.volumes,
                        "volume": l.volume,
                        "volumeReturns": l.volume_returns,
                        "dueAt": l.due_at,
                        "returnedAt": Value::Null
                    })
                })
                .collect();

            out.push(json!({
                "id": b.id,
                "title": b.title,
                "author": b.author,
                "publisher": b.publisher,
                "referenceNumber": b.reference_number,
                "category": b.category,
                "edition": b.edition,
                "publishYear": b.publish_year,
                "copiesTotal": b.copies_total,
                "volumes": b.volumes,
                "series": b.series,
                "seriesOrder": b.series_order,
                "keywords": b.keywords,
                "condition": b.condition,
                "shelf": b.shelf,
                "language": b.language,
                "loans": redacted_loans,
                "publicAvailability": {
                    "state": avail.state,
                    "copiesTotal": avail.copies_total,
                    "availableCopies": avail.available_copies,
                    "borrowedCopies": avail.borrowed_copies,
                    "availableVolumes": avail.available_volumes,
                    "borrowedVolumes": avail.borrowed_volumes
                }
            }));
        }
        Ok(out)
    }

    pub fn peek_next_reference_number(&self) -> Result<String, String> {
        let mut seq = self.get_next_ref_seq();
        loop {
            let candidate = format!("raf-{:0>4}", seq);
            let id_key = reference_identity(&candidate);
            let exists: bool = self
                .conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM books WHERE reference_identity = ?1)",
                    params![id_key],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            if !exists {
                return Ok(candidate);
            }
            seq += 1;
        }
    }

    fn allocate_next_reference_number(&self) -> Result<(String, u64), String> {
        let mut seq = self.get_next_ref_seq();
        loop {
            let candidate = format!("raf-{:0>4}", seq);
            seq += 1;
            let id_key = reference_identity(&candidate);
            let exists: bool = self
                .conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM books WHERE reference_identity = ?1)",
                    params![id_key],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            if !exists {
                return Ok((candidate, seq));
            }
        }
    }

    pub fn assert_unique_reference(
        &self,
        reference_number: &str,
        ignore_book_id: Option<&str>,
    ) -> Result<(), String> {
        let key = reference_identity(reference_number);
        if key.is_empty() {
            return Ok(());
        }
        let conflict: Option<(String, String, String)> = match ignore_book_id {
            Some(ignore_id) => self
                .conn
                .query_row(
                    "SELECT id, reference_number, title FROM books
                     WHERE reference_identity = ?1 AND id != ?2 LIMIT 1",
                    params![key, ignore_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(|e| format!("Uniqueness check failed: {e}"))?,
            None => self
                .conn
                .query_row(
                    "SELECT id, reference_number, title FROM books
                     WHERE reference_identity = ?1 LIMIT 1",
                    params![key],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(|e| format!("Uniqueness check failed: {e}"))?,
        };

        if let Some((_, existing_ref, existing_title)) = conflict {
            let shown = normalize_reference_for_storage(reference_number);
            let title_display = if existing_title.is_empty() {
                "بدون عنوان"
            } else {
                &existing_title
            };
            return Err(format!(
                "الرقم المرجعي \"{shown}\" مستخدم بالفعل للكتاب \"{title_display}\" ({existing_ref}). لكل كتاب رقم مرجعي فريد."
            ));
        }
        Ok(())
    }

    pub fn add_book(&mut self, payload: &Value) -> Result<Book, String> {
        let title = payload
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() {
            return Err("عنوان الكتاب مطلوب".to_string());
        }

        let copies_total = payload
            .get("copiesTotal")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .unwrap_or(1)
            .max(1) as u32;
        let volumes = payload
            .get("volumes")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .unwrap_or(1)
            .max(1) as u32;

        let raw_ref = payload
            .get("referenceNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let custom_ref = normalize_reference_for_storage(raw_ref);

        let mut next_seq = self.get_next_ref_seq();
        let reference_number = if !custom_ref.is_empty() {
            self.assert_unique_reference(&custom_ref, None)?;
            if let Some(seq) = canonical_ref_seq(&custom_ref) {
                if seq >= next_seq {
                    next_seq = seq + 1;
                }
            }
            custom_ref
        } else {
            let (allocated, new_seq) = self.allocate_next_reference_number()?;
            next_seq = new_seq;
            allocated
        };

        let keywords = match payload.get("keywords") {
            Some(Value::Array(arr)) => sanitize_keywords(
                &arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>(),
            ),
            Some(Value::String(s)) => sanitize_keywords(&[s.clone()]),
            _ => Vec::new(),
        };

        let price = payload
            .get("price")
            .and_then(|v| v.as_f64().or_else(|| v.as_str()?.trim().parse::<f64>().ok()));

        let now = Self::now_iso();
        let book = Book {
            id: new_uuid(),
            title,
            author: payload
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            publisher: payload
                .get("publisher")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            reference_number,
            category: payload
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            edition: payload
                .get("edition")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            publish_year: payload
                .get("publishYear")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_u64().map(|n| n.to_string()))
                })
                .unwrap_or_default()
                .trim()
                .to_string(),
            copies_total,
            volumes,
            price: sanitize_price(price),
            series: payload
                .get("series")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            series_order: payload
                .get("seriesOrder")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.as_u64().map(|n| n.to_string()))
                })
                .unwrap_or_default()
                .trim()
                .to_string(),
            keywords,
            condition: sanitize_condition(
                payload
                    .get("condition")
                    .and_then(|v| v.as_str())
                    .unwrap_or("جيدة"),
            ),
            acquisition: payload
                .get("acquisition")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            shelf: payload
                .get("shelf")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            loans: Vec::new(),
            notes: payload
                .get("notes")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            language: payload
                .get("language")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("العربية")
                .trim()
                .to_string(),
            archived_at: None,
            created_at: now.clone(),
            updated_at: now,
        };

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        Self::insert_book_on_tx(&tx, &book)?;
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![next_seq.to_string()],
        )
        .map_err(|e| format!("Failed to update sequence: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        self.log_activity(
            "add",
            &format!("إضافة كتاب: {}", book.title),
            json!({ "bookId": book.id, "ref": book.reference_number }),
        )?;
        Ok(book)
    }

    pub fn update_book(&mut self, book_id: &str, patch: &Value) -> Result<Book, String> {
        let mut book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;

        let now_ms = Utc::now().timestamp_millis();
        let current_avail = compute_book_availability(&book, now_ms);

        let next_copies = patch
            .get("copiesTotal")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .map(|n| (n as u32).max(1))
            .unwrap_or(book.copies_total);

        let next_volumes = patch
            .get("volumes")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .map(|n| (n as u32).max(1))
            .unwrap_or(book.volumes);

        if next_copies < current_avail.borrowed_copies {
            return Err(format!(
                "لا يمكن تقليل عدد النسخ إلى أقل من النسخ المستعارة حالياً ({})",
                current_avail.borrowed_copies
            ));
        }

        if let Some(&max_borrowed_vol) = current_avail.borrowed_volumes.iter().max() {
            if next_volumes < max_borrowed_vol {
                return Err(format!(
                    "لا يمكن تقليل عدد الأجزاء إلى {next_volumes} لأن الجزء رقم {max_borrowed_vol} مستعار حالياً."
                ));
            }
        }

        if let Some(t) = patch.get("title").and_then(|v| v.as_str()) {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                return Err("عنوان الكتاب مطلوب".to_string());
            }
            book.title = trimmed.to_string();
        }

        let mut next_seq = self.get_next_ref_seq();
        if let Some(raw_ref) = patch.get("referenceNumber").and_then(|v| v.as_str()) {
            let candidate = normalize_reference_for_storage(raw_ref);
            if !candidate.is_empty() {
                self.assert_unique_reference(&candidate, Some(book_id))?;
                book.reference_number = candidate;
                if let Some(seq) = canonical_ref_seq(&book.reference_number) {
                    if seq >= next_seq {
                        next_seq = seq + 1;
                    }
                }
            }
        }

        if let Some(v) = patch.get("author").and_then(|v| v.as_str()) {
            book.author = v.trim().to_string();
        }
        if let Some(v) = patch.get("publisher").and_then(|v| v.as_str()) {
            book.publisher = v.trim().to_string();
        }
        if let Some(v) = patch.get("category").and_then(|v| v.as_str()) {
            book.category = v.trim().to_string();
        }
        if let Some(v) = patch.get("edition").and_then(|v| v.as_str()) {
            book.edition = v.trim().to_string();
        }
        if let Some(v) = patch.get("publishYear") {
            book.publish_year = v
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_u64().map(|n| n.to_string()))
                .unwrap_or_default()
                .trim()
                .to_string();
        }
        book.copies_total = next_copies;
        book.volumes = next_volumes;

        if patch.get("price").is_some() {
            let p = patch
                .get("price")
                .and_then(|v| v.as_f64().or_else(|| v.as_str()?.trim().parse::<f64>().ok()));
            book.price = sanitize_price(p);
        }
        if let Some(v) = patch.get("series").and_then(|v| v.as_str()) {
            book.series = v.trim().to_string();
        }
        if let Some(v) = patch.get("seriesOrder") {
            book.series_order = v
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_u64().map(|n| n.to_string()))
                .unwrap_or_default()
                .trim()
                .to_string();
        }
        if let Some(kw) = patch.get("keywords") {
            book.keywords = match kw {
                Value::Array(arr) => sanitize_keywords(
                    &arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>(),
                ),
                Value::String(s) => sanitize_keywords(&[s.clone()]),
                _ => book.keywords.clone(),
            };
        }
        if let Some(v) = patch.get("condition").and_then(|v| v.as_str()) {
            book.condition = sanitize_condition(v);
        }
        if let Some(v) = patch.get("acquisition").and_then(|v| v.as_str()) {
            book.acquisition = v.trim().to_string();
        }
        if let Some(v) = patch.get("shelf").and_then(|v| v.as_str()) {
            book.shelf = v.trim().to_string();
        }
        if let Some(v) = patch.get("notes").and_then(|v| v.as_str()) {
            book.notes = v.trim().to_string();
        }
        if let Some(v) = patch.get("language").and_then(|v| v.as_str()) {
            if !v.trim().is_empty() {
                book.language = v.trim().to_string();
            }
        }
        book.updated_at = Self::now_iso();

        let ref_identity = reference_identity(&book.reference_number);
        let keywords_json =
            serde_json::to_string(&book.keywords).unwrap_or_else(|_| "[]".to_string());
        let search_blob = Self::build_search_blob(&book);

        self.conn
            .execute(
                "UPDATE books SET
                    title = ?1, author = ?2, publisher = ?3,
                    reference_number = ?4, reference_identity = ?5,
                    category = ?6, edition = ?7, publish_year = ?8,
                    copies_total = ?9, volumes = ?10, price = ?11,
                    series = ?12, series_order = ?13, keywords_json = ?14,
                    condition = ?15, acquisition = ?16, shelf = ?17,
                    notes = ?18, language = ?19, updated_at = ?20, search_blob = ?21
                 WHERE id = ?22",
                params![
                    book.title,
                    book.author,
                    book.publisher,
                    book.reference_number,
                    ref_identity,
                    book.category,
                    book.edition,
                    book.publish_year,
                    book.copies_total,
                    book.volumes,
                    book.price,
                    book.series,
                    book.series_order,
                    keywords_json,
                    book.condition,
                    book.acquisition,
                    book.shelf,
                    book.notes,
                    book.language,
                    book.updated_at,
                    search_blob,
                    book.id
                ],
            )
            .map_err(|e| format!("Failed to update book: {e}"))?;

        self.set_next_ref_seq(next_seq)?;
        self.log_activity(
            "update",
            &format!("تحديث بيانات: {}", book.title),
            json!({ "bookId": book.id }),
        )?;
        Ok(book)
    }

    pub fn set_reference_number(
        &mut self,
        book_id: &str,
        reference_number: &str,
    ) -> Result<Book, String> {
        let book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;
        let candidate = normalize_reference_for_storage(reference_number);
        if candidate.is_empty() {
            return Err("الرقم المرجعي لا يمكن أن يكون فارغاً".to_string());
        }
        if candidate == book.reference_number {
            return Ok(book);
        }
        self.assert_unique_reference(&candidate, Some(book_id))?;
        let previous = book.reference_number.clone();
        let updated = self.update_book(book_id, &json!({ "referenceNumber": candidate }))?;
        self.log_activity(
            "ref-change",
            &format!(
                "تعديل الرقم المرجعي لكتاب \"{}\" من {} إلى {}",
                updated.title, previous, updated.reference_number
            ),
            json!({ "bookId": updated.id, "from": previous, "to": updated.reference_number }),
        )?;
        Ok(updated)
    }

    pub fn remove_book(&mut self, book_id: &str) -> Result<bool, String> {
        let book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;
        if book.loans.iter().any(is_loan_active) {
            return Err("لا يمكن حذف كتاب لديه إعارات نشطة. أرجع النسخ أولاً.".to_string());
        }
        let deleted_at = Self::now_iso();
        let book_json =
            serde_json::to_string(&book).map_err(|e| format!("Serialize error: {e}"))?;

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute("DELETE FROM books WHERE id = ?1", params![book_id])
            .map_err(|e| format!("Failed to delete book: {e}"))?;
        tx.execute(
            "INSERT OR REPLACE INTO trash (id, deleted_at, book_json) VALUES (?1, ?2, ?3)",
            params![book.id, deleted_at, book_json],
        )
        .map_err(|e| format!("Failed to move book to trash: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        self.log_activity(
            "delete",
            &format!("نقل إلى المهملات: {}", book.title),
            json!({ "bookId": book.id, "ref": book.reference_number }),
        )?;
        Ok(true)
    }

    pub fn restore_book(&mut self, trash_id: &str) -> Result<Book, String> {
        let _ = self.purge_expired_trash();
        let book_json: String = self
            .conn
            .query_row(
                "SELECT book_json FROM trash WHERE id = ?1",
                params![trash_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to query trash: {e}"))?
            .ok_or_else(|| "العنصر غير موجود في المهملات".to_string())?;

        let mut book: Book =
            serde_json::from_str(&book_json).map_err(|e| format!("Invalid trash JSON: {e}"))?;

        let mut next_seq = self.get_next_ref_seq();
        if self
            .assert_unique_reference(&book.reference_number, None)
            .is_err()
        {
            let (new_ref, seq) = self.allocate_next_reference_number()?;
            book.reference_number = new_ref;
            next_seq = seq;
        }
        book.updated_at = Self::now_iso();

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        Self::insert_book_on_tx(&tx, &book)?;
        tx.execute("DELETE FROM trash WHERE id = ?1", params![trash_id])
            .map_err(|e| format!("Failed to remove from trash: {e}"))?;
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![next_seq.to_string()],
        )
        .map_err(|e| format!("Failed to update sequence: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        self.log_activity(
            "restore",
            &format!("استعادة كتاب: {}", book.title),
            json!({ "bookId": book.id }),
        )?;
        Ok(book)
    }

    pub fn purge_trash(&mut self, trash_id: Option<&str>) -> Result<bool, String> {
        if let Some(id) = trash_id {
            self.conn
                .execute("DELETE FROM trash WHERE id = ?1", params![id])
                .map_err(|e| format!("Failed to delete trash item: {e}"))?;
        } else {
            self.conn
                .execute("DELETE FROM trash", [])
                .map_err(|e| format!("Failed to empty trash: {e}"))?;
        }
        Ok(true)
    }

    fn purge_expired_trash(&mut self) -> Result<usize, String> {
        let cutoff = Utc::now() - Duration::days(TRASH_RETENTION_DAYS);
        let cutoff_iso = cutoff.to_rfc3339();
        let removed = self
            .conn
            .execute(
                "DELETE FROM trash WHERE deleted_at < ?1",
                params![cutoff_iso],
            )
            .map_err(|e| format!("Failed to purge expired trash: {e}"))?;
        Ok(removed)
    }

    pub fn get_trash(&mut self) -> Result<Vec<TrashItem>, String> {
        let _ = self.purge_expired_trash();
        let mut stmt = self
            .conn
            .prepare("SELECT id, deleted_at, book_json FROM trash ORDER BY deleted_at DESC")
            .map_err(|e| format!("Failed to query trash: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let deleted_at: String = row.get(1)?;
                let book_json: String = row.get(2)?;
                let book: Book = serde_json::from_str(&book_json).unwrap_or_else(|_| Book {
                    id: id.clone(),
                    title: String::new(),
                    author: String::new(),
                    publisher: String::new(),
                    reference_number: String::new(),
                    category: String::new(),
                    edition: String::new(),
                    publish_year: String::new(),
                    copies_total: 1,
                    volumes: 1,
                    price: None,
                    series: String::new(),
                    series_order: String::new(),
                    keywords: Vec::new(),
                    condition: "جيدة".to_string(),
                    acquisition: String::new(),
                    shelf: String::new(),
                    loans: Vec::new(),
                    notes: String::new(),
                    language: "العربية".to_string(),
                    archived_at: None,
                    created_at: deleted_at.clone(),
                    updated_at: deleted_at.clone(),
                });
                Ok(TrashItem {
                    id,
                    deleted_at,
                    book,
                })
            })
            .map_err(|e| format!("Failed to read trash rows: {e}"))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| format!("Trash row error: {e}"))?);
        }
        Ok(list)
    }

    pub fn archive_book(&mut self, book_id: &str, archived: bool) -> Result<Book, String> {
        let mut book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;
        book.archived_at = if archived {
            Some(Self::now_iso())
        } else {
            None
        };
        book.updated_at = Self::now_iso();
        self.conn
            .execute(
                "UPDATE books SET archived_at = ?1, updated_at = ?2 WHERE id = ?3",
                params![book.archived_at, book.updated_at, book.id],
            )
            .map_err(|e| format!("Failed to update archive status: {e}"))?;

        self.log_activity(
            if archived { "archive" } else { "unarchive" },
            &format!(
                "{}: {}",
                if archived {
                    "أرشفة كتاب"
                } else {
                    "إلغاء أرشفة"
                },
                book.title
            ),
            json!({ "bookId": book.id }),
        )?;
        Ok(book)
    }

    pub fn borrow_copy(&mut self, book_id: &str, payload: &Value) -> Result<Book, String> {
        let mut book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;

        let borrower_name = payload
            .get("borrowerName")
            .or_else(|| payload.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if borrower_name.is_empty() {
            return Err("اسم المستعير مطلوب".to_string());
        }

        let now_ms = Utc::now().timestamp_millis();
        let avail = compute_book_availability(&book, now_ms);
        if avail.available_copies == 0 {
            return Err("كل نسخ الكتاب مستعارة حالياً".to_string());
        }

        let total_vols = book.volumes.max(1);
        let requested_type = payload
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| if s == "partial" { "partial" } else { "full" })
            .unwrap_or_else(|| {
                if payload
                    .get("volumes")
                    .and_then(|v| v.as_array())
                    .map(|a| !a.is_empty())
                    .unwrap_or(false)
                    || payload.get("volume").is_some()
                {
                    "partial"
                } else {
                    "full"
                }
            });

        let mut loan_type = "full".to_string();
        let mut chosen_volumes: Vec<u32> = Vec::new();

        if requested_type == "partial" && total_vols > 1 {
            let mut raw_vols: Vec<u32> = payload
                .get("volumes")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| {
                            x.as_u64()
                                .or_else(|| x.as_str()?.trim().parse().ok())
                                .map(|n| n as u32)
                        })
                        .collect()
                })
                .unwrap_or_default();
            if raw_vols.is_empty() {
                if let Some(single) = payload
                    .get("volume")
                    .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
                {
                    raw_vols.push(single as u32);
                }
            }
            let unique_sorted: Vec<u32> = raw_vols
                .into_iter()
                .filter(|&n| n >= 1 && n <= total_vols)
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect();

            if unique_sorted.is_empty() {
                return Err("حدد جزءاً واحداً على الأقل للإعارة الجزئية".to_string());
            }

            let conflict = unique_sorted
                .iter()
                .find(|v| avail.borrowed_volumes.contains(v))
                .copied();
            if let Some(cv) = conflict {
                return Err(format!("الجزء رقم {cv} مستعار حالياً ولا يمكن إعارته مرتين"));
            }

            if unique_sorted.len() < total_vols as usize {
                loan_type = "partial".to_string();
                chosen_volumes = unique_sorted;
            }
        } else if avail.has_partial_loan && avail.copies_total <= 1 {
            return Err(
                "بعض أجزاء الكتاب مستعارة حالياً؛ اختر إعارة الأجزاء المتاحة فقط".to_string(),
            );
        }

        let borrowed_at = payload
            .get("borrowedAt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(Self::now_iso);

        let settings = self.get_settings()?;
        let duration_days = payload
            .get("durationDays")
            .and_then(|v| v.as_i64())
            .unwrap_or(settings.loan_duration_days as i64);

        let due_at = payload
            .get("dueAt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Self::add_days_iso(&borrowed_at, duration_days));

        let loan = Loan {
            id: new_uuid(),
            borrower_name: borrower_name.clone(),
            r#type: loan_type.clone(),
            volume: if loan_type == "partial" && chosen_volumes.len() == 1 {
                Some(chosen_volumes[0])
            } else {
                None
            },
            volumes: chosen_volumes,
            borrowed_at,
            due_at,
            contact: payload
                .get("contact")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            note: payload
                .get("note")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            volume_returns: BTreeMap::new(),
            returned_at: None,
        };

        book.loans.push(loan.clone());
        book.updated_at = Self::now_iso();

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute(
            "UPDATE books SET updated_at = ?1 WHERE id = ?2",
            params![book.updated_at, book.id],
        )
        .map_err(|e| format!("Failed to update book timestamp: {e}"))?;
        Self::replace_book_loans_on_tx(&tx, &book.id, &book.loans)?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        let scope = loan_scope_label(&loan, false);
        let suffix = if scope.is_empty() {
            String::new()
        } else {
            format!(" ({scope})")
        };
        self.log_activity(
            "borrow",
            &format!("إعارة \"{}\" إلى {}{}", book.title, borrower_name, suffix),
            json!({ "bookId": book.id, "borrower": borrower_name, "scope": scope }),
        )?;
        Ok(book)
    }

    pub fn return_loan(&mut self, book_id: &str, loan_id: Option<&str>) -> Result<Book, String> {
        let mut book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;

        let target_idx = if let Some(lid) = loan_id {
            book.loans
                .iter()
                .position(|l| l.id == lid && is_loan_active(l))
        } else {
            book.loans.iter().position(is_loan_active)
        }
        .ok_or_else(|| "لا توجد إعارة نشطة لهذا الكتاب".to_string())?;

        let now = Self::now_iso();
        let borrower_name = book.loans[target_idx].borrower_name.clone();
        if book.loans[target_idx].r#type == "partial" {
            let vols = get_loan_volumes(&book.loans[target_idx]);
            for v in vols {
                book.loans[target_idx]
                    .volume_returns
                    .entry(v.to_string())
                    .or_insert_with(|| now.clone());
            }
        }
        book.loans[target_idx].returned_at = Some(now.clone());
        book.updated_at = now;

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute(
            "UPDATE books SET updated_at = ?1 WHERE id = ?2",
            params![book.updated_at, book.id],
        )
        .map_err(|e| format!("Failed to update book timestamp: {e}"))?;
        Self::replace_book_loans_on_tx(&tx, &book.id, &book.loans)?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        self.log_activity(
            "return",
            &format!("إرجاع \"{}\" من {}", book.title, borrower_name),
            json!({ "bookId": book.id, "borrower": borrower_name }),
        )?;
        Ok(book)
    }

    pub fn return_loan_parts(
        &mut self,
        book_id: &str,
        loan_id: &str,
        volumes_to_return: &[u32],
    ) -> Result<Book, String> {
        let mut book = self
            .get_book_by_id(book_id)?
            .ok_or_else(|| "الكتاب غير موجود".to_string())?;

        let target_idx = book
            .loans
            .iter()
            .position(|l| l.id == loan_id && is_loan_active(l))
            .ok_or_else(|| "الإعارة غير موجودة أو أُرجعت بالفعل".to_string())?;

        if book.loans[target_idx].r#type != "partial" {
            return self.return_loan(book_id, Some(loan_id));
        }

        let outstanding = get_loan_outstanding_volumes(&book.loans[target_idx]);
        let requested: Vec<u32> = volumes_to_return
            .iter()
            .copied()
            .filter(|v| outstanding.contains(v))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();

        if requested.is_empty() {
            return Err("اختر جزءاً واحداً على الأقل من الأجزاء غير المُرجعة".to_string());
        }

        let now = Self::now_iso();
        for v in &requested {
            book.loans[target_idx]
                .volume_returns
                .insert(v.to_string(), now.clone());
        }

        let remaining = get_loan_outstanding_volumes(&book.loans[target_idx]);
        if remaining.is_empty() {
            book.loans[target_idx].returned_at = Some(now.clone());
        }
        book.updated_at = now;

        let borrower_name = book.loans[target_idx].borrower_name.clone();
        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute(
            "UPDATE books SET updated_at = ?1 WHERE id = ?2",
            params![book.updated_at, book.id],
        )
        .map_err(|e| format!("Failed to update book timestamp: {e}"))?;
        Self::replace_book_loans_on_tx(&tx, &book.id, &book.loans)?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        let parts_label = if requested.len() == 1 {
            format!("الجزء {}", requested[0])
        } else {
            format!(
                "الأجزاء {}",
                requested
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join("، ")
            )
        };
        self.log_activity(
            "return-part",
            &format!(
                "إرجاع {} من \"{}\" ({})",
                parts_label, book.title, borrower_name
            ),
            json!({
                "bookId": book.id,
                "loanId": loan_id,
                "returnedVolumes": requested,
                "remainingVolumes": remaining
            }),
        )?;
        Ok(book)
    }

    pub fn bulk_update(&mut self, book_ids: &[String], patch: &Value) -> Result<Value, String> {
        let mut count = 0usize;
        for id in book_ids {
            if let Some(mut book) = self.get_book_by_id(id)? {
                let mut changed = false;
                if let Some(cat) = patch.get("category").and_then(|v| v.as_str()) {
                    book.category = cat.trim().to_string();
                    changed = true;
                }
                if let Some(shelf) = patch.get("shelf").and_then(|v| v.as_str()) {
                    book.shelf = shelf.trim().to_string();
                    changed = true;
                }
                if let Some(pub_name) = patch.get("publisher").and_then(|v| v.as_str()) {
                    book.publisher = pub_name.trim().to_string();
                    changed = true;
                }
                if let Some(cond) = patch.get("condition").and_then(|v| v.as_str()) {
                    book.condition = sanitize_condition(cond);
                    changed = true;
                }
                if let Some(add_kw) = patch.get("addKeywords") {
                    let extras = match add_kw {
                        Value::Array(arr) => sanitize_keywords(
                            &arr.iter()
                                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                                .collect::<Vec<_>>(),
                        ),
                        Value::String(s) => sanitize_keywords(&[s.clone()]),
                        _ => Vec::new(),
                    };
                    let mut combined = book.keywords.clone();
                    combined.extend(extras);
                    book.keywords = sanitize_keywords(&combined);
                    changed = true;
                }
                if let Some(arch) = patch.get("archived").and_then(|v| v.as_bool()) {
                    book.archived_at = if arch { Some(Self::now_iso()) } else { None };
                    changed = true;
                }
                if changed {
                    book.updated_at = Self::now_iso();
                    let keywords_json = serde_json::to_string(&book.keywords)
                        .unwrap_or_else(|_| "[]".to_string());
                    let search_blob = Self::build_search_blob(&book);
                    self.conn
                        .execute(
                            "UPDATE books SET
                                category = ?1, shelf = ?2, publisher = ?3,
                                condition = ?4, keywords_json = ?5, archived_at = ?6,
                                updated_at = ?7, search_blob = ?8
                             WHERE id = ?9",
                            params![
                                book.category,
                                book.shelf,
                                book.publisher,
                                book.condition,
                                keywords_json,
                                book.archived_at,
                                book.updated_at,
                                search_blob,
                                book.id
                            ],
                        )
                        .map_err(|e| format!("Bulk update failed: {e}"))?;
                    count += 1;
                }
            }
        }
        if count > 0 {
            self.log_activity(
                "bulk",
                &format!("تحديث جماعي لـ {count} كتاب"),
                json!({ "count": count }),
            )?;
        }
        Ok(json!({ "updated": count }))
    }

    pub fn get_settings(&self) -> Result<Settings, String> {
        let raw = self.get_meta_string("settings")?.unwrap_or_else(|| "{}".into());
        let val: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
        Ok(Self::sanitize_settings_value(&val, None))
    }

    pub fn get_public_settings(&self) -> Result<Value, String> {
        let s = self.get_settings()?;
        Ok(json!({
            "institutionName": s.institution_name,
            "logo": s.logo
        }))
    }

    pub fn update_settings(&mut self, patch: &Value) -> Result<Settings, String> {
        let current = self.get_settings()?;
        let updated = Self::sanitize_settings_value(patch, Some(&current));
        let serialized = serde_json::to_string(&updated)
            .map_err(|e| format!("Failed to serialize settings: {e}"))?;
        self.set_meta_string("settings", &serialized)?;
        Ok(updated)
    }

    fn sanitize_settings_value(patch: &Value, current: Option<&Settings>) -> Settings {
        let base = current.cloned().unwrap_or_default();
        let cols = patch
            .get("labelColumns")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32)
            .filter(|&n| n == 3 || n == 4 || n == 5)
            .unwrap_or(base.label_columns);
        let size = patch
            .get("labelSize")
            .and_then(|v| v.as_str())
            .filter(|&s| s == "small" || s == "medium" || s == "large")
            .map(|s| s.to_string())
            .unwrap_or(base.label_size);
        let loan_days = patch
            .get("loanDurationDays")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .map(|n| (n as u32).clamp(1, 365))
            .unwrap_or(base.loan_duration_days);
        let scanner_gap = patch
            .get("scannerGapMs")
            .and_then(|v| v.as_u64().or_else(|| v.as_str()?.trim().parse().ok()))
            .map(|n| (n as u32).clamp(15, 120))
            .unwrap_or(base.scanner_gap_ms);
        let terminator = patch
            .get("scannerTerminator")
            .and_then(|v| v.as_str())
            .filter(|&s| s == "Enter" || s == "Tab" || s == "both")
            .map(|s| s.to_string())
            .unwrap_or(base.scanner_terminator);

        let saved_filters = if let Some(arr) = patch.get("savedFilters").and_then(|v| v.as_array())
        {
            arr.iter()
                .filter_map(|f| {
                    let name = f.get("name")?.as_str()?.trim().to_string();
                    if name.is_empty() {
                        return None;
                    }
                    Some(SavedFilter {
                        id: f
                            .get("id")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| new_uuid()),
                        name,
                        query: f
                            .get("query")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        field: f
                            .get("field")
                            .and_then(|v| v.as_str())
                            .unwrap_or("all")
                            .to_string(),
                        status: f
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or("all")
                            .to_string(),
                        sort: f
                            .get("sort")
                            .and_then(|v| v.as_str())
                            .unwrap_or("newest")
                            .to_string(),
                    })
                })
                .take(20)
                .collect()
        } else {
            base.saved_filters
        };

        Settings {
            institution_name: patch
                .get("institutionName")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .unwrap_or(base.institution_name),
            logo: patch
                .get("logo")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or(base.logo),
            label_columns: cols,
            label_size: size,
            label_show_price: patch
                .get("labelShowPrice")
                .and_then(|v| v.as_bool())
                .unwrap_or(base.label_show_price),
            label_show_shelf: patch
                .get("labelShowShelf")
                .and_then(|v| v.as_bool())
                .unwrap_or(base.label_show_shelf),
            label_show_microtext: patch
                .get("labelShowMicrotext")
                .and_then(|v| v.as_bool())
                .unwrap_or(base.label_show_microtext),
            loan_duration_days: loan_days,
            scanner_gap_ms: scanner_gap,
            scanner_terminator: terminator,
            saved_filters,
        }
    }

    pub fn apply_loan_duration_to_open_loans(
        &mut self,
        duration_days: Option<u32>,
    ) -> Result<Value, String> {
        let settings = self.get_settings()?;
        let days = duration_days.unwrap_or(settings.loan_duration_days).clamp(1, 365) as i64;
        let books = self.get_all_books()?;
        let mut updated_count = 0usize;

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;

        for mut b in books {
            let mut touched = false;
            for l in &mut b.loans {
                if is_loan_active(l) {
                    let base = if l.borrowed_at.is_empty() {
                        Self::now_iso()
                    } else {
                        l.borrowed_at.clone()
                    };
                    l.due_at = Self::add_days_iso(&base, days);
                    updated_count += 1;
                    touched = true;
                }
            }
            if touched {
                b.updated_at = Self::now_iso();
                tx.execute(
                    "UPDATE books SET updated_at = ?1 WHERE id = ?2",
                    params![b.updated_at, b.id],
                )
                .map_err(|e| format!("Failed to update book timestamp: {e}"))?;
                Self::replace_book_loans_on_tx(&tx, &b.id, &b.loans)?;
            }
        }
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        if updated_count > 0 {
            self.log_activity(
                "loan-duration-recalc",
                &format!("تحديث تواريخ استحقاق {updated_count} إعارة نشطة ({days} يوم)"),
                json!({ "updated": updated_count, "days": days }),
            )?;
        }
        Ok(json!({ "updated": updated_count, "days": days }))
    }

    pub fn find_possible_duplicates(
        &self,
        payload: &Value,
        exclude_id: Option<&str>,
    ) -> Result<Vec<DuplicateMatch>, String> {
        let raw_title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let norm_title = normalize_text_for_duplicate_hint(raw_title);
        if norm_title.chars().count() < 2 {
            return Ok(Vec::new());
        }
        let norm_author = normalize_text_for_duplicate_hint(
            payload.get("author").and_then(|v| v.as_str()).unwrap_or(""),
        );

        let books = self.get_all_books()?;
        let mut matches = Vec::new();
        for b in books {
            if exclude_id == Some(b.id.as_str()) {
                continue;
            }
            let bt = normalize_text_for_duplicate_hint(&b.title);
            if bt.is_empty() {
                continue;
            }
            let same_title = bt == norm_title || bt.contains(&norm_title) || norm_title.contains(&bt);
            if !same_title {
                continue;
            }
            if !norm_author.is_empty() {
                let ba = normalize_text_for_duplicate_hint(&b.author);
                if !ba.is_empty() && ba != norm_author && !ba.contains(&norm_author) {
                    continue;
                }
            }
            matches.push(DuplicateMatch {
                id: b.id,
                title: b.title,
                author: b.author,
                publisher: b.publisher,
                publish_year: b.publish_year,
                reference_number: b.reference_number,
            });
            if matches.len() >= 5 {
                break;
            }
        }
        Ok(matches)
    }

    pub fn get_stats(&self) -> Result<LibraryStats, String> {
        let books = self.get_all_books()?;
        let active_books: Vec<&Book> = books.iter().filter(|b| b.archived_at.is_none()).collect();
        let now_ms = Utc::now().timestamp_millis();
        let soon_ms = 3 * 86_400_000_i64;

        let mut authors = HashSet::new();
        let mut publishers = HashSet::new();
        let mut categories = HashSet::new();
        let mut active_borrowers = HashSet::new();
        let mut by_category = BTreeMap::new();
        let mut by_publisher = BTreeMap::new();

        let mut total_copies = 0u32;
        let mut borrowed_copies = 0u32;
        let mut fully_borrowed = 0usize;
        let mut partially_borrowed = 0usize;
        let mut total_value = 0.0f64;
        let mut priced_copies = 0u32;
        let mut priced_titles = 0usize;
        let mut top_priced: Option<TopPricedBook> = None;
        let mut overdue_loans = 0usize;
        let mut due_soon_loans = 0usize;
        let mut multi_volume_titles = 0usize;
        let mut complete_records = 0usize;

        for b in &active_books {
            if !b.author.is_empty() {
                authors.insert(b.author.clone());
            }
            if !b.publisher.is_empty() {
                publishers.insert(b.publisher.clone());
                *by_publisher.entry(b.publisher.clone()).or_insert(0) += 1;
            }
            if !b.category.is_empty() {
                categories.insert(b.category.clone());
                *by_category.entry(b.category.clone()).or_insert(0) += 1;
            } else {
                *by_category.entry("غير مصنّف".to_string()).or_insert(0) += 1;
            }

            let avail = compute_book_availability(b, now_ms);
            total_copies += avail.copies_total;
            borrowed_copies += avail.borrowed_copies;
            if avail.state == "borrowed" {
                fully_borrowed += 1;
            } else if avail.state == "partial" {
                partially_borrowed += 1;
            }

            if b.volumes > 1 {
                multi_volume_titles += 1;
            }

            if !b.title.is_empty()
                && !b.author.is_empty()
                && !b.publisher.is_empty()
                && !b.category.is_empty()
                && !b.publish_year.is_empty()
                && !b.shelf.is_empty()
            {
                complete_records += 1;
            }

            if let Some(p) = b.price {
                if p.is_finite() && p > 0.0 {
                    total_value += p * (avail.copies_total as f64);
                    priced_copies += avail.copies_total;
                    priced_titles += 1;
                    if top_priced.as_ref().map(|tp| p > tp.price).unwrap_or(true) {
                        top_priced = Some(TopPricedBook {
                            id: b.id.clone(),
                            title: b.title.clone(),
                            price: p,
                        });
                    }
                }
            }

            for l in &avail.active_loans {
                if !l.borrower_name.is_empty() {
                    active_borrowers.insert(l.borrower_name.clone());
                }
                if is_loan_overdue(l, now_ms) {
                    overdue_loans += 1;
                } else if let Ok(dt) = DateTime::parse_from_rfc3339(&l.due_at) {
                    let due_ms = dt.timestamp_millis();
                    if due_ms - now_ms <= soon_ms {
                        due_soon_loans += 1;
                    }
                }
            }
        }

        let total_books = active_books.len();
        let completeness = if total_books > 0 {
            ((complete_records as f64 / total_books as f64) * 100.0).round() as u32
        } else {
            0
        };

        Ok(LibraryStats {
            total_books,
            total_authors: authors.len(),
            total_publishers: publishers.len(),
            total_categories: categories.len(),
            total_copies,
            borrowed_copies,
            available_copies: total_copies.saturating_sub(borrowed_copies),
            fully_borrowed,
            partially_borrowed,
            active_borrowers: active_borrowers.len(),
            total_value: (total_value * 100.0).round() / 100.0,
            priced_copies,
            priced_titles,
            overdue_loans,
            due_soon_loans,
            multi_volume_titles,
            completeness,
            complete_records,
            top_priced,
            by_category,
            by_publisher,
        })
    }

    pub fn get_meta(&self) -> Result<LibraryMeta, String> {
        let books = self.get_all_books()?;
        let mut authors = BTreeSet::new();
        let mut publishers = BTreeSet::new();
        let mut categories = BTreeSet::new();
        let mut borrowers = BTreeSet::new();
        let mut years = BTreeSet::new();
        let mut series = BTreeSet::new();
        let mut shelves = BTreeSet::new();
        let mut keywords = BTreeSet::new();

        for b in &books {
            if !b.author.is_empty() {
                authors.insert(b.author.clone());
            }
            if !b.publisher.is_empty() {
                publishers.insert(b.publisher.clone());
            }
            if !b.category.is_empty() {
                categories.insert(b.category.clone());
            }
            if !b.publish_year.is_empty() {
                years.insert(b.publish_year.clone());
            }
            if !b.series.is_empty() {
                series.insert(b.series.clone());
            }
            if !b.shelf.is_empty() {
                shelves.insert(b.shelf.clone());
            }
            for k in &b.keywords {
                if !k.is_empty() {
                    keywords.insert(k.clone());
                }
            }
            for l in &b.loans {
                if !l.borrower_name.is_empty() {
                    borrowers.insert(l.borrower_name.clone());
                }
            }
        }

        let borrower_profiles = self.build_borrowers_directory(&books, false);

        Ok(LibraryMeta {
            authors: authors.into_iter().collect(),
            publishers: publishers.into_iter().collect(),
            categories: categories.into_iter().collect(),
            borrowers: borrowers.into_iter().collect(),
            borrower_profiles,
            years: years.into_iter().collect(),
            series: series.into_iter().collect(),
            shelves: shelves.into_iter().collect(),
            keywords: keywords.into_iter().collect(),
            file_path: self.db_path.to_string_lossy().to_string(),
        })
    }

    pub fn get_public_meta(&self) -> Result<Value, String> {
        let meta = self.get_meta()?;
        Ok(json!({
            "authors": meta.authors,
            "publishers": meta.publishers,
            "categories": meta.categories,
            "years": meta.years,
            "series": meta.series,
            "shelves": meta.shelves,
            "keywords": meta.keywords
        }))
    }

    pub fn get_borrowers_directory(&self) -> Result<Vec<BorrowerProfile>, String> {
        let books = self.get_all_books()?;
        Ok(self.build_borrowers_directory(&books, true))
    }

    fn build_borrowers_directory(&self, books: &[Book], include_loans: bool) -> Vec<BorrowerProfile> {
        let now_ms = Utc::now().timestamp_millis();
        let mut by_name: HashMap<String, BorrowerProfile> = HashMap::new();

        for b in books {
            for l in &b.loans {
                let name = l.borrower_name.trim();
                if name.is_empty() {
                    continue;
                }
                let key = normalize_text_for_duplicate_hint(name);
                let active = is_loan_active(l);
                let overdue = is_loan_overdue(l, now_ms);

                let entry = by_name.entry(key).or_insert_with(|| BorrowerProfile {
                    name: name.to_string(),
                    contact: String::new(),
                    contacts: Vec::new(),
                    loans: if include_loans {
                        Some(Vec::new())
                    } else {
                        None
                    },
                    current_count: 0,
                    overdue_count: 0,
                    total_loans: 0,
                    last_loan_at: None,
                });

                if !l.contact.trim().is_empty() {
                    let c = l.contact.trim().to_string();
                    if !entry.contacts.contains(&c) {
                        entry.contacts.push(c.clone());
                    }
                    entry.contact = c;
                }

                entry.total_loans += 1;
                if active {
                    entry.current_count += 1;
                }
                if overdue {
                    entry.overdue_count += 1;
                }
                if entry
                    .last_loan_at
                    .as_ref()
                    .map(|prev| &l.borrowed_at > prev)
                    .unwrap_or(true)
                {
                    entry.last_loan_at = Some(l.borrowed_at.clone());
                }

                if let Some(ref mut list) = entry.loans {
                    list.push(BorrowerLoanItem {
                        book_id: b.id.clone(),
                        title: b.title.clone(),
                        reference_number: b.reference_number.clone(),
                        loan_id: l.id.clone(),
                        borrowed_at: l.borrowed_at.clone(),
                        due_at: l.due_at.clone(),
                        returned_at: l.returned_at.clone(),
                        active,
                        overdue,
                        scope: loan_scope_label(l, false),
                    });
                }
            }
        }

        let mut list: Vec<BorrowerProfile> = by_name.into_values().collect();
        list.sort_by(|a, b| {
            b.current_count
                .cmp(&a.current_count)
                .then_with(|| b.total_loans.cmp(&a.total_loans))
                .then_with(|| a.name.cmp(&b.name))
        });
        list
    }

    pub fn get_active_loans(&self) -> Result<Vec<ActiveLoanSummary>, String> {
        let books = self.get_all_books()?;
        let now_ms = Utc::now().timestamp_millis();
        let mut out = Vec::new();
        for b in books {
            for l in b.loans {
                if !is_loan_active(&l) {
                    continue;
                }
                out.push(ActiveLoanSummary {
                    book_id: b.id.clone(),
                    title: b.title.clone(),
                    reference_number: b.reference_number.clone(),
                    borrower_name: l.borrower_name.clone(),
                    contact: l.contact.clone(),
                    scope: loan_scope_label(&l, true),
                    borrowed_at: Some(l.borrowed_at.clone()),
                    due_at: Some(l.due_at.clone()),
                    overdue: is_loan_overdue(&l, now_ms),
                    overdue_days: loan_overdue_days(&l, now_ms),
                    note: l.note.clone(),
                });
            }
        }
        Ok(out)
    }

    pub fn get_loan_center(&self, filter: &str) -> Result<Vec<LoanCenterItem>, String> {
        let books = self.get_all_books()?;
        let now = Utc::now();
        let now_ms = now.timestamp_millis();
        let today_date = now.date_naive();
        let soon_ms = 3 * 86_400_000_i64;

        let mut rows = Vec::new();
        for b in books {
            for l in b.loans {
                let active = is_loan_active(&l);
                let overdue = is_loan_overdue(&l, now_ms);
                let due_dt = DateTime::parse_from_rfc3339(&l.due_at).ok();
                let due_today = active
                    && due_dt
                        .map(|d| d.with_timezone(&Utc).date_naive() == today_date)
                        .unwrap_or(false);
                let due_soon = active
                    && !overdue
                    && !due_today
                    && due_dt
                        .map(|d| d.timestamp_millis() - now_ms <= soon_ms && d.timestamp_millis() >= now_ms)
                        .unwrap_or(false);
                let returned_parts = get_loan_returned_volumes(&l);
                let outstanding_parts = get_loan_outstanding_volumes(&l);
                let partial_return =
                    active && l.r#type == "partial" && !returned_parts.is_empty();

                let item = LoanCenterItem {
                    loan_id: l.id.clone(),
                    book_id: b.id.clone(),
                    title: b.title.clone(),
                    reference_number: b.reference_number.clone(),
                    borrower_name: l.borrower_name.clone(),
                    contact: l.contact.clone(),
                    note: l.note.clone(),
                    scope: loan_scope_label(&l, false),
                    outstanding_scope: loan_scope_label(&l, true),
                    borrowed_at: if l.borrowed_at.is_empty() {
                        None
                    } else {
                        Some(l.borrowed_at.clone())
                    },
                    due_at: if l.due_at.is_empty() {
                        None
                    } else {
                        Some(l.due_at.clone())
                    },
                    returned_at: l.returned_at.clone(),
                    active,
                    overdue,
                    due_today,
                    due_soon,
                    overdue_days: loan_overdue_days(&l, now_ms),
                    partial_return,
                    returned_parts,
                    outstanding_parts,
                };

                let keep = match filter {
                    "open" => item.active,
                    "overdue" => item.overdue,
                    "today" => item.due_today,
                    "soon" => item.due_soon || item.due_today,
                    "partial" => item.partial_return,
                    "history" => !item.active,
                    _ => true,
                };
                if keep {
                    rows.push(item);
                }
            }
        }

        rows.sort_by(|a, b| {
            b.active
                .cmp(&a.active)
                .then_with(|| b.overdue.cmp(&a.overdue))
                .then_with(|| b.borrowed_at.cmp(&a.borrowed_at))
        });
        Ok(rows)
    }

    pub fn get_activity(&self, limit: usize) -> Result<Vec<ActivityItem>, String> {
        let cap = limit.clamp(1, MAX_ACTIVITY);
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, type, message, details_json, created_at
                 FROM activity
                 ORDER BY seq DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Failed to query activity: {e}"))?;

        let rows = stmt
            .query_map(params![cap as i64], |row| {
                let details_json: String = row.get(3)?;
                Ok(ActivityItem {
                    id: row.get(0)?,
                    r#type: row.get(1)?,
                    message: row.get(2)?,
                    details: serde_json::from_str(&details_json).unwrap_or_else(|_| json!({})),
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to read activity rows: {e}"))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| format!("Activity row error: {e}"))?);
        }
        Ok(list)
    }

    fn log_activity(&self, r#type: &str, message: &str, details: Value) -> Result<(), String> {
        let id = new_uuid();
        let created_at = Self::now_iso();
        let details_json = serde_json::to_string(&details).unwrap_or_else(|_| "{}".to_string());
        self.conn
            .execute(
                "INSERT INTO activity (id, type, message, details_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, r#type, message, details_json, created_at],
            )
            .map_err(|e| format!("Failed to log activity: {e}"))?;

        self.conn
            .execute(
                "DELETE FROM activity WHERE seq NOT IN (
                    SELECT seq FROM activity ORDER BY seq DESC LIMIT ?1
                )",
                params![MAX_ACTIVITY as i64],
            )
            .map_err(|e| format!("Failed to trim activity log: {e}"))?;
        Ok(())
    }

    pub fn export_json(&mut self) -> Result<String, String> {
        let books = self.get_all_books()?;
        let settings = self.get_settings()?;
        let trash = self.get_trash()?;
        let activity = self.get_activity(MAX_ACTIVITY)?;
        let next_ref_seq = self.get_next_ref_seq();

        let payload = json!({
            "schemaVersion": SCHEMA_VERSION,
            "engine": "RAFF-4.0.0-SQLite",
            "nextRefSeq": next_ref_seq,
            "settings": settings,
            "books": books,
            "trash": trash,
            "activity": activity
        });
        serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to serialize export JSON: {e}"))
    }

    pub fn export_csv(&self, book_ids: Option<&[String]>) -> Result<String, String> {
        let all_books = self.get_all_books()?;
        let books: Vec<&Book> = if let Some(ids) = book_ids {
            let set: HashSet<&String> = ids.iter().collect();
            all_books.iter().filter(|b| set.contains(&b.id)).collect()
        } else {
            all_books.iter().filter(|b| b.archived_at.is_none()).collect()
        };

        let headers = [
            "الرقم المرجعي",
            "العنوان",
            "المؤلف",
            "دار النشر",
            "التصنيف",
            "الطبعة",
            "سنة النشر",
            "اللغة",
            "السلسلة",
            "ترتيب السلسلة",
            "الكلمات المفتاحية",
            "الحالة المادية",
            "مصدر الاقتناء",
            "إجمالي النسخ",
            "النسخ المتاحة",
            "الأجزاء",
            "السعر",
            "الرف",
            "الحالة",
            "المستعيرون الحاليون",
            "ملاحظات",
        ];

        let now_ms = Utc::now().timestamp_millis();
        let mut lines = Vec::with_capacity(books.len() + 1);
        lines.push(
            headers
                .iter()
                .map(|h| Self::csv_escape(h))
                .collect::<Vec<_>>()
                .join(","),
        );

        for b in books {
            let avail = compute_book_availability(b, now_ms);
            let status_ar = match avail.state.as_str() {
                "borrowed" => "مستعار بالكامل",
                "partial" => "مستعار جزئياً",
                _ => "متاح",
            };
            let borrowers = avail
                .active_loans
                .iter()
                .map(|l| {
                    let sc = loan_scope_label(l, true);
                    if sc.is_empty() {
                        l.borrower_name.clone()
                    } else {
                        format!("{} ({sc})", l.borrower_name)
                    }
                })
                .collect::<Vec<_>>()
                .join(" | ");
            let price_str = b.price.map(|p| p.to_string()).unwrap_or_default();

            let row = [
                b.reference_number.as_str(),
                b.title.as_str(),
                b.author.as_str(),
                b.publisher.as_str(),
                b.category.as_str(),
                b.edition.as_str(),
                b.publish_year.as_str(),
                b.language.as_str(),
                b.series.as_str(),
                b.series_order.as_str(),
                &b.keywords.join("، "),
                b.condition.as_str(),
                b.acquisition.as_str(),
                &avail.copies_total.to_string(),
                &avail.available_copies.to_string(),
                &b.volumes.to_string(),
                &price_str,
                b.shelf.as_str(),
                status_ar,
                &borrowers,
                b.notes.as_str(),
            ];
            lines.push(
                row.iter()
                    .map(|v| Self::csv_escape(v))
                    .collect::<Vec<_>>()
                    .join(","),
            );
        }

        Ok(format!("\u{FEFF}{}", lines.join("\r\n")))
    }

    pub fn export_overdue_csv(&self) -> Result<String, String> {
        let rows = self.get_loan_center("overdue")?;
        let headers = [
            "الرقم المرجعي",
            "عنوان الكتاب",
            "النطاق",
            "اسم المستعير",
            "وسيلة التواصل",
            "تاريخ الإعارة",
            "تاريخ الاستحقاق",
            "أيام التأخير",
            "ملاحظات",
        ];
        let mut lines = Vec::with_capacity(rows.len() + 1);
        lines.push(
            headers
                .iter()
                .map(|h| Self::csv_escape(h))
                .collect::<Vec<_>>()
                .join(","),
        );
        for r in rows {
            let b_date = r
                .borrowed_at
                .as_deref()
                .map(|s| s.chars().take(10).collect::<String>())
                .unwrap_or_default();
            let d_date = r
                .due_at
                .as_deref()
                .map(|s| s.chars().take(10).collect::<String>())
                .unwrap_or_default();
            let cols = [
                r.reference_number.as_str(),
                r.title.as_str(),
                r.outstanding_scope.as_str(),
                r.borrower_name.as_str(),
                r.contact.as_str(),
                &b_date,
                &d_date,
                &r.overdue_days.to_string(),
                r.note.as_str(),
            ];
            lines.push(
                cols.iter()
                    .map(|c| Self::csv_escape(c))
                    .collect::<Vec<_>>()
                    .join(","),
            );
        }
        Ok(format!("\u{FEFF}{}", lines.join("\r\n")))
    }

    pub fn export_txt(&self) -> Result<String, String> {
        let books = self.get_all_books()?;
        let active: Vec<&Book> = books.iter().filter(|b| b.archived_at.is_none()).collect();
        let settings = self.get_settings()?;
        let stats = self.get_stats()?;
        let now_ms = Utc::now().timestamp_millis();

        let title = if settings.institution_name.is_empty() {
            "فهرس مكتبة رف".to_string()
        } else {
            format!("فهرس مكتبة رف — {}", settings.institution_name)
        };
        let sep = "═".repeat(62);
        let sub = "─".repeat(62);

        let mut lines = vec![
            sep.clone(),
            title,
            format!(
                "إجمالي العناوين: {}   |   إجمالي النسخ: {}   |   المستعارة: {}",
                stats.total_books, stats.total_copies, stats.borrowed_copies
            ),
            sep,
            String::new(),
        ];

        for (idx, b) in active.iter().enumerate() {
            let avail = compute_book_availability(b, now_ms);
            let status_ar = match avail.state.as_str() {
                "borrowed" => "مستعار بالكامل",
                "partial" => "مستعار جزئياً",
                _ => "متاح",
            };
            lines.push(format!(
                "{}. [{}] {}",
                idx + 1,
                if b.reference_number.is_empty() {
                    "—"
                } else {
                    &b.reference_number
                },
                if b.title.is_empty() { "—" } else { &b.title }
            ));
            lines.push(format!(
                "   المؤلف: {}   |   الناشر: {}   |   التصنيف: {}",
                if b.author.is_empty() { "—" } else { &b.author },
                if b.publisher.is_empty() {
                    "—"
                } else {
                    &b.publisher
                },
                if b.category.is_empty() {
                    "—"
                } else {
                    &b.category
                }
            ));
            lines.push(format!(
                "   الطبعة: {}   |   السنة: {}   |   النسخ: {}/{}   |   الأجزاء: {}   |   الرف: {}   |   الحالة: {}",
                if b.edition.is_empty() { "—" } else { &b.edition },
                if b.publish_year.is_empty() { "—" } else { &b.publish_year },
                avail.available_copies,
                avail.copies_total,
                b.volumes,
                if b.shelf.is_empty() { "—" } else { &b.shelf },
                status_ar
            ));
            if !b.notes.is_empty() {
                lines.push(format!("   ملاحظات: {}", b.notes));
            }
            lines.push(sub.clone());
        }
        Ok(lines.join("\r\n"))
    }

    pub fn build_printable_html(&self) -> Result<String, String> {
        let books = self.get_all_books()?;
        let active: Vec<&Book> = books.iter().filter(|b| b.archived_at.is_none()).collect();
        let settings = self.get_settings()?;
        let stats = self.get_stats()?;
        let now_ms = Utc::now().timestamp_millis();

        let mut rows = String::new();
        for (i, b) in active.iter().enumerate() {
            let avail = compute_book_availability(b, now_ms);
            let status_ar = match avail.state.as_str() {
                "borrowed" => "مستعار بالكامل",
                "partial" => "مستعار جزئياً",
                _ => "متاح",
            };
            rows.push_str(&format!(
                "<tr><td>{}</td><td class=\"mono\">{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}/{}</td><td>{}</td><td>{}</td></tr>",
                i + 1,
                Self::html_escape(&b.reference_number),
                Self::html_escape(&b.title),
                Self::html_escape(&b.author),
                Self::html_escape(&b.publisher),
                Self::html_escape(&b.category),
                avail.available_copies,
                avail.copies_total,
                Self::html_escape(&b.shelf),
                status_ar
            ));
        }

        let inst = if settings.institution_name.is_empty() {
            String::new()
        } else {
            format!(" — {}", Self::html_escape(&settings.institution_name))
        };

        Ok(format!(
            "<!DOCTYPE html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><title>تقرير مكتبة رف</title>\
            <style>\
            @page {{ size: A4 landscape; margin: 14mm; }}\
            body {{ font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #161614; margin: 0; font-size: 11px; }}\
            header {{ display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #b68a3a; padding-bottom: 10px; margin-bottom: 14px; }}\
            h1 {{ margin: 0; font-size: 20px; color: #2b211b; }}\
            .meta {{ color: #665d55; font-size: 11px; }}\
            .summary {{ display: flex; gap: 18px; margin-bottom: 14px; font-size: 12px; }}\
            .summary span {{ background: #faf8f4; padding: 6px 12px; border-radius: 6px; border: 1px solid #e4e1d8; }}\
            table {{ width: 100%; border-collapse: collapse; }}\
            th, td {{ border: 1px solid #d9d5ca; padding: 6px 8px; text-align: right; }}\
            th {{ background: #2b211b; color: #fffaf2; font-weight: 600; }}\
            tr:nth-child(even) td {{ background: #faf8f3; }}\
            .mono {{ font-family: Consolas, monospace; direction: ltr; text-align: left; }}\
            </style></head><body>\
            <header><div><h1>فهرس مكتبة رف{inst}</h1><div class=\"meta\">RAFF 4.0.0</div></div></header>\
            <div class=\"summary\">\
            <span>العناوين: <strong>{}</strong></span>\
            <span>النسخ: <strong>{}</strong></span>\
            <span>المستعارة: <strong>{}</strong></span>\
            <span>المتاحة: <strong>{}</strong></span>\
            </div>\
            <table><thead><tr><th>#</th><th>الرقم المرجعي</th><th>العنوان</th><th>المؤلف</th><th>دار النشر</th><th>التصنيف</th><th>النسخ</th><th>الرف</th><th>الحالة</th></tr></thead>\
            <tbody>{rows}</tbody></table></body></html>",
            stats.total_books, stats.total_copies, stats.borrowed_copies, stats.available_copies
        ))
    }

    pub fn create_backup(&mut self, reason: &str) -> Result<BackupInfo, String> {
        let json_str = self.export_json()?;
        let safe_reason: String = reason
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .take(24)
            .collect();
        let suffix = if safe_reason.is_empty() {
            "manual".to_string()
        } else {
            safe_reason
        };
        let name = format!("raff-backup-{}-{}.json", Self::file_stamp(), suffix);
        let file_path = self.backups_dir.join(&name);
        fs::write(&file_path, &json_str)
            .map_err(|e| format!("Failed to write backup file: {e}"))?;
        let meta = fs::metadata(&file_path)
            .map_err(|e| format!("Failed to stat backup file: {e}"))?;
        let books_count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        self.prune_backups(25);
        Ok(BackupInfo {
            name,
            file_path: file_path.to_string_lossy().to_string(),
            created_at: Self::now_iso(),
            size: meta.len(),
            books: Some(books_count),
        })
    }

    fn prune_backups(&self, max_keep: usize) {
        if let Ok(entries) = fs::read_dir(&self.backups_dir) {
            let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.starts_with("raff-backup-") && n.ends_with(".json")
                })
                .filter_map(|e| {
                    let m = e.metadata().ok()?.modified().ok()?;
                    Some((e.path(), m))
                })
                .collect();
            files.sort_by(|a, b| b.1.cmp(&a.1));
            for (path, _) in files.into_iter().skip(max_keep) {
                let _ = fs::remove_file(path);
            }
        }
    }

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let mut list = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.backups_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("raff-backup-") || !name.ends_with(".json") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    let created_at = meta
                        .modified()
                        .ok()
                        .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                        .unwrap_or_else(Self::now_iso);
                    let books = fs::read_to_string(entry.path())
                        .ok()
                        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
                        .and_then(|v| v.get("books")?.as_array().map(|a| a.len()));
                    list.push(BackupInfo {
                        name,
                        file_path: entry.path().to_string_lossy().to_string(),
                        created_at,
                        size: meta.len(),
                        books,
                    });
                }
            }
        }
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(list)
    }

    pub fn get_recovery_state(&self) -> Result<RecoveryState, String> {
        Ok(RecoveryState {
            notice: self.recovery_notice.clone(),
            backups: self.list_backups()?,
            migrated_from_v3: self.migrated_from_v3,
            v3_source_preserved: self.legacy_json_path.exists(),
        })
    }

    pub fn ensure_daily_backup(&mut self) -> Result<Option<BackupInfo>, String> {
        let count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        if count == 0 {
            return Ok(None);
        }
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let existing = self.list_backups()?;
        if existing.iter().any(|b| b.created_at.starts_with(&today)) {
            return Ok(None);
        }
        self.create_backup("auto").map(Some)
    }

    pub fn merge_json(&mut self, json_string: &str) -> Result<Value, String> {
        let parsed: Value = serde_json::from_str(json_string)
            .map_err(|_| "ملف JSON غير صالح".to_string())?;
        let incoming = if let Some(arr) = parsed.as_array() {
            arr.clone()
        } else if let Some(arr) = parsed.get("books").and_then(|v| v.as_array()) {
            arr.clone()
        } else {
            return Err(
                "الملف لا يحتوي على قائمة كتب صالحة (توقّع حقل books أو مصفوفة كتب)".to_string(),
            );
        };

        let existing_books = self.get_all_books()?;
        if !existing_books.is_empty() {
            let _ = self.create_backup("before-merge");
        }

        let settings = self.get_settings()?;
        let default_loan_days = settings.loan_duration_days as i64;
        let mut next_seq = self.get_next_ref_seq();

        let mut used_ids: HashSet<String> = existing_books.iter().map(|b| b.id.clone()).collect();
        let mut used_refs: HashSet<String> = existing_books
            .iter()
            .map(|b| reference_identity(&b.reference_number))
            .filter(|k| !k.is_empty())
            .collect();
        let mut existing_keys: HashSet<String> = existing_books
            .iter()
            .map(|b| {
                format!(
                    "{}|{}",
                    b.title.trim().to_lowercase(),
                    b.author.trim().to_lowercase()
                )
            })
            .collect();

        let mut added = 0usize;
        let mut skipped = 0usize;
        let mut reassigned_refs = 0usize;

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;

        for item in &incoming {
            let title = item
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if title.is_empty() {
                skipped += 1;
                continue;
            }
            let author = item
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let key = format!("{}|{}", title.to_lowercase(), author.to_lowercase());
            if existing_keys.contains(&key) {
                skipped += 1;
                continue;
            }

            let raw_ref = item
                .get("referenceNumber")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let candidate_ref = normalize_reference_for_storage(raw_ref);
            let candidate_id = reference_identity(&candidate_ref);

            let mut item_patched = item.clone();
            if !candidate_id.is_empty() && used_refs.contains(&candidate_id) {
                if let Some(obj) = item_patched.as_object_mut() {
                    obj.insert("referenceNumber".to_string(), Value::String(String::new()));
                }
                reassigned_refs += 1;
            }

            let mut book = Self::migrate_legacy_book(
                &item_patched,
                default_loan_days,
                &mut next_seq,
                &mut used_refs,
            );
            if used_ids.contains(&book.id) {
                book.id = new_uuid();
            }
            used_ids.insert(book.id.clone());
            existing_keys.insert(key);

            Self::insert_book_on_tx(&tx, &book)?;
            added += 1;
        }

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![next_seq.to_string()],
        )
        .map_err(|e| format!("Failed to update sequence: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        if added > 0 {
            self.log_activity(
                "import",
                &format!("استيراد {added} كتاب (تخطي {skipped})"),
                json!({ "added": added, "skipped": skipped, "reassignedRefs": reassigned_refs }),
            )?;
        }

        let total: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        Ok(json!({
            "added": added,
            "skipped": skipped,
            "reassignedRefs": reassigned_refs,
            "total": total
        }))
    }

    pub fn restore_json(&mut self, json_string: &str) -> Result<Value, String> {
        let parsed: Value = serde_json::from_str(json_string)
            .map_err(|_| "ملف النسخة الاحتياطية غير صالح (JSON تالف)".to_string())?;
        let books_arr = parsed
            .get("books")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "الملف لا يحتوي على بنية مكتبة رف صالحة (حقل books مفقود)".to_string())?;

        let raw_version = parsed
            .get("schemaVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;
        if raw_version > SCHEMA_VERSION {
            return Err(format!(
                "هذه النسخة أُنشئت بإصدار أحدث من رف (schemaVersion={raw_version}). حدّث البرنامج أولاً."
            ));
        }

        let existing_count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        if existing_count > 0 {
            let _ = self.create_backup("before-restore");
        }

        let report = self.import_legacy_payload(&parsed, None)?;
        self.recovery_notice = None;
        self.log_activity(
            "restore-backup",
            &format!("استعادة نسخة كاملة ({} كتاب)", report.books_migrated),
            json!({ "total": report.books_migrated, "inputCount": books_arr.len() }),
        )?;
        Ok(json!({ "total": report.books_migrated }))
    }

    pub fn reset_all(&mut self) -> Result<Value, String> {
        let existing_count: usize = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
            .unwrap_or(0);
        if existing_count > 0 {
            let _ = self.create_backup("before-reset");
        }
        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute("DELETE FROM loans", [])
            .map_err(|e| format!("Failed to clear loans: {e}"))?;
        tx.execute("DELETE FROM books", [])
            .map_err(|e| format!("Failed to clear books: {e}"))?;
        tx.execute("DELETE FROM trash", [])
            .map_err(|e| format!("Failed to clear trash: {e}"))?;
        tx.execute("DELETE FROM activity", [])
            .map_err(|e| format!("Failed to clear activity: {e}"))?;
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', '1')
             ON CONFLICT(key) DO UPDATE SET value = '1'",
            [],
        )
        .map_err(|e| format!("Failed to reset sequence: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;
        self.recovery_notice = None;
        Ok(json!({ "ok": true }))
    }

    pub fn integrity_check(&self) -> Result<IntegrityReport, String> {
        let books = self.get_all_books()?;
        let mut issues = Vec::new();
        let mut seen_ids = HashMap::new();
        let mut seen_refs: HashMap<String, &Book> = HashMap::new();

        for b in &books {
            if seen_ids.contains_key(&b.id) {
                issues.push(IntegrityIssue {
                    r#type: "duplicate-id".to_string(),
                    severity: "error".to_string(),
                    book_id: Some(b.id.clone()),
                    loan_id: None,
                    title: Some(b.title.clone()),
                    reference_number: None,
                    message: format!("معرّف مكرر للكتاب \"{}\"", b.title),
                });
            } else {
                seen_ids.insert(b.id.clone(), b);
            }

            if b.title.trim().is_empty() {
                issues.push(IntegrityIssue {
                    r#type: "missing-title".to_string(),
                    severity: "error".to_string(),
                    book_id: Some(b.id.clone()),
                    loan_id: None,
                    title: None,
                    reference_number: Some(b.reference_number.clone()),
                    message: format!("كتاب بدون عنوان ({})", b.reference_number),
                });
            }

            let ref_key = reference_identity(&b.reference_number);
            if ref_key.is_empty() {
                issues.push(IntegrityIssue {
                    r#type: "missing-ref".to_string(),
                    severity: "error".to_string(),
                    book_id: Some(b.id.clone()),
                    loan_id: None,
                    title: Some(b.title.clone()),
                    reference_number: None,
                    message: format!("كتاب بدون رقم مرجعي: \"{}\"", b.title),
                });
            } else if let Some(first) = seen_refs.get(&ref_key) {
                issues.push(IntegrityIssue {
                    r#type: "duplicate-ref".to_string(),
                    severity: "error".to_string(),
                    book_id: Some(b.id.clone()),
                    loan_id: None,
                    title: Some(b.title.clone()),
                    reference_number: Some(b.reference_number.clone()),
                    message: format!(
                        "الرقم المرجعي {} مكرر بين \"{}\" و\"{}\"",
                        b.reference_number, first.title, b.title
                    ),
                });
            } else {
                seen_refs.insert(ref_key, b);
            }

            let avail = compute_book_availability(b, Utc::now().timestamp_millis());
            if avail.active_loans.len() as u32 > avail.copies_total {
                issues.push(IntegrityIssue {
                    r#type: "overborrowed".to_string(),
                    severity: "warning".to_string(),
                    book_id: Some(b.id.clone()),
                    loan_id: None,
                    title: Some(b.title.clone()),
                    reference_number: None,
                    message: format!(
                        "عدد الإعارات النشطة ({}) يتجاوز إجمالي النسخ ({}) للكتاب \"{}\"",
                        avail.active_loans.len(),
                        avail.copies_total,
                        b.title
                    ),
                });
            }

            let mut used_vols = HashSet::new();
            for l in &avail.active_loans {
                if l.r#type == "partial" {
                    for v in get_loan_outstanding_volumes(l) {
                        if v < 1 || v > b.volumes.max(1) {
                            issues.push(IntegrityIssue {
                                r#type: "invalid-volume".to_string(),
                                severity: "warning".to_string(),
                                book_id: Some(b.id.clone()),
                                loan_id: Some(l.id.clone()),
                                title: Some(b.title.clone()),
                                reference_number: None,
                                message: format!(
                                    "إعارة تشير إلى جزء غير موجود ({v}) في \"{}\"",
                                    b.title
                                ),
                            });
                        } else if !used_vols.insert(v) {
                            issues.push(IntegrityIssue {
                                r#type: "duplicate-volume-loan".to_string(),
                                severity: "error".to_string(),
                                book_id: Some(b.id.clone()),
                                loan_id: Some(l.id.clone()),
                                title: Some(b.title.clone()),
                                reference_number: None,
                                message: format!("الجزء رقم {v} معار مرتين في \"{}\"", b.title),
                            });
                        }
                    }
                }
            }
        }

        Ok(IntegrityReport {
            ok: issues.is_empty(),
            total_books: books.len(),
            checked_at: Self::now_iso(),
            issue_count: issues.len(),
            issues,
        })
    }

    pub fn repair_integrity(&mut self) -> Result<RepairReport, String> {
        let before = self.integrity_check()?;
        if before.ok {
            return Ok(RepairReport {
                repaired: 0,
                changes: Vec::new(),
                backup_path: None,
                after: before,
            });
        }

        let backup = self.create_backup("before-integrity-repair")?;
        let mut books = self.get_all_books()?;
        let mut next_seq = self.get_next_ref_seq();
        let mut seen_ids = HashSet::new();
        let mut seen_refs = HashSet::new();
        let mut changes = Vec::new();

        for b in &mut books {
            if b.id.is_empty() || seen_ids.contains(&b.id) {
                let old_id = b.id.clone();
                b.id = new_uuid();
                changes.push(format!(
                    "توليد معرّف جديد للكتاب \"{}\" (كان {})",
                    b.title,
                    if old_id.is_empty() { "فارغاً" } else { &old_id }
                ));
            }
            seen_ids.insert(b.id.clone());

            if b.title.trim().is_empty() {
                b.title = format!(
                    "كتاب بدون عنوان ({})",
                    if b.reference_number.is_empty() {
                        &b.id[..6.min(b.id.len())]
                    } else {
                        &b.reference_number
                    }
                );
                changes.push(format!("تعيين عنوان بديل للكتاب {}", b.title));
            }

            let norm_ref = normalize_reference_for_storage(&b.reference_number);
            let ref_key = reference_identity(&norm_ref);
            if ref_key.is_empty() || seen_refs.contains(&ref_key) {
                let old_ref = if b.reference_number.is_empty() {
                    "فارغ".to_string()
                } else {
                    b.reference_number.clone()
                };
                loop {
                    let candidate = format!("raf-{:0>4}", next_seq);
                    next_seq += 1;
                    let cid = reference_identity(&candidate);
                    if !seen_refs.contains(&cid) {
                        seen_refs.insert(cid);
                        b.reference_number = candidate;
                        break;
                    }
                }
                changes.push(format!(
                    "تعيين رقم مرجعي جديد {} للكتاب \"{}\" (كان {old_ref})",
                    b.reference_number, b.title
                ));
            } else {
                b.reference_number = norm_ref;
                seen_refs.insert(ref_key);
                if let Some(seq) = canonical_ref_seq(&b.reference_number) {
                    if seq >= next_seq {
                        next_seq = seq + 1;
                    }
                }
            }

            let active_count = b.loans.iter().filter(|l| is_loan_active(l)).count() as u32;
            if active_count > b.copies_total {
                let prev = b.copies_total;
                b.copies_total = active_count;
                changes.push(format!(
                    "رفع إجمالي النسخ للكتاب \"{}\" من {prev} إلى {} ليطابق الإعارات النشطة",
                    b.title, b.copies_total
                ));
            }
        }

        let tx = self
            .conn
            .transaction()
            .map_err(|e| format!("Transaction error: {e}"))?;
        tx.execute("DELETE FROM loans", [])
            .map_err(|e| format!("Failed to clear loans: {e}"))?;
        tx.execute("DELETE FROM books", [])
            .map_err(|e| format!("Failed to clear books: {e}"))?;
        for b in &books {
            Self::insert_book_on_tx(&tx, b)?;
        }
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('next_ref_seq', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![next_seq.to_string()],
        )
        .map_err(|e| format!("Failed to save sequence: {e}"))?;
        tx.commit().map_err(|e| format!("Commit error: {e}"))?;

        self.log_activity(
            "integrity-repair",
            &format!("إصلاح فحص السلامة ({} تعديل)", changes.len()),
            json!({ "changes": changes }),
        )?;

        let after = self.integrity_check()?;
        Ok(RepairReport {
            repaired: changes.len(),
            changes,
            backup_path: Some(backup.file_path),
            after,
        })
    }

    fn now_iso() -> String {
        Utc::now().to_rfc3339()
    }

    fn add_days_iso(base_iso: &str, days: i64) -> String {
        let base = DateTime::parse_from_rfc3339(base_iso)
            .map(|dt| dt.with_timezone(&Utc))
            .or_else(|_| {
                NaiveDate::parse_from_str(base_iso, "%Y-%m-%d")
                    .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc())
            })
            .unwrap_or_else(|_| Utc::now());
        (base + Duration::days(days.max(1))).to_rfc3339()
    }

    fn file_stamp() -> String {
        Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string()
    }

    fn csv_escape(val: &str) -> String {
        let mut s = val.to_string();
        if let Some(first) = s.chars().next() {
            if matches!(first, '=' | '+' | '-' | '@' | '\t' | '\r') {
                s.insert(0, '\'');
            }
        }
        if s.contains('"') || s.contains(',') || s.contains('\n') || s.contains('\r') {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s
        }
    }

    fn html_escape(val: &str) -> String {
        val.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }
}
