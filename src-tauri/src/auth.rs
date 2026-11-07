use crate::book_status::{now_iso, now_ms};
use crate::normalize::normalize_security_answer;
use rand::RngCore;
use scrypt::{scrypt, Params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use subtle::ConstantTimeEq;

pub const SECURITY_FILE: &str = "raff-security.json";
pub const SECURITY_VERSION: u32 = 1;
pub const MIN_PASSWORD_LENGTH: usize = 4;
pub const MAX_ATTEMPTS: u32 = 5;
pub const LOCK_MS: i64 = 30_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HashRecord {
    pub algorithm: String,
    pub salt: String,
    pub hash: String,
    pub key_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    #[serde(default)]
    pub question: String,
    #[serde(default)]
    pub answer: Option<HashRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityData {
    #[serde(default = "default_sec_version")]
    pub version: u32,
    #[serde(default)]
    pub configured: bool,
    #[serde(default)]
    pub password: Option<HashRecord>,
    #[serde(default)]
    pub recovery: RecoveryRecord,
    #[serde(default = "default_true")]
    pub start_in_public_mode: bool,
    #[serde(default = "now_iso")]
    pub updated_at: String,
}

fn default_sec_version() -> u32 {
    SECURITY_VERSION
}
fn default_true() -> bool {
    true
}

impl Default for SecurityData {
    fn default() -> Self {
        Self {
            version: SECURITY_VERSION,
            configured: false,
            password: None,
            recovery: RecoveryRecord::default(),
            start_in_public_mode: true,
            updated_at: now_iso(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub enabled: bool,
    pub configured: bool,
    pub username: String,
    pub mode: String,
    pub unlocked: bool,
    pub public_mode_enabled: bool,
    pub start_in_public_mode: bool,
    pub recovery_configured: bool,
    pub recovery_question: String,
    pub locked_out: bool,
    pub locked_for_ms: i64,
    pub lockout_remaining_ms: i64,
    pub max_attempts: u32,
    pub max_failed_attempts: u32,
    pub failed_attempts: u32,
    pub attempts_remaining: u32,
    pub remaining_attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<AuthState>,
}

pub fn make_hash(secret: &str) -> HashRecord {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    // N=16384 (log_n=14), r=8, p=1, key_len=64 — matches RAFF 3.0.0 Node crypto.scryptSync
    let params = Params::new(14, 8, 1, 64).expect("valid scrypt params");
    let mut output = [0u8; 64];
    scrypt(secret.as_bytes(), &salt, &params, &mut output).expect("scrypt derivation");
    HashRecord {
        algorithm: "scrypt".to_string(),
        salt: hex::encode(salt),
        hash: hex::encode(output),
        key_length: 64,
    }
}

pub fn verify_hash(secret: &str, record: &HashRecord) -> bool {
    if record.algorithm != "scrypt" || record.salt.is_empty() || record.hash.is_empty() {
        return false;
    }
    let Ok(salt_bytes) = hex::decode(&record.salt) else {
        return false;
    };
    let Ok(expected) = hex::decode(&record.hash) else {
        return false;
    };
    if expected.is_empty() || expected.len() > 128 {
        return false;
    }
    let Ok(params) = Params::new(14, 8, 1, expected.len()) else {
        return false;
    };
    let mut actual = vec![0u8; expected.len()];
    if scrypt(secret.as_bytes(), &salt_bytes, &params, &mut actual).is_err() {
        return false;
    }
    expected.ct_eq(&actual).into()
}

pub struct AuthStore {
    file_path: PathBuf,
    failed_attempts: u32,
    locked_until: i64,
    data: SecurityData,
    mode: String,
}

impl AuthStore {
    pub fn new(user_data_dir: &Path) -> Self {
        let file_path = user_data_dir.join(SECURITY_FILE);
        let data = Self::load_or_init(&file_path);
        let mode = if data.configured && data.start_in_public_mode {
            "public".to_string()
        } else {
            "admin".to_string()
        };
        Self {
            file_path,
            failed_attempts: 0,
            locked_until: 0,
            data,
            mode,
        }
    }

    fn load_or_init(file_path: &Path) -> SecurityData {
        if let Ok(raw) = fs::read_to_string(file_path) {
            if let Ok(parsed) = serde_json::from_str::<SecurityData>(&raw) {
                return parsed;
            }
            let _ = fs::copy(
                file_path,
                format!("{}.corrupt-{}", file_path.display(), now_ms()),
            );
        }
        let fresh = SecurityData::default();
        let _ = Self::save_atomic(file_path, &fresh);
        fresh
    }

    fn save_atomic(file_path: &Path, data: &SecurityData) -> Result<(), String> {
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let tmp = file_path.with_extension("json.tmp");
        let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, file_path).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn save(&self) {
        let _ = Self::save_atomic(&self.file_path, &self.data);
    }

    fn assert_password(password: &str) -> Result<String, String> {
        let count = password.chars().count();
        if count < MIN_PASSWORD_LENGTH {
            return Err(format!(
                "يجب ألا تقل كلمة المرور عن {} أحرف",
                MIN_PASSWORD_LENGTH
            ));
        }
        if count > 256 {
            return Err("كلمة المرور طويلة جداً".to_string());
        }
        Ok(password.to_string())
    }

    pub fn is_admin(&self) -> bool {
        self.mode == "admin"
    }

    pub fn get_state(&mut self) -> AuthState {
        let now = now_ms();
        let remaining = (self.locked_until - now).max(0);
        if remaining == 0 && self.locked_until > 0 && self.failed_attempts >= MAX_ATTEMPTS {
            self.locked_until = 0;
            self.failed_attempts = 0;
        }
        let locked = remaining > 0;
        let failed = if locked {
            MAX_ATTEMPTS
        } else {
            self.failed_attempts
        };
        let attempts_rem = if locked {
            0
        } else {
            MAX_ATTEMPTS.saturating_sub(self.failed_attempts)
        };
        let rec_configured =
            !self.data.recovery.question.trim().is_empty() && self.data.recovery.answer.is_some();

        AuthState {
            enabled: self.data.configured,
            configured: self.data.configured,
            username: "admin".to_string(),
            mode: self.mode.clone(),
            unlocked: !self.data.configured || self.mode == "admin",
            public_mode_enabled: self.data.start_in_public_mode,
            start_in_public_mode: self.data.start_in_public_mode,
            recovery_configured: rec_configured,
            recovery_question: self.data.recovery.question.clone(),
            locked_out: locked,
            locked_for_ms: remaining,
            lockout_remaining_ms: remaining,
            max_attempts: MAX_ATTEMPTS,
            max_failed_attempts: MAX_ATTEMPTS,
            failed_attempts: failed,
            attempts_remaining: attempts_rem,
            remaining_attempts: attempts_rem,
        }
    }

    pub fn configure(
        &mut self,
        password: &str,
        question: &str,
        answer: &str,
        start_in_public_mode: bool,
    ) -> Result<AuthState, String> {
        let safe_pw = Self::assert_password(password)?;
        let safe_q: String = question.trim().chars().take(180).collect();
        let safe_a = normalize_security_answer(answer);
        let recovery = if !safe_q.is_empty() && safe_a.chars().count() >= 2 {
            RecoveryRecord {
                question: safe_q,
                answer: Some(make_hash(&safe_a)),
            }
        } else {
            RecoveryRecord::default()
        };
        self.data = SecurityData {
            version: SECURITY_VERSION,
            configured: true,
            password: Some(make_hash(&safe_pw)),
            recovery,
            start_in_public_mode,
            updated_at: now_iso(),
        };
        self.mode = "admin".to_string();
        self.failed_attempts = 0;
        self.locked_until = 0;
        self.save();
        Ok(self.get_state())
    }

    pub fn login(&mut self, password: &str) -> AuthResult {
        if !self.data.configured {
            self.mode = "admin".to_string();
            return AuthResult {
                ok: true,
                error: None,
                code: None,
                state: Some(self.get_state()),
            };
        }
        let now = now_ms();
        let wait = self.locked_until - now;
        if wait <= 0 && self.locked_until > 0 {
            self.locked_until = 0;
            self.failed_attempts = 0;
        }
        if wait > 0 {
            let secs = ((wait as f64) / 1000.0).ceil() as i64;
            return AuthResult {
                ok: false,
                error: Some(format!("محاولات كثيرة. حاول بعد {} ثانية", secs)),
                code: Some("LOCKED".to_string()),
                state: Some(self.get_state()),
            };
        }
        let verified = self
            .data
            .password
            .as_ref()
            .map(|rec| verify_hash(password, rec))
            .unwrap_or(false);
        if !verified {
            self.failed_attempts += 1;
            if self.failed_attempts >= MAX_ATTEMPTS {
                self.failed_attempts = MAX_ATTEMPTS;
                self.locked_until = now_ms() + LOCK_MS;
            }
            return AuthResult {
                ok: false,
                error: Some("كلمة المرور غير صحيحة".to_string()),
                code: Some("INVALID_PASSWORD".to_string()),
                state: Some(self.get_state()),
            };
        }
        self.failed_attempts = 0;
        self.locked_until = 0;
        self.mode = "admin".to_string();
        AuthResult {
            ok: true,
            error: None,
            code: None,
            state: Some(self.get_state()),
        }
    }

    pub fn logout(&mut self) -> AuthState {
        self.mode = "public".to_string();
        self.get_state()
    }

    pub fn enter_admin_without_password(&mut self) -> AuthResult {
        if self.data.configured {
            return AuthResult {
                ok: false,
                error: Some("أدخل كلمة مرور الإدارة".to_string()),
                code: None,
                state: None,
            };
        }
        self.mode = "admin".to_string();
        AuthResult {
            ok: true,
            error: None,
            code: None,
            state: Some(self.get_state()),
        }
    }

    pub fn update_preferences(&mut self, start_in_public_mode: Option<bool>) -> AuthState {
        if let Some(flag) = start_in_public_mode {
            self.data.start_in_public_mode = flag;
        }
        self.data.updated_at = now_iso();
        self.save();
        self.get_state()
    }

    pub fn change_credentials(
        &mut self,
        password: Option<&str>,
        question: Option<&str>,
        answer: Option<&str>,
    ) -> Result<AuthState, String> {
        if !self.is_admin() {
            return Err("يتطلب وضع الإدارة".to_string());
        }
        if let Some(pw) = password {
            if !pw.is_empty() {
                let safe_pw = Self::assert_password(pw)?;
                self.data.password = Some(make_hash(&safe_pw));
            }
        }
        if let Some(q) = question {
            let safe_q: String = q.trim().chars().take(180).collect();
            if !safe_q.is_empty() {
                self.data.recovery.question = safe_q;
            }
        }
        if let Some(a) = answer {
            let safe_a = normalize_security_answer(a);
            if safe_a.chars().count() >= 2 {
                self.data.recovery.answer = Some(make_hash(&safe_a));
            }
        }
        self.data.configured = self.data.password.is_some();
        self.data.updated_at = now_iso();
        self.save();
        Ok(self.get_state())
    }

    pub fn reset_password(&mut self, answer: &str, new_password: &str) -> AuthResult {
        let Some(ref expected_ans) = self.data.recovery.answer else {
            return AuthResult {
                ok: false,
                error: Some("لم يُضبط استرداد كلمة المرور".to_string()),
                code: None,
                state: None,
            };
        };
        if !self.data.configured {
            return AuthResult {
                ok: false,
                error: Some("لم يُضبط استرداد كلمة المرور".to_string()),
                code: None,
                state: None,
            };
        }
        let normalized = normalize_security_answer(answer);
        if !verify_hash(&normalized, expected_ans) {
            return AuthResult {
                ok: false,
                error: Some("إجابة الاسترداد غير صحيحة".to_string()),
                code: None,
                state: None,
            };
        }
        match Self::assert_password(new_password) {
            Ok(safe_pw) => {
                self.data.password = Some(make_hash(&safe_pw));
                self.data.updated_at = now_iso();
                self.mode = "admin".to_string();
                self.failed_attempts = 0;
                self.locked_until = 0;
                self.save();
                AuthResult {
                    ok: true,
                    error: None,
                    code: None,
                    state: Some(self.get_state()),
                }
            }
            Err(e) => AuthResult {
                ok: false,
                error: Some(e),
                code: None,
                state: None,
            },
        }
    }

    pub fn remove_protection(&mut self) -> Result<AuthState, String> {
        if !self.is_admin() {
            return Err("يتطلب وضع الإدارة".to_string());
        }
        self.data = SecurityData::default();
        self.mode = "admin".to_string();
        self.save();
        Ok(self.get_state())
    }
}
