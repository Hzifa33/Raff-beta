use crate::book_status::now_ms;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const AUTO_CHECK_CONSENT_VERSION: u32 = 1;
pub const DAY_MS: i64 = 24 * 60 * 60 * 1000;

pub fn normalize_version(value: &str) -> [u32; 4] {
    let raw = value.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let mut parts = [0u32; 4];
    for (i, segment) in raw.split(['.', '-']).take(4).enumerate() {
        if let Ok(n) = segment.parse::<u32>() {
            parts[i] = n;
        } else {
            break;
        }
    }
    parts
}

pub fn compare_versions(a: &str, b: &str) -> i32 {
    let left = normalize_version(a);
    let right = normalize_version(b);
    for i in 0..4 {
        if left[i] > right[i] {
            return 1;
        }
        if left[i] < right[i] {
            return -1;
        }
    }
    0
}

pub fn arch_label(arch: &str) -> &'static str {
    match arch {
        "ia32" | "x86" | "i686" => "x86",
        "x64" | "x86_64" => "x64",
        "arm64" | "aarch64" => "ARM64",
        _ => "unknown",
    }
}

pub fn is_installer_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".exe")
        && (lower.contains("setup")
            || lower.contains("installer")
            || lower.contains("windows")
            || lower.contains("win"))
        && !lower.contains("blockmap")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    #[serde(default)]
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub digest: String,
    #[serde(default)]
    pub download_url: String,
}

pub fn pick_installer_asset<'a>(
    assets: &'a [ReleaseAsset],
    arch: &str,
) -> Option<&'a ReleaseAsset> {
    let list: Vec<&ReleaseAsset> = assets.iter().filter(|a| is_installer_name(&a.name)).collect();
    if list.is_empty() {
        return None;
    }

    let tokens: &[&str] = match arch {
        "ia32" | "x86" | "i686" => &["ia32", "x86", "32bit", "32"],
        "x64" | "x86_64" => &["x64", "amd64", "64bit", "64"],
        "arm64" | "aarch64" => &["arm64", "aarch64"],
        _ => &[],
    };

    for &tok in tokens {
        if let Some(&found) = list.iter().find(|a| has_token_bounded(&a.name, tok)) {
            return Some(found);
        }
    }

    if list.len() == 1 {
        Some(list[0])
    } else {
        None
    }
}

fn has_token_bounded(name: &str, token: &str) -> bool {
    let lower = name.to_lowercase();
    lower
        .split(|c: char| matches!(c, '-' | '_' | '.' | ' '))
        .any(|seg| seg == token)
}

pub fn parse_digest(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() == 71 && trimmed[..7].eq_ignore_ascii_case("sha256:") {
        let hex_part = &trimmed[7..];
        if hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
            return hex_part.to_lowercase();
        }
    }
    String::new()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedUpdateState {
    #[serde(default)]
    pub auto_check_enabled: bool,
    #[serde(default)]
    pub auto_check_enabled_at: i64,
    #[serde(default)]
    pub auto_check_consent_version: u32,
    #[serde(default)]
    pub auto_check_consent_choice: String,
    #[serde(default)]
    pub auto_check_consent_at: i64,
    #[serde(default)]
    pub last_auto_check_at: i64,
    #[serde(default)]
    pub last_manual_check_at: i64,
    #[serde(default)]
    pub last_successful_check_at: i64,
    #[serde(default)]
    pub last_error: String,
    #[serde(default)]
    pub latest: Option<serde_json::Value>,
    #[serde(default)]
    pub downloaded: Option<serde_json::Value>,
    #[serde(default)]
    pub postponed_version: String,
    #[serde(default)]
    pub postponed_until: i64,
}

impl Default for PersistedUpdateState {
    fn default() -> Self {
        Self {
            auto_check_enabled: false,
            auto_check_enabled_at: 0,
            auto_check_consent_version: 0,
            auto_check_consent_choice: String::new(),
            auto_check_consent_at: 0,
            last_auto_check_at: 0,
            last_manual_check_at: 0,
            last_successful_check_at: 0,
            last_error: String::new(),
            latest: None,
            downloaded: None,
            postponed_version: String::new(),
            postponed_until: 0,
        }
    }
}

