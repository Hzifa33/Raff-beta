'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/js/store');
const RaffV4Store = require('../src/js/raff-v4-store');
const LocalOpacServer = require('../src/js/local-opac-server');

function tempStore(prefix = 'raff-v4-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const legacy = new Store(dir);
  const v4 = new RaffV4Store(legacy);
  return { dir, legacy, v4 };
}

(async () => {
  const ctx = tempStore();
  const cleanup = [ctx.dir];
  let opac;
  try {
    const { v4 } = ctx;

    // New normalized catalog: one bibliographic record, one holding, and a
    // unique physical item for every copy/volume combination.
    const record = v4.createRecord({
      title: 'اختبار رَفّ 4', author: 'مؤلف الاختبار', publisher: 'دار الاختبار',
      category: 'اختبارات', referenceNumber: 'raf-4000', isbn13: '9780306406157',
      copiesTotal: 2, volumes: 2, shelf: 'A-01', subjects: ['اختبار', 'برمجيات'],
    });
    assert.ok(record.id && record.legacyBookId, 'record must be linked to the compatible legacy record');
    let snapshot = v4.snapshot();
    const items = snapshot.items.filter((x) => x.recordId === record.id && !x.deletedAt && !x.archived);
    assert.strictEqual(items.length, 4, 'two copies of a two-volume work must create four individually tracked items');
    assert.strictEqual(new Set(items.map((x) => x.barcode)).size, 4, 'every physical item needs a unique barcode');
    assert.ok(snapshot.holdings.some((x) => x.recordId === record.id && x.shelf === 'A-01'));

    // Offline ISBN check is mathematical only and never depends on a service.
    assert.deepStrictEqual(v4.validateIsbn('978-0-306-40615-7'), { type: 'ISBN-13', valid: true, value: '9780306406157' });
    assert.strictEqual(v4.validateIsbn('9780306406158').valid, false);

    // Patrons, circulation, partial return and renewal.
    const patron = v4.createEntity('patrons', { name: 'قارئ الاختبار', phone: '01000000000', privacyConsent: true });
    const loan = v4.checkout({ patronId: patron.id, itemIds: [items[0].id, items[1].id] })[0];
    snapshot = v4.snapshot();
    assert.strictEqual(snapshot.items.find((x) => x.id === items[0].id).status, 'on_loan');
    const renewed = v4.renewLoan(loan.id);
    assert.strictEqual(renewed.renewalCount, 1);
    v4.returnItems({ itemIds: [items[0].id] });
    snapshot = v4.snapshot();
    assert.strictEqual(snapshot.items.find((x) => x.id === items[0].id).status, 'available');
    assert.strictEqual(snapshot.items.find((x) => x.id === items[1].id).status, 'on_loan');
    v4.returnItems({ itemIds: [items[1].id] });

    // Holds and waiting list state.
    const hold = v4.placeHold({ recordId: record.id, patronId: patron.id });
    assert.strictEqual(hold.status, 'waiting');
    assert.strictEqual(v4.updateHoldStatus(hold.id, 'ready').status, 'ready');

    // Inventory sessions classify correct, duplicate, unknown and missing scans.
    const inventory = v4.startInventory({ name: 'جرد الاختبار', branchId: 'branch_main', shelf: 'A-01' });
    assert.strictEqual(v4.scanInventory(inventory.id, items[0].barcode).status, 'ok');
    assert.strictEqual(v4.scanInventory(inventory.id, items[0].barcode).status, 'duplicate');
    assert.strictEqual(v4.scanInventory(inventory.id, 'UNKNOWN-4000').status, 'unknown');
    const invReport = v4.closeInventory(inventory.id);
    assert.strictEqual(invReport.scanned, 1);
    assert.ok(invReport.missing.length >= 1);

    // Authority control and duplicate merge.
    const authorityA = v4.createEntity('authorities', { type: 'person', preferred: 'طه حسين', variants: ['د. طه حسين'] });
    const authorityB = v4.createEntity('authorities', { type: 'person', preferred: 'حسين، طه', variants: ['طه حسين'] });
    const merged = v4.mergeAuthorities(authorityA.id, [authorityB.id]);
    assert.ok(merged.variants.includes('حسين، طه'));

    // MARCXML, ISO 2709, Dublin Core, JSON-LD, BibTeX, RIS and offline transfer formats.
    const marc = v4.exportMarcXml();
    assert.ok(marc.includes('<collection') && marc.includes('اختبار رَفّ 4'));
    const marcIso = v4.exportMarcIso2709();
    assert.ok(Buffer.isBuffer(marcIso) && marcIso.includes(Buffer.from('اختبار رَفّ 4')));
    assert.ok(v4.exportDublinCore().includes('<dc:title>اختبار رَفّ 4</dc:title>'));
    const jsonLd = JSON.parse(v4.exportJsonLd());
    assert.ok(jsonLd['@graph'].some((x) => x.name === 'اختبار رَفّ 4'));
    assert.ok(v4.exportBibTex().includes('@book'));
    assert.ok(v4.exportRis().includes('TY  - BOOK'));
    const transfer = v4.exportTransferPackage();
    assert.strictEqual(transfer.format, 'raff-offline-transfer');

    const ctx2 = tempStore('raff-v4-target-'); cleanup.push(ctx2.dir);
    const mergedTransfer = ctx2.v4.importTransferPackage(transfer);
    assert.ok(mergedTransfer.records >= 1);

    const ctxMarc = tempStore('raff-v4-marc-'); cleanup.push(ctxMarc.dir);
    assert.strictEqual(ctxMarc.v4.importMarcIso2709(marcIso).added, 1);
    assert.ok(ctxMarc.v4.snapshot().records.some((x) => x.title === 'اختبار رَفّ 4'));
    const bibResult = ctxMarc.v4.importBibTex('@book{offline, title={كتاب BibTeX}, author={كاتب محلي}, year={2026}, publisher={دار محلية}}');
    assert.strictEqual(bibResult.added, 1);
    const risResult = ctxMarc.v4.importRis('TY  - BOOK\nTI  - كتاب RIS\nAU  - مؤلف محلي\nPY  - 2026\nPB  - ناشر محلي\nER  -');
    assert.strictEqual(risResult.added, 1);

    // Notifications are derived locally from circulation/holds and can be acknowledged.
    const notifications = v4.refreshNotifications();
    assert.ok(notifications.some((x) => x.relatedId === hold.id));
    const firstNotification = notifications[0];
    assert.strictEqual(v4.markNotification(firstNotification.id, true).read, true);

    // A physical item can move between branches without losing its identity.
    v4.updateHoldStatus(hold.id, 'fulfilled');
    const secondBranch = v4.createEntity('branches', { code: 'B2', name: 'الفرع الثاني' });
    const itemToMove = v4.snapshot().items.find((x) => x.recordId === record.id && x.status === 'available');
    assert.ok(itemToMove, 'an available item is required for the transfer test');
    const branchTransfer = v4.createTransfer({ fromBranchId: 'branch_main', toBranchId: secondBranch.id, itemIds: [itemToMove.id], notes: 'اختبار نقل محلي' });
    assert.strictEqual(v4.snapshot().items.find((x) => x.id === itemToMove.id).status, 'in_transit');
    v4.receiveTransfer(branchTransfer.id, { shelf: 'B-02' });
    snapshot = v4.snapshot();
    assert.strictEqual(snapshot.items.find((x) => x.id === itemToMove.id).status, 'available');
    const movedHolding = snapshot.holdings.find((x) => x.id === snapshot.items.find((i) => i.id === itemToMove.id).holdingId);
    assert.strictEqual(movedHolding.branchId, secondBranch.id);

    // Custom fields are validated and unique inside their scope.
    const custom = v4.createEntity('customFields', { scope: 'record', key: 'depositNumber', label: 'رقم الإيداع', type: 'text' });
    assert.strictEqual(custom.key, 'depositNumber');
    assert.throws(() => v4.createEntity('customFields', { scope: 'record', key: 'depositNumber', label: 'مكرر', type: 'text' }), /مستخدم بالفعل/);
    assert.throws(() => v4.createEntity('customFields', { scope: 'record', key: 'رقم', label: 'غير صالح', type: 'text' }), /المفتاح التقني/);

    // Trash is recoverable before explicit purge.
    const tempPatron = v4.createEntity('patrons', { name: 'قارئ مؤقت' });
    const trash = v4.deleteEntity('patrons', tempPatron.id, 'اختبار السلة');
    assert.ok(v4.snapshot().trash.some((x) => x.id === trash.id));
    assert.strictEqual(v4.restoreTrash(trash.id), true);
    assert.ok(v4.snapshot().patrons.some((x) => x.id === tempPatron.id && !x.deletedAt));

    // PIN hashes never cross the renderer boundary, and role permissions are enforced.
    const viewer = v4.createEntity('users', { username: 'reader', displayName: 'باحث', role: 'viewer', pin: '1234' });
    snapshot = v4.snapshot();
    const publicViewer = snapshot.users.find((x) => x.id === viewer.id);
    assert.strictEqual(publicViewer.hasPin, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(publicViewer, 'pinHash'), false);
    assert.strictEqual(v4.authenticateUser(viewer.id, '1234').ok, true);
    const viewerSnapshot = v4.snapshot();
    assert.strictEqual(viewerSnapshot.patrons.length, 0, 'researcher snapshots must not expose patron contact records');
    assert.strictEqual(viewerSnapshot.loans.length, 0, 'researcher snapshots must not expose circulation history');
    assert.deepStrictEqual(viewerSnapshot.users.map((x) => x.id), [viewer.id], 'researchers only receive their own local user identity');
    assert.throws(() => v4.createRecord({ title: 'غير مسموح' }), /صلاحية/);
    assert.strictEqual(v4.authenticateUser('user_admin', '').ok, true);

    // Integrity and backups.
    const integrity = v4.integrityReport();
    assert.ok(Number.isFinite(integrity.score));
    const backup = v4.createSnapshot('test-v4');
    assert.ok(fs.existsSync(backup.filePath));
    assert.ok(v4.listBackups().length >= 1);

    // Read-only local OPAC exposes public catalog data only.
    opac = new LocalOpacServer(() => v4.snapshot());
    const status = await opac.start({ lan: false });
    assert.strictEqual(status.running, true);
    const result = await fetch(`${status.localUrl}/api/search?q=${encodeURIComponent('اختبار')}`).then((r) => r.json());
    assert.ok(result.records.some((x) => x.id === record.id));
    const publicRecord = await fetch(`${status.localUrl}/api/record/${encodeURIComponent(record.id)}`).then((r) => r.json());
    assert.strictEqual(publicRecord.title, 'اختبار رَفّ 4');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(publicRecord, 'patrons'), false);
    await opac.stop(); opac = null;

    console.log('✓ Raff 4 offline domain tests passed');
  } finally {
    if (opac) await opac.stop().catch(() => {});
    for (const dir of cleanup) fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
