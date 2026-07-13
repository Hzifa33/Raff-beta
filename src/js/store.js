'use strict';

const fs = require('fs');
const path = require('path');
const B = require('./book-status');

const DB_FILE = 'raff-library.json';
const SCHEMA_VERSION = 6;

// Default loan period; the auto due date is this many days after borrowing.
const DEFAULT_LOAN_DAYS = 30;

const COPY_CONDITIONS = ['جيدة', 'مقبولة', 'تالفة', 'مفقودة'];

function nowIso() {
  return new Date().toISOString();
}

function genId() {
  return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function genLoanId() {
  return 'l_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Prices are stored as a non-negative number, or null when unspecified. */
function sanitizePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function escapeXml(str) {
  return (str ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Normalizes a keywords value to a clean array of unique non-empty tags. */
function sanitizeKeywords(value) {
  let arr = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === 'string') arr = value.split(/[،,]/);
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const t = (raw || '').toString().trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

function sanitizeCondition(value) {
  const v = (value || '').toString().trim();
  return COPY_CONDITIONS.includes(v) ? v : 'جيدة';
}

/** The inventory fields shared by addBook and updateBook. */
function normalizeInventoryFields(book) {
  return {
    series: (book.series || '').trim(),                 // اسم السلسلة
    seriesOrder: (book.seriesOrder || '').toString().trim(), // رقم المجلد/الترتيب داخل السلسلة
    keywords: sanitizeKeywords(book.keywords),          // كلمات مفتاحية
    condition: sanitizeCondition(book.condition),       // حالة النسخة
    acquisition: (book.acquisition || '').trim(),       // جهة الاقتناء
    shelf: (book.shelf || '').trim(),                   // الرف
  };
}

function makeRecordDefaults() {
  return { series: '', seriesOrder: '', keywords: [], condition: 'جيدة', acquisition: '', shelf: '' };
}

function emptyDb() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    nextRefSeq: 1,
    books: [],
    settings: defaultSettings(),
  };
}

/** Institution branding and label-printing preferences. */
function defaultSettings() {
  return {
    institutionName: '',   // اسم المكتبة/المؤسسة على الملصقات
    logo: '',              // شعار كـ data URL (base64) — يبقى محلياً
    labelColumns: 4,       // عدد الأعمدة في ورقة A4
    labelSize: 'small',    // small | medium — حجم الملصق للصق خلف الكتاب
    labelShowPrice: true,
    labelShowShelf: true,
    labelShowMicrotext: true, // معلومات دقيقة شبه خفية
    loanDurationDays: 30,      // مدة الإعارة الافتراضية بالأيام
  };
}

/**
 * A minimal, dependency-free JSON datastore. Chosen over a native SQLite
 * binding so the packaged app never has to rebuild native modules per
 * platform/Electron ABI — a common source of broken installers.
 */
class Store {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, DB_FILE);
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.db = emptyDb();
        this._save();
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.db = JSON.parse(raw);
      if (!this.db.books) this.db.books = [];
      if (!this.db.nextRefSeq) {
        // Upgrading an older database: start the counter past any existing
        // numeric suffixes so newly generated numbers can't collide.
        let maxSeq = 0;
        for (const b of this.db.books) {
          const m = /(\d+)\s*$/.exec(b.referenceNumber || '');
          if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
        }
        this.db.nextRefSeq = maxSeq + 1;
      }
      this._migrate();
    } catch (err) {
      // Corrupt file safety net: back it up and start fresh rather than crash.
      try {
        if (fs.existsSync(this.filePath)) {
          fs.copyFileSync(this.filePath, this.filePath + '.corrupt-' + Date.now());
        }
      } catch (_) {}
      this.db = emptyDb();
      this._save();
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    // Internal store is written compactly (no pretty-print) so it stays small
    // and fast to read/write even with thousands of records. The human-readable
    // formatting is reserved for exportJson. Written to a temp file then renamed
    // so an interrupted write can never corrupt the live database.
    fs.writeFileSync(tmp, JSON.stringify(this.db), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  /** Writes a timestamped copy of the current database into a backups folder. */
  createBackup(reason = 'manual') {
    const dir = path.join(path.dirname(this.filePath), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `raff-backup-${stamp}-${reason}.json`);
    fs.writeFileSync(file, JSON.stringify(this.db, null, 2), 'utf-8');
    this._pruneBackups(dir, 20);
    return file;
  }

  /** Keeps only the newest `keep` backups so the folder can't grow forever. */
  _pruneBackups(dir, keep) {
    try {
      const files = fs.readdirSync(dir)
        .filter((f) => f.startsWith('raff-backup-') && f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const { f } of files.slice(keep)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  }

  dataDir() { return path.dirname(this.filePath); }

  /**
   * v1 stored a single `status` string plus one `borrowerName`. v2 stores a
   * loan ledger and derives status from it. Convert in place, once, and keep
   * the old borrower as an open loan dated to the record's creation.
   */
  _migrate() {
    let changed = false;
    const from = this.db.schemaVersion || 1;
    if (from >= SCHEMA_VERSION) return;

    for (const book of this.db.books) {
      // v1 -> v2: single status/borrower becomes a loan ledger.
      if (!Array.isArray(book.loans)) book.loans = [];
      const wasBorrowed = book.status === 'معار';
      if (wasBorrowed && book.loans.length === 0) {
        book.loans.push({
          id: genLoanId(),
          borrowerName: (book.borrowerName || 'غير معروف').trim(),
          borrowedAt: book.updatedAt || book.createdAt || nowIso(),
          returnedAt: null,
        });
      }
      delete book.status;
      delete book.borrowerName;

      // v2 -> v3: price and volumes fields.
      if (book.volumes === undefined) { book.volumes = 1; changed = true; }
      if (book.price === undefined) { book.price = null; changed = true; }
      // Loans predating volume-level lending are whole-copy loans.
      for (const loan of book.loans || []) {
        if (loan.type === undefined) { loan.type = 'full'; loan.volume = null; changed = true; }
        // v4 -> v5: a partial loan can contain one or several volume numbers.
        if (loan.type === 'volume' || loan.volume != null || Array.isArray(loan.volumes)) {
          const raw = Array.isArray(loan.volumes) ? loan.volumes : (loan.volume != null ? [loan.volume] : []);
          const volumes = [...new Set(raw.map((v) => Math.floor(Number(v))).filter((v) => v > 0))].sort((a, b) => a - b);
          if (JSON.stringify(loan.volumes || []) !== JSON.stringify(volumes)) { loan.volumes = volumes; changed = true; }
          const legacyVolume = volumes.length === 1 ? volumes[0] : null;
          if (loan.volume !== legacyVolume) { loan.volume = legacyVolume; changed = true; }
          if (volumes.length > 0 && loan.type !== 'volume') { loan.type = 'volume'; changed = true; }
          if (volumes.length === 0 && loan.type !== 'full') { loan.type = 'full'; changed = true; }
        } else {
          if (!Array.isArray(loan.volumes) || loan.volumes.length) { loan.volumes = []; changed = true; }
          if (loan.volume !== null) { loan.volume = null; changed = true; }
        }
        // v3 -> v4: loans gain a due date, contact, and per-loan note.
        if (loan.dueAt === undefined) {
          const start = Date.parse(loan.borrowedAt) || Date.now();
          loan.dueAt = new Date(start + DEFAULT_LOAN_DAYS * 86400000).toISOString();
          changed = true;
        }
        if (loan.contact === undefined) { loan.contact = ''; changed = true; }
        if (loan.note === undefined) { loan.note = ''; changed = true; }
        // v5 -> v6: each volume can be returned independently.
        if (!loan.volumeReturns || typeof loan.volumeReturns !== 'object' || Array.isArray(loan.volumeReturns)) {
          loan.volumeReturns = {};
          changed = true;
        }
      }

      // v3 -> v4: new inventory fields.
      const defs = makeRecordDefaults();
      for (const k of Object.keys(defs)) {
        if (book[k] === undefined) { book[k] = defs[k]; changed = true; }
      }
      if (!Array.isArray(book.keywords)) { book.keywords = sanitizeKeywords(book.keywords); changed = true; }
    }
    // Ensure the settings object exists and has every key (older DBs lack it).
    if (!this.db.settings || typeof this.db.settings !== 'object') this.db.settings = defaultSettings();
    else {
      const defs = defaultSettings();
      for (const k of Object.keys(defs)) {
        if (this.db.settings[k] === undefined) this.db.settings[k] = defs[k];
      }
    }
    this.db.schemaVersion = SCHEMA_VERSION;
    this._save();
    void changed;
  }

  getSettings() {
    if (!this.db.settings) this.db.settings = defaultSettings();
    return { ...this.db.settings };
  }

  /** Updates institution/label settings. Logo is validated to be a data URL. */
  updateSettings(patch) {
    const cur = this.getSettings();
    const next = { ...cur };
    if (patch.institutionName !== undefined) next.institutionName = (patch.institutionName || '').toString().slice(0, 120).trim();
    if (patch.logo !== undefined) {
      const logo = (patch.logo || '').toString();
      // Only accept an image data URL, or empty to clear it.
      next.logo = (logo === '' || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(logo)) ? logo : cur.logo;
    }
    if (patch.labelColumns !== undefined) {
      const n = Math.floor(Number(patch.labelColumns));
      next.labelColumns = (n >= 1 && n <= 5) ? n : cur.labelColumns;
    }
    if (patch.labelSize !== undefined) {
      next.labelSize = ['small', 'medium'].includes(patch.labelSize) ? patch.labelSize : cur.labelSize;
    }
    if (patch.loanDurationDays !== undefined) {
      const n = Math.floor(Number(patch.loanDurationDays));
      next.loanDurationDays = (n >= 1 && n <= 3650) ? n : cur.loanDurationDays;
    }
    for (const k of ['labelShowPrice', 'labelShowShelf', 'labelShowMicrotext']) {
      if (patch[k] !== undefined) next[k] = !!patch[k];
    }
    this.db.settings = next;
    this._save();
    return { ...next };
  }

  /** Resolves a reference-number range (e.g. raf-0001..raf-0100) to books. */
  booksInReferenceRange(fromRef, toRef) {
    const num = (r) => {
      const m = /(\d+)\s*$/.exec((r || '').trim());
      return m ? parseInt(m[1], 10) : null;
    };
    const a = num(fromRef), b = num(toRef);
    if (a === null || b === null) return [];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return this.db.books
      .filter((bk) => { const n = num(bk.referenceNumber); return n !== null && n >= lo && n <= hi; })
      .sort((x, y) => num(x.referenceNumber) - num(y.referenceNumber));
  }

  getAll() {
    return this.db.books;
  }

  getMeta() {
    const authors = new Set();
    const publishers = new Set();
    const categories = new Set();
    const borrowers = new Set();
    const years = new Set();
    const series = new Set();
    const shelves = new Set();
    const keywords = new Set();
    for (const b of this.db.books) {
      if (b.author) authors.add(b.author.trim());
      if (b.publisher) publishers.add(b.publisher.trim());
      if (b.category) categories.add(b.category.trim());
      if (b.publishYear) years.add(b.publishYear.trim());
      if (b.series) series.add(b.series.trim());
      if (b.shelf) shelves.add(b.shelf.trim());
      for (const k of b.keywords || []) if (k) keywords.add(k.trim());
      for (const loan of b.loans || []) {
        if (loan.borrowerName) borrowers.add(loan.borrowerName.trim());
      }
    }
    const arSort = (a, c) => a.localeCompare(c, 'ar');
    return {
      authors: [...authors].sort(arSort),
      publishers: [...publishers].sort(arSort),
      categories: [...categories].sort(arSort),
      borrowers: [...borrowers].sort(arSort),
      years: [...years].sort(arSort),
      series: [...series].sort(arSort),
      shelves: [...shelves].sort(arSort),
      keywords: [...keywords].sort(arSort),
      filePath: this.filePath,
    };
  }

  // A reference counts toward the auto-sequence only if it matches رَفّ's own
  // canonical format exactly: "raf-" followed by digits. Imported numbers in a
  // different shape (e.g. "RAF-TEST-1000") are foreign and must NOT push the
  // counter forward — otherwise adding a book after such an import would skip
  // to raf-1001 while raf-0001 sits unused.
  _canonicalRefSeq(ref) {
    const m = /^raf-(\d+)$/.exec((ref || '').trim().toLowerCase());
    return m ? parseInt(m[1], 10) : null;
  }

  /** The set of canonical raf-NNNN sequence numbers currently in use. */
  _usedCanonicalSeqs() {
    const used = new Set();
    for (const b of this.db.books) {
      const n = this._canonicalRefSeq(b.referenceNumber);
      if (n !== null) used.add(n);
    }
    return used;
  }

  /** Lowest free canonical sequence number, starting from 1. */
  _lowestFreeSeq() {
    const used = this._usedCanonicalSeqs();
    let seq = 1;
    while (used.has(seq)) seq += 1;
    return seq;
  }

  _nextReferenceNumber() {
    const seq = this._lowestFreeSeq();
    return 'raf-' + String(seq).padStart(4, '0');
  }

  /**
   * Returns what the next auto reference number *would* be, without consuming
   * the sequence. Used to preview the number in the add form as the user types.
   */
  peekNextReferenceNumber() {
    return 'raf-' + String(this._lowestFreeSeq()).padStart(4, '0');
  }

  addBook(book, { keepReferenceNumber = false, defer = false } = {}) {
    const requested = (book.referenceNumber || '').trim();
    let referenceNumber;
    if (keepReferenceNumber && requested) {
      // Import path: keep the incoming number as-is (import de-dupes upstream).
      referenceNumber = requested;
    } else if (requested) {
      // Form path: the user typed or edited a reference. Honor it, but never
      // allow a duplicate to slip in.
      if (this.db.books.some((b) => b.referenceNumber === requested)) {
        return { ok: false, error: 'الرقم المرجعي مستخدم بالفعل' };
      }
      referenceNumber = requested;
    } else {
      referenceNumber = this._nextReferenceNumber();
    }

    const record = {
      id: genId(),
      title: (book.title || '').trim(),
      author: (book.author || '').trim(),
      publisher: (book.publisher || '').trim(),
      referenceNumber,
      category: (book.category || '').trim(),
      edition: (book.edition || '').trim(),
      publishYear: (book.publishYear || '').toString().trim(),
      copiesTotal: Number(book.copiesTotal) > 0 ? Number(book.copiesTotal) : 1,
      volumes: Number(book.volumes) > 0 ? Math.floor(Number(book.volumes)) : 1,
      price: sanitizePrice(book.price),
      ...normalizeInventoryFields(book),
      // Status is derived from this ledger; it is never stored.
      loans: Array.isArray(book.loans) ? book.loans : [],
      notes: (book.notes || '').trim(),
      language: (book.language || 'العربية').trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.db.books.unshift(record);
    // Bulk paths (import) defer the write; persisting the whole file once per
    // inserted book turns an import of N books into O(N^2) disk work.
    if (!defer) this._save();
    return record;
  }

  updateBook(id, patch) {
    const idx = this.db.books.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const current = this.db.books[idx];

    const safePatch = { ...patch };
    // The ledger is only ever changed through borrowCopy/returnLoan.
    delete safePatch.loans;
    delete safePatch.id;
    delete safePatch.status;
    delete safePatch.borrowerName;
    // Reference-number changes go through setReferenceNumber (uniqueness check).
    delete safePatch.referenceNumber;

    if (safePatch.copiesTotal !== undefined) {
      const requested = Number(safePatch.copiesTotal);
      // The floor is the highest number of copies any single volume has out
      // (full-copy loans count against every volume), so we never record fewer
      // copies than are physically on loan for some volume.
      let busiest = B.borrowedFullCopies(current);
      const vols = B.totalVolumes(current);
      for (let v = 1; v <= vols; v++) {
        const out = B.borrowedOfVolume(current, v);
        if (out > busiest) busiest = out;
      }
      safePatch.copiesTotal = Math.max(busiest || 1, requested > 0 ? requested : 1);
    }
    if (safePatch.volumes !== undefined) {
      let requested = Number(safePatch.volumes) > 0 ? Math.floor(Number(safePatch.volumes)) : 1;
      // Don't drop the volume count below the highest volume number currently
      // out on loan, or that loan would reference a volume that no longer exists.
      let maxVolOut = 1;
      for (const l of B.activeLoans(current)) {
        for (const volume of B.loanVolumes(l)) {
          if (volume > maxVolOut) maxVolOut = volume;
        }
      }
      safePatch.volumes = Math.max(requested, maxVolOut);
    }
    if (safePatch.price !== undefined) {
      safePatch.price = sanitizePrice(safePatch.price);
    }
    if (safePatch.keywords !== undefined) safePatch.keywords = sanitizeKeywords(safePatch.keywords);
    if (safePatch.condition !== undefined) safePatch.condition = sanitizeCondition(safePatch.condition);
    for (const f of ['series', 'seriesOrder', 'acquisition', 'shelf']) {
      if (safePatch[f] !== undefined) safePatch[f] = (safePatch[f] || '').toString().trim();
    }

    const updated = { ...current, ...safePatch, id: current.id, loans: current.loans, updatedAt: nowIso() };
    this.db.books[idx] = updated;
    this._save();
    return updated;
  }

  /**
   * Reference numbers must stay unique. Returns { ok, error?, book? } so the
   * UI can refuse a clash rather than silently create a duplicate.
   */
  setReferenceNumber(id, referenceNumber) {
    const ref = (referenceNumber || '').trim();
    if (!ref) return { ok: false, error: 'الرقم المرجعي لا يمكن أن يكون فارغاً' };
    const clash = this.db.books.find((b) => b.id !== id && b.referenceNumber === ref);
    if (clash) return { ok: false, error: 'هذا الرقم المرجعي مستخدم في كتاب آخر' };
    const book = this.db.books.find((b) => b.id === id);
    if (!book) return { ok: false, error: 'الكتاب غير موجود' };
    book.referenceNumber = ref;
    book.updatedAt = nowIso();
    this._save();
    return { ok: true, book };
  }

  /**
   * Lends either a whole copy (all volumes) or one/more selected volumes.
   * payload: { borrowerName, borrowedAt, scope: 'full'|'volume', volumes?, volume? }
   * `volume` remains accepted for compatibility with older renderer builds.
   * Returns { ok, error?, book? }.
   */
  borrowCopy(bookId, payload = {}) {
    const book = this.db.books.find((b) => b.id === bookId);
    if (!book) return { ok: false, error: 'الكتاب غير موجود' };

    const name = (payload.borrowerName || '').trim();
    if (!name) return { ok: false, error: 'اسم المستعير مطلوب' };

    const multi = B.isMultiVolume(book);
    const scope = (multi && payload.scope === 'volume') ? 'volume' : 'full';

    let volumes = [];
    if (scope === 'volume') {
      const rawVolumes = Array.isArray(payload.volumes) ? payload.volumes : [payload.volume];
      volumes = [...new Set(rawVolumes
        .map((v) => Math.floor(Number(v)))
        .filter((v) => Number.isFinite(v)))]
        .sort((a, b) => a - b);

      const totalVolumes = B.totalVolumes(book);
      if (volumes.length === 0) return { ok: false, error: 'اختر جزءًا واحدًا على الأقل' };
      const invalid = volumes.filter((v) => !(v >= 1 && v <= totalVolumes));
      if (invalid.length) return { ok: false, error: `أرقام الأجزاء يجب أن تكون بين 1 و ${totalVolumes}` };

      const unavailable = volumes.filter((v) => !B.canBorrowVolume(book, v));
      if (unavailable.length) {
        const label = unavailable.length === 1 ? `الجزء ${unavailable[0]}` : `الأجزاء ${unavailable.join('، ')}`;
        return { ok: false, error: `لا توجد نسخة متاحة من ${label}` };
      }
    } else if (!B.canBorrow(book)) {
      return { ok: false, error: 'لا توجد نسخة كاملة متاحة للإعارة' };
    }

    const when = payload.borrowedAt ? new Date(payload.borrowedAt) : new Date();
    if (isNaN(when.getTime())) return { ok: false, error: 'تاريخ الإعارة غير صالح' };
    if (when.getTime() > Date.now() + 86400000) return { ok: false, error: 'لا يمكن أن يكون تاريخ الإعارة في المستقبل' };

    // Due date defaults to the library's configured loan period after
    // borrowing (30 days out of the box), but can be set explicitly.
    let due;
    if (payload.dueAt) {
      due = new Date(payload.dueAt);
      if (isNaN(due.getTime())) return { ok: false, error: 'تاريخ الإرجاع غير صالح' };
      if (due.getTime() < when.getTime()) return { ok: false, error: 'تاريخ الإرجاع أسبق من تاريخ الإعارة' };
    } else {
      const days = this.getSettings().loanDurationDays || DEFAULT_LOAN_DAYS;
      due = new Date(when.getTime() + days * 86400000);
    }

    book.loans.push({
      id: genLoanId(),
      borrowerName: name,
      type: scope === 'volume' ? B.LOAN_VOLUME : B.LOAN_FULL,
      volumes: scope === 'volume' ? volumes : [],
      // Keep the legacy field only when exactly one part was selected.
      volume: scope === 'volume' && volumes.length === 1 ? volumes[0] : null,
      borrowedAt: when.toISOString(),
      dueAt: due.toISOString(),
      contact: (payload.contact || '').trim(),
      note: (payload.note || '').trim(),
      volumeReturns: {},
      returnedAt: null,
    });
    book.updatedAt = nowIso();
    this._save();
    return { ok: true, book };
  }

  /**
   * Returns all parts that are still outstanding on one loan. Kept as the
   * backwards-compatible whole-loan action used by older renderer builds.
   */
  returnLoan(bookId, loanId, returnedAt) {
    return this._returnLoanParts(bookId, loanId, null, returnedAt);
  }

  /** Returns one or several selected parts while leaving the rest open. */
  returnLoanParts(bookId, loanId, volumes, returnedAt) {
    return this._returnLoanParts(bookId, loanId, volumes, returnedAt);
  }

  _returnLoanParts(bookId, loanId, volumes, returnedAt) {
    const book = this.db.books.find((b) => b.id === bookId);
    if (!book) return { ok: false, error: 'الكتاب غير موجود' };
    const loan = (book.loans || []).find((l) => l.id === loanId);
    if (!loan || !B.isLoanActive(loan, book)) {
      return { ok: false, error: 'الإعارة غير موجودة أو أُرجعت بالكامل مسبقاً' };
    }

    const when = returnedAt ? new Date(returnedAt) : new Date();
    if (isNaN(when.getTime())) return { ok: false, error: 'تاريخ الإرجاع غير صالح' };
    if (when.getTime() < Date.parse(loan.borrowedAt)) {
      return { ok: false, error: 'تاريخ الإرجاع أسبق من تاريخ الإعارة' };
    }

    const outstanding = B.outstandingLoanVolumes(loan, book);
    let selected = volumes == null ? outstanding : [...new Set((Array.isArray(volumes) ? volumes : [volumes])
      .map((v) => Math.floor(Number(v)))
      .filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);

    if (selected.length === 0) return { ok: false, error: 'اختر جزءًا واحدًا على الأقل لإرجاعه' };
    const invalid = selected.filter((v) => !outstanding.includes(v));
    if (invalid.length) {
      const label = invalid.length === 1 ? `الجزء ${invalid[0]}` : `الأجزاء ${invalid.join('، ')}`;
      return { ok: false, error: `${label} غير موجودة ضمن الأجزاء المعارة حالياً أو أُرجعت مسبقاً` };
    }

    if (!loan.volumeReturns || typeof loan.volumeReturns !== 'object' || Array.isArray(loan.volumeReturns)) {
      loan.volumeReturns = {};
    }
    const stamp = when.toISOString();
    for (const volume of selected) loan.volumeReturns[String(volume)] = stamp;

    const remaining = B.outstandingLoanVolumes(loan, book);
    if (remaining.length === 0) {
      const returnTimes = Object.values(loan.volumeReturns)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));
      loan.returnedAt = new Date(returnTimes.length ? Math.max(...returnTimes) : when.getTime()).toISOString();
    } else {
      loan.returnedAt = null;
    }

    book.updatedAt = nowIso();
    this._save();
    return {
      ok: true,
      book,
      returnedVolumes: selected,
      remainingVolumes: remaining,
      completed: remaining.length === 0,
    };
  }

  removeBook(id) {
    const before = this.db.books.length;
    this.db.books = this.db.books.filter((b) => b.id !== id);
    this._save();
    return before !== this.db.books.length;
  }

  /**
   * Puts a previously deleted record back exactly as it was — same id,
   * same reference number, same timestamps — so an undo is a true undo
   * rather than a re-add under a new number.
   */
  restoreBook(book) {
    if (!book || !book.id) return null;
    if (this.db.books.some((b) => b.id === book.id)) return book;
    this.db.books.unshift(book);
    this._save();
    return book;
  }

  getStats() {
    const books = this.db.books;
    const byCategory = {};
    const byPublisher = {};
    let totalCopies = 0;
    let borrowedCopies = 0;
    let fullyBorrowed = 0;
    let partiallyBorrowed = 0;
    let activeBorrowers = new Set();
    let totalValue = 0;
    let pricedCopies = 0;
    let overdueLoans = 0;
    let dueSoonLoans = 0;
    let pricedTitles = 0;
    let multiVolumeTitles = 0;
    let completeRecords = 0;
    let topPriced = null;
    const now = Date.now();

    // Fields that make an inventory record "complete".
    const completenessFields = ['title', 'author', 'publisher', 'referenceNumber', 'category', 'publishYear'];

    for (const b of books) {
      const cat = b.category || 'غير مصنف';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      const pub = b.publisher || 'غير محدد';
      byPublisher[pub] = (byPublisher[pub] || 0) + 1;

      const copies = B.totalCopies(b);
      totalCopies += copies;
      const availFull = B.availableFullCopies(b);
      const out = copies - availFull;
      borrowedCopies += out;
      const status = B.bookStatus(b);
      if (status === B.STATUS_FULL) fullyBorrowed += 1;
      else if (status === B.STATUS_PARTIAL) partiallyBorrowed += 1;
      for (const name of B.currentBorrowers(b)) activeBorrowers.add(name);

      if (typeof b.price === 'number' && b.price > 0) {
        totalValue += b.price * copies;
        pricedCopies += copies;
        pricedTitles += 1;
        if (!topPriced || b.price > topPriced.price) topPriced = { id: b.id, title: b.title, price: b.price };
      }
      if (B.isMultiVolume(b)) multiVolumeTitles += 1;

      let filled = 0;
      for (const f of completenessFields) if ((b[f] || '').toString().trim()) filled += 1;
      if (filled === completenessFields.length) completeRecords += 1;

      for (const l of b.loans || []) {
        if (l.returnedAt) continue;
        if (B.isOverdue(l, DEFAULT_LOAN_DAYS, now)) overdueLoans += 1;
        else if (B.isDueSoon(l, 7, now)) dueSoonLoans += 1;
      }
    }

    const completeness = books.length ? Math.round((completeRecords / books.length) * 100) : 100;

    return {
      totalBooks: books.length,
      totalAuthors: new Set(books.map((b) => b.author).filter(Boolean)).size,
      totalPublishers: new Set(books.map((b) => b.publisher).filter(Boolean)).size,
      totalCategories: new Set(books.map((b) => b.category).filter(Boolean)).size,
      totalCopies,
      borrowedCopies,
      availableCopies: totalCopies - borrowedCopies,
      fullyBorrowed,
      partiallyBorrowed,
      activeBorrowers: activeBorrowers.size,
      totalValue: Math.round(totalValue * 100) / 100,
      pricedCopies,
      pricedTitles,
      overdueLoans,
      dueSoonLoans,
      multiVolumeTitles,
      completeness,
      completeRecords,
      topPriced,
      byCategory,
      byPublisher,
    };
  }

  exportJson(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.db, null, 2), 'utf-8');
  }

  exportCsv(filePath) {
    const headers = [
      'العنوان', 'المؤلف', 'دار النشر', 'الرقم المرجعي', 'المجال',
      'السلسلة', 'الترتيب في السلسلة', 'الرف', 'الكلمات المفتاحية', 'جهة الاقتناء', 'حالة النسخة',
      'الطبعة', 'سنة النشر', 'عدد الأجزاء', 'السعر', 'إجمالي النسخ', 'نسخ معارة', 'نسخ متاحة',
      'الحالة', 'المستعيرون الحاليون', 'ملاحظات',
    ];
    const rows = this.db.books.map((b) => [
      b.title, b.author, b.publisher, b.referenceNumber, b.category,
      b.series || '', b.seriesOrder || '', b.shelf || '', (b.keywords || []).join(' | '), b.acquisition || '', b.condition || '',
      b.edition, b.publishYear, b.volumes || 1, (b.price ?? ''),
      B.totalCopies(b), B.borrowedCopies(b), B.availableCopies(b),
      B.bookStatus(b), B.currentBorrowers(b).join(' | '), b.notes,
    ]);
    const escape = (v) => {
      const s = (v === undefined || v === null) ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers, ...rows].map((r) => r.map(escape).join(','));
    // BOM so Excel opens Arabic UTF-8 correctly.
    fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf-8');
  }

  exportTxt(filePath) {
    const lines = this.db.books.map((b, i) => {
      const open = B.activeLoans(b).map((l) =>
        `      - ${l.borrowerName} [${B.loanScopeLabel(l)}] (منذ ${B.loanDurationDays(l)} يوماً)`);
      return [
        `${i + 1}. ${b.title || 'بدون عنوان'}`,
        `   المؤلف: ${b.author || '—'}`,
        `   دار النشر: ${b.publisher || '—'}`,
        `   المجال/التصنيف: ${b.category || '—'}`,
        `   الرقم المرجعي: ${b.referenceNumber || '—'}`,
        `   الطبعة: ${b.edition || '—'}    سنة النشر: ${b.publishYear || '—'}`,
        `   عدد الأجزاء: ${b.volumes || 1}${typeof b.price === 'number' ? `    السعر: ${b.price}` : ''}`,
        `   النسخ: ${B.totalCopies(b)} (متاح: ${B.availableCopies(b)}، معار: ${B.borrowedCopies(b)})`,
        `   الحالة: ${B.bookStatus(b)}`,
        open.length ? '   الإعارات المفتوحة:' : null,
        ...(open.length ? open : []),
        b.notes ? `   ملاحظات: ${b.notes}` : null,
        '',
      ].filter((l) => l !== null).join('\n');
    });
    const header = `فهرس مكتبة رَفّ\nتاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}\nإجمالي الكتب: ${this.db.books.length}\n${'='.repeat(40)}\n\n`;
    fs.writeFileSync(filePath, header + lines.join('\n'), 'utf-8');
  }

  buildPrintableHtml() {
    const rows = this.db.books.map((b, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeXml(b.title)}</td>
        <td>${escapeXml(b.author)}</td>
        <td>${escapeXml(b.publisher)}</td>
        <td>${escapeXml(b.category)}</td>
        <td class="ltr">${escapeXml(b.referenceNumber)}</td>
        <td>${B.availableCopies(b)} / ${B.totalCopies(b)}</td>
        <td>${B.bookStatus(b)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; color: #23150a; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .sub { color: #6b5644; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ddc9a3; padding: 6px 8px; text-align: right; }
  th { background: #f5eddb; }
  .ltr { direction: ltr; text-align: left; font-family: monospace; }
</style></head>
<body>
  <h1>فهرس مكتبة رَفّ</h1>
  <div class="sub">تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} — إجمالي الكتب: ${this.db.books.length}</div>
  <table>
    <thead><tr><th>#</th><th>العنوان</th><th>المؤلف</th><th>دار النشر</th><th>المجال</th><th>الرقم المرجعي</th><th>متاح / الكل</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
  }

  importJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const incoming = Array.isArray(parsed) ? parsed : parsed.books;
    if (!Array.isArray(incoming)) throw new Error('صيغة الملف غير صالحة');

    // Safety net: snapshot the current data before merging anything in.
    let backup = null;
    try { backup = this.createBackup('before-import'); } catch (_) { /* ignore */ }

    const existingRefs = new Set(
      this.db.books.map((b) => b.referenceNumber).filter(Boolean)
    );
    let added = 0;
    let skipped = 0;

    for (const item of incoming) {
      if (item.referenceNumber && existingRefs.has(item.referenceNumber)) {
        skipped += 1;
        continue;
      }
      const record = this.addBook(item, { keepReferenceNumber: true, defer: true });
      const m = /(\d+)\s*$/.exec(record.referenceNumber || '');
      if (m) this.db.nextRefSeq = Math.max(this.db.nextRefSeq, parseInt(m[1], 10) + 1);
      if (record.referenceNumber) existingRefs.add(record.referenceNumber);
      added += 1;
    }
    this._save();
    return { added, skipped, backup };
  }

  resetAll() {
    // Never destroy everything without a recoverable snapshot first.
    let backup = null;
    try { backup = this.createBackup('before-reset'); } catch (_) { /* ignore */ }
    this.db = emptyDb();
    this._save();
    return { backup };
  }

  /**
   * Scans the library for problems worth flagging: overdue loans, incomplete
   * inventory records, and likely-duplicate titles. Read-only.
   */
  integrityCheck() {
    const books = this.db.books;
    const now = Date.now();

    // 1) Overdue loans.
    const overdue = [];
    for (const b of books) {
      for (const l of b.loans || []) {
        if (!l.returnedAt && B.isOverdue(l, DEFAULT_LOAN_DAYS, now)) {
          overdue.push({ bookId: b.id, title: b.title, borrower: l.borrowerName, days: B.loanDurationDays(l, now) });
        }
      }
    }

    // 2) Reference-number duplicates (should never happen, but verify).
    const refMap = new Map();
    for (const b of books) {
      if (!b.referenceNumber) continue;
      if (!refMap.has(b.referenceNumber)) refMap.set(b.referenceNumber, []);
      refMap.get(b.referenceNumber).push(b);
    }
    const duplicateRefs = [];
    for (const [ref, arr] of refMap) {
      if (arr.length > 1) duplicateRefs.push({ ref, count: arr.length, titles: arr.map((x) => x.title) });
    }

    // 3) Missing essential fields.
    const missing = [];
    for (const b of books) {
      const gaps = [];
      if (!b.title) gaps.push('العنوان');
      if (!b.author) gaps.push('المؤلف');
      if (!b.referenceNumber) gaps.push('الرقم المرجعي');
      if (!b.category) gaps.push('المجال');
      if (gaps.length) missing.push({ bookId: b.id, title: b.title || '(بدون عنوان)', gaps });
    }

    // 4) Likely-duplicate titles (same normalized title + author).
    const titleMap = new Map();
    for (const b of books) {
      const key = ((b.title || '') + '\u0000' + (b.author || '')).trim();
      if (!key) continue;
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key).push(b);
    }
    const possibleDuplicates = [];
    for (const [, arr] of titleMap) {
      if (arr.length > 1) possibleDuplicates.push({ title: arr[0].title, author: arr[0].author, count: arr.length });
    }

    return {
      totalBooks: books.length,
      overdue,
      duplicateRefs,
      missing,
      possibleDuplicates,
      healthy: overdue.length === 0 && duplicateRefs.length === 0 && missing.length === 0 && possibleDuplicates.length === 0,
    };
  }

  /** Exports only currently-overdue loans as a CSV. */
  exportOverdueCsv(filePath) {
    const now = Date.now();
    const headers = ['العنوان', 'الرقم المرجعي', 'المستعير', 'وسيلة التواصل', 'النطاق', 'تاريخ الإعارة', 'تاريخ الاستحقاق', 'أيام التأخير', 'ملاحظة'];
    const rows = [];
    for (const b of this.db.books) {
      for (const l of b.loans || []) {
        if (l.returnedAt || !B.isOverdue(l, DEFAULT_LOAN_DAYS, now)) continue;
        const overdueDays = l.dueAt ? Math.max(0, Math.ceil((now - Date.parse(l.dueAt)) / 86400000)) : B.loanDurationDays(l, now);
        rows.push([
          b.title, b.referenceNumber, l.borrowerName, l.contact || '',
          B.loanScopeLabel(l),
          l.borrowedAt ? new Date(l.borrowedAt).toLocaleDateString('ar-EG') : '',
          l.dueAt ? new Date(l.dueAt).toLocaleDateString('ar-EG') : '',
          overdueDays, l.note || '',
        ]);
      }
    }
    const escape = (v) => {
      const s = (v === undefined || v === null) ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers, ...rows].map((r) => r.map(escape).join(','));
    fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf-8');
    return { count: rows.length };
  }

  /**
   * Returns every currently-open loan flattened with its book and borrower
   * details, sorted with overdue loans first (then by how late they are).
   * Used by the loans view and the borrower PDF exports.
   */
  /**
   * Recomputes the due date of every currently-open loan as borrowedAt + days.
   * Used when the librarian chooses to apply a new loan period retroactively.
   * Returns how many loans were updated.
   */
  applyLoanDurationToOpenLoans(days) {
    const d = Math.max(1, Math.min(3650, Math.floor(Number(days) || 30)));
    let updated = 0;
    for (const b of this.db.books) {
      let touched = false;
      for (const l of b.loans || []) {
        if (l.returnedAt) continue;
        const start = Date.parse(l.borrowedAt) || Date.now();
        l.dueAt = new Date(start + d * 86400000).toISOString();
        updated += 1; touched = true;
      }
      if (touched) b.updatedAt = nowIso();
    }
    if (updated) this._save();
    return { updated };
  }

  getActiveLoans({ overdueOnly = false } = {}) {
    const now = Date.now();
    const out = [];
    for (const b of this.db.books) {
      for (const l of b.loans || []) {
        if (l.returnedAt) continue;
        const overdue = B.isOverdue(l, DEFAULT_LOAN_DAYS, now);
        if (overdueOnly && !overdue) continue;
        const overdueDays = overdue && l.dueAt
          ? Math.max(0, Math.ceil((now - Date.parse(l.dueAt)) / 86400000)) : 0;
        out.push({
          bookId: b.id,
          title: b.title,
          referenceNumber: b.referenceNumber,
          borrowerName: l.borrowerName || '',
          contact: l.contact || '',
          scope: B.outstandingScopeLabel(l, b),
          borrowedAt: l.borrowedAt || null,
          dueAt: l.dueAt || null,
          overdue,
          overdueDays,
          note: l.note || '',
        });
      }
    }
    // Overdue first, then most-overdue, then soonest due.
    out.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue && b.overdue) return b.overdueDays - a.overdueDays;
      return (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0);
    });
    return out;
  }
}

module.exports = Store;
