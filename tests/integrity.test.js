'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/js/store');

function book(title, referenceNumber) {
  return {
    title,
    author: 'مؤلف الاختبار',
    publisher: 'دار الاختبار',
    category: 'اختبار',
    referenceNumber,
    copiesTotal: 1,
    volumes: 1,
  };
}

function withStore(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raff-integrity-'));
  try {
    return run(new Store(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

withStore((store) => {
  const one = store.addBook(book('الكتاب الأول', 'raf-0001'));
  const thousandOne = store.addBook(book('الكتاب الألف وواحد', 'raf-1001'));
  assert.ok(!one.error, 'raf-0001 should be accepted');
  assert.ok(!thousandOne.error, 'raf-1001 should be accepted');

  const report = store.integrityCheck();
  assert.strictEqual(report.duplicateRefs.length, 0, 'raf-0001 and raf-1001 must never be grouped as duplicates');

  const formattingClash = store.addBook(book('نسخة منسقة بشكل مختلف', ' RAF – 0001 '));
  assert.strictEqual(formattingClash.ok, false, 'formatting-equivalent full references must collide');

  const arabicDigitClash = store.addBook(book('رقم مكتوب بأرقام عربية', 'raf-١٠٠١'));
  assert.strictEqual(arabicDigitClash.ok, false, 'Arabic-Indic digits must resolve to the same complete reference identity');

  const editClash = store.setReferenceNumber(thousandOne.id, 'RAF-1');
  assert.strictEqual(editClash.ok, false, 'editing must use the same uniqueness identity as adding');
});

withStore((store) => {
  const keeper = store.addBook(book('السجل الأقدم', 'raf-0001'));
  const other = store.addBook(book('سجل مختلف', 'raf-1001'));

  // Simulate a legacy/corrupt database that contains a formatting-equivalent
  // duplicate and a record with no reference number.
  store.db.books.push({
    ...book('السجل المكرر', ' RAF – 0001 '),
    id: 'legacy-duplicate',
    loans: [],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  keeper.createdAt = '2026-01-01T00:00:00.000Z';
  store.db.books.push({
    ...book('بلا رقم مرجعي', ''),
    id: 'legacy-missing',
    loans: [],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  });
  store._save();

  const before = store.integrityCheck();
  assert.strictEqual(before.duplicateRefs.length, 1, 'only the formatting-equivalent pair should be duplicated');
  assert.strictEqual(before.duplicateRefs[0].count, 2);
  assert.ok(!before.duplicateRefs[0].books.some((b) => b.referenceNumber === 'raf-1001'), 'raf-1001 must stay outside the duplicate group');

  const repaired = store.repairIntegrity();
  assert.ok(repaired.backup && fs.existsSync(repaired.backup), 'repair must create a backup');
  assert.strictEqual(repaired.after.duplicateRefs.length, 0, 'repair must resolve real duplicate references');

  const byTitle = Object.fromEntries(store.db.books.map((b) => [b.title, b.referenceNumber]));
  assert.strictEqual(byTitle['السجل الأقدم'], 'raf-0001', 'oldest record keeps the established reference');
  assert.strictEqual(byTitle['سجل مختلف'], 'raf-1001', 'unrelated reference remains unchanged');
  assert.strictEqual(byTitle['السجل المكرر'], 'raf-0002', 'duplicate receives the lowest free canonical reference');
  assert.strictEqual(byTitle['بلا رقم مرجعي'], 'raf-0003', 'missing reference receives the next free canonical reference');
});


withStore((store, dir) => {
  store.addBook(book('موجود', 'raf-0001'));
  const importPath = path.join(dir, 'import.json');
  fs.writeFileSync(importPath, JSON.stringify({ books: [
    book('تنسيق مكرر', ' RAF – 0001 '),
    book('رقم مختلف', 'raf-1001'),
  ] }), 'utf8');

  const result = store.importJson(importPath);
  assert.strictEqual(result.added, 1, 'import must keep raf-1001 because it is a different full reference');
  assert.strictEqual(result.skipped, 1, 'import must skip only the formatting-equivalent raf-0001');
  assert.ok(store.db.books.some((b) => b.referenceNumber === 'raf-1001'));
});


withStore((store) => {
  const original = store.addBook(book('محذوف', 'raf-0001'));
  store.removeBook(original.id);
  store.addBook(book('حجز الرقم بعد الحذف', 'raf-0001'));
  const restored = store.restoreBook(original);
  assert.strictEqual(restored.referenceNumber, 'raf-0002', 'undo restore must not reintroduce a duplicate reference');
  assert.strictEqual(store.integrityCheck().duplicateRefs.length, 0);
});

console.log('✓ Raff integrity tests passed');
