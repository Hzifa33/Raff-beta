use crate::models::{Book, Loan};
use chrono::{DateTime, Utc};

pub const STATUS_AVAILABLE: &str = "متاح";
pub const STATUS_PARTIAL: &str = "معار جزئياً";
pub const STATUS_FULL: &str = "معار بالكامل";

pub const LOAN_FULL: &str = "full";
pub const LOAN_VOLUME: &str = "volume";
pub const MS_PER_DAY: i64 = 86_400_000;

pub fn total_copies(book: &Book) -> u32 {
    if book.copies_total > 0 {
        book.copies_total
    } else {
        1
    }
}

pub fn total_volumes(book: &Book) -> u32 {
    if book.volumes > 0 {
        book.volumes
    } else {
        1
    }
}

pub fn is_multi_volume(book: &Book) -> bool {
    total_volumes(book) > 1
}

pub fn loan_volumes(loan: &Loan) -> Vec<u32> {
    if loan.r#type == LOAN_FULL {
        return Vec::new();
    }
    let mut raw: Vec<u32> = if !loan.volumes.is_empty() {
        loan.volumes.clone()
    } else if let Some(v) = loan.volume {
        vec![v]
    } else {
        Vec::new()
    };
    raw.retain(|&v| v > 0);
    raw.sort_unstable();
    raw.dedup();
    raw
}

pub fn is_volume_loan(loan: &Loan) -> bool {
    loan.r#type != LOAN_FULL && !loan_volumes(loan).is_empty()
}

pub fn loan_all_volumes(loan: &Loan, book: &Book) -> Vec<u32> {
    if is_volume_loan(loan) {
        loan_volumes(loan)
    } else {
        (1..=total_volumes(book)).collect()
    }
}

pub fn parse_iso_ms(iso: &str) -> Option<i64> {
    if iso.trim().is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(iso) {
        return Some(dt.timestamp_millis());
    }
    // Fallback for YYYY-MM-DD
    if let Ok(naive) = chrono::NaiveDate::parse_from_str(iso.trim(), "%Y-%m-%d") {
        let dt = naive.and_hms_opt(12, 0, 0)?.and_utc();
        return Some(dt.timestamp_millis());
    }
    None
}

pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn returned_loan_volumes(loan: &Loan, book: &Book) -> Vec<u32> {
    let all = loan_all_volumes(loan, book);
    if all.is_empty() {
        return Vec::new();
    }
    if loan.returned_at.is_some() && loan.volume_returns.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|v| {
            loan.volume_returns
                .get(&v.to_string())
                .and_then(|stamp| parse_iso_ms(stamp))
                .is_some()
        })
        .collect()
}

pub fn outstanding_loan_volumes(loan: &Loan, book: &Book) -> Vec<u32> {
    if loan.returned_at.is_some() {
        return Vec::new();
    }
    let returned = returned_loan_volumes(loan, book);
    loan_all_volumes(loan, book)
        .into_iter()
        .filter(|v| !returned.contains(v))
        .collect()
}

pub fn is_loan_active(loan: &Loan, book: &Book) -> bool {
    !outstanding_loan_volumes(loan, book).is_empty()
}

pub fn active_loans<'a>(book: &'a Book) -> Vec<&'a Loan> {
    book.loans
        .iter()
        .filter(|l| is_loan_active(l, book))
        .collect()
}

pub fn borrowed_of_volume(book: &Book, volume_no: u32) -> u32 {
    book.loans
        .iter()
        .filter(|l| is_loan_active(l, book) && outstanding_loan_volumes(l, book).contains(&volume_no))
        .count() as u32
}

pub fn available_of_volume(book: &Book, volume_no: u32) -> u32 {
    total_copies(book).saturating_sub(borrowed_of_volume(book, volume_no))
}

pub fn borrowed_full_copies(book: &Book) -> u32 {
    let count = total_volumes(book);
    active_loans(book)
        .into_iter()
        .filter(|l| !is_volume_loan(l) && outstanding_loan_volumes(l, book).len() as u32 == count)
        .count() as u32
}

pub fn available_full_copies(book: &Book) -> u32 {
    let vols = total_volumes(book);
    let copies = total_copies(book);
    let mut min_free = copies;
    for v in 1..=vols {
        let free = copies.saturating_sub(borrowed_of_volume(book, v));
        if free < min_free {
            min_free = free;
        }
    }
    min_free
}

