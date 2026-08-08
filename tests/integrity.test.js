'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/js/store');
const Book = require('../src/js/book-status');
const AuthStore = require('../src/js/auth-store');

const tempRoots = [];
function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `raff-${label}-`));
  tempRoots.push(dir);
  return dir;
}
function book(store, data = {}) {
  const result = store.addBook({ title: data.title || 'كتاب اختباري', author: data.author || 'مؤلف', ...data });
  assert.ok(result && result.id, result?.error || 'تعذر إضافة كتاب');
  return result;
}
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

try {
  test('الأرقام المرجعية تنظف اختلافات التنسيق من دون خلط 0001 مع 1001', () => {
    const store = new Store(tempDir('refs'));
    const a = book(store, { referenceNumber: ' RAF – ٠٠٠١ ' });
    assert.strictEqual(a.referenceNumber.toLowerCase(), 'raf-0001');
    const duplicate = store.addBook({ title: 'مكرر', referenceNumber: 'raf-1' });
    assert.strictEqual(duplicate.ok, false);
    const distinct = book(store, { title: 'مختلف', referenceNumber: 'raf-1001' });
    assert.strictEqual(distinct.referenceNumber.toLowerCase(), 'raf-1001');
  });

  test('توليد الأرقام المتتابعة يستخدم الفهرس ولا يعيد المسح البطيء لكل الكتب', () => {
    const store = new Store(tempDir('sequence'));
    const started = Date.now();
    for (let i = 0; i < 2000; i += 1) {
      const added = store.addBook({ title: `كتاب ${i}` }, { defer: true });
      assert.ok(added.id);
    }
    assert.ok(Date.now() - started < 2500, 'توليد 2000 رقم أبطأ من المتوقع');
    assert.strictEqual(new Set(store.getAll().map((b) => b.referenceNumber)).size, 2000);
  });

  test('الإعارة الجزئية والإرجاع الجزئي يحافظان على بقية الأجزاء مفتوحة', () => {
    const store = new Store(tempDir('loans'));
    const b = book(store, { volumes: 4, copiesTotal: 1 });
    const lent = store.borrowCopy(b.id, { borrowerName: 'أحمد', scope: 'volume', volumes: [1, 3] });
    assert.strictEqual(lent.ok, true);
    const loan = lent.book.loans[0];
    const partial = store.returnLoanParts(b.id, loan.id, [1]);
    assert.deepStrictEqual(partial.remainingVolumes, [3]);
    assert.strictEqual(partial.completed, false);
    assert.strictEqual(Book.bookStatus(partial.book), Book.STATUS_PARTIAL);
    const complete = store.returnLoanParts(b.id, loan.id, [3]);
    assert.strictEqual(complete.completed, true);
    assert.strictEqual(Book.bookStatus(complete.book), Book.STATUS_AVAILABLE);
  });

  test('لا يمكن حذف كتاب معار، وبعد الإرجاع ينتقل إلى السلة ويمكن استعادته', () => {
    const store = new Store(tempDir('trash'));
    const b = book(store);
    const lent = store.borrowCopy(b.id, { borrowerName: 'سارة' });
    assert.strictEqual(store.removeBook(b.id).ok, false);
    assert.strictEqual(store.returnLoan(b.id, lent.book.loans[0].id).ok, true);
    const removed = store.removeBook(b.id);
    assert.strictEqual(removed.ok, true);
    assert.strictEqual(store.getTrash().length, 1);
    const restored = store.restoreBook(removed.trashId);
    assert.strictEqual(restored.id, b.id);
    assert.strictEqual(store.getTrash().length, 0);
  });

  test('الدمج يضيف غير المكرر، بينما الاستعادة الكاملة تعيد الإعدادات والسجلات', () => {
    const sourceDir = tempDir('source');
    const source = new Store(sourceDir);
    book(source, { title: 'الأصل', referenceNumber: 'raf-0020' });
    source.updateSettings({ institutionName: 'مكتبة الاختبار', scannerGapMs: 61 });
    const exported = path.join(sourceDir, 'complete.json');
    source.exportJson(exported);

    const target = new Store(tempDir('target'));
    book(target, { title: 'حالي', referenceNumber: 'raf-0001' });
    const merged = target.mergeJson(exported);
    assert.strictEqual(merged.added, 1);
    assert.strictEqual(target.getAll().length, 2);

    target.restoreJson(exported);
    assert.strictEqual(target.getAll().length, 1);
    assert.strictEqual(target.getSettings().institutionName, 'مكتبة الاختبار');
    assert.strictEqual(target.getSettings().scannerGapMs, 61);
  });

  test('وضع البحث العام يحجب بيانات المستعير والملاحظات والسجلات المؤرشفة', () => {
    const store = new Store(tempDir('public'));
    const visible = book(store, { notes: 'خاص', acquisition: 'تبرع' });
    store.borrowCopy(visible.id, { borrowerName: 'اسم سري', contact: '0100000000', note: 'خاص' });
    const archived = book(store, { title: 'مؤرشف' });
    store.archiveBook(archived.id, true);
    const publicBooks = store.getPublicBooks();
    assert.strictEqual(publicBooks.length, 1);
    assert.strictEqual(publicBooks[0].notes, '');
    assert.strictEqual(publicBooks[0].acquisition, '');
    assert.strictEqual(publicBooks[0].loans[0].borrowerName, '');
    assert.strictEqual(publicBooks[0].loans[0].contact, '');
  });

  test('التعديل الجماعي يغيّر الحقول المطلوبة فقط', () => {
    const store = new Store(tempDir('bulk'));
    const a = book(store, { title: 'أ', author: 'مؤلف أ' });
    const b = book(store, { title: 'ب', author: 'مؤلف ب' });
    const result = store.bulkUpdate([a.id, b.id], { shelf: 'A-3', addKeyword: 'مختار' });
    assert.strictEqual(result.updated, 2);
    for (const item of store.getAll()) {
      assert.strictEqual(item.shelf, 'A-3');
      assert.ok(item.keywords.includes('مختار'));
    }
  });

  test('كلمة مرور الإدارة وإجابة الاسترداد لا تحفظان كنص ويمكن الاسترداد بهما', () => {
    const dir = tempDir('auth');
    const auth = new AuthStore(dir);
    const state = auth.configure({ password: 'Raff-Secret-42', question: 'ما الكلمة؟', answer: 'إجابة سرية', startInPublicMode: true });
    assert.strictEqual(state.configured, true);
    const raw = fs.readFileSync(path.join(dir, 'raff-security.json'), 'utf8');
    assert.ok(!raw.includes('Raff-Secret-42'));
    assert.ok(!raw.includes('إجابة سرية'));
    auth.logout();
    assert.strictEqual(auth.login('خطأ').ok, false);
    assert.strictEqual(auth.login('Raff-Secret-42').ok, true);
    auth.logout();
    const reset = auth.resetPassword({ answer: '  إجابة   سرية  ', newPassword: 'New-Raff-99' });
    assert.strictEqual(reset.ok, true);
    auth.logout();
    assert.strictEqual(auth.login('New-Raff-99').ok, true);
  });

  test('عداد محاولات الإدارة ينقص بدقة ثم يفعّل القفل المؤقت', () => {
    const dir = tempDir('auth-attempts');
    const auth = new AuthStore(dir);
    auth.configure({ password: 'Raff-Secure-77', question: 'السؤال', answer: 'الإجابة' });
    auth.logout();
    assert.strictEqual(auth.getState().attemptsRemaining, 5);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = auth.login('نفس-الكلمة-الخاطئة');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.state.attemptsRemaining, Math.max(0, 5 - attempt));
      assert.strictEqual(result.state.failedAttempts, attempt);
    }
    const locked = auth.getState();
    assert.strictEqual(locked.attemptsRemaining, 0);
    assert.ok(locked.lockedForMs > 0);
  });

  test('عقود واجهة 3.0 تمنع مربعات Windows وتفصل حزمتَي x64 وx86 وتحفظ نص الملصق كاملًا', () => {
    const root = path.resolve(__dirname, '..');
    const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
    const viewsSource = fs.readFileSync(path.join(root, 'src/js/views.js'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(root, 'src/js/settings-view.js'), 'utf8');
    const fileDialogSource = fs.readFileSync(path.join(root, 'src/js/file-dialog.js'), 'utf8');
    const v3Css = fs.readFileSync(path.join(root, 'src/css/v3.css'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    const nativeDialogPattern = /showSaveDialog|showOpenDialog|window\.print\(|shell\.openPath|openDataFolder|<input[^>]+type=["']file/i;
    assert.ok(!nativeDialogPattern.test([mainSource, preloadSource, viewsSource, settingsSource].join('\n')));
    assert.ok(fileDialogSource.includes('showRaffFileDialog'));
    assert.ok(fileDialogSource.includes('showRaffPrintDialog'));
    assert.ok(fileDialogSource.includes("mode: 'browse'"));
    assert.ok(v3Css.includes('--v3-sidebar-admin:'));
    assert.ok(v3Css.includes('--v3-sidebar-public:'));
    assert.ok(v3Css.includes('var(--v3-sidebar-admin)'));
    assert.ok(v3Css.includes('var(--v3-sidebar-public)'));

    assert.ok(packageJson.scripts['dist:win:x64'].includes('--x64'));
    assert.ok(packageJson.scripts['dist:win:x86'].includes('--ia32'));
    assert.strictEqual(packageJson.build.win.target, 'nsis');
    assert.strictEqual(packageJson.build.win.artifactName, 'Raff-${version}-Windows-${arch}-Setup.${ext}');

    const labelStart = viewsSource.indexOf('function buildLabelsHtml');
    const labelEnd = viewsSource.indexOf('async function printBarcodeLabels');
    const labelSource = viewsSource.slice(labelStart, labelEnd);
    assert.ok(labelStart >= 0 && labelEnd > labelStart);
    assert.ok(!labelSource.includes('.slice(0, 42)'));
    assert.ok(!/text-overflow\s*:\s*ellipsis|line-clamp/.test(labelSource));
    assert.ok(labelSource.includes('overflow-wrap: anywhere'));
    assert.ok(mainSource.includes('LABEL_FIT_SCRIPT'));
  });

  test('وضع طي القائمة الجانبية يعمل كمسار أيقونات بلا نصوص أو صفوف خفية', () => {
    const root = path.resolve(__dirname, '..');
    const appSource = fs.readFileSync(path.join(root, 'src/js/app.js'), 'utf8');
    const accessSource = fs.readFileSync(path.join(root, 'src/js/access-control.js'), 'utf8');
    const v3Css = fs.readFileSync(path.join(root, 'src/css/v3.css'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

    assert.ok(appSource.includes("classList.toggle('is-collapsed'"));
    assert.ok(appSource.includes("target.getAttribute('aria-label') || target.dataset.tooltip"));
    assert.ok(accessSource.includes('switchBtn.dataset.tooltip = title'));
    assert.ok(v3Css.includes('body.sidebar-collapsed .access-mode-copy'));
    assert.ok(v3Css.includes('body.sidebar-collapsed .nav-group-label'));
    assert.ok(v3Css.includes('display: none !important;'));
    assert.ok(v3Css.includes('--sidebar-collapsed-width: 70px'));
    assert.ok(v3Css.includes('height: 39px !important'));
    assert.ok(html.includes('class="rail-control-glyph"'));
    assert.ok(html.includes('class="rail-panel"'));
    assert.ok(html.includes('class="rail-chevron"'));
  });

  test('إصلاحات الواجهة تحجب إدارة الـrail وتسرّع دليل المستعيرين وتثبت تبويبات الإعدادات', () => {
    const root = path.resolve(__dirname, '..');
    const loanSource = fs.readFileSync(path.join(root, 'src/js/loans-view.js'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(root, 'src/js/settings-view.js'), 'utf8');
    const v3Css = fs.readFileSync(path.join(root, 'src/css/v3.css'), 'utf8');

    assert.ok(v3Css.includes('body.sidebar-collapsed .nav-item[hidden]'));
    assert.ok(v3Css.includes('body.mode-public .nav-item[data-admin-only]'));
    assert.ok(v3Css.includes('[data-admin-only][hidden]'));
    assert.ok(v3Css.includes('display: none !important'));
    assert.ok(loanSource.includes('borrowerSummaries()'));
    assert.ok(loanSource.includes('RAFF_STATE.meta?.borrowerProfiles'));
    assert.ok(loanSource.includes('getBorrowerDetailsCached'));
    assert.ok(loanSource.includes('Pure local render: no IPC'));
    assert.ok(settingsSource.includes("body.innerHTML = panels[_settingsTab]"));
    assert.ok(settingsSource.includes('maintenance-actions-grid'));
    assert.ok(v3Css.includes('height: 42px !important'));
    assert.ok(v3Css.includes('.maintenance-card'));
  });

  test('النسخ الصادرة من مخطط أحدث تُرفض بدلاً من إتلاف البيانات الحالية', () => {
    const dir = tempDir('future');
    const store = new Store(dir);
    book(store, { title: 'يبقى' });
    const future = path.join(dir, 'future.json');
    fs.writeFileSync(future, JSON.stringify({ schemaVersion: 999, books: [] }));
    assert.throws(() => store.restoreJson(future), /إصدار أحدث/);
    assert.strictEqual(store.getAll().length, 1);
  });

  console.log('\nجميع اختبارات رَفّ 3.0.0 نجحت.');
} finally {
  for (const dir of tempRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}
