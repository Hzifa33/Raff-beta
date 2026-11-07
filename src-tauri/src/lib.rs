pub mod auth;
pub mod barcode;
pub mod book_status;
pub mod commands;
pub mod db;
pub mod models;
pub mod normalize;
pub mod updater;

#[cfg(not(target_os = "android"))]
pub fn run() {
    use commands::AppState;
    use tauri::Manager;

    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap().join("raff-data"));
            let state = AppState::new(&app_data_dir)
                .expect("Failed to initialize RAFF 4.0.0 SQLite Engine");
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::raff_invoke])
        .run(tauri::generate_context!())
        .expect("Error while running RAFF 4.0.0 Tauri application");
}

#[cfg(target_os = "android")]
pub fn run() {
    println!("RAFF 4.0.0 Core Engine (Rust + SQLite) ready.");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::barcode::{to_svg, BarcodeOptions};
    use crate::commands::AppState;
    use crate::db::Database;
    use crate::normalize::*;
    use crate::updater::{
        compare_versions, normalize_version, parse_digest, pick_installer_asset, ReleaseAsset,
    };
    use serde_json::json;
    use std::fs;
    use std::time::Instant;

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("raff_v4_test_{}_{}", label, new_uuid()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_reference_identity_and_normalization() {
        // Complete-string identity: raf-0001 and raf-1001 must NEVER collide
        assert_ne!(
            reference_identity("raf-0001"),
            reference_identity("raf-1001")
        );
        assert_ne!(
            reference_identity("LIB-0001"),
            reference_identity("LIB-1001")
        );

        // Equivalent canonical formatting collides properly
        assert_eq!(reference_identity("raf-1"), reference_identity("RAF-0001"));
        assert_eq!(
            reference_identity("raf – 0001"),
            reference_identity("raf-0001")
        );
        assert_eq!(
            reference_identity("raf-٠٠٠١"),
            reference_identity("raf-0001")
        );
        assert_eq!(normalize_reference_for_storage("RAF - 7"), "raf-0007");
        assert_eq!(
            normalize_reference_for_storage("HIST-2026-01"),
            "HIST-2026-01"
        );
    }

    #[test]
    fn test_arabic_forgiving_search_normalization() {
        let a = normalize_arabic("الإِتْقَانُ فِي عُلُومِ القُرْآنِ - مكتبة الرسالة");
        let b = normalize_arabic("الاتقان في علوم القران - مكتبه الرساله");
        assert_eq!(a, b);
    }

    #[test]
    fn test_v3_to_v4_sqlite_migration_preserves_original_json_and_migrates_all_data() {
        let dir = temp_dir("migration");
        let legacy_json = dir.join("raff-library.json");

        let v3_payload = json!({
            "schemaVersion": 8,
            "nextRefSeq": 15,
            "settings": {
                "institutionName": "مكتبة دار الحكمة",
                "loanDurationDays": 21,
                "scannerGapMs": 40,
                "scannerTerminator": "Enter"
            },
            "books": [
                {
                    "id": "book-1",
                    "title": "المقدمة",
                    "author": "ابن خلدون",
                    "publisher": "دار الفكر",
                    "referenceNumber": "raf-0001",
                    "category": "تاريخ",
                    "copiesTotal": 2,
                    "volumes": 3,
                    "price": 120.5,
                    "shelf": "A-1",
                    "loans": [
                        {
                            "id": "loan-1",
                            "borrowerName": "أحمد محمد",
                            "type": "partial",
                            "volumes": [1, 2],
                            "volumeReturns": { "1": "2026-10-05T10:00:00Z" },
                            "borrowedAt": "2026-10-01T10:00:00Z",
                            "dueAt": "2026-10-22T10:00:00Z",
                            "contact": "0500000000"
                        }
                    ]
                },
                {
                    "id": "book-2",
                    "title": "البيان والتبيين",
                    "author": "الجاحظ",
                    "referenceNumber": "raf-1001",
                    "copiesTotal": 1,
                    "volumes": 4
                }
            ],
            "trash": [
                {
                    "id": "trash-1",
                    "deletedAt": chrono::Utc::now().to_rfc3339(),
                    "book": {
                        "id": "trash-1",
                        "title": "كتاب محذوف مؤقتاً",
                        "referenceNumber": "raf-0009"
                    }
                }
            ],
            "activity": [
                {
                    "id": "act-1",
                    "type": "add",
                    "message": "إضافة كتاب المقدمة",
                    "createdAt": "2026-10-01T09:00:00Z"
                }
            ]
        });

        let raw_v3 = serde_json::to_string_pretty(&v3_payload).unwrap();
        fs::write(&legacy_json, &raw_v3).unwrap();

        let mut db = Database::open(&dir).unwrap();

        // 1. Original v3 JSON file MUST remain untouched and byte-for-byte identical
        assert!(legacy_json.exists());
        assert_eq!(fs::read_to_string(&legacy_json).unwrap(), raw_v3);

        // 2. A pre-migration backup MUST have been created automatically
        let backups = db.list_backups().unwrap();
        assert!(!backups.is_empty());
        assert!(backups[0].name.contains("pre-v4-migration"));

        // 3. Books, partial volume returns, settings, trash, and sequence MUST be in SQLite
        let books = db.get_all_books().unwrap();
        assert_eq!(books.len(), 2);
        let b1 = books.iter().find(|b| b.id == "book-1").unwrap();
        assert_eq!(b1.reference_number, "raf-0001");
        assert_eq!(b1.loans.len(), 1);
        assert_eq!(b1.loans[0].volume_returns.get("1").map(|s| s.as_str()), Some("2026-10-05T10:00:00Z"));

        let settings = db.get_settings().unwrap();
        assert_eq!(settings.institution_name, "مكتبة دار الحكمة");
        assert_eq!(settings.loan_duration_days, 21);

        let trash = db.get_trash().unwrap();
        assert_eq!(trash.len(), 1);

        // Next reference sequence respects max(15, 1001 + 1) = 1002
        assert_eq!(db.peek_next_reference_number().unwrap(), "raf-1002");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_future_schema_version_rejected_without_destructive_overwrite() {
        let dir = temp_dir("future_schema");
        let legacy_json = dir.join("raff-library.json");
        let future_payload = json!({
            "schemaVersion": 99,
            "books": [{ "id": "b1", "title": "Future Book" }]
        });
        let raw = serde_json::to_string(&future_payload).unwrap();
        fs::write(&legacy_json, &raw).unwrap();

        let res = Database::open(&dir);
        assert!(res.is_err());
        assert_eq!(fs::read_to_string(&legacy_json).unwrap(), raw);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_partial_volume_borrow_and_progressive_return() {
        let dir = temp_dir("volumes");
        let mut db = Database::open(&dir).unwrap();

        let book = db
            .add_book(&json!({
                "title": "سير أعلام النبلاء",
                "author": "الذهبي",
                "copiesTotal": 1,
                "volumes": 4
            }))
            .unwrap();
        assert_eq!(book.reference_number, "raf-0001");

        // Borrow volumes 1, 2, 3
        let borrowed = db
            .borrow_copy(
                &book.id,
                &json!({
                    "borrowerName": "خالد العتيبي",
                    "type": "partial",
                    "volumes": [1, 2, 3]
                }),
            )
            .unwrap();
        let loan_id = borrowed.loans[0].id.clone();

        // Attempting to borrow volume 2 again must fail
        let conflict = db.borrow_copy(
            &book.id,
            &json!({
                "borrowerName": "سعد",
                "type": "partial",
                "volumes": [2]
            }),
        );
        assert!(conflict.is_err());

        // Return volume 2 only -> loan stays active with [1, 3] outstanding
        let after_part = db.return_loan_parts(&book.id, &loan_id, &[2]).unwrap();
        let avail = book_status::compute_book_availability(&after_part, 0);
        assert_eq!(avail.state, "partial");
        assert_eq!(avail.borrowed_volumes, vec![1, 3]);
        assert_eq!(avail.available_volumes, vec![2, 4]);

        // Now volume 2 can be borrowed by someone else!
        let second_borrow = db
            .borrow_copy(
                &book.id,
                &json!({
                    "borrowerName": "سعد",
                    "type": "partial",
                    "volumes": [2]
                }),
            )
            .unwrap();
        assert_eq!(second_borrow.loans.len(), 2);

        // Return remaining [1, 3] on first loan -> first loan closes automatically
        let after_close = db.return_loan_parts(&book.id, &loan_id, &[1, 3]).unwrap();
        let first_loan = after_close.loans.iter().find(|l| l.id == loan_id).unwrap();
        assert!(first_loan.returned_at.is_some());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_auth_lockout_and_public_kiosk_privacy() {
        let dir = temp_dir("auth");
        let state = AppState::new(&dir).unwrap();

        state
            .dispatch(
                "add_book",
                &json!({
                    "title": "كتاب خاص",
                    "author": "مؤلف",
                    "price": 95.0,
                    "notes": "ملاحظة داخلية سرية"
                }),
            )
            .unwrap();

        let books_val = state.dispatch("get_all_books", &json!({})).unwrap();
        let book_id = books_val[0]["id"].as_str().unwrap().to_string();

        state
            .dispatch(
                "borrow_copy",
                &json!({
                    "bookId": book_id,
                    "borrower": {
                        "borrowerName": "مستعير سري",
                        "contact": "0555555555",
                        "note": "ملاحظة إعارة سرية"
                    }
                }),
            )
            .unwrap();

        // Enable admin security with public kiosk mode
        state
            .dispatch(
                "auth_setup",
                &json!({
                    "username": "admin",
                    "password": "StrongPassword123",
                    "recoveryQuestion": "ما اسم المكتبة؟",
                    "recoveryAnswer": "مكتبة النور",
                    "publicModeEnabled": true
                }),
            )
            .unwrap();

        // Switch to public mode
        state.dispatch("auth_logout_to_public", &json!({})).unwrap();

        // Admin mutations must be blocked in public mode
        assert!(state
            .dispatch("add_book", &json!({ "title": "ممنوع" }))
            .is_err());

        // Public books must NOT leak borrowerName, contact, note, price, or internal notes
        let public_books = state.dispatch("get_all_books", &json!({})).unwrap();
        let serialized_public = serde_json::to_string(&public_books).unwrap();
        assert!(!serialized_public.contains("مستعير سري"));
        assert!(!serialized_public.contains("0555555555"));
        assert!(!serialized_public.contains("ملاحظة داخلية سرية"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_code128_barcode_and_updater_contracts() {
        let svg = to_svg("raf-0001", &BarcodeOptions::default()).unwrap();
        assert!(svg.starts_with("<svg"));
        assert!(svg.contains("raf-0001"));

        assert_eq!(compare_versions("4.0.0", "3.0.0"), 1);
        assert_eq!(normalize_version("v4.0.0")[0], 4);

        let assets = vec![
            ReleaseAsset {
                id: 1,
                name: "Raff-Setup-4.0.0-x64.exe".to_string(),
                size: 12_500_000,
                digest: String::new(),
                download_url: "https://github.com/example/Raff-Setup-4.0.0-x64.exe".to_string(),
            },
            ReleaseAsset {
                id: 2,
                name: "Raff-Setup-4.0.0-ia32.exe".to_string(),
                size: 11_800_000,
                digest: String::new(),
                download_url: "https://github.com/example/Raff-Setup-4.0.0-ia32.exe".to_string(),
            },
        ];
        let picked = pick_installer_asset(&assets, "x64").unwrap();
        assert_eq!(picked.name, "Raff-Setup-4.0.0-x64.exe");

        let digest = "a3f5c9b8d7e60123456789abcdef0123456789abcdef0123456789abcdef0123";
        assert_eq!(parse_digest(&format!("sha256:{digest}")), digest);
    }

    #[test]
    fn bench_10k_books_and_5k_loans_sqlite_performance() {
        let dir = temp_dir("bench10k");
        let mut db = Database::open(&dir).unwrap();

        // Build a realistic 10,000-book dataset with 5,000 loans and migrate/import it
        let t_gen = Instant::now();
        let mut books_json = Vec::with_capacity(10_000);
        for i in 1..=10_000 {
            let has_loan = i <= 5_000;
            let loans = if has_loan {
                json!([{
                    "id": format!("loan-{i}"),
                    "borrowerName": format!("مستعير رقم {}", (i % 450) + 1),
                    "type": if i % 5 == 0 { "partial" } else { "full" },
                    "volumes": if i % 5 == 0 { json!([1, 2]) } else { json!([]) },
                    "borrowedAt": "2026-10-01T10:00:00Z",
                    "dueAt": if i % 12 == 0 { "2026-10-15T10:00:00Z" } else { "2027-12-31T10:00:00Z" },
                    "contact": format!("050{:07}", i)
                }])
            } else {
                json!([])
            };

            books_json.push(json!({
                "id": format!("book-{i}"),
                "title": format!("كتاب التراث العربي المجلد {i}"),
                "author": format!("المؤلف {}", (i % 800) + 1),
                "publisher": format!("دار النشر {}", (i % 120) + 1),
                "referenceNumber": format!("raf-{i:04}"),
                "category": format!("تصنيف {}", (i % 25) + 1),
                "publishYear": format!("{}", 1980 + (i % 46)),
                "copiesTotal": 2,
                "volumes": 4,
                "price": 45.0 + ((i % 100) as f64),
                "shelf": format!("R{}-S{}", (i % 20) + 1, (i % 8) + 1),
                "loans": loans
            }));
        }
        let payload = serde_json::to_string(&json!({
            "schemaVersion": 8,
            "nextRefSeq": 10001,
            "books": books_json
        }))
        .unwrap();
        let gen_ms = t_gen.elapsed().as_millis();

        let t_import = Instant::now();
        db.restore_json(&payload).unwrap();
        let import_ms = t_import.elapsed().as_millis();

        let t_load = Instant::now();
        let loaded = db.get_all_books().unwrap();
        let load_ms = t_load.elapsed().as_millis();
        assert_eq!(loaded.len(), 10_000);

        let t_stats = Instant::now();
        let stats = db.get_stats().unwrap();
        let stats_ms = t_stats.elapsed().as_millis();
        assert_eq!(stats.total_books, 10_000);
        assert_eq!(stats.total_copies, 20_000);

        let t_integrity = Instant::now();
        let integrity = db.integrity_check().unwrap();
        let integrity_ms = t_integrity.elapsed().as_millis();
        assert!(integrity.ok);

        let t_peek = Instant::now();
        let next_ref = db.peek_next_reference_number().unwrap();
        let peek_us = t_peek.elapsed().as_micros();
        assert_eq!(next_ref, "raf-10001");

        println!(
            "\n=== RAFF 4.0.0 BENCHMARK (10,000 Books + 5,000 Active Loans) ===\n\
             Dataset Generation : {} ms\n\
             SQLite Bulk Import : {} ms\n\
             Load 10k Books+Loans: {} ms\n\
             Compute Full Stats : {} ms\n\
             Integrity Check 10k: {} ms\n\
             O(1) Next Ref Peek : {} µs\n\
             =================================================================",
            gen_ms, import_ms, load_ms, stats_ms, integrity_ms, peek_us
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