pub fn borrowed_copies(book: &Book) -> u32 {
    let vols = total_volumes(book);
    if vols <= 1 {
        return borrowed_of_volume(book, 1);
    }
    let mut busiest = 0;
    for v in 1..=vols {
        let out = borrowed_of_volume(book, v);
        if out > busiest {
            busiest = out;
        }
    }
    busiest
}

pub fn available_copies(book: &Book) -> u32 {
    total_copies(book).saturating_sub(borrowed_copies(book))
}

pub fn book_status(book: &Book) -> &'static str {
    let vols = total_volumes(book);
    let copies = total_copies(book);
    if vols <= 1 {
        let out = borrowed_copies(book);
        if out == 0 {
            return STATUS_AVAILABLE;
        }
        if out >= copies {
            return STATUS_FULL;
        }
        return STATUS_PARTIAL;
    }
    let mut any_out = false;
    let mut all_full = true;
    for v in 1..=vols {
        let out = borrowed_of_volume(book, v);
        if out > 0 {
            any_out = true;
        }
        if out < copies {
            all_full = false;
        }
    }
    if !any_out {
        STATUS_AVAILABLE
    } else if all_full {
        STATUS_FULL
    } else {
        STATUS_PARTIAL
    }
}

pub fn can_borrow(book: &Book) -> bool {
    available_full_copies(book) > 0
}

pub fn can_borrow_volume(book: &Book, volume_no: u32) -> bool {
    volume_no >= 1 && volume_no <= total_volumes(book) && available_of_volume(book, volume_no) > 0
}

pub fn loan_duration_days(loan: &Loan, now_millis: Option<i64>) -> i64 {
    let Some(start) = parse_iso_ms(&loan.borrowed_at) else {
        return 0;
    };
    let end = loan
        .returned_at
        .as_deref()
        .and_then(parse_iso_ms)
        .unwrap_or_else(|| now_millis.unwrap_or_else(now_ms));
    let days = (end - start) / MS_PER_DAY;
    days.max(0)
}

pub fn days_until_due(loan: &Loan, now_millis: Option<i64>) -> Option<i64> {
    let due = parse_iso_ms(&loan.due_at)?;
    let now = now_millis.unwrap_or_else(now_ms);
    let diff = (due - now) as f64 / (MS_PER_DAY as f64);
    Some(diff.ceil() as i64)
}

pub fn is_overdue(loan: &Loan, limit_days: i64, now_millis: Option<i64>) -> bool {
    if loan.returned_at.is_some() {
        return false;
    }
    let now = now_millis.unwrap_or_else(now_ms);
    if let Some(due) = parse_iso_ms(&loan.due_at) {
        return now > due;
    }
    loan_duration_days(loan, Some(now)) > limit_days
}

pub fn is_due_soon(loan: &Loan, window_days: i64, now_millis: Option<i64>) -> bool {
    if loan.returned_at.is_some() || loan.due_at.is_empty() {
        return false;
    }
    if let Some(d) = days_until_due(loan, now_millis) {
        d >= 0 && d <= window_days
    } else {
        false
    }
}

