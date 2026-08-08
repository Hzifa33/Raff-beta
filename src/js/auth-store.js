'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECURITY_FILE = 'raff-security.json';
const SECURITY_VERSION = 1;
const MIN_PASSWORD_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

function nowIso() { return new Date().toISOString(); }

function normalizeAnswer(value) {
  return (value ?? '').toString()
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLocaleLowerCase('ar');
}

function makeHash(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(secret, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    algorithm: 'scrypt',
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    keyLength: 64,
  };
}

function verifyHash(secret, record) {
  if (!record || record.algorithm !== 'scrypt' || !record.salt || !record.hash) return false;
  try {
    const expected = Buffer.from(record.hash, 'hex');
    const actual = crypto.scryptSync(secret, Buffer.from(record.salt, 'hex'), expected.length, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}

function emptySecurity() {
  return {
    version: SECURITY_VERSION,
    configured: false,
    password: null,
    recovery: { question: '', answer: null },
    startInPublicMode: true,
    updatedAt: nowIso(),
  };
}

class AuthStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, SECURITY_FILE);
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    this.data = this._load();
    this.mode = this.data.configured && this.data.startInPublicMode ? 'public' : 'admin';
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        const fresh = emptySecurity();
        this._save(fresh);
        return fresh;
      }
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        ...emptySecurity(),
        ...parsed,
        recovery: { ...emptySecurity().recovery, ...(parsed.recovery || {}) },
      };
    } catch (_) {
      try {
        if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      } catch (_) {}
      const fresh = emptySecurity();
      this._save(fresh);
      return fresh;
    }
  }

  _save(next = this.data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(next), 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch (_) {}
  }

  _assertPassword(password) {
    const value = (password || '').toString();
    if (value.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`يجب ألا تقل كلمة المرور عن ${MIN_PASSWORD_LENGTH} أحرف`);
    }
    if (value.length > 256) throw new Error('كلمة المرور طويلة جداً');
    return value;
  }

  isAdmin() { return this.mode === 'admin'; }

  getState() {
    const remaining = Math.max(0, this.lockedUntil - Date.now());
    if (!remaining && this.lockedUntil && this.failedAttempts >= MAX_ATTEMPTS) {
      this.lockedUntil = 0;
      this.failedAttempts = 0;
    }
    const locked = remaining > 0;
    return {
      configured: !!this.data.configured,
      mode: this.mode,
      recoveryQuestion: this.data.recovery?.question || '',
      startInPublicMode: this.data.startInPublicMode !== false,
      lockedForMs: remaining,
      maxAttempts: MAX_ATTEMPTS,
      failedAttempts: locked ? MAX_ATTEMPTS : this.failedAttempts,
      attemptsRemaining: locked ? 0 : Math.max(0, MAX_ATTEMPTS - this.failedAttempts),
    };
  }

  configure({ password, question, answer, startInPublicMode = true } = {}) {
    const safePassword = this._assertPassword(password);
    const safeQuestion = (question || '').toString().trim().slice(0, 180);
    const safeAnswer = normalizeAnswer(answer);
    if (!safeQuestion) throw new Error('اكتب سؤال الاسترداد');
    if (safeAnswer.length < 2) throw new Error('اكتب إجابة الاسترداد');

    this.data = {
      version: SECURITY_VERSION,
      configured: true,
      password: makeHash(safePassword),
      recovery: { question: safeQuestion, answer: makeHash(safeAnswer) },
      startInPublicMode: !!startInPublicMode,
      updatedAt: nowIso(),
    };
    this.mode = 'admin';
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    this._save();
    return this.getState();
  }

  login(password) {
    if (!this.data.configured) {
      this.mode = 'admin';
      return { ok: true, state: this.getState() };
    }
    const wait = this.lockedUntil - Date.now();
    if (wait <= 0 && this.lockedUntil) {
      this.lockedUntil = 0;
      this.failedAttempts = 0;
    }
    if (wait > 0) {
      return { ok: false, error: `محاولات كثيرة. حاول بعد ${Math.ceil(wait / 1000)} ثانية`, code: 'LOCKED', state: this.getState() };
    }
    if (!verifyHash((password || '').toString(), this.data.password)) {
      this.failedAttempts += 1;
      if (this.failedAttempts >= MAX_ATTEMPTS) {
        this.failedAttempts = MAX_ATTEMPTS;
        this.lockedUntil = Date.now() + LOCK_MS;
      }
      return { ok: false, error: 'كلمة المرور غير صحيحة', code: 'INVALID_PASSWORD', state: this.getState() };
    }
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    this.mode = 'admin';
    return { ok: true, state: this.getState() };
  }

  logout() {
    this.mode = 'public';
    return this.getState();
  }

  enterAdminWithoutPassword() {
    if (this.data.configured) return { ok: false, error: 'أدخل كلمة مرور الإدارة' };
    this.mode = 'admin';
    return { ok: true, state: this.getState() };
  }

  updatePreferences({ startInPublicMode } = {}) {
    if (startInPublicMode !== undefined) this.data.startInPublicMode = !!startInPublicMode;
    this.data.updatedAt = nowIso();
    this._save();
    return this.getState();
  }

  changeCredentials({ password, question, answer } = {}) {
    if (!this.isAdmin()) throw new Error('يتطلب وضع الإدارة');
    const nextPassword = password ? this._assertPassword(password) : null;
    const nextQuestion = question === undefined ? this.data.recovery.question : (question || '').toString().trim().slice(0, 180);
    const nextAnswer = answer === undefined ? null : normalizeAnswer(answer);

    if (nextPassword) this.data.password = makeHash(nextPassword);
    if (question !== undefined) {
      if (!nextQuestion) throw new Error('اكتب سؤال الاسترداد');
      this.data.recovery.question = nextQuestion;
    }
    if (answer !== undefined) {
      if (nextAnswer.length < 2) throw new Error('اكتب إجابة الاسترداد');
      this.data.recovery.answer = makeHash(nextAnswer);
    }
    this.data.configured = !!this.data.password;
    this.data.updatedAt = nowIso();
    this._save();
    return this.getState();
  }

  resetPassword({ answer, newPassword } = {}) {
    if (!this.data.configured || !this.data.recovery?.answer) {
      return { ok: false, error: 'لم يُضبط استرداد كلمة المرور' };
    }
    const normalized = normalizeAnswer(answer);
    if (!verifyHash(normalized, this.data.recovery.answer)) {
      return { ok: false, error: 'إجابة الاسترداد غير صحيحة' };
    }
    try {
      const safePassword = this._assertPassword(newPassword);
      this.data.password = makeHash(safePassword);
      this.data.updatedAt = nowIso();
      this.mode = 'admin';
      this.failedAttempts = 0;
      this.lockedUntil = 0;
      this._save();
      return { ok: true, state: this.getState() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  removeProtection() {
    if (!this.isAdmin()) throw new Error('يتطلب وضع الإدارة');
    this.data = emptySecurity();
    this.mode = 'admin';
    this._save();
    return this.getState();
  }
}

AuthStore._test = { makeHash, verifyHash, normalizeAnswer };
module.exports = AuthStore;
