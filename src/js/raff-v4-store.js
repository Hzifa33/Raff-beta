'use strict';

/**
 * Raff 4 offline domain layer.
 *
 * The legacy 2.x store remains the compatibility source for the original
 * screens. This layer adds a normalized, fully-local model for records,
 * holdings, physical items, patrons, circulation, holds, policies, branches,
 * authorities, acquisitions, serials, inventory sessions, staff permissions,
 * audit history, saved searches, reading lists and a recoverable trash bin.
 * No method performs a network request.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAFF4_SCHEMA = 4;
const DAY = 86400000;

const ENTITY_NAMES = new Set([
  'patrons', 'holds', 'policies', 'branches', 'users', 'authorities',
  'acquisitions', 'serials', 'savedSearches', 'readingLists', 'notifications',
  'customFields', 'patronCategories', 'materialTypes', 'locations', 'transfers',
]);

function nowIso() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redact(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value, (key, current) => ['pinHash', 'pin', 'password', 'secret'].includes(key) ? undefined : current));
}
function asText(value, max = 500) { return (value ?? '').toString().trim().slice(0, max); }
function asNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function unique(arr) { return [...new Set((arr || []).filter(Boolean))]; }
function id(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
function normalizeArabic(value) {
  return asText(value, 5000)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ')
    .trim();
}
function digits(value) { return asText(value, 64).replace(/[^0-9Xx]/g, '').toUpperCase(); }
function isValidIsbn10(value) {
  const s = digits(value);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += (10 - i) * (s[i] === 'X' ? 10 : Number(s[i]));
  return sum % 11 === 0;
}
function isValidIsbn13(value) {
  const s = digits(value);
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPin(pin, stored) {
  if (!stored) return true;
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')); }
  catch (_) { return false; }
}
function safeDate(value, fallback = nowIso()) {
  const d = new Date(value || fallback);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
}
function enumValue(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }

function defaultBranch() {
  return {
    id: 'branch_main', code: 'MAIN', name: 'المكتبة الرئيسية', type: 'library',
    address: '', phone: '', notes: '', active: true, createdAt: nowIso(), updatedAt: nowIso(),
  };
}
function defaultPolicy() {
  return {
    id: 'policy_default', name: 'السياسة الافتراضية', patronCategoryId: 'patron_general',
    materialTypeId: 'material_book', branchId: '', loanDays: 30, graceDays: 0,
    maxItems: 5, maxRenewals: 2, allowHolds: true, allowRenewalWhenHeld: false,
    finePerDay: 0, maxFine: 0, closedWeekdays: [], active: true,
    createdAt: nowIso(), updatedAt: nowIso(),
  };
}
function defaultPatronCategory() {
  return { id: 'patron_general', name: 'قارئ', maxItems: 5, loanDays: 30, active: true, createdAt: nowIso(), updatedAt: nowIso() };
}
function defaultMaterialType() {
  return { id: 'material_book', name: 'كتاب', loanable: true, referenceOnly: false, active: true, createdAt: nowIso(), updatedAt: nowIso() };
}
function defaultAdmin() {
  return {
    id: 'user_admin', username: 'admin', displayName: 'مدير النظام', role: 'admin',
    permissions: ['*'], pinHash: '', active: true, createdAt: nowIso(), updatedAt: nowIso(),
  };
}
function emptyAdvanced() {
  const stamp = nowIso();
  return {
    schemaVersion: RAFF4_SCHEMA,
    createdAt: stamp,
    updatedAt: stamp,
    migratedFromLegacyAt: null,
    records: [], holdings: [], items: [], patrons: [], loans: [], holds: [],
    policies: [defaultPolicy()], branches: [defaultBranch()], users: [defaultAdmin()],
    authorities: [], acquisitions: [], serials: [], inventorySessions: [], transfers: [],
    savedSearches: [], readingLists: [], notifications: [], customFields: [],
    patronCategories: [defaultPatronCategory()], materialTypes: [defaultMaterialType()], locations: [],
    audit: [], trash: [],
    settings: {
      activeUserId: 'user_admin', activeBranchId: 'branch_main', workspace: 'researcher',
      interfaceDensity: 'comfortable', highContrast: false, fontScale: 1,
      enableFines: false, enableSerials: true, enableAcquisitions: true,
      enablePublisherMode: true, enableLocalOpac: true, requirePinOnSwitch: false,
      backupOnClose: false, backupEveryChanges: 25, changesSinceBackup: 0,
      retentionDays: 30, currency: 'EGP', institutionType: 'library',
      holidays: [], closedWeekdays: [],
    },
  };
}

class RaffV4Store {
  constructor(legacyStore) {
    this.legacy = legacyStore;
    this.ensure();
  }

  get a() { return this.legacy.db.raff4; }

  ensure() {
    if (!this.legacy.db.raff4 || typeof this.legacy.db.raff4 !== 'object') {
      this.legacy.db.raff4 = emptyAdvanced();
    }
    const a = this.legacy.db.raff4;
    const base = emptyAdvanced();
    for (const [key, value] of Object.entries(base)) {
      if (a[key] === undefined) a[key] = clone(value);
    }
    const arrayKeys = Object.keys(base).filter((k) => Array.isArray(base[k]));
    for (const k of arrayKeys) if (!Array.isArray(a[k])) a[k] = [];
    a.settings = { ...base.settings, ...(a.settings || {}) };
    a.schemaVersion = RAFF4_SCHEMA;
    this._ensureDefaults();
    this.syncLegacy({ audit: false });
    this._save(false);
  }

  _ensureDefaults() {
    const a = this.a;
    if (!a.branches.some((x) => x.id === 'branch_main')) a.branches.unshift(defaultBranch());
    if (!a.policies.some((x) => x.id === 'policy_default')) a.policies.unshift(defaultPolicy());
    if (!a.patronCategories.some((x) => x.id === 'patron_general')) a.patronCategories.unshift(defaultPatronCategory());
    if (!a.materialTypes.some((x) => x.id === 'material_book')) a.materialTypes.unshift(defaultMaterialType());
    if (!a.users.some((x) => x.id === 'user_admin')) a.users.unshift(defaultAdmin());
    if (!a.settings.activeUserId || !a.users.some((u) => u.id === a.settings.activeUserId)) a.settings.activeUserId = 'user_admin';
    if (!a.settings.activeBranchId || !a.branches.some((b) => b.id === a.settings.activeBranchId)) a.settings.activeBranchId = 'branch_main';
  }

  _save(countChange = true) {
    this.a.updatedAt = nowIso();
    if (countChange) {
      this.a.settings.changesSinceBackup = asNumber(this.a.settings.changesSinceBackup, 0, 0) + 1;
      const every = asNumber(this.a.settings.backupEveryChanges, 25, 0, 100000);
      if (every && this.a.settings.changesSinceBackup >= every) {
        try { this.legacy.createBackup('automatic-v4'); this.a.settings.changesSinceBackup = 0; } catch (_) {}
      }
    }
    this.legacy._save();
  }

  _activeUser() {
    return this.a.users.find((u) => u.id === this.a.settings.activeUserId) || this.a.users[0] || defaultAdmin();
  }

  _rolePermissions(role) {
    const map = {
      admin: ['*'], librarian: ['*'],
      cataloger: ['records:*', 'items:*', 'authorities:*', 'exchange:*', 'reports:view'],
      circulation: ['patrons:view', 'patrons:update', 'circulation:*', 'holds:*', 'records:view', 'items:view'],
      inventory: ['inventory:*', 'records:view', 'items:view', 'reports:view'],
      viewer: ['records:view', 'opac:view', 'readingLists:*', 'savedSearches:*'],
      publisher: ['records:*', 'items:*', 'acquisitions:*', 'publisher:*', 'reports:view', 'exchange:export'],
    };
    return map[role] || map.viewer;
  }

  _can(permission) {
    const user = this._activeUser();
    const grants = unique([...(user.permissions || []), ...this._rolePermissions(user.role)]);
    if (grants.includes('*') || grants.includes(permission)) return true;
    const [scope] = String(permission).split(':');
    return grants.includes(`${scope}:*`);
  }

  _assertPermission(permission) {
    if (!this._can(permission)) throw new Error('لا يملك المستخدم الحالي صلاحية تنفيذ هذه العملية');
  }

  _audit(action, entity, entityId, summary, before = null, after = null, metadata = {}) {
    const user = this._activeUser();
    this.a.audit.unshift({
      id: id('audit'), at: nowIso(), userId: user.id, userName: user.displayName,
      action, entity, entityId: entityId || '', summary: asText(summary, 500),
      before: before == null ? null : redact(before), after: after == null ? null : redact(after), metadata: redact(metadata || {}),
    });
    if (this.a.audit.length > 10000) this.a.audit.length = 10000;
  }

  _membershipNumber() {
    const used = new Set(this.a.patrons.map((p) => p.membershipNumber));
    let n = 1;
    while (used.has(`P-${String(n).padStart(5, '0')}`)) n += 1;
    return `P-${String(n).padStart(5, '0')}`;
  }

  _recordForLegacy(bookId) { return this.a.records.find((r) => r.legacyBookId === bookId && !r.deletedAt); }
  _holdingForRecord(recordId) { return this.a.holdings.find((h) => h.recordId === recordId && !h.deletedAt); }
  _itemsForRecord(recordId) { return this.a.items.filter((i) => i.recordId === recordId && !i.deletedAt && !i.archived); }
  _patronByLegacyName(name) {
    const key = normalizeArabic(name);
    return this.a.patrons.find((p) => normalizeArabic(p.name) === key && !p.deletedAt);
  }

  syncLegacy({ audit = false } = {}) {
    const a = this.a;
    const books = this.legacy.db.books || [];
    const liveBookIds = new Set(books.map((b) => b.id));
    let createdRecords = 0;
    let createdItems = 0;
    let createdPatrons = 0;
    let createdLoans = 0;

    for (const book of books) {
      let record = this._recordForLegacy(book.id);
      if (!record) {
        record = {
          id: id('rec'), legacyBookId: book.id, title: book.title || '', subtitle: '',
          contributors: book.author ? [{ name: book.author, role: 'مؤلف' }] : [],
          author: book.author || '', publisher: book.publisher || '', publicationPlace: '',
          publishYear: book.publishYear || '', edition: book.edition || '', language: 'العربية',
          isbn10: '', isbn13: '', issn: '', materialTypeId: 'material_book',
          category: book.category || '', subjects: unique(book.keywords || []), summary: '',
          series: book.series || '', seriesOrder: book.seriesOrder || '', pageCount: '', dimensions: '',
          coverType: '', audience: '', coverDataUrl: '', digitalFiles: [], customFields: {},
          referenceNumber: book.referenceNumber || '', createdAt: book.createdAt || nowIso(), updatedAt: book.updatedAt || nowIso(),
        };
        a.records.push(record); createdRecords += 1;
      } else {
        record.title = book.title || record.title || '';
        record.author = book.author || record.author || '';
        if (book.author && (!record.contributors || !record.contributors.length)) record.contributors = [{ name: book.author, role: 'مؤلف' }];
        record.publisher = book.publisher || record.publisher || '';
        record.publishYear = book.publishYear || record.publishYear || '';
        record.edition = book.edition || record.edition || '';
        record.category = book.category || record.category || '';
        record.series = book.series || record.series || '';
        record.seriesOrder = book.seriesOrder || record.seriesOrder || '';
        record.referenceNumber = book.referenceNumber || record.referenceNumber || '';
        record.subjects = unique([...(record.subjects || []), ...(book.keywords || [])]);
        record.updatedAt = book.updatedAt || record.updatedAt || nowIso();
      }

      let holding = this._holdingForRecord(record.id);
      if (!holding) {
        holding = {
          id: id('holdg'), recordId: record.id, branchId: a.settings.activeBranchId || 'branch_main',
          locationId: '', room: '', section: book.category || '', shelf: book.shelf || '',
          callNumber: book.referenceNumber || '', circulationPolicyId: 'policy_default',
          notes: '', createdAt: nowIso(), updatedAt: nowIso(),
        };
        a.holdings.push(holding);
      } else {
        holding.shelf = book.shelf || holding.shelf || '';
        holding.section = book.category || holding.section || '';
        holding.callNumber = book.referenceNumber || holding.callNumber || '';
      }

      const totalCopies = Math.max(1, Math.floor(Number(book.copiesTotal) || 1));
      const volumes = Math.max(1, Math.floor(Number(book.volumes) || 1));
      const wantedKeys = new Set();
      for (let c = 1; c <= totalCopies; c += 1) {
        for (let v = 1; v <= volumes; v += 1) {
          const key = `${c}:${v}`; wantedKeys.add(key);
          let item = a.items.find((x) => x.legacyBookId === book.id && x.copyNumber === c && x.volumeNumber === v && !x.deletedAt);
          if (!item) {
            const baseRef = (book.referenceNumber || `raff-${book.id}`).replace(/\s+/g, '');
            item = {
              id: id('item'), recordId: record.id, holdingId: holding.id, legacyBookId: book.id,
              copyNumber: c, volumeNumber: v,
              barcode: volumes > 1 ? `${baseRef}-C${String(c).padStart(2, '0')}-V${String(v).padStart(2, '0')}` : `${baseRef}-C${String(c).padStart(2, '0')}`,
              status: 'available', condition: book.condition || 'جيدة', acquisitionSource: book.acquisition || '',
              acquiredAt: book.createdAt || nowIso(), price: typeof book.price === 'number' ? book.price : null,
              notes: '', archived: false, createdAt: nowIso(), updatedAt: nowIso(),
            };
            a.items.push(item); createdItems += 1;
          } else {
            item.recordId = record.id;
            if (!item.holdingId || !a.holdings.some((h) => h.id === item.holdingId && !h.deletedAt)) item.holdingId = holding.id;
            item.archived = false;
            item.condition = item.condition || book.condition || 'جيدة';
            item.acquisitionSource = item.acquisitionSource || book.acquisition || '';
          }
        }
      }
      for (const item of a.items.filter((x) => x.legacyBookId === book.id && !x.deletedAt)) {
        item.archived = !wantedKeys.has(`${item.copyNumber}:${item.volumeNumber}`);
      }

      // Rebuild/augment patrons and normalized loans from the legacy ledger.
      for (const legacyLoan of book.loans || []) {
        let patron = this._patronByLegacyName(legacyLoan.borrowerName || 'غير معروف');
        if (!patron) {
          patron = {
            id: id('pat'), membershipNumber: this._membershipNumber(), name: legacyLoan.borrowerName || 'غير معروف',
            phone: legacyLoan.contact || '', email: '', address: '', organization: '', guardianName: '',
            categoryId: 'patron_general', status: 'active', expiresAt: null, notes: '', privacyConsent: false,
            createdAt: legacyLoan.borrowedAt || nowIso(), updatedAt: nowIso(),
          };
          a.patrons.push(patron); createdPatrons += 1;
        }
        let loan = a.loans.find((x) => x.legacyBookId === book.id && x.legacyLoanId === legacyLoan.id);
        if (!loan) {
          const volumesInLoan = legacyLoan.type === 'volume'
            ? unique((legacyLoan.volumes || (legacyLoan.volume ? [legacyLoan.volume] : [])).map(Number))
            : Array.from({ length: volumes }, (_, i) => i + 1);
          const alreadyUsed = new Set(a.loans.filter((x) => x.legacyBookId === book.id && !x.returnedAt).flatMap((x) => x.itemIds || []));
          const selected = [];
          for (const vol of volumesInLoan) {
            const candidate = a.items.find((x) => x.legacyBookId === book.id && x.volumeNumber === vol && !x.archived && !x.deletedAt && !alreadyUsed.has(x.id));
            if (candidate) { selected.push(candidate.id); alreadyUsed.add(candidate.id); }
          }
          loan = {
            id: id('loan'), legacyBookId: book.id, legacyLoanId: legacyLoan.id,
            patronId: patron.id, itemIds: selected, checkedOutAt: legacyLoan.borrowedAt || nowIso(),
            dueAt: legacyLoan.dueAt || new Date(Date.now() + 30 * DAY).toISOString(),
            returnedItemIds: [], returnedItemDates: {}, returnedAt: legacyLoan.returnedAt || null,
            renewalCount: 0, contactSnapshot: legacyLoan.contact || '', note: legacyLoan.note || '',
            overrideReason: '', createdAt: legacyLoan.borrowedAt || nowIso(), updatedAt: nowIso(),
          };
          a.loans.push(loan); createdLoans += 1;
        }
        loan.patronId = patron.id;
        loan.checkedOutAt = legacyLoan.borrowedAt || loan.checkedOutAt;
        loan.dueAt = legacyLoan.dueAt || loan.dueAt;
        loan.returnedAt = legacyLoan.returnedAt || null;
        loan.note = legacyLoan.note || loan.note || '';
        loan.contactSnapshot = legacyLoan.contact || loan.contactSnapshot || '';
        const volumeReturns = legacyLoan.volumeReturns || {};
        for (const itemId of loan.itemIds || []) {
          const item = a.items.find((i) => i.id === itemId);
          if (!item) continue;
          const returnedAt = volumeReturns[String(item.volumeNumber)] || legacyLoan.returnedAt || null;
          if (returnedAt) {
            if (!loan.returnedItemIds.includes(itemId)) loan.returnedItemIds.push(itemId);
            loan.returnedItemDates[itemId] = returnedAt;
          }
        }
      }
    }

    for (const rec of a.records) {
      if (rec.legacyBookId && !liveBookIds.has(rec.legacyBookId) && !rec.deletedAt) {
        rec.deletedAt = nowIso();
        for (const item of a.items.filter((i) => i.recordId === rec.id)) item.deletedAt = rec.deletedAt;
        for (const h of a.holdings.filter((x) => x.recordId === rec.id)) h.deletedAt = rec.deletedAt;
      }
    }

    this._refreshItemStatuses();
    if (!a.migratedFromLegacyAt) a.migratedFromLegacyAt = nowIso();
    if (audit && (createdRecords || createdItems || createdPatrons || createdLoans)) {
      this._audit('sync', 'system', '', 'مزامنة بيانات الإصدار السابق مع نموذج رَفّ 4', null, { createdRecords, createdItems, createdPatrons, createdLoans });
    }
    return { createdRecords, createdItems, createdPatrons, createdLoans };
  }

  _refreshItemStatuses() {
    const activeByItem = new Map();
    for (const loan of this.a.loans.filter((l) => !l.returnedAt)) {
      for (const itemId of loan.itemIds || []) {
        if (!(loan.returnedItemIds || []).includes(itemId)) activeByItem.set(itemId, loan);
      }
    }
    const heldRecordIds = new Set(this.a.holds.filter((h) => ['waiting', 'ready'].includes(h.status)).map((h) => h.recordId));
    for (const item of this.a.items) {
      if (item.deletedAt || item.archived) continue;
      if (['lost', 'damaged', 'maintenance', 'withdrawn', 'in_transit'].includes(item.status)) continue;
      item.status = activeByItem.has(item.id) ? 'on_loan' : (heldRecordIds.has(item.recordId) ? 'reserved' : 'available');
    }
  }

  _stats() {
    const a = this.a;
    const records = a.records.filter((x) => !x.deletedAt);
    const items = a.items.filter((x) => !x.deletedAt && !x.archived);
    const patrons = a.patrons.filter((x) => !x.deletedAt);
    const loans = a.loans;
    const openLoans = loans.filter((x) => !x.returnedAt);
    const now = Date.now();
    const overdue = openLoans.filter((x) => Date.parse(x.dueAt) < now);
    const activeHolds = a.holds.filter((x) => ['waiting', 'ready'].includes(x.status));
    const value = items.reduce((s, x) => s + (Number(x.price) || 0), 0);
    const incomplete = records.filter((r) => !r.title || !(r.author || (r.contributors || []).length) || !r.publisher || !r.referenceNumber).length;
    const byBranch = {};
    for (const item of items) {
      const h = a.holdings.find((x) => x.id === item.holdingId);
      const branch = a.branches.find((x) => x.id === h?.branchId)?.name || 'غير محدد';
      byBranch[branch] = (byBranch[branch] || 0) + 1;
    }
    return {
      records: records.length, items: items.length, availableItems: items.filter((x) => x.status === 'available').length,
      loanedItems: items.filter((x) => x.status === 'on_loan').length, patrons: patrons.length,
      activePatrons: patrons.filter((x) => x.status === 'active').length, openLoans: openLoans.length,
      overdue: overdue.length, holds: activeHolds.length, branches: a.branches.filter((x) => x.active !== false && !x.deletedAt).length,
      inventorySessions: a.inventorySessions.filter((x) => x.status === 'open').length,
      acquisitionsOpen: a.acquisitions.filter((x) => !['received', 'cancelled'].includes(x.status) && !x.deletedAt).length,
      serialsActive: a.serials.filter((x) => x.active !== false && !x.deletedAt).length,
      collectionValue: Math.round(value * 100) / 100,
      completeness: records.length ? Math.round(((records.length - incomplete) / records.length) * 100) : 100,
      byBranch,
    };
  }

  snapshot() {
    this.syncLegacy({ audit: false });
    this.refreshNotifications();
    const safe = redact({ ...this.a, stats: this._stats(), isbn: { offlineOnly: true } });
    safe.users = this.a.users.map((u) => ({ ...redact(u), hasPin: !!u.pinHash }));

    // The renderer receives only the collections needed by the active local
    // role.  This is not a substitute for operating-system account security,
    // but it prevents researcher/cataloging workspaces from exposing patron
    // contact data or administrative history by accident.
    if (!this._can('patrons:view') && !this._can('patrons:update') && !this._can('circulation:*')) safe.patrons = [];
    if (!this._can('circulation:*')) safe.loans = [];
    if (!this._can('holds:*')) safe.holds = [];
    if (!this._can('inventory:*')) safe.inventorySessions = [];
    if (!this._can('transfers:*')) safe.transfers = [];
    if (!this._can('acquisitions:*') && !this._can('publisher:*')) safe.acquisitions = [];
    if (!this._can('serials:*')) safe.serials = [];
    if (!this._can('authorities:*')) safe.authorities = [];
    if (!this._can('reports:view') && !this._can('audit:*')) safe.audit = [];
    if (!this._can('trash:*')) safe.trash = [];
    if (!this._can('users:*')) safe.users = safe.users.filter((u) => u.id === this.a.settings.activeUserId);
    if (!this._can('circulation:*') && !this._can('holds:*') && !this._can('acquisitions:*') && !this._can('serials:*') && !this._can('transfers:*')) safe.notifications = [];
    if (this._activeUser().role === 'viewer') safe.readingLists = safe.readingLists.filter((x) => x.publicInOpac !== false).map((x) => ({ ...x, patronId: '' }));
    return safe;
  }

  getEntity(entity) {
    if (!ENTITY_NAMES.has(entity)) throw new Error('نوع السجل غير مسموح');
    const rows = this.a[entity].filter((x) => !x.deletedAt);
    if (entity === 'users') return rows.map((u) => ({ ...redact(u), hasPin: !!u.pinHash }));
    return redact(rows);
  }

  _cleanEntity(entity, payload, existing = {}) {
    const stamp = nowIso();
    const base = { ...existing, ...clone(payload || {}) };
    delete base.id; delete base.createdAt; delete base.updatedAt; delete base.deletedAt; delete base.pinHash;
    const common = { ...existing, ...base, updatedAt: stamp };
    if (!existing.id) { common.id = id(entity.slice(0, 4)); common.createdAt = stamp; }

    if (entity === 'patrons') {
      common.membershipNumber = asText(base.membershipNumber || existing.membershipNumber || this._membershipNumber(), 40);
      common.name = asText(base.name, 180); if (!common.name) throw new Error('اسم المستعير مطلوب');
      common.phone = asText(base.phone, 60); common.email = asText(base.email, 160);
      common.address = asText(base.address, 500); common.organization = asText(base.organization, 180);
      common.guardianName = asText(base.guardianName, 180); common.notes = asText(base.notes, 2000);
      common.categoryId = asText(base.categoryId || 'patron_general', 80);
      common.status = enumValue(base.status, ['active', 'suspended', 'expired'], 'active');
      common.expiresAt = base.expiresAt ? safeDate(base.expiresAt) : null;
      common.privacyConsent = !!base.privacyConsent;
      common.customFields = clone(base.customFields || existing.customFields || {});
    } else if (entity === 'policies') {
      common.name = asText(base.name, 160); if (!common.name) throw new Error('اسم السياسة مطلوب');
      common.patronCategoryId = asText(base.patronCategoryId, 80); common.materialTypeId = asText(base.materialTypeId, 80);
      common.branchId = asText(base.branchId, 80); common.loanDays = asNumber(base.loanDays, 30, 1, 3650);
      common.graceDays = asNumber(base.graceDays, 0, 0, 365); common.maxItems = asNumber(base.maxItems, 5, 1, 999);
      common.maxRenewals = asNumber(base.maxRenewals, 2, 0, 99); common.allowHolds = base.allowHolds !== false;
      common.allowRenewalWhenHeld = !!base.allowRenewalWhenHeld; common.finePerDay = asNumber(base.finePerDay, 0, 0, 1000000);
      common.maxFine = asNumber(base.maxFine, 0, 0, 100000000); common.closedWeekdays = unique(base.closedWeekdays || []);
      common.active = base.active !== false;
    } else if (entity === 'branches') {
      common.name = asText(base.name, 160); if (!common.name) throw new Error('اسم الفرع مطلوب');
      common.code = asText(base.code || common.name.slice(0, 4).toUpperCase(), 24);
      common.type = enumValue(base.type, ['library', 'publisher', 'warehouse', 'reading_room'], 'library');
      common.address = asText(base.address, 500); common.phone = asText(base.phone, 60); common.notes = asText(base.notes, 1000);
      common.active = base.active !== false;
    } else if (entity === 'users') {
      common.username = asText(base.username, 80); common.displayName = asText(base.displayName, 160);
      if (!common.username || !common.displayName) throw new Error('اسم الدخول والاسم الظاهر مطلوبان');
      common.role = enumValue(base.role, ['admin', 'librarian', 'cataloger', 'circulation', 'inventory', 'viewer', 'publisher'], 'viewer');
      common.permissions = Array.isArray(base.permissions) ? unique(base.permissions.map((x) => asText(x, 80))) : (existing.permissions || []);
      common.active = base.active !== false;
      common.pinHash = existing.pinHash || '';
      if (base.pin !== undefined && asText(base.pin, 64)) common.pinHash = hashPin(base.pin);
    } else if (entity === 'authorities') {
      common.type = enumValue(base.type, ['person', 'corporate', 'subject', 'publisher', 'series', 'place'], 'person');
      common.preferred = asText(base.preferred, 240); if (!common.preferred) throw new Error('الشكل المعتمد مطلوب');
      common.variants = unique((base.variants || []).map((x) => asText(x, 240)));
      common.birthYear = asText(base.birthYear, 12); common.deathYear = asText(base.deathYear, 12);
      common.country = asText(base.country, 120); common.notes = asText(base.notes, 1500);
    } else if (entity === 'acquisitions') {
      common.title = asText(base.title, 240); if (!common.title) throw new Error('عنوان الطلب مطلوب');
      common.vendor = asText(base.vendor, 180); common.requestedBy = asText(base.requestedBy, 180);
      common.branchId = asText(base.branchId || this.a.settings.activeBranchId, 80);
      common.status = enumValue(base.status, ['requested', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'], 'requested');
      common.quantity = asNumber(base.quantity, 1, 1, 100000); common.unitPrice = asNumber(base.unitPrice, 0, 0, 100000000);
      common.budget = asText(base.budget, 120); common.invoiceNumber = asText(base.invoiceNumber, 120);
      common.expectedAt = base.expectedAt ? safeDate(base.expectedAt) : null; common.notes = asText(base.notes, 2000);
      common.customFields = clone(base.customFields || existing.customFields || {});
    } else if (entity === 'serials') {
      common.title = asText(base.title, 240); if (!common.title) throw new Error('اسم الدورية مطلوب');
      common.issn = asText(base.issn, 32); common.frequency = enumValue(base.frequency, ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'irregular'], 'monthly');
      common.vendor = asText(base.vendor, 180); common.startAt = base.startAt ? safeDate(base.startAt) : null;
      common.endAt = base.endAt ? safeDate(base.endAt) : null; common.lastIssue = asText(base.lastIssue, 120);
      common.nextExpectedAt = base.nextExpectedAt ? safeDate(base.nextExpectedAt) : null;
      common.missingIssues = unique((base.missingIssues || []).map((x) => asText(x, 120)));
      common.active = base.active !== false; common.notes = asText(base.notes, 2000);
    } else if (entity === 'transfers') {
      common.fromBranchId = asText(base.fromBranchId || this.a.settings.activeBranchId, 80);
      common.toBranchId = asText(base.toBranchId, 80);
      common.itemIds = unique(base.itemIds || []);
      if (!common.toBranchId || common.toBranchId === common.fromBranchId) throw new Error('اختر فرع وجهة مختلفًا');
      if (!common.itemIds.length) throw new Error('اختر نسخة واحدة على الأقل للنقل');
      common.status = enumValue(base.status, ['draft', 'in_transit', 'received', 'cancelled'], 'draft');
      common.sentAt = base.sentAt ? safeDate(base.sentAt) : null;
      common.receivedAt = base.receivedAt ? safeDate(base.receivedAt) : null;
      common.notes = asText(base.notes, 1600);
    } else if (entity === 'savedSearches') {
      common.name = asText(base.name, 160); common.query = asText(base.query, 1000);
      common.filters = clone(base.filters || {}); common.pinned = !!base.pinned;
    } else if (entity === 'readingLists') {
      common.name = asText(base.name, 160); if (!common.name) throw new Error('اسم القائمة مطلوب');
      common.description = asText(base.description, 1000); common.recordIds = unique(base.recordIds || []);
      common.patronId = asText(base.patronId, 80); common.publicInOpac = base.publicInOpac !== false;
    } else if (entity === 'notifications') {
      common.type = asText(base.type || 'info', 40); common.title = asText(base.title, 180);
      common.message = asText(base.message, 2000); common.read = !!base.read; common.relatedId = asText(base.relatedId, 80);
    } else if (entity === 'customFields') {
      common.scope = enumValue(base.scope, ['record', 'item', 'patron', 'acquisition'], 'record'); common.key = asText(base.key, 80);
      common.label = asText(base.label, 160); common.type = enumValue(base.type, ['text', 'number', 'date', 'select', 'boolean'], 'text');
      if (!common.label) throw new Error('اسم الحقل المخصص مطلوب');
      if (!/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(common.key)) throw new Error('المفتاح التقني يجب أن يبدأ بحرف لاتيني ويحتوي على حروف وأرقام وشرطة سفلية فقط');
      common.options = unique((base.options || []).map((x) => asText(x, 120))); common.required = !!base.required; common.active = base.active !== false;
      if (common.type === 'select' && !common.options.length) throw new Error('أضف خيارًا واحدًا على الأقل لحقل القائمة');
    } else if (entity === 'patronCategories' || entity === 'materialTypes' || entity === 'locations') {
      common.name = asText(base.name, 160); if (!common.name) throw new Error('الاسم مطلوب');
      common.code = asText(base.code, 40); common.active = base.active !== false;
      if (entity === 'patronCategories') { common.maxItems = asNumber(base.maxItems, 5, 1, 999); common.loanDays = asNumber(base.loanDays, 30, 1, 3650); }
      if (entity === 'materialTypes') { common.loanable = base.loanable !== false; common.referenceOnly = !!base.referenceOnly; }
      if (entity === 'locations') { common.branchId = asText(base.branchId || this.a.settings.activeBranchId, 80); common.room = asText(base.room, 120); common.shelf = asText(base.shelf, 120); }
    } else if (entity === 'holds') {
      common.recordId = asText(base.recordId, 80); common.patronId = asText(base.patronId, 80);
      if (!common.recordId || !common.patronId) throw new Error('الكتاب والمستعير مطلوبان');
      common.branchId = asText(base.branchId || this.a.settings.activeBranchId, 80);
      common.status = enumValue(base.status, ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'], 'waiting');
      common.position = asNumber(base.position, this.a.holds.filter((h) => h.recordId === common.recordId && h.status === 'waiting').length + 1, 1, 100000);
      common.expiresAt = base.expiresAt ? safeDate(base.expiresAt) : null; common.notes = asText(base.notes, 1000);
    }
    return common;
  }

  createEntity(entity, payload) {
    this._assertPermission(entity === 'holds' ? 'holds:*' : entity === 'patrons' ? 'patrons:update' : `${entity}:*`);
    if (!ENTITY_NAMES.has(entity)) throw new Error('نوع السجل غير مسموح');
    const record = this._cleanEntity(entity, payload, {});
    if (entity === 'patrons' && this.a.patrons.some((p) => p.membershipNumber === record.membershipNumber && !p.deletedAt)) throw new Error('رقم العضوية مستخدم بالفعل');
    if (entity === 'users' && this.a.users.some((u) => normalizeArabic(u.username) === normalizeArabic(record.username) && !u.deletedAt)) throw new Error('اسم الدخول مستخدم بالفعل');
    if (entity === 'customFields' && this.a.customFields.some((f) => f.scope === record.scope && f.key === record.key && !f.deletedAt)) throw new Error('مفتاح الحقل مستخدم بالفعل في هذا النطاق');
    this.a[entity].unshift(record);
    this._audit('create', entity, record.id, `إنشاء ${entity}`, null, record);
    this._save();
    return clone(record);
  }

  updateEntity(entity, entityId, patch) {
    this._assertPermission(entity === 'holds' ? 'holds:*' : entity === 'patrons' ? 'patrons:update' : `${entity}:*`);
    if (!ENTITY_NAMES.has(entity)) throw new Error('نوع السجل غير مسموح');
    const index = this.a[entity].findIndex((x) => x.id === entityId && !x.deletedAt);
    if (index < 0) throw new Error('السجل غير موجود');
    const before = clone(this.a[entity][index]);
    const after = this._cleanEntity(entity, patch, this.a[entity][index]);
    if (entity === 'customFields' && this.a.customFields.some((f) => f.id !== entityId && f.scope === after.scope && f.key === after.key && !f.deletedAt)) throw new Error('مفتاح الحقل مستخدم بالفعل في هذا النطاق');
    this.a[entity][index] = after;
    this._audit('update', entity, entityId, `تعديل ${entity}`, before, after);
    this._save();
    return clone(after);
  }

  deleteEntity(entity, entityId, reason = '') {
    this._assertPermission(entity === 'holds' ? 'holds:*' : entity === 'patrons' ? 'patrons:update' : `${entity}:*`);
    if (!ENTITY_NAMES.has(entity)) throw new Error('نوع السجل غير مسموح');
    if (['branches', 'users'].includes(entity) && entityId === (entity === 'branches' ? 'branch_main' : 'user_admin')) throw new Error('لا يمكن حذف السجل الافتراضي');
    const record = this.a[entity].find((x) => x.id === entityId && !x.deletedAt);
    if (!record) throw new Error('السجل غير موجود');
    const before = clone(record); record.deletedAt = nowIso(); record.updatedAt = nowIso();
    const trash = { id: id('trash'), entity, entityId, snapshot: before, reason: asText(reason, 500), deletedAt: record.deletedAt, deletedBy: this._activeUser().id };
    this.a.trash.unshift(trash);
    this._audit('delete', entity, entityId, `نقل ${entity} إلى سلة المحذوفات`, before, null, { reason });
    this._save();
    return clone(trash);
  }

  restoreTrash(trashId) {
    this._assertPermission('trash:*');
    const trash = this.a.trash.find((x) => x.id === trashId && !x.restoredAt);
    if (!trash) throw new Error('العنصر غير موجود في السلة');
    const collection = this.a[trash.entity];
    if (!Array.isArray(collection)) throw new Error('نوع العنصر غير صالح');
    const current = collection.find((x) => x.id === trash.entityId);
    if (current) Object.assign(current, clone(trash.snapshot), { deletedAt: null, updatedAt: nowIso() });
    else collection.unshift({ ...clone(trash.snapshot), deletedAt: null, updatedAt: nowIso() });
    trash.restoredAt = nowIso();
    this._audit('restore', trash.entity, trash.entityId, 'استعادة عنصر من سلة المحذوفات', null, trash.snapshot);
    this._save();
    return true;
  }

  purgeTrash(trashId) {
    this._assertPermission('trash:*');
    const index = this.a.trash.findIndex((x) => x.id === trashId);
    if (index < 0) throw new Error('العنصر غير موجود');
    const trash = this.a.trash[index];
    if (Array.isArray(this.a[trash.entity])) this.a[trash.entity] = this.a[trash.entity].filter((x) => x.id !== trash.entityId);
    this.a.trash.splice(index, 1);
    this._audit('purge', trash.entity, trash.entityId, 'حذف نهائي من السلة');
    this._save();
    return true;
  }

  createRecord(payload = {}) {
    this._assertPermission('records:*');
    const contributors = Array.isArray(payload.contributors) ? payload.contributors.filter((c) => asText(c.name, 180)).map((c) => ({ name: asText(c.name, 180), role: asText(c.role || 'مؤلف', 80) })) : [];
    const author = asText(payload.author || contributors.find((x) => x.role === 'مؤلف')?.name, 240);
    const isbn10 = digits(payload.isbn10); const isbn13 = digits(payload.isbn13);
    if (isbn10 && !isValidIsbn10(isbn10)) throw new Error('ISBN-10 غير صحيح');
    if (isbn13 && !isValidIsbn13(isbn13)) throw new Error('ISBN-13 غير صحيح');
    if (isbn10 && this.a.records.some((r) => r.isbn10 === isbn10 && !r.deletedAt)) throw new Error('ISBN-10 مستخدم في سجل آخر');
    if (isbn13 && this.a.records.some((r) => r.isbn13 === isbn13 && !r.deletedAt)) throw new Error('ISBN-13 مستخدم في سجل آخر');
    const legacyResult = this.legacy.addBook({
      title: asText(payload.title, 300), author, publisher: asText(payload.publisher, 240),
      referenceNumber: asText(payload.referenceNumber, 80), category: asText(payload.category, 180),
      edition: asText(payload.edition, 120), publishYear: asText(payload.publishYear, 20),
      copiesTotal: asNumber(payload.copiesTotal, 1, 1, 100000), volumes: asNumber(payload.volumes, 1, 1, 1000),
      price: payload.price, series: asText(payload.series, 180), seriesOrder: asText(payload.seriesOrder, 80),
      keywords: payload.subjects || [], condition: asText(payload.condition || 'جيدة', 80),
      acquisition: asText(payload.acquisitionSource, 180), shelf: asText(payload.shelf, 120), notes: asText(payload.notes, 3000),
    });
    if (legacyResult?.ok === false) throw new Error(legacyResult.error || 'تعذر إنشاء السجل');
    this.syncLegacy({ audit: false });
    const record = this._recordForLegacy(legacyResult.id);
    Object.assign(record, {
      subtitle: asText(payload.subtitle, 300), contributors: contributors.length ? contributors : (author ? [{ name: author, role: 'مؤلف' }] : []),
      author, publicationPlace: asText(payload.publicationPlace, 160), language: asText(payload.language || 'العربية', 80),
      isbn10, isbn13, issn: asText(payload.issn, 32), materialTypeId: asText(payload.materialTypeId || 'material_book', 80),
      subjects: unique((payload.subjects || []).map((x) => asText(x, 180))), summary: asText(payload.summary, 5000),
      pageCount: asText(payload.pageCount, 20), dimensions: asText(payload.dimensions, 80), coverType: asText(payload.coverType, 80),
      audience: asText(payload.audience, 120), coverDataUrl: /^data:image\//.test(payload.coverDataUrl || '') ? payload.coverDataUrl : '',
      customFields: clone(payload.customFields || {}), updatedAt: nowIso(),
    });
    const holding = this._holdingForRecord(record.id);
    if (holding) {
      holding.branchId = asText(payload.branchId || this.a.settings.activeBranchId, 80);
      holding.room = asText(payload.room, 120); holding.section = asText(payload.section || payload.category, 180);
      holding.shelf = asText(payload.shelf, 120); holding.callNumber = asText(payload.callNumber || legacyResult.referenceNumber, 120);
      holding.circulationPolicyId = asText(payload.circulationPolicyId || 'policy_default', 80); holding.updatedAt = nowIso();
    }
    this._audit('create', 'records', record.id, `إضافة سجل ببليوغرافي: ${record.title}`, null, record);
    this._save();
    return clone(record);
  }

  updateRecord(recordId, patch = {}) {
    this._assertPermission('records:*');
    const record = this.a.records.find((r) => r.id === recordId && !r.deletedAt);
    if (!record) throw new Error('السجل غير موجود');
    const before = clone(record);
    const legacyPatch = {};
    const map = { title: 'title', author: 'author', publisher: 'publisher', referenceNumber: 'referenceNumber', category: 'category', edition: 'edition', publishYear: 'publishYear', series: 'series', seriesOrder: 'seriesOrder' };
    for (const [src, dest] of Object.entries(map)) if (patch[src] !== undefined) legacyPatch[dest] = patch[src];
    if (patch.subjects !== undefined) legacyPatch.keywords = patch.subjects;
    if (patch.shelf !== undefined) legacyPatch.shelf = patch.shelf;
    if (Object.keys(legacyPatch).length) {
      const result = this.legacy.updateBook(record.legacyBookId, legacyPatch);
      if (result?.ok === false) throw new Error(result.error || 'تعذر تحديث السجل');
    }
    const allowed = ['title','subtitle','author','publisher','publicationPlace','publishYear','edition','language','isbn10','isbn13','issn','materialTypeId','category','series','seriesOrder','summary','pageCount','dimensions','coverType','audience','coverDataUrl','referenceNumber'];
    for (const key of allowed) if (patch[key] !== undefined) record[key] = asText(patch[key], key === 'summary' ? 5000 : 500);
    if (patch.contributors !== undefined) record.contributors = (patch.contributors || []).map((x) => ({ name: asText(x.name, 180), role: asText(x.role, 80) })).filter((x) => x.name);
    if (patch.subjects !== undefined) record.subjects = unique((patch.subjects || []).map((x) => asText(x, 180)));
    if (patch.customFields !== undefined) record.customFields = clone(patch.customFields || {});
    if (record.isbn10 && !isValidIsbn10(record.isbn10)) throw new Error('ISBN-10 غير صحيح');
    if (record.isbn13 && !isValidIsbn13(record.isbn13)) throw new Error('ISBN-13 غير صحيح');
    record.updatedAt = nowIso();
    const holding = this._holdingForRecord(record.id);
    if (holding) {
      for (const key of ['branchId','locationId','room','section','shelf','callNumber','circulationPolicyId','notes']) if (patch[key] !== undefined) holding[key] = asText(patch[key], 500);
      holding.updatedAt = nowIso();
    }
    this._audit('update', 'records', record.id, `تعديل السجل: ${record.title}`, before, record);
    this._save();
    return clone(record);
  }

  addItems(recordId, payload = {}) {
    this._assertPermission('items:*');
    const record = this.a.records.find((r) => r.id === recordId && !r.deletedAt);
    if (!record) throw new Error('السجل غير موجود');
    const book = this.legacy.db.books.find((b) => b.id === record.legacyBookId);
    if (!book) throw new Error('السجل المتوافق غير موجود');
    const addCopies = asNumber(payload.copies, 1, 1, 10000);
    const totalCopies = Math.max(1, Number(book.copiesTotal) || 1) + addCopies;
    const result = this.legacy.updateBook(book.id, { copiesTotal: totalCopies });
    if (result?.ok === false) throw new Error(result.error || 'تعذر إضافة النسخ');
    this.syncLegacy({ audit: false });
    this._audit('create', 'items', recordId, `إضافة ${addCopies} نسخة إلى ${record.title}`, null, { addCopies, totalCopies });
    this._save();
    return clone(this._itemsForRecord(recordId));
  }

  updateItem(itemId, patch = {}) {
    this._assertPermission('items:*');
    const item = this.a.items.find((i) => i.id === itemId && !i.deletedAt);
    if (!item) throw new Error('النسخة غير موجودة');
    const before = clone(item);
    if (patch.barcode !== undefined) {
      const barcode = asText(patch.barcode, 120);
      if (!barcode) throw new Error('الباركود مطلوب');
      if (this.a.items.some((i) => i.id !== itemId && normalizeArabic(i.barcode) === normalizeArabic(barcode) && !i.deletedAt)) throw new Error('الباركود مستخدم بالفعل');
      item.barcode = barcode;
    }
    if (patch.status !== undefined) item.status = enumValue(patch.status, ['available','on_loan','reserved','lost','damaged','maintenance','withdrawn','in_transit'], item.status);
    if (patch.condition !== undefined) item.condition = asText(patch.condition, 80);
    if (patch.acquisitionSource !== undefined) item.acquisitionSource = asText(patch.acquisitionSource, 180);
    if (patch.price !== undefined) item.price = patch.price === '' ? null : asNumber(patch.price, 0, 0, 100000000);
    if (patch.notes !== undefined) item.notes = asText(patch.notes, 2000);
    if (patch.holdingId !== undefined) item.holdingId = asText(patch.holdingId, 80);
    if (patch.customFields !== undefined) item.customFields = clone(patch.customFields || {});
    item.updatedAt = nowIso();
    this._audit('update', 'items', item.id, `تعديل النسخة ${item.barcode}`, before, item);
    this._save();
    return clone(item);
  }

  _policyFor(patron, item) {
    const record = this.a.records.find((r) => r.id === item.recordId);
    const holding = this.a.holdings.find((h) => h.id === item.holdingId);
    const matches = this.a.policies.filter((p) => p.active !== false && !p.deletedAt).filter((p) =>
      (!p.patronCategoryId || p.patronCategoryId === patron.categoryId) &&
      (!p.materialTypeId || p.materialTypeId === record?.materialTypeId) &&
      (!p.branchId || p.branchId === holding?.branchId));
    return matches[0] || this.a.policies.find((p) => p.id === 'policy_default') || defaultPolicy();
  }

  _nextOpenDay(date, policy) {
    const closed = new Set([...(this.a.settings.closedWeekdays || []), ...(policy.closedWeekdays || [])].map(Number));
    const holidays = new Set((this.a.settings.holidays || []).map((x) => new Date(x).toISOString().slice(0, 10)));
    const d = new Date(date);
    for (let guard = 0; guard < 370; guard += 1) {
      const key = d.toISOString().slice(0, 10);
      if (!closed.has(d.getDay()) && !holidays.has(key)) return d;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }

  checkout(payload = {}) {
    this._assertPermission('circulation:*');
    const patron = this.a.patrons.find((p) => p.id === payload.patronId && !p.deletedAt);
    if (!patron) throw new Error('المستعير غير موجود');
    if (patron.status !== 'active') throw new Error('حساب المستعير غير نشط');
    if (patron.expiresAt && Date.parse(patron.expiresAt) < Date.now()) throw new Error('عضوية المستعير منتهية');
    const itemIds = unique(payload.itemIds || []);
    if (!itemIds.length) throw new Error('اختر نسخة واحدة على الأقل');
    const items = itemIds.map((itemId) => this.a.items.find((i) => i.id === itemId && !i.deletedAt && !i.archived));
    if (items.some((x) => !x)) throw new Error('إحدى النسخ غير موجودة');
    if (items.some((x) => x.status !== 'available')) throw new Error('إحدى النسخ ليست متاحة للإعارة');
    const openItemCount = this.a.loans.filter((l) => l.patronId === patron.id && !l.returnedAt).reduce((n, l) => n + (l.itemIds || []).filter((x) => !(l.returnedItemIds || []).includes(x)).length, 0);
    const policies = items.map((item) => this._policyFor(patron, item));
    const maxItems = Math.min(...policies.map((p) => Number(p.maxItems) || 5));
    if (openItemCount + items.length > maxItems && !payload.overrideReason) throw new Error(`تجاوز الحد الأقصى المسموح به (${maxItems})`);

    const byBook = new Map();
    for (const item of items) {
      if (!byBook.has(item.legacyBookId)) byBook.set(item.legacyBookId, []);
      byBook.get(item.legacyBookId).push(item);
    }
    const created = [];
    for (const [bookId, group] of byBook.entries()) {
      const book = this.legacy.db.books.find((b) => b.id === bookId);
      if (!book) throw new Error('تعذر العثور على سجل الكتاب');
      const policy = this._policyFor(patron, group[0]);
      const start = new Date(payload.checkedOutAt || Date.now());
      const dueInput = payload.dueAt ? new Date(payload.dueAt) : new Date(start.getTime() + policy.loanDays * DAY);
      const due = this._nextOpenDay(dueInput, policy);
      const volumes = unique(group.map((x) => Number(x.volumeNumber))).sort((a, b) => a - b);
      const isMulti = Number(book.volumes) > 1;
      const beforeIds = new Set((book.loans || []).map((l) => l.id));
      const result = this.legacy.borrowCopy(bookId, {
        borrowerName: patron.name, borrowedAt: start.toISOString(), dueAt: due.toISOString(),
        scope: isMulti ? 'volume' : 'full', volumes: isMulti ? volumes : [],
        contact: patron.phone || patron.email || '', note: asText(payload.note, 1000),
      });
      if (!result.ok) throw new Error(result.error || 'تعذر تسجيل الإعارة');
      const legacyLoan = (result.book.loans || []).find((l) => !beforeIds.has(l.id));
      const loan = {
        id: id('loan'), legacyBookId: bookId, legacyLoanId: legacyLoan?.id || '', patronId: patron.id,
        itemIds: group.map((x) => x.id), checkedOutAt: start.toISOString(), dueAt: due.toISOString(),
        returnedItemIds: [], returnedItemDates: {}, returnedAt: null, renewalCount: 0,
        contactSnapshot: patron.phone || patron.email || '', note: asText(payload.note, 1000),
        overrideReason: asText(payload.overrideReason, 500), policyId: policy.id,
        createdAt: nowIso(), updatedAt: nowIso(),
      };
      this.a.loans.unshift(loan); created.push(loan);
    }
    this._refreshItemStatuses();
    this._audit('checkout', 'loans', created.map((x) => x.id).join(','), `إعارة ${items.length} نسخة إلى ${patron.name}`, null, created, { overrideReason: payload.overrideReason || '' });
    this._save();
    return clone(created);
  }

  returnItems(payload = {}) {
    this._assertPermission('circulation:*');
    const itemIds = unique(payload.itemIds || []);
    if (!itemIds.length) throw new Error('اختر نسخة واحدة على الأقل');
    const stamp = safeDate(payload.returnedAt || nowIso());
    const touched = [];
    for (const loan of this.a.loans.filter((l) => !l.returnedAt && (l.itemIds || []).some((x) => itemIds.includes(x)))) {
      const selected = (loan.itemIds || []).filter((x) => itemIds.includes(x) && !(loan.returnedItemIds || []).includes(x));
      if (!selected.length) continue;
      const book = this.legacy.db.books.find((b) => b.id === loan.legacyBookId);
      const legacyLoan = (book?.loans || []).find((l) => l.id === loan.legacyLoanId);
      if (book && legacyLoan) {
        const volumes = selected.map((itemId) => this.a.items.find((i) => i.id === itemId)?.volumeNumber).filter(Boolean);
        const result = Number(book.volumes) > 1
          ? this.legacy.returnLoanParts(book.id, legacyLoan.id, volumes, stamp)
          : this.legacy.returnLoan(book.id, legacyLoan.id, stamp);
        if (!result.ok) throw new Error(result.error || 'تعذر تسجيل الإرجاع');
      }
      for (const itemId of selected) {
        if (!loan.returnedItemIds.includes(itemId)) loan.returnedItemIds.push(itemId);
        loan.returnedItemDates[itemId] = stamp;
      }
      if ((loan.itemIds || []).every((x) => loan.returnedItemIds.includes(x))) loan.returnedAt = stamp;
      loan.updatedAt = nowIso(); touched.push(loan);
    }
    if (!touched.length) throw new Error('لا توجد إعارة مفتوحة لهذه النسخ');
    this._refreshItemStatuses();
    this._audit('return', 'loans', touched.map((x) => x.id).join(','), `إرجاع ${itemIds.length} نسخة`, null, touched);
    this._save();
    return clone(touched);
  }

  renewLoan(loanId, payload = {}) {
    this._assertPermission('circulation:*');
    const loan = this.a.loans.find((l) => l.id === loanId && !l.returnedAt);
    if (!loan) throw new Error('الإعارة غير موجودة أو مغلقة');
    const patron = this.a.patrons.find((p) => p.id === loan.patronId);
    const item = this.a.items.find((i) => (loan.itemIds || []).includes(i.id));
    const policy = this._policyFor(patron || {}, item || {});
    if (loan.renewalCount >= policy.maxRenewals && !payload.overrideReason) throw new Error('تم بلوغ الحد الأقصى للتجديدات');
    const hasHold = this.a.holds.some((h) => h.recordId === item?.recordId && ['waiting', 'ready'].includes(h.status));
    if (hasHold && !policy.allowRenewalWhenHeld && !payload.overrideReason) throw new Error('لا يمكن التجديد لوجود حجز على الكتاب');
    const base = new Date(Math.max(Date.now(), Date.parse(loan.dueAt) || Date.now()));
    const due = this._nextOpenDay(payload.dueAt ? new Date(payload.dueAt) : new Date(base.getTime() + policy.loanDays * DAY), policy);
    const before = clone(loan); loan.dueAt = due.toISOString(); loan.renewalCount += 1; loan.updatedAt = nowIso();
    const book = this.legacy.db.books.find((b) => b.id === loan.legacyBookId);
    const legacyLoan = (book?.loans || []).find((l) => l.id === loan.legacyLoanId);
    if (legacyLoan) { legacyLoan.dueAt = loan.dueAt; this.legacy._save(); }
    this._audit('renew', 'loans', loan.id, `تجديد إعارة ${patron?.name || ''}`, before, loan, { overrideReason: payload.overrideReason || '' });
    this._save(); return clone(loan);
  }

  placeHold(payload = {}) {
    this._assertPermission('holds:*');
    const record = this.a.records.find((r) => r.id === payload.recordId && !r.deletedAt);
    const patron = this.a.patrons.find((p) => p.id === payload.patronId && !p.deletedAt);
    if (!record || !patron) throw new Error('الكتاب أو المستعير غير موجود');
    if (this.a.holds.some((h) => h.recordId === record.id && h.patronId === patron.id && ['waiting', 'ready'].includes(h.status))) throw new Error('يوجد حجز مفتوح بالفعل لهذا المستعير');
    const hold = this.createEntity('holds', payload);
    this._refreshItemStatuses(); this._save(); return hold;
  }

  updateHoldStatus(holdId, status) {
    this._assertPermission('holds:*');
    const hold = this.a.holds.find((h) => h.id === holdId && !h.deletedAt);
    if (!hold) throw new Error('الحجز غير موجود');
    const before = clone(hold); hold.status = enumValue(status, ['waiting','ready','fulfilled','cancelled','expired'], hold.status); hold.updatedAt = nowIso();
    if (hold.status === 'ready' && !hold.expiresAt) hold.expiresAt = new Date(Date.now() + 3 * DAY).toISOString();
    this._refreshItemStatuses();
    this._audit('status', 'holds', hold.id, `تغيير حالة الحجز إلى ${hold.status}`, before, hold);
    this._save(); return clone(hold);
  }

  startInventory(payload = {}) {
    this._assertPermission('inventory:*');
    const branchId = asText(payload.branchId || this.a.settings.activeBranchId, 80);
    const session = {
      id: id('inv'), name: asText(payload.name || `جرد ${new Date().toLocaleDateString('ar-EG')}`, 180),
      branchId, locationId: asText(payload.locationId, 80), shelf: asText(payload.shelf, 120),
      expectedItemIds: this.a.items.filter((item) => {
        if (item.deletedAt || item.archived) return false;
        const h = this.a.holdings.find((x) => x.id === item.holdingId);
        return (!branchId || h?.branchId === branchId) && (!payload.shelf || h?.shelf === payload.shelf);
      }).map((x) => x.id),
      scanned: [], unknownCodes: [], duplicateScans: [], status: 'open', startedAt: nowIso(), closedAt: null,
      notes: asText(payload.notes, 1000), createdBy: this._activeUser().id,
    };
    this.a.inventorySessions.unshift(session);
    this._audit('start', 'inventorySessions', session.id, `بدء جلسة الجرد: ${session.name}`, null, session);
    this._save(); return clone(session);
  }

  scanInventory(sessionId, code) {
    this._assertPermission('inventory:*');
    const session = this.a.inventorySessions.find((x) => x.id === sessionId && x.status === 'open');
    if (!session) throw new Error('جلسة الجرد غير مفتوحة');
    const clean = asText(code, 160);
    const item = this.a.items.find((i) => normalizeArabic(i.barcode) === normalizeArabic(clean) && !i.deletedAt && !i.archived);
    if (!item) { if (!session.unknownCodes.includes(clean)) session.unknownCodes.push(clean); this._save(); return { status: 'unknown', code: clean }; }
    if (session.scanned.some((x) => x.itemId === item.id)) { session.duplicateScans.push({ code: clean, at: nowIso() }); this._save(); return { status: 'duplicate', item: clone(item) }; }
    const holding = this.a.holdings.find((h) => h.id === item.holdingId);
    const misplaced = (session.branchId && holding?.branchId !== session.branchId) || (session.shelf && holding?.shelf !== session.shelf);
    session.scanned.push({ itemId: item.id, code: clean, at: nowIso(), misplaced });
    this._save(); return { status: misplaced ? 'misplaced' : 'ok', item: clone(item), holding: clone(holding || {}) };
  }

  closeInventory(sessionId) {
    this._assertPermission('inventory:*');
    const session = this.a.inventorySessions.find((x) => x.id === sessionId && x.status === 'open');
    if (!session) throw new Error('جلسة الجرد غير مفتوحة');
    session.status = 'closed'; session.closedAt = nowIso();
    const scannedIds = new Set(session.scanned.map((x) => x.itemId));
    const missing = session.expectedItemIds.filter((x) => !scannedIds.has(x));
    const misplaced = session.scanned.filter((x) => x.misplaced).map((x) => x.itemId);
    const report = { expected: session.expectedItemIds.length, scanned: scannedIds.size, missing, misplaced, unknownCodes: session.unknownCodes, duplicateScans: session.duplicateScans };
    session.report = report;
    this._audit('close', 'inventorySessions', session.id, `إغلاق جلسة الجرد: ${session.name}`, null, report);
    this._save(); return clone(report);
  }

  createTransfer(payload = {}) {
    this._assertPermission('transfers:*');
    const transfer = this._cleanEntity('transfers', { ...payload, status: 'in_transit', sentAt: nowIso() }, {});
    const selected = this.a.items.filter((item) => transfer.itemIds.includes(item.id) && !item.deletedAt && !item.archived);
    if (selected.length !== transfer.itemIds.length) throw new Error('إحدى النسخ المحددة غير موجودة أو مؤرشفة');
    for (const item of selected) {
      const holding = this.a.holdings.find((h) => h.id === item.holdingId && !h.deletedAt);
      if (holding?.branchId !== transfer.fromBranchId) throw new Error(`النسخة ${item.barcode} ليست في فرع الإرسال`);
      if (['on_loan', 'reserved'].includes(item.status)) throw new Error(`لا يمكن نقل النسخة ${item.barcode} وهي ${item.status === 'on_loan' ? 'معارة' : 'محجوزة'}`);
    }
    for (const item of selected) item.status = 'in_transit';
    this.a.transfers.unshift(transfer);
    this._audit('transfer-send', 'transfers', transfer.id, `إرسال ${selected.length} نسخة إلى فرع آخر`, null, transfer);
    this._save();
    return clone(transfer);
  }

  receiveTransfer(transferId, payload = {}) {
    this._assertPermission('transfers:*');
    const transfer = this.a.transfers.find((x) => x.id === transferId && !x.deletedAt);
    if (!transfer || transfer.status !== 'in_transit') throw new Error('عملية النقل غير متاحة للاستلام');
    const before = clone(transfer);
    const shelf = asText(payload.shelf, 120);
    const locationId = asText(payload.locationId, 80);
    for (const itemId of transfer.itemIds || []) {
      const item = this.a.items.find((x) => x.id === itemId && !x.deletedAt && !x.archived);
      if (!item) continue;
      let holding = this.a.holdings.find((h) => h.recordId === item.recordId && h.branchId === transfer.toBranchId && !h.deletedAt);
      if (!holding) {
        holding = {
          id: id('holdg'), recordId: item.recordId, branchId: transfer.toBranchId,
          locationId, room: '', cabinet: '', shelf, callNumber: '', acquisitionSource: 'نقل بين الفروع',
          acquiredAt: nowIso(), notes: `أُنشئ تلقائيًا عند استلام النقل ${transfer.id}`,
          createdAt: nowIso(), updatedAt: nowIso(),
        };
        this.a.holdings.push(holding);
      } else {
        if (shelf) holding.shelf = shelf;
        if (locationId) holding.locationId = locationId;
        holding.updatedAt = nowIso();
      }
      item.holdingId = holding.id;
      item.status = 'available';
      item.updatedAt = nowIso();
    }
    transfer.status = 'received'; transfer.receivedAt = nowIso(); transfer.receivedBy = this._activeUser().id;
    transfer.receiveNotes = asText(payload.notes, 1200); transfer.updatedAt = nowIso();
    this._audit('transfer-receive', 'transfers', transfer.id, `استلام ${transfer.itemIds.length} نسخة في الفرع`, before, transfer);
    this._save(); return clone(transfer);
  }

  cancelTransfer(transferId, reason = '') {
    this._assertPermission('transfers:*');
    const transfer = this.a.transfers.find((x) => x.id === transferId && !x.deletedAt);
    if (!transfer || transfer.status !== 'in_transit') throw new Error('لا يمكن إلغاء عملية النقل الحالية');
    const before = clone(transfer);
    for (const itemId of transfer.itemIds || []) {
      const item = this.a.items.find((x) => x.id === itemId && !x.deletedAt && !x.archived);
      if (item?.status === 'in_transit') item.status = 'available';
    }
    transfer.status = 'cancelled'; transfer.cancelledAt = nowIso(); transfer.cancelReason = asText(reason, 1000); transfer.updatedAt = nowIso();
    this._audit('transfer-cancel', 'transfers', transfer.id, 'إلغاء عملية نقل بين الفروع', before, transfer);
    this._save(); return clone(transfer);
  }

  refreshNotifications() {
    const previous = new Map((this.a.notifications || []).map((n) => [n.key, n]));
    const rows = [];
    const push = (key, type, title, message, relatedId = '', route = '') => {
      const old = previous.get(key);
      rows.push({
        id: old?.id || id('noti'), key, type, title, message, relatedId, route,
        read: !!old?.read, createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(),
      });
    };
    const now = Date.now();
    for (const loan of this.a.loans.filter((x) => !x.returnedAt)) {
      const due = Date.parse(loan.dueAt);
      const patron = this.a.patrons.find((p) => p.id === loan.patronId);
      const item = this.a.items.find((i) => (loan.itemIds || []).includes(i.id) && !(loan.returnedItemIds || []).includes(i.id));
      const record = this.a.records.find((r) => r.id === item?.recordId);
      if (Number.isFinite(due) && due < now) push(`loan-overdue:${loan.id}`, 'danger', 'إعارة متأخرة', `${patron?.name || 'مستعير'} — ${record?.title || 'كتاب'} متأخر عن موعده`, loan.id, 'circulation');
      else if (Number.isFinite(due) && due - now <= 3 * DAY) push(`loan-due:${loan.id}`, 'warning', 'موعد استحقاق قريب', `${record?.title || 'كتاب'} يستحق خلال ثلاثة أيام`, loan.id, 'circulation');
    }
    for (const hold of this.a.holds.filter((x) => ['waiting', 'ready'].includes(x.status) && !x.deletedAt)) {
      const record = this.a.records.find((r) => r.id === hold.recordId);
      const patron = this.a.patrons.find((p) => p.id === hold.patronId);
      push(`hold:${hold.id}`, hold.status === 'ready' ? 'success' : 'info', hold.status === 'ready' ? 'حجز جاهز للاستلام' : 'حجز في قائمة الانتظار', `${record?.title || 'كتاب'} — ${patron?.name || 'مستعير'}`, hold.id, 'holds');
    }
    for (const serial of this.a.serials.filter((x) => x.active !== false && !x.deletedAt && x.nextExpectedAt && Date.parse(x.nextExpectedAt) < now)) {
      push(`serial:${serial.id}`, 'warning', 'عدد دورية متأخر', `${serial.title} تجاوز موعد الوصول المتوقع`, serial.id, 'serials');
    }
    for (const order of this.a.acquisitions.filter((x) => !x.deletedAt && !['received', 'cancelled'].includes(x.status) && x.expectedAt && Date.parse(x.expectedAt) < now)) {
      push(`acquisition:${order.id}`, 'warning', 'طلب تزويد متأخر', `${order.title} تجاوز موعد التوريد المتوقع`, order.id, 'acquisitions');
    }
    for (const transfer of this.a.transfers.filter((x) => !x.deletedAt && x.status === 'in_transit')) {
      push(`transfer:${transfer.id}`, 'info', 'نسخ قيد النقل', `${(transfer.itemIds || []).length} نسخة تنتظر الاستلام في الفرع`, transfer.id, 'branches');
    }
    this.a.notifications = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clone(this.a.notifications);
  }

  markNotification(notificationId, read = true) {
    const row = this.a.notifications.find((x) => x.id === notificationId);
    if (!row) throw new Error('الإشعار غير موجود');
    row.read = !!read; row.updatedAt = nowIso(); this._save(false); return clone(row);
  }

  markAllNotifications(read = true) {
    for (const row of this.a.notifications) { row.read = !!read; row.updatedAt = nowIso(); }
    this._save(false); return { count: this.a.notifications.length };
  }

  bulkUpdateRecords(recordIds, patch = {}) {
    this._assertPermission('records:*');
    const ids = new Set(recordIds || []); const changed = [];
    this.legacy.createBackup('before-bulk-update-v4');
    for (const record of this.a.records.filter((r) => ids.has(r.id) && !r.deletedAt)) changed.push(this.updateRecord(record.id, patch));
    this._audit('bulk-update', 'records', [...ids].join(','), `تعديل جماعي لـ ${changed.length} سجل`, null, { patch });
    this._save(); return changed;
  }

  mergeAuthorities(keeperId, duplicateIds = []) {
    this._assertPermission('authorities:*');
    const keeper = this.a.authorities.find((x) => x.id === keeperId && !x.deletedAt);
    if (!keeper) throw new Error('السجل المعتمد غير موجود');
    const duplicates = this.a.authorities.filter((x) => duplicateIds.includes(x.id) && !x.deletedAt && x.id !== keeperId);
    keeper.variants = unique([...(keeper.variants || []), ...duplicates.flatMap((x) => [x.preferred, ...(x.variants || [])])]);
    for (const dup of duplicates) { dup.deletedAt = nowIso(); this.a.trash.unshift({ id: id('trash'), entity: 'authorities', entityId: dup.id, snapshot: clone(dup), reason: `دُمج في ${keeper.preferred}`, deletedAt: dup.deletedAt, deletedBy: this._activeUser().id }); }
    keeper.updatedAt = nowIso();
    this._audit('merge', 'authorities', keeper.id, `دمج ${duplicates.length} سجل استنادي في ${keeper.preferred}`, duplicates, keeper);
    this._save(); return clone(keeper);
  }

  validateIsbn(value) {
    const s = digits(value);
    return { value: s, type: s.length === 10 ? 'ISBN-10' : s.length === 13 ? 'ISBN-13' : 'unknown', valid: s.length === 10 ? isValidIsbn10(s) : s.length === 13 ? isValidIsbn13(s) : false };
  }

  search(query = '', filters = {}) {
    const q = normalizeArabic(query);
    const records = this.a.records.filter((r) => !r.deletedAt).filter((r) => {
      const hay = normalizeArabic([r.title, r.subtitle, r.author, r.publisher, r.category, r.series, r.referenceNumber, r.isbn10, r.isbn13, ...(r.subjects || []), ...(r.contributors || []).map((x) => x.name)].join(' '));
      if (q && !hay.includes(q)) return false;
      if (filters.materialTypeId && r.materialTypeId !== filters.materialTypeId) return false;
      if (filters.language && r.language !== filters.language) return false;
      if (filters.category && r.category !== filters.category) return false;
      const items = this._itemsForRecord(r.id);
      if (filters.availableOnly && !items.some((i) => i.status === 'available')) return false;
      if (filters.branchId) {
        const holdingIds = new Set(this.a.holdings.filter((h) => h.recordId === r.id && h.branchId === filters.branchId && !h.deletedAt).map((h) => h.id));
        if (!items.some((i) => holdingIds.has(i.holdingId))) return false;
      }
      return true;
    });
    return clone(records.map((record) => {
      const items = this._itemsForRecord(record.id);
      return { ...record, itemCount: items.length, availableCount: items.filter((x) => x.status === 'available').length, holdings: this.a.holdings.filter((h) => h.recordId === record.id && !h.deletedAt) };
    }));
  }

  setSettings(patch = {}) {
    this._assertPermission('settings:*');
    const before = clone(this.a.settings);
    const allowed = ['activeBranchId','workspace','interfaceDensity','highContrast','fontScale','enableFines','enableSerials','enableAcquisitions','enablePublisherMode','enableLocalOpac','requirePinOnSwitch','backupOnClose','backupEveryChanges','retentionDays','currency','institutionType','holidays','closedWeekdays','publisherLowStockThreshold'];
    for (const key of allowed) if (patch[key] !== undefined) this.a.settings[key] = clone(patch[key]);
    this.a.settings.fontScale = asNumber(this.a.settings.fontScale, 1, 0.8, 1.5);
    this.a.settings.interfaceDensity = enumValue(this.a.settings.interfaceDensity, ['comfortable','compact','dense'], 'comfortable');
    this.a.settings.workspace = enumValue(this.a.settings.workspace, ['researcher','circulation','cataloging','management','all'], 'researcher');
    this._audit('settings', 'settings', '', 'تحديث إعدادات رَفّ 4', before, this.a.settings);
    this._save(); return clone(this.a.settings);
  }

  authenticateUser(userId, pin = '') {
    const user = this.a.users.find((u) => u.id === userId && !u.deletedAt && u.active !== false);
    if (!user) throw new Error('المستخدم غير موجود أو غير نشط');
    if (!verifyPin(pin, user.pinHash)) throw new Error('الرمز غير صحيح');
    const before = this.a.settings.activeUserId; this.a.settings.activeUserId = user.id;
    this._audit('login', 'users', user.id, `تبديل المستخدم إلى ${user.displayName}`, { activeUserId: before }, { activeUserId: user.id });
    this._save(); return { ok: true, user: clone({ ...user, pinHash: undefined }) };
  }

  auditLog(filters = {}) {
    return clone(this.a.audit.filter((x) => (!filters.entity || x.entity === filters.entity) && (!filters.userId || x.userId === filters.userId) && (!filters.query || normalizeArabic(`${x.summary} ${x.userName}`).includes(normalizeArabic(filters.query)))).slice(0, asNumber(filters.limit, 1000, 1, 10000)));
  }

  createSnapshot(reason = 'manual-v4') {
    this._assertPermission('backups:*');
    const file = this.legacy.createBackup(asText(reason, 80).replace(/[^a-zA-Z0-9_-]/g, '-') || 'manual-v4');
    this.a.settings.changesSinceBackup = 0;
    this._audit('backup', 'system', '', 'إنشاء نسخة احتياطية', null, { file: path.basename(file) });
    this._save(false); return { filePath: file };
  }

  listBackups() {
    const dir = path.join(this.legacy.dataDir(), 'backups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((x) => x.endsWith('.json')).map((name) => {
      const full = path.join(dir, name); const st = fs.statSync(full);
      return { name, path: full, size: st.size, modifiedAt: st.mtime.toISOString() };
    }).sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  }

  restoreBackup(backupName) {
    this._assertPermission('backups:*');
    const dir = path.resolve(path.join(this.legacy.dataDir(), 'backups'));
    const file = path.resolve(path.join(dir, path.basename(backupName)));
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) throw new Error('النسخة الاحتياطية غير موجودة');
    this.legacy.createBackup('before-restore-v4');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.books)) throw new Error('صيغة النسخة الاحتياطية غير صالحة');
    this.legacy.db = parsed; this.ensure(); this.legacy._save();
    return { ok: true };
  }

  integrityReport() {
    const issues = [];
    const a = this.a;
    const dup = (arr, keyFn, type, label) => {
      const seen = new Map();
      for (const x of arr.filter((y) => !y.deletedAt)) {
        const key = keyFn(x); if (!key) continue;
        if (!seen.has(key)) seen.set(key, []); seen.get(key).push(x);
      }
      for (const [key, rows] of seen) if (rows.length > 1) issues.push({ severity: 'high', type, label, key, ids: rows.map((x) => x.id) });
    };
    dup(a.items, (x) => normalizeArabic(x.barcode), 'duplicate-barcode', 'باركود مكرر');
    dup(a.patrons, (x) => normalizeArabic(x.membershipNumber), 'duplicate-membership', 'رقم عضوية مكرر');
    dup(a.records, (x) => digits(x.isbn13), 'duplicate-isbn13', 'ISBN-13 مكرر');
    for (const item of a.items.filter((x) => !x.deletedAt && !x.archived)) {
      if (!a.records.some((r) => r.id === item.recordId && !r.deletedAt)) issues.push({ severity: 'critical', type: 'orphan-item', label: 'نسخة بلا سجل ببليوغرافي', id: item.id });
      if (!a.holdings.some((h) => h.id === item.holdingId && !h.deletedAt)) issues.push({ severity: 'critical', type: 'orphan-holding', label: 'نسخة بلا مقتنى صالح', id: item.id });
    }
    for (const loan of a.loans.filter((x) => !x.returnedAt)) {
      if (!a.patrons.some((p) => p.id === loan.patronId && !p.deletedAt)) issues.push({ severity: 'critical', type: 'orphan-loan-patron', label: 'إعارة بلا مستعير', id: loan.id });
      for (const itemId of loan.itemIds || []) if (!a.items.some((i) => i.id === itemId && !i.deletedAt)) issues.push({ severity: 'critical', type: 'orphan-loan-item', label: 'إعارة تشير إلى نسخة مفقودة', id: loan.id, itemId });
    }
    const legacy = this.legacy.integrityCheck();
    return { generatedAt: nowIso(), score: Math.max(0, 100 - issues.reduce((n, x) => n + (x.severity === 'critical' ? 10 : x.severity === 'high' ? 5 : 1), 0)), issues, legacy };
  }

  repairSafe() {
    this._assertPermission('integrity:*');
    const backup = this.legacy.createBackup('before-v4-safe-repair');
    const before = this.integrityReport();
    const actions = [];
    // Deterministically repair only missing/duplicate barcodes and stale statuses.
    const used = new Set();
    for (const item of this.a.items.filter((x) => !x.deletedAt && !x.archived)) {
      let candidate = asText(item.barcode, 120);
      if (!candidate || used.has(normalizeArabic(candidate))) {
        const rec = this.a.records.find((r) => r.id === item.recordId);
        const base = (rec?.referenceNumber || 'raff').replace(/\s+/g, '');
        candidate = `${base}-C${String(item.copyNumber || 1).padStart(2, '0')}${Number(item.volumeNumber) > 1 ? `-V${String(item.volumeNumber).padStart(2, '0')}` : ''}`;
        let suffix = 2;
        while (used.has(normalizeArabic(candidate))) candidate = `${base}-${suffix++}`;
        actions.push({ type: 'barcode', itemId: item.id, before: item.barcode, after: candidate }); item.barcode = candidate;
      }
      used.add(normalizeArabic(candidate));
    }
    this._refreshItemStatuses();
    this._audit('repair', 'system', '', 'إصلاح آمن لبيانات رَفّ 4', before, { actions, backup: path.basename(backup) });
    this._save(); return { backup, before, after: this.integrityReport(), actions };
  }

  exportMarcXml() {
    const esc = (s) => asText(s, 10000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const records = this.a.records.filter((r) => !r.deletedAt).map((r) => {
      const fields = [];
      if (r.isbn13 || r.isbn10) fields.push(`<datafield tag="020" ind1=" " ind2=" "><subfield code="a">${esc(r.isbn13 || r.isbn10)}</subfield></datafield>`);
      if (r.author) fields.push(`<datafield tag="100" ind1="1" ind2=" "><subfield code="a">${esc(r.author)}</subfield></datafield>`);
      fields.push(`<datafield tag="245" ind1="1" ind2="0"><subfield code="a">${esc(r.title)}</subfield>${r.subtitle ? `<subfield code="b">${esc(r.subtitle)}</subfield>` : ''}</datafield>`);
      if (r.publisher || r.publishYear) fields.push(`<datafield tag="264" ind1=" " ind2="1">${r.publicationPlace ? `<subfield code="a">${esc(r.publicationPlace)}</subfield>` : ''}${r.publisher ? `<subfield code="b">${esc(r.publisher)}</subfield>` : ''}${r.publishYear ? `<subfield code="c">${esc(r.publishYear)}</subfield>` : ''}</datafield>`);
      for (const subject of r.subjects || []) fields.push(`<datafield tag="650" ind1=" " ind2="4"><subfield code="a">${esc(subject)}</subfield></datafield>`);
      return `<record><leader>00000nam a2200000 i 4500</leader><controlfield tag="001">${esc(r.id)}</controlfield><controlfield tag="005">${new Date(r.updatedAt || Date.now()).toISOString().replace(/[-:.]/g, '').slice(0, 14)}.0</controlfield>${fields.join('')}</record>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><collection xmlns="http://www.loc.gov/MARC21/slim">${records}</collection>`;
  }

  importMarcXml(xml) {
    this._assertPermission('exchange:*');
    const text = String(xml || '');
    const chunks = text.match(/<record\b[\s\S]*?<\/record>/gi) || [];
    const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    const field = (chunk, tag, code) => {
      const re = new RegExp(`<datafield[^>]*tag=["']${tag}["'][^>]*>[\\s\\S]*?<subfield[^>]*code=["']${code}["'][^>]*>([\\s\\S]*?)<\\/subfield>[\\s\\S]*?<\\/datafield>`, 'i');
      return strip(re.exec(chunk)?.[1] || '');
    };
    const fields = (chunk, tag, code) => {
      const out = []; const blockRe = new RegExp(`<datafield[^>]*tag=["']${tag}["'][^>]*>([\\s\\S]*?)<\\/datafield>`, 'gi'); let b;
      while ((b = blockRe.exec(chunk))) { const re = new RegExp(`<subfield[^>]*code=["']${code}["'][^>]*>([\\s\\S]*?)<\\/subfield>`, 'i'); const v = strip(re.exec(b[1])?.[1] || ''); if (v) out.push(v); }
      return out;
    };
    let added = 0; const errors = [];
    this.legacy.createBackup('before-marc-import');
    for (const chunk of chunks) {
      try {
        const title = field(chunk, '245', 'a'); if (!title) throw new Error('سجل بلا عنوان');
        const isbn = field(chunk, '020', 'a');
        this.createRecord({ title, subtitle: field(chunk, '245', 'b'), author: field(chunk, '100', 'a'), publisher: field(chunk, '264', 'b') || field(chunk, '260', 'b'), publicationPlace: field(chunk, '264', 'a') || field(chunk, '260', 'a'), publishYear: field(chunk, '264', 'c') || field(chunk, '260', 'c'), isbn13: digits(isbn).length === 13 ? digits(isbn) : '', isbn10: digits(isbn).length === 10 ? digits(isbn) : '', subjects: fields(chunk, '650', 'a'), copiesTotal: 1, volumes: 1 });
        added += 1;
      } catch (err) { errors.push(err.message); }
    }
    return { added, errors, total: chunks.length };
  }

  exportMarcIso2709() {
    const makeControl = (tag, value) => ({ tag, data: Buffer.from(`${asText(value, 10000)}\x1e`, 'utf8') });
    const makeData = (tag, ind1, ind2, fields) => {
      let value = `${ind1 || ' '}${ind2 || ' '}`;
      for (const [code, text] of fields.filter(([, v]) => asText(v, 10000))) value += `\x1f${code}${asText(text, 10000)}`;
      return { tag, data: Buffer.from(`${value}\x1e`, 'utf8') };
    };
    const output = [];
    for (const r of this.a.records.filter((x) => !x.deletedAt)) {
      const fields = [makeControl('001', r.id)];
      if (r.isbn13 || r.isbn10) fields.push(makeData('020', ' ', ' ', [['a', r.isbn13 || r.isbn10]]));
      if (r.author) fields.push(makeData('100', '1', ' ', [['a', r.author]]));
      fields.push(makeData('245', '1', '0', [['a', r.title], ['b', r.subtitle]]));
      if (r.publisher || r.publishYear || r.publicationPlace) fields.push(makeData('264', ' ', '1', [['a', r.publicationPlace], ['b', r.publisher], ['c', r.publishYear]]));
      for (const subject of r.subjects || []) fields.push(makeData('650', ' ', '4', [['a', subject]]));
      if (r.language) fields.push(makeData('041', '0', ' ', [['a', r.language]]));
      if (r.summary) fields.push(makeData('520', ' ', ' ', [['a', r.summary]]));
      const directoryParts = [];
      let offset = 0;
      for (const field of fields) {
        const length = field.data.length;
        directoryParts.push(Buffer.from(`${field.tag}${String(length).padStart(4, '0')}${String(offset).padStart(5, '0')}`, 'ascii'));
        offset += length;
      }
      const directory = Buffer.concat([...directoryParts, Buffer.from('\x1e', 'binary')]);
      const baseAddress = 24 + directory.length;
      const data = Buffer.concat(fields.map((x) => x.data));
      const recordLength = baseAddress + data.length + 1;
      const leader = Buffer.from(`${String(recordLength).padStart(5, '0')}nam a22${String(baseAddress).padStart(5, '0')} i 4500`, 'ascii');
      if (leader.length !== 24) throw new Error('تعذر إنشاء Leader صحيح لـ MARC');
      output.push(Buffer.concat([leader, directory, data, Buffer.from('\x1d', 'binary')]));
    }
    return Buffer.concat(output);
  }

  importMarcIso2709(input) {
    this._assertPermission('exchange:*');
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || '');
    const records = [];
    let cursor = 0;
    while (cursor + 24 <= buffer.length) {
      const length = Number(buffer.subarray(cursor, cursor + 5).toString('ascii'));
      if (!Number.isInteger(length) || length < 26 || cursor + length > buffer.length) break;
      records.push(buffer.subarray(cursor, cursor + length)); cursor += length;
    }
    this.legacy.createBackup('before-marc-iso2709-import');
    let added = 0; const errors = [];
    for (const raw of records) {
      try {
        const base = Number(raw.subarray(12, 17).toString('ascii'));
        if (!Number.isInteger(base) || base <= 24 || base >= raw.length) throw new Error('عنوان قاعدة MARC غير صالح');
        const directory = raw.subarray(24, base - 1);
        const parsed = [];
        for (let i = 0; i + 12 <= directory.length; i += 12) {
          const tag = directory.subarray(i, i + 3).toString('ascii');
          const length = Number(directory.subarray(i + 3, i + 7).toString('ascii'));
          const offset = Number(directory.subarray(i + 7, i + 12).toString('ascii'));
          if (!tag || !Number.isInteger(length) || !Number.isInteger(offset)) continue;
          const data = raw.subarray(base + offset, base + offset + Math.max(0, length - 1));
          if (Number(tag) < 10) parsed.push({ tag, value: data.toString('utf8').trim() });
          else {
            const body = data.subarray(2).toString('utf8');
            const subfields = {};
            for (const segment of body.split('\x1f').slice(1)) {
              const code = segment[0]; const value = segment.slice(1).trim();
              if (!subfields[code]) subfields[code] = []; if (value) subfields[code].push(value);
            }
            parsed.push({ tag, subfields });
          }
        }
        const first = (tag, code) => parsed.find((x) => x.tag === tag)?.subfields?.[code]?.[0] || '';
        const all = (tag, code) => parsed.filter((x) => x.tag === tag).flatMap((x) => x.subfields?.[code] || []);
        const title = first('245', 'a'); if (!title) throw new Error('سجل MARC بلا عنوان');
        const isbn = digits(first('020', 'a'));
        this.createRecord({
          title, subtitle: first('245', 'b'), author: first('100', 'a') || first('110', 'a'),
          publisher: first('264', 'b') || first('260', 'b'), publicationPlace: first('264', 'a') || first('260', 'a'),
          publishYear: first('264', 'c') || first('260', 'c'), isbn13: isbn.length === 13 ? isbn : '', isbn10: isbn.length === 10 ? isbn : '',
          subjects: all('650', 'a'), language: first('041', 'a') || 'العربية', summary: first('520', 'a'), copiesTotal: 1, volumes: 1,
        });
        added += 1;
      } catch (err) { errors.push(err.message); }
    }
    return { added, errors, total: records.length };
  }

  exportDublinCore() {
    const esc = (s) => asText(s, 10000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const records = this.a.records.filter((r) => !r.deletedAt).map((r) => `<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:identifier>${esc(r.referenceNumber || r.id)}</dc:identifier><dc:title>${esc(r.title)}</dc:title>${r.subtitle ? `<dc:title>${esc(r.subtitle)}</dc:title>` : ''}${(r.contributors || []).map((c) => `<dc:creator>${esc(c.name)}</dc:creator>`).join('') || (r.author ? `<dc:creator>${esc(r.author)}</dc:creator>` : '')}${r.publisher ? `<dc:publisher>${esc(r.publisher)}</dc:publisher>` : ''}${r.publishYear ? `<dc:date>${esc(r.publishYear)}</dc:date>` : ''}${r.language ? `<dc:language>${esc(r.language)}</dc:language>` : ''}${(r.subjects || []).map((x) => `<dc:subject>${esc(x)}</dc:subject>`).join('')}${r.summary ? `<dc:description>${esc(r.summary)}</dc:description>` : ''}${r.isbn13 || r.isbn10 ? `<dc:identifier>${esc(r.isbn13 || r.isbn10)}</dc:identifier>` : ''}<dc:type>${esc(this.a.materialTypes.find((x) => x.id === r.materialTypeId)?.name || 'كتاب')}</dc:type></oai_dc:dc>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><collection>${records}</collection>`;
  }

  exportJsonLd() {
    const graph = this.a.records.filter((r) => !r.deletedAt).map((r) => ({
      '@type': 'Book', '@id': `urn:raff:${r.id}`, name: r.title, alternateName: r.subtitle || undefined,
      author: (r.contributors || []).length ? r.contributors.map((c) => ({ '@type': 'Person', name: c.name, roleName: c.role })) : (r.author ? [{ '@type': 'Person', name: r.author }] : []),
      publisher: r.publisher ? { '@type': 'Organization', name: r.publisher } : undefined,
      datePublished: r.publishYear || undefined, inLanguage: r.language || undefined,
      isbn: r.isbn13 || r.isbn10 || undefined, keywords: (r.subjects || []).join(', ') || undefined,
      description: r.summary || undefined, numberOfPages: Number(r.pageCount) || undefined,
      isPartOf: r.series ? { '@type': 'CreativeWorkSeries', name: r.series, position: r.seriesOrder || undefined } : undefined,
    }));
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  }

  importBibTex(text) {
    this._assertPermission('exchange:*');
    const source = String(text || '');
    const entries = [];
    for (let start = source.indexOf('@'); start >= 0;) {
      const open = source.indexOf('{', start);
      if (open < 0) break;
      let depth = 0; let quoted = false; let escaped = false; let end = -1;
      for (let i = open; i < source.length; i += 1) {
        const ch = source[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
      }
      if (end < 0) break;
      entries.push(source.slice(start, end));
      start = source.indexOf('@', end);
    }
    this.legacy.createBackup('before-bibtex-import');
    let added = 0; const errors = [];
    const value = (entry, key) => {
      const re = new RegExp(`${key}\\s*=\\s*(?:\\{([\\s\\S]*?)\\}|\"([\\s\\S]*?)\")\\s*,?`, 'i');
      const m = re.exec(entry); return (m?.[1] || m?.[2] || '').replace(/\s+/g, ' ').trim();
    };
    for (const entry of entries) {
      try {
        const title = value(entry, 'title'); if (!title) throw new Error('مدخلة BibTeX بلا عنوان');
        const isbn = digits(value(entry, 'isbn'));
        this.createRecord({ title, author: value(entry, 'author').replace(/\s+and\s+/gi, '، '), publisher: value(entry, 'publisher'), publishYear: value(entry, 'year'), edition: value(entry, 'edition'), isbn13: isbn.length === 13 ? isbn : '', isbn10: isbn.length === 10 ? isbn : '', subjects: value(entry, 'keywords').split(/[,;]/).map((x) => x.trim()).filter(Boolean), summary: value(entry, 'abstract'), copiesTotal: 1, volumes: 1 });
        added += 1;
      } catch (err) { errors.push(err.message); }
    }
    return { added, errors, total: entries.length };
  }

  importRis(text) {
    this._assertPermission('exchange:*');
    const entries = String(text || '').split(/\r?\nER\s*-\s*\r?\n?/).map((x) => x.trim()).filter(Boolean);
    this.legacy.createBackup('before-ris-import');
    let added = 0; const errors = [];
    for (const entry of entries) {
      try {
        const fields = {};
        for (const line of entry.split(/\r?\n/)) { const m = /^([A-Z0-9]{2})\s*-\s*(.*)$/.exec(line); if (m) (fields[m[1]] ||= []).push(m[2].trim()); }
        const title = fields.TI?.[0] || fields.T1?.[0] || ''; if (!title) throw new Error('مدخلة RIS بلا عنوان');
        const isbn = digits(fields.SN?.[0] || '');
        this.createRecord({ title, author: (fields.AU || fields.A1 || []).join('، '), publisher: fields.PB?.[0] || '', publishYear: fields.PY?.[0] || fields.Y1?.[0] || '', isbn13: isbn.length === 13 ? isbn : '', isbn10: isbn.length === 10 ? isbn : '', subjects: fields.KW || [], summary: fields.AB?.[0] || '', copiesTotal: 1, volumes: 1 });
        added += 1;
      } catch (err) { errors.push(err.message); }
    }
    return { added, errors, total: entries.length };
  }

  exportBibTex() {
    const clean = (s) => asText(s, 5000).replace(/[{}]/g, '');
    return this.a.records.filter((r) => !r.deletedAt).map((r, index) => `@book{raff${index + 1},\n  title = {${clean(r.title)}},\n  author = {${clean(r.author)}},\n  publisher = {${clean(r.publisher)}},\n  year = {${clean(r.publishYear)}},\n  isbn = {${clean(r.isbn13 || r.isbn10)}},\n  edition = {${clean(r.edition)}}\n}`).join('\n\n');
  }

  exportRis() {
    return this.a.records.filter((r) => !r.deletedAt).map((r) => ['TY  - BOOK', `TI  - ${r.title || ''}`, `AU  - ${r.author || ''}`, `PB  - ${r.publisher || ''}`, `PY  - ${r.publishYear || ''}`, `SN  - ${r.isbn13 || r.isbn10 || ''}`, ...(r.subjects || []).map((s) => `KW  - ${s}`), 'ER  - '].join('\n')).join('\n\n');
  }

  exportTransferPackage() {
    return clone({ format: 'raff-offline-transfer', version: 4, exportedAt: nowIso(), sourceBranchId: this.a.settings.activeBranchId, data: this.a });
  }

  importTransferPackage(payload) {
    this._assertPermission('exchange:*');
    if (!payload || payload.format !== 'raff-offline-transfer' || !payload.data) throw new Error('حزمة النقل غير صالحة');
    this.legacy.createBackup('before-transfer-import');
    const incoming = payload.data; const merged = { records: 0, patrons: 0, items: 0 };
    for (const key of ['records','holdings','items','patrons','loans','holds','policies','branches','authorities','acquisitions','serials','inventorySessions','transfers','savedSearches','readingLists','notifications','customFields','patronCategories','materialTypes','locations']) {
      if (!Array.isArray(incoming[key])) continue;
      const existingIds = new Set(this.a[key].map((x) => x.id));
      for (const row of incoming[key]) if (!existingIds.has(row.id)) { this.a[key].push(clone(row)); if (merged[key] !== undefined) merged[key] += 1; }
    }
    this._audit('import', 'system', '', 'استيراد حزمة نقل محلية بين الفروع', null, merged);
    this._save(); return merged;
  }
}

module.exports = RaffV4Store;
module.exports.helpers = { normalizeArabic, isValidIsbn10, isValidIsbn13, hashPin, verifyPin };