pub struct UpdateManager {
    state_path: PathBuf,
    current_version: String,
    owner: String,
    repo: String,
    pub state: PersistedUpdateState,
}

impl UpdateManager {
    pub fn new(user_data_dir: &Path, current_version: &str, owner: &str, repo: &str) -> Self {
        let state_path = user_data_dir.join("raff-update-state.json");
        let mut state = fs::read_to_string(&state_path)
            .ok()
            .and_then(|s| serde_json::from_str::<PersistedUpdateState>(&s).ok())
            .unwrap_or_default();

        // Enforce one-time consent contract on upgraded profiles
        if state.auto_check_consent_version < AUTO_CHECK_CONSENT_VERSION {
            state.auto_check_enabled = false;
            state.auto_check_enabled_at = 0;
        }

        let mgr = Self {
            state_path,
            current_version: current_version.to_string(),
            owner: owner.to_string(),
            repo: repo.to_string(),
            state,
        };
        mgr.save();
        mgr
    }

    pub fn save(&self) {
        if let Some(parent) = self.state_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.state) {
            let _ = fs::write(&self.state_path, json);
        }
    }

    pub fn set_auto_check_enabled(&mut self, enabled: bool) -> serde_json::Value {
        let changed = self.state.auto_check_enabled != enabled;
        self.state.auto_check_enabled = enabled;
        self.state.auto_check_consent_version = AUTO_CHECK_CONSENT_VERSION;
        self.state.auto_check_consent_choice = if enabled {
            "enabled".to_string()
        } else {
            "disabled".to_string()
        };
        self.state.auto_check_consent_at = now_ms();
        if changed && enabled {
            self.state.auto_check_enabled_at = now_ms();
            self.state.last_auto_check_at = now_ms();
        }
        self.save();
        self.get_status()
    }

    pub fn postpone(&mut self, hours: i64) -> serde_json::Value {
        let safe_hours = hours.clamp(1, 168);
        if let Some(ver) = self
            .state
            .latest
            .as_ref()
            .and_then(|l| l.get("version"))
            .and_then(|v| v.as_str())
        {
            self.state.postponed_version = ver.to_string();
            self.state.postponed_until = now_ms() + safe_hours * 3_600_000;
            self.save();
        }
        self.get_status()
    }

    pub fn get_status(&self) -> serde_json::Value {
        let arch = std::env::consts::ARCH;
        let auto_enabled = self.state.auto_check_enabled
            && self.state.auto_check_consent_version >= AUTO_CHECK_CONSENT_VERSION;
        let needs_choice = self.state.auto_check_consent_version < AUTO_CHECK_CONSENT_VERSION;
        let latest_ver = self
            .state
            .latest
            .as_ref()
            .and_then(|l| l.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let available =
            !latest_ver.is_empty() && compare_versions(latest_ver, &self.current_version) > 0;
        let postponed = available
            && self.state.postponed_version == latest_ver
            && self.state.postponed_until > now_ms();

        serde_json::json!({
            "ok": true,
            "currentVersion": self.current_version,
            "arch": arch,
            "archLabel": arch_label(arch),
            "repository": format!("{}/{}", self.owner, self.repo),
            "checkIntervalHours": 24,
            "autoCheckEnabled": auto_enabled,
            "autoCheckEnabledAt": self.state.auto_check_enabled_at,
            "autoCheckConsentVersion": self.state.auto_check_consent_version,
            "autoCheckConsentChoice": self.state.auto_check_consent_choice,
            "autoCheckConsentAt": self.state.auto_check_consent_at,
            "needsAutoCheckChoice": needs_choice,
            "lastAutoCheckAt": self.state.last_auto_check_at,
            "lastManualCheckAt": self.state.last_manual_check_at,
            "lastSuccessfulCheckAt": self.state.last_successful_check_at,
            "lastError": self.state.last_error,
            "available": available,
            "postponed": postponed,
            "latest": if available { self.state.latest.clone() } else { None },
            "compatible": true,
            "downloaded": self.state.downloaded,
            "downloading": null
        })
    }
}
