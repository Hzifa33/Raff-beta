# RAFF 4.0.0 — Complete Rebuild & Premium Transformation

## 1. Architecture & Technology Stack
- **Rust Core Engine (`src-tauri/src/`)**: Complete backend rewrite in Rust with modular domain layers (`models.rs`, `normalize.rs`, `book_status.rs`, `barcode.rs`, `auth.rs`, `updater.rs`, `db.rs`, `commands.rs`).
- **Tauri 2 Desktop Framework (`src-tauri/tauri.conf.json`)**: Replaces heavy Chromium bundling with native WebView2/WebKitGTK via Tauri 2 IPC, cutting idle RAM and installer footprint dramatically.
- **SQLite 3 (`rusqlite` with WAL mode)**: Normalized relational storage (`books`, `loans`, `trash`, `activity`, `meta`) with `PRAGMA journal_mode = WAL`, `synchronous = NORMAL`, and indexed lookups.
- **React 18 + TypeScript + Vite + Zustand (`src/app/`)**: Fine-grained Zustand selectors, zero unnecessary re-renders, and an **81.6 KB gzipped** production frontend bundle.

## 2. "Vertix" Premium UI/UX & Motion Design System
- Inspired by the reference screens in `screens/`, featuring:
  - Warm Soft Gray canvas (`#F2F3F7` Light / `#0B0C0F` Obsidian Dark) with super-rounded `26px` Bento cards.
  - Signature **Vermilion / Solar Orange glowing hero card** (`#FF622E` -> `#E43A04`) with **diagonal-hatched progress bars** and striped bar charts.
  - **Top Floating Pill Navigation Bar** + **Left/Start Floating Vertical Icon Dock**.
  - **Diagonal Clip-Path Theme Wipe Animation** between Light and Dark modes.
  - Instant **Arabic RTL (`dir="rtl"`) and English LTR (`dir="ltr"`)** switching.

## 3. Safe Non-Destructive RAFF 3.0.0 -> 4.0.0 Migration
- Automatically detects `raff-library.json` (v1..v8), creates a pre-migration backup (`backups/raff-backup-<timestamp>-pre-v4-migration.json`), migrates all books, partial-volume loans (`volumeReturns`), settings, trash, and activity into `raff-library.sqlite` inside an atomic SQLite transaction, and **never deletes or overwrites `raff-library.json`**.

## 4. Measured Performance (10,000 Books + 5,000 Active Loans)
- **Production Frontend Bundle**: `77.52 kB` JS (gzip) + `4.07 kB` CSS (gzip).
- **Load 10,000 Books + 5,000 Loans from SQLite**: `~58 ms` (release) / `~279 ms` (debug).
- **O(1) Canonical Reference Allocation (`raf-XXXX`)**: `< 0.4 ms` (`~95 µs` in release).
- **Full 10,000-Record Integrity Check**: `~240 ms` (release).