pub fn current_borrowers(book: &Book) -> Vec<String> {
    active_loans(book)
        .into_iter()
        .map(|l| l.borrower_name.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn format_volume_numbers(values: &[u32]) -> String {
    let mut vols = values.to_vec();
    vols.sort_unstable();
    vols.dedup();
    match vols.len() {
        0 => String::new(),
        1 => vols[0].to_string(),
        2 => format!("{} و{}", vols[0], vols[1]),
        n => {
            let head: Vec<String> = vols[..n - 1].iter().map(|v| v.to_string()).collect();
            format!("{} و{}", head.join("، "), vols[n - 1])
        }
    }
}

pub fn loan_scope_label(loan: &Loan) -> String {
    if !is_volume_loan(loan) {
        return "نسخة كاملة".to_string();
    }
    let vols = loan_volumes(loan);
    if vols.len() == 1 {
        format!("الجزء {}", vols[0])
    } else {
        format!("الأجزاء {}", format_volume_numbers(&vols))
    }
}

pub fn outstanding_scope_label(loan: &Loan, book: &Book) -> String {
    let vols = outstanding_loan_volumes(loan, book);
    if vols.is_empty() {
        return "أُرجعت بالكامل".to_string();
    }
    if !is_volume_loan(loan) && vols.len() as u32 == total_volumes(book) {
        return "نسخة كاملة".to_string();
    }
    if vols.len() == 1 {
        format!("الجزء {}", vols[0])
    } else {
        format!("الأجزاء {}", format_volume_numbers(&vols))
    }
}

#[derive(Debug, Clone)]
pub struct BookAvailability {
    pub state: String,
    pub copies_total: u32,
    pub available_copies: u32,
    pub borrowed_copies: u32,
    pub available_volumes: Vec<u32>,
    pub borrowed_volumes: Vec<u32>,
    pub has_partial_loan: bool,
    pub active_loans: Vec<Loan>,
}

pub fn get_loan_volumes(loan: &Loan) -> Vec<u32> {
    loan_volumes(loan)
}

pub fn get_loan_returned_volumes(loan: &Loan) -> Vec<u32> {
    let all = loan_volumes(loan);
    if all.is_empty() {
        return Vec::new();
    }
    if loan.returned_at.is_some() && loan.volume_returns.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|v| {
            loan.volume_returns
                .get(&v.to_string())
                .and_then(|stamp| parse_iso_ms(stamp))
                .is_some()
        })
        .collect()
}

pub fn get_loan_outstanding_volumes(loan: &Loan) -> Vec<u32> {
    if loan.returned_at.is_some() {
        return Vec::new();
    }
    let returned = get_loan_returned_volumes(loan);
    loan_volumes(loan)
        .into_iter()
        .filter(|v| !returned.contains(v))
        .collect()
}

pub fn is_loan_open(loan: &Loan) -> bool {
    if loan.returned_at.is_some() {
        return false;
    }
    if is_volume_loan(loan) {
        return !get_loan_outstanding_volumes(loan).is_empty();
    }
    true
}

pub fn is_loan_overdue(loan: &Loan, now_millis: i64) -> bool {
    if !is_loan_open(loan) {
        return false;
    }
    is_overdue(loan, 30, Some(now_millis))
}

pub fn loan_overdue_days(loan: &Loan, now_millis: i64) -> i64 {
    if !is_loan_overdue(loan, now_millis) {
        return 0;
    }
    if let Some(due_ms) = parse_iso_ms(&loan.due_at) {
        return ((now_millis - due_ms) / MS_PER_DAY).max(1);
    }
    0
}

pub fn loan_scope_label_with_mode(loan: &Loan, outstanding_only: bool) -> String {
    if !is_volume_loan(loan) {
        return String::new();
    }
    let vols = if outstanding_only {
        get_loan_outstanding_volumes(loan)
    } else {
        loan_volumes(loan)
    };
    if vols.is_empty() {
        return String::new();
    }
    if vols.len() == 1 {
        format!("الجزء {}", vols[0])
    } else {
        format!("الأجزاء {}", format_volume_numbers(&vols))
    }
}

pub fn compute_book_availability(book: &Book, _now_millis: i64) -> BookAvailability {
    let copies = total_copies(book);
    let vols = total_volumes(book);
    let mut borrowed_vols = Vec::new();
    let mut available_vols = Vec::new();
    for v in 1..=vols {
        if borrowed_of_volume(book, v) > 0 {
            borrowed_vols.push(v);
        }
        if available_of_volume(book, v) > 0 {
            available_vols.push(v);
        }
    }
    let active: Vec<Loan> = book
        .loans
        .iter()
        .filter(|l| is_loan_active(l, book))
        .cloned()
        .collect();
    let has_partial = active.iter().any(is_volume_loan);
    let status_ar = book_status(book);
    let state = if status_ar == STATUS_FULL {
        "borrowed"
    } else if status_ar == STATUS_PARTIAL {
        "partial"
    } else {
        "available"
    }
    .to_string();

    let b_copies = borrowed_copies(book);
    let a_copies = if state == "available" {
        copies
    } else if state == "borrowed" {
        0
    } else {
        available_copies(book).max(if available_vols.is_empty() { 0 } else { 1 })
    };

    BookAvailability {
        state,
        copies_total: copies,
        available_copies: a_copies,
        borrowed_copies: b_copies,
        available_volumes: available_vols,
        borrowed_volumes: borrowed_vols,
        has_partial_loan: has_partial,
        active_loans: active,
    }
}

