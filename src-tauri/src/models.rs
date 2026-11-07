use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SCHEMA_VERSION: u32 = 8;
pub const MAX_ACTIVITY: usize = 1000;
pub const TRASH_RETENTION_DAYS: i64 = 30;
pub const DEFAULT_LOAN_DAYS: i64 = 30;
pub const COPY_CONDITIONS: [&str; 4] = ["جيدة", "مقبولة", "تالفة", "مفقودة"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Loan {
    pub id: String,
    pub borrower_name: String,
    #[serde(default = "default_loan_type")]
    pub r#type: String,
    #[serde(default)]
    pub volumes: Vec<u32>,
    #[serde(default)]
    pub volume: Option<u32>,
    pub borrowed_at: String,
    #[serde(default)]
    pub due_at: String,
    #[serde(default)]
    pub contact: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub volume_returns: BTreeMap<String, String>,
    #[serde(default)]
    pub returned_at: Option<String>,
}

fn default_loan_type() -> String {
    "full".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub publisher: String,
    #[serde(default)]
    pub reference_number: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub edition: String,
    #[serde(default)]
    pub publish_year: String,
    #[serde(default = "default_one")]
    pub copies_total: u32,
    #[serde(default = "default_one")]
    pub volumes: u32,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub series: String,
    #[serde(default)]
    pub series_order: String,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default = "default_condition")]
    pub condition: String,
    #[serde(default)]
    pub acquisition: String,
    #[serde(default)]
    pub shelf: String,
    #[serde(default)]
    pub loans: Vec<Loan>,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub archived_at: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_one() -> u32 {
    1
}

fn default_condition() -> String {
    "جيدة".to_string()
}

fn default_language() -> String {
    "العربية".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilter {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub query: String,
    #[serde(default = "default_all")]
    pub field: String,
    #[serde(default = "default_all")]
    pub status: String,
    #[serde(default = "default_newest")]
    pub sort: String,
}

fn default_all() -> String {
    "all".to_string()
}

fn default_newest() -> String {
    "newest".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub institution_name: String,
    #[serde(default)]
    pub logo: String,
    #[serde(default = "default_cols")]
    pub label_columns: u32,
    #[serde(default = "default_size")]
    pub label_size: String,
    #[serde(default = "default_true")]
    pub label_show_price: bool,
    #[serde(default = "default_true")]
    pub label_show_shelf: bool,
    #[serde(default = "default_true")]
    pub label_show_microtext: bool,
    #[serde(default = "default_loan_days_u32")]
    pub loan_duration_days: u32,
    #[serde(default = "default_scanner_gap")]
    pub scanner_gap_ms: u32,
    #[serde(default = "default_terminator")]
    pub scanner_terminator: String,
    #[serde(default)]
    pub saved_filters: Vec<SavedFilter>,
}

fn default_cols() -> u32 {
    4
}
fn default_size() -> String {
    "small".to_string()
}
fn default_true() -> bool {
    true
}
fn default_loan_days_u32() -> u32 {
    30
}
fn default_scanner_gap() -> u32 {
    35
}
fn default_terminator() -> String {
    "Enter".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            institution_name: String::new(),
            logo: String::new(),
            label_columns: 4,
            label_size: "small".to_string(),
            label_show_price: true,
            label_show_shelf: true,
            label_show_microtext: true,
            loan_duration_days: 30,
            scanner_gap_ms: 35,
            scanner_terminator: "Enter".to_string(),
            saved_filters: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub deleted_at: String,
    pub book: Book,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub r#type: String,
    pub message: String,
    #[serde(default)]
    pub details: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopPricedBook {
    pub id: String,
    pub title: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_books: usize,
    pub total_authors: usize,
    pub total_publishers: usize,
    pub total_categories: usize,
    pub total_copies: u32,
    pub borrowed_copies: u32,
    pub available_copies: u32,
    pub fully_borrowed: usize,
    pub partially_borrowed: usize,
    pub active_borrowers: usize,
    pub total_value: f64,
    pub priced_copies: u32,
    pub priced_titles: usize,
    pub overdue_loans: usize,
    pub due_soon_loans: usize,
    pub multi_volume_titles: usize,
    pub completeness: u32,
    pub complete_records: usize,
    pub top_priced: Option<TopPricedBook>,
    pub by_category: BTreeMap<String, usize>,
    pub by_publisher: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowerLoanItem {
    pub book_id: String,
    pub title: String,
    pub reference_number: String,
    pub loan_id: String,
    pub borrowed_at: String,
    pub due_at: String,
    pub returned_at: Option<String>,
    pub active: bool,
    pub overdue: bool,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorrowerProfile {
    pub name: String,
    pub contact: String,
    pub contacts: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loans: Option<Vec<BorrowerLoanItem>>,
    pub current_count: usize,
    pub overdue_count: usize,
    pub total_loans: usize,
    pub last_loan_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryMeta {
    pub authors: Vec<String>,
    pub publishers: Vec<String>,
    pub categories: Vec<String>,
    pub borrowers: Vec<String>,
    pub borrower_profiles: Vec<BorrowerProfile>,
    pub years: Vec<String>,
    pub series: Vec<String>,
    pub shelves: Vec<String>,
    pub keywords: Vec<String>,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoanCenterItem {
    pub loan_id: String,
    pub book_id: String,
    pub title: String,
    pub reference_number: String,
    pub borrower_name: String,
    pub contact: String,
    pub note: String,
    pub scope: String,
    pub outstanding_scope: String,
    pub borrowed_at: Option<String>,
    pub due_at: Option<String>,
    pub returned_at: Option<String>,
    pub active: bool,
    pub overdue: bool,
    pub due_today: bool,
    pub due_soon: bool,
    pub overdue_days: i64,
    pub partial_return: bool,
    pub returned_parts: Vec<u32>,
    pub outstanding_parts: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveLoanSummary {
    pub book_id: String,
    pub title: String,
    pub reference_number: String,
    pub borrower_name: String,
    pub contact: String,
    pub scope: String,
    pub borrowed_at: Option<String>,
    pub due_at: Option<String>,
    pub overdue: bool,
    pub overdue_days: i64,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateMatch {
    pub id: String,
    pub title: String,
    pub author: String,
    pub publisher: String,
    pub publish_year: String,
    pub reference_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub file_path: String,
    pub created_at: String,
    pub size: u64,
    pub books: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryNotice {
    pub reason: String,
    pub message: String,
    pub corrupt_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryState {
    pub notice: Option<RecoveryNotice>,
    pub backups: Vec<BackupInfo>,
    pub migrated_from_v3: bool,
    pub v3_source_preserved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub migrated: bool,
    pub books_migrated: usize,
    pub loans_migrated: usize,
    pub trash_migrated: usize,
    pub activity_migrated: usize,
    pub backup_path: Option<String>,
    pub source_json_preserved: bool,
}
