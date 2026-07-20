'use strict';

/* ========================================================================
   رَفّ 4 — management, offline exchange and accessibility surfaces
   Loaded after v4-ui.js and before app.js.
   ======================================================================== */

const V4_ROUTE_META = {
  dashboard: ['لوحة المعلومات', 'نظرة عملية هادئة على المجموعة والخدمة اليومية'],
  opac: ['فهرس الباحث', 'واجهة بحث مبسطة للعثور على الكتاب ومكانه وإتاحته'],
  'reading-lists': ['قوائم القراءة', 'قوائم محلية للباحثين والبرامج الثقافية'],
  circulation: ['مكتب الإعارة', 'إعارة وإرجاع وتجديد سريع قائم على النسخ المادية'],
  patrons: ['المستعيرون', 'العضويات وسجل الاستخدام والقيود المحلية'],
  holds: ['الحجوزات', 'قوائم الانتظار وتجهيز النسخ للاستلام'],
  inventory: ['الجرد الميداني', 'جلسات مسح بالباركود ومقارنة الموجود بالسجل'],
  catalog: ['السجلات والمقتنيات', 'فهرسة احترافية تفصل العنوان عن المقتنى والنسخة'],
  authorities: ['الضبط الاستنادي', 'أسماء موحدة للمؤلفين والموضوعات والسلاسل'],
  exchange: ['الاستيراد والتبادل', 'تنسيقات مكتبية محلية دون اتصال بخدمات خارجية'],
  acquisitions: ['التزويد والمشتريات', 'طلبات الشراء والموردون والاستلام والميزانيات'],
  serials: ['الدوريات', 'الاشتراكات والأعداد المتوقعة والمتأخرة'],
  publisher: ['وضع دار النشر', 'الإصدارات والطبعات والمخزون والتوزيع محليًا'],
  branches: ['الفروع والمواقع', 'هيكل المكتبة والقاعات والخزائن والرفوف'],
  policies: ['سياسات الإعارة', 'قواعد واضحة حسب نوع المستعير والمادة والفرع'],
  users: ['المستخدمون والصلاحيات', 'حسابات محلية وأدوار وسجل تدقيق'],
  audit: ['سجل التدقيق', 'تاريخ غير صامت للعمليات الحساسة'],
  trash: ['سلة المحذوفات', 'استعادة آمنة قبل الحذف النهائي'],
  settings: ['الإعدادات والنسخ', 'الهوية والخصوصية والنسخ الاحتياطية وإمكانية الوصول'],
};

function v4safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch (_) { return ''; }
}

function v4formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / 1024 ** 2).toFixed(1)} ميجابايت`;
}

function v4entityName(entity) {
  const labels = {
    records: 'سجل ببليوغرافي', holdings: 'مقتنى', items: 'نسخة مادية', loans: 'إعارة',
    inventorySessions: 'جلسة جرد', system: 'النظام', ...V4_ENTITY_LABELS,
  };
  return labels[entity] || entity || 'سجل';
}

function v4actionLabel(action) {
  const labels = {
    create: 'إنشاء', update: 'تعديل', delete: 'نقل إلى السلة', restore: 'استعادة', purge: 'حذف نهائي',
    checkout: 'إعارة', return: 'إرجاع', renew: 'تجديد', hold: 'حجز', inventory: 'جرد', merge: 'دمج',
    import: 'استيراد', export: 'تصدير', backup: 'نسخة احتياطية', repair: 'إصلاح آمن', login: 'تبديل مستخدم',
    migrate: 'ترحيل', transfer: 'نقل', status: 'تغيير حالة', bulk_update: 'تعديل جماعي',
  };
  return labels[action] || action || 'عملية';
}

function renderV4Publisher(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Publisher(root)); return; }
  const d = RAFF4_STATE.data;
  const records = d.records.filter((x) => !x.deletedAt);
  const items = d.items.filter((x) => !x.deletedAt && !x.archived);
  const statuses = ['مخطط', 'قيد التحرير', 'قيد الطباعة', 'متاح', 'نافد'];
  const rows = records.map((r) => {
    const its = items.filter((i) => i.recordId === r.id);
    const stock = its.filter((i) => ['available', 'reserved'].includes(i.status)).length;
    const sold = Number(r.customFields?.soldCopies || 0);
    const printRun = Number(r.customFields?.printRun || its.length || 0);
    const status = r.customFields?.publicationStatus || 'متاح';
    return { r, stock, sold, printRun, status, value: its.reduce((s, i) => s + (Number(i.price) || 0), 0) };
  });
  const lowStock = rows.filter((x) => x.stock <= Number(d.settings?.publisherLowStockThreshold || 5));
  const totalPrinted = rows.reduce((s, x) => s + x.printRun, 0);
  const stockValue = rows.reduce((s, x) => s + x.value, 0);
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('التزويد والنشر', 'وضع دار النشر', 'واجهة مركزة للإصدارات والطبعات والمخزون، دون تحويل رَفّ إلى برنامج محاسبة معقد.', `${v4action('إصدار جديد', 'new-record', 'plus', 'primary')}${v4action('طلب طباعة', 'new-acquisition', 'printer')}`)}
    <div class="v4-note">هذا الوضع محلي بالكامل. تُستخدم السجلات الببليوغرافية نفسها مع حقول نشر إضافية، لذلك لا تتكرر بيانات الكتاب بين المكتبة ودار النشر.</div>
    <div class="v4-metrics-grid">
      ${v4metric('العناوين', rows.length, 'book', 'كل الإصدارات المسجلة')}
      ${v4metric('إجمالي الطبعات/النسخ', totalPrinted, 'copies', 'وفق دفعات الطباعة المسجلة')}
      ${v4metric('منخفض المخزون', lowStock.length, 'alert', 'بحاجة إلى مراجعة', lowStock.length ? 'danger' : '')}
      ${v4metric('قيمة المخزون', v4money(stockValue), 'stack', 'قيمة تقديرية محلية')}
    </div>
    <section class="v4-card">
      <div class="v4-card-head"><div><h3>كتالوج الإصدارات</h3><p>الطبعة والحالة والمخزون في مكان واحد</p></div><div class="v4-search compact">${icon('search', 14)}<input id="publisherSearch" placeholder="ابحث عن عنوان أو مؤلف أو ISBN"></div></div>
      <div class="v4-card-body" style="padding:0;"><div class="v4-table-wrap" style="border:0;border-radius:0;"><table class="v4-table"><thead><tr><th>الإصدار</th><th>حالة النشر</th><th>دفعة الطباعة</th><th>المتاح</th><th>المباع/الموزع</th><th>إجراءات</th></tr></thead><tbody id="publisherRows">${v4PublisherRows(rows, statuses)}</tbody></table></div></div>
    </section>
    <div class="v4-two-col">
      <section class="v4-card"><div class="v4-card-head"><div><h3>تنبيهات المخزون</h3><p>عناوين عند حد إعادة الطباعة</p></div></div><div class="v4-card-body">${lowStock.length ? lowStock.slice(0, 8).map((x) => `<button class="v4-list-row" data-v4-action="record-details" data-id="${v4e(x.r.id)}"><span><b>${v4e(x.r.title)}</b><small>${v4e(x.r.edition || 'طبعة غير محددة')}</small></span><span class="v4-badge warning">${x.stock} متاح</span></button>`).join('') : v4empty('check', 'المخزون مستقر', 'لا توجد عناوين تحت حد التنبيه الحالي.')}</div></section>
      <section class="v4-card"><div class="v4-card-head"><div><h3>إجراءات النشر</h3><p>مهام واضحة بدل ازدحام الواجهة</p></div></div><div class="v4-card-body"><div class="v4-quick-grid">
        <button data-v4-action="new-record">${icon('book', 18)}<b>إضافة إصدار</b><small>سجل وطبعة ونسخ</small></button>
        <button data-v4-route="acquisitions">${icon('download', 18)}<b>طلبات الطباعة</b><small>التكاليف والموردون</small></button>
        <button data-v4-action="export-bibtex">${icon('note', 18)}<b>كتالوج BibTeX</b><small>تصدير ببليوغرافي</small></button>
        <button data-v4-action="export-marc">${icon('upload', 18)}<b>تصدير MARC</b><small>تبادل مع المكتبات</small></button>
      </div></div></section>
    </div>
  </div>`;
  const input = root.querySelector('#publisherSearch');
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLocaleLowerCase('ar');
    const filtered = !q ? rows : rows.filter((x) => `${x.r.title} ${x.r.author} ${x.r.publisher} ${x.r.isbn13}`.toLocaleLowerCase('ar').includes(q));
    root.querySelector('#publisherRows').innerHTML = v4PublisherRows(filtered, statuses);
  });
}

function v4PublisherRows(rows, statuses) {
  if (!rows.length) return `<tr><td colspan="6">${v4empty('book', 'لا توجد إصدارات', 'أضف أول سجل ببليوغرافي لتبدأ إدارة النشر.')}</td></tr>`;
  return rows.map((x) => `<tr>
    <td><b>${v4e(x.r.title)}</b><div class="muted">${v4e(x.r.author || '—')} · ${v4e(x.r.edition || 'طبعة غير محددة')}</div></td>
    <td><select class="v4-inline-select" data-v4-publisher-status="${v4e(x.r.id)}">${statuses.map((s) => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><input class="v4-inline-number" type="number" min="0" value="${v4e(x.printRun)}" data-v4-print-run="${v4e(x.r.id)}"></td>
    <td><b>${x.stock}</b></td><td>${x.sold}</td>
    <td><div class="v4-table-actions">${v4iconButton('record-details', x.r.id, 'info', 'التفاصيل')}${v4iconButton('edit-record', x.r.id, 'edit', 'تعديل')}</div></td>
  </tr>`).join('');
}

function renderV4Exchange(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Exchange(root)); return; }
  const d = RAFF4_STATE.data;
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الفهرسة والمجموعات', 'الاستيراد والتبادل المحلي', 'تنسيقات معيارية وحزم نقل تعمل من ملفات الجهاز فقط؛ لا توجد أي مكالمات شبكية.', '')}
    <div class="v4-note success"><b>Offline First:</b> كل الاستيراد والتصدير هنا يقرأ أو يكتب ملفًا محليًا يختاره المستخدم. لا يُرسل أي سجل إلى الإنترنت.</div>
    <div class="exchange-grid">
      ${v4ExchangeCard('MARCXML', 'استيراد وتصدير سجلات MARC 21 بصيغة XML مع حقول العنوان والمؤلف والنشر والموضوعات.', 'import-marc', 'export-marc', 'upload')}
      ${v4ExchangeCard('MARC 21 · ISO 2709', 'ملفات MRC الثنائية القياسية لتبادل السجلات مع أنظمة المكتبات الاحترافية.', 'import-marc-iso', 'export-marc-iso', 'stack')}
      ${v4ExchangeCard('BibTeX', 'استيراد وتصدير مراجع الكتب للباحثين وبرامج إدارة الاستشهادات.', 'import-bibtex', 'export-bibtex', 'note')}
      ${v4ExchangeCard('RIS', 'استيراد وتصدير المراجع بصيغة RIS المتوافقة مع أدوات البحث المرجعي.', 'import-ris', 'export-ris', 'note')}
      ${v4ExchangeCard('Dublin Core', 'تصدير وصف مبسط ومتوافق مع المستودعات والفهارس الرقمية بصيغة XML.', '', 'export-dublin-core', 'download')}
      ${v4ExchangeCard('JSON-LD', 'تصدير دلالي محلي وفق Schema.org للكتب والمؤلفين والسلاسل.', '', 'export-jsonld', 'code')}
      ${v4ExchangeCard('حزمة نقل رَفّ', 'نقل الفروع والمقتنيات والمستعيرين والسياسات عبر ملف محلي، دون خادم.', 'import-transfer', 'export-transfer', 'copies')}
      ${v4ExchangeCard('نسخة احتياطية كاملة', 'صورة محلية للبيانات قبل النقل أو التحديث أو الصيانة.', 'restore-backup', 'create-backup', 'refresh')}
      ${v4ExchangeCard('JSON / CSV / TXT / PDF', 'تصدير تشغيلي وتقارير من أدوات رَفّ المحلية الحالية.', '', 'open-legacy-settings', 'download')}
    </div>
    <section class="v4-card">
      <div class="v4-card-head"><div><h3>فحص ISBN محلي</h3><p>تحقق رياضي من ISBN-10 وISBN-13 من دون جلب أي بيانات خارجية</p></div></div>
      <div class="v4-card-body"><div class="v4-form-row"><div class="v4-search" style="flex:1;">${icon('hash', 15)}<input id="offlineIsbnInput" class="v4-ltr" placeholder="978... أو ISBN-10"></div><button class="v4-action primary" id="offlineIsbnCheck">تحقق</button></div><div id="offlineIsbnResult" class="v4-help-text" style="margin-top:10px;"></div></div>
    </section>
    <section class="v4-card">
      <div class="v4-card-head"><div><h3>ملخص قابلية التبادل</h3><p>حالة البيانات الحالية قبل التصدير</p></div></div>
      <div class="v4-card-body"><div class="v4-kpi-list"><div class="v4-kpi-row"><span>السجلات الببليوغرافية</span><b>${d.records.filter((x) => !x.deletedAt).length}</b></div><div class="v4-kpi-row"><span>السجلات ذات ISBN</span><b>${d.records.filter((x) => !x.deletedAt && (x.isbn13 || x.isbn10)).length}</b></div><div class="v4-kpi-row"><span>السجلات ذات مؤلف وناشر</span><b>${d.records.filter((x) => !x.deletedAt && x.author && x.publisher).length}</b></div><div class="v4-kpi-row"><span>اكتمال البيانات</span><b>${d.stats.completeness}%</b></div></div></div>
    </section>
  </div>`;
  root.querySelector('#offlineIsbnCheck')?.addEventListener('click', async () => {
    const value = root.querySelector('#offlineIsbnInput').value;
    const result = await window.raff4.validateIsbn(value);
    root.querySelector('#offlineIsbnResult').innerHTML = result.valid ? `<span class="v4-badge success">${v4e(result.type)} صحيح</span> الرقم صالح حسابيًا.` : `<span class="v4-badge danger">غير صالح</span> تحقق من عدد الأرقام ورقم التحقق.`;
  });
}

function v4ExchangeCard(title, text, importAction, exportAction, iconName) {
  return `<article class="exchange-card"><div class="exchange-icon">${icon(iconName, 20)}</div><div><h3>${v4e(title)}</h3><p>${v4e(text)}</p></div><div class="exchange-actions">${importAction ? `<button class="v4-action ghost" data-v4-action="${v4e(importAction)}">${icon('upload', 14)} استيراد</button>` : ''}${exportAction ? `<button class="v4-action" data-v4-action="${v4e(exportAction)}">${icon('download', 14)} تصدير</button>` : ''}</div></article>`;
}

async function renderV4Notifications(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Notifications(root)); return; }
  const rows = v4arr(RAFF4_STATE.data.notifications).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const unread = rows.filter((x) => !x.read).length;
  const labels = { danger: 'عاجل', warning: 'متابعة', success: 'جاهز', info: 'معلومة' };
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الرئيسية', 'مركز التنبيهات', 'يجمع رَفّ المواعيد والحجوزات والدوريات والتزويد والنقل، ويولّدها من البيانات المحلية فقط.', unread ? v4action('تعليم الكل كمقروء', 'notifications-read-all', 'check') : '')}
    <section class="v4-grid cols-4">
      ${v4metric('غير مقروء', unread, 'alert', 'يحتاج مراجعة', unread ? 'danger' : 'success')}
      ${v4metric('متأخرات', rows.filter((x) => x.key?.startsWith('loan-overdue:')).length, 'calendar', 'إعارات تجاوزت الموعد')}
      ${v4metric('حجوزات', rows.filter((x) => x.key?.startsWith('hold:')).length, 'book', 'انتظار أو جاهز')}
      ${v4metric('تشغيل ومخزون', rows.filter((x) => /^(serial|acquisition|transfer):/.test(x.key || '')).length, 'stack', 'دوريات وتزويد ونقل')}
    </section>
    <section class="v4-card">
      <div class="v4-card-head"><div><h3>التنبيهات الحالية</h3><p>${rows.length} تنبيهًا مشتقًا من حالة المكتبة</p></div><button class="v4-action ghost" data-v4-action="notifications-refresh">${icon('refresh', 14)} تحديث</button></div>
      <div class="v4-card-body notification-center">${rows.length ? rows.map((n) => `<article class="notification-row ${n.read ? 'is-read' : 'is-unread'}">
        <span class="notification-tone ${v4e(n.type || 'info')}">${icon(n.type === 'danger' ? 'alert' : n.type === 'warning' ? 'calendar' : n.type === 'success' ? 'check' : 'info', 16)}</span>
        <div class="notification-copy"><div><span class="v4-badge ${v4e(n.type || 'info')}">${v4e(labels[n.type] || 'تنبيه')}</span>${n.read ? '' : '<span class="notification-new">جديد</span>'}</div><h3>${v4e(n.title)}</h3><p>${v4e(n.message)}</p><small>${v4date(n.createdAt, true)}</small></div>
        <div class="notification-actions">${n.route ? `<button class="v4-action" data-v4-action="notification-open" data-id="${v4e(n.id)}" data-route="${v4e(n.route)}">فتح</button>` : ''}<button class="v4-action ghost" data-v4-action="notification-toggle" data-id="${v4e(n.id)}">${n.read ? 'غير مقروء' : 'تمت القراءة'}</button></div>
      </article>`).join('') : v4empty('check', 'لا توجد تنبيهات حالية', 'المواعيد والحجوزات والتزويد والنقل في حالة مستقرة.')}</div>
    </section>
  </div>`;
}

async function renderV4Audit(root) {
  if (!RAFF4_STATE.data) await refreshRaff4State();
  const rows = await window.raff4.auditLog({});
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الإدارة', 'سجل التدقيق', 'كل تعديل حساس موثق محليًا بالوقت والمستخدم والقيمة القديمة والجديدة.', v4action('تحديث', 'refresh-audit', 'refresh'))}
    <section class="v4-card"><div class="v4-card-head"><div><h3>البحث والتصفية</h3><p>اعثر على عملية محددة دون كشف السجل للمستخدم العادي</p></div></div><div class="v4-card-body"><div class="v4-form-grid"><div class="v4-field"><label>بحث</label><input id="auditQuery" placeholder="كتاب، مستعير، عملية..."></div><div class="v4-field"><label>نوع السجل</label><select id="auditEntity"><option value="">الكل</option>${[...new Set(rows.map((x) => x.entity).filter(Boolean))].map((x) => `<option value="${v4e(x)}">${v4e(v4entityName(x))}</option>`).join('')}</select></div><div class="v4-field"><label>المستخدم</label><select id="auditUser"><option value="">الكل</option>${[...new Map(rows.map((x) => [x.userId, x.userName])).entries()].map(([id, name]) => `<option value="${v4e(id)}">${v4e(name)}</option>`).join('')}</select></div><div class="v4-field"><label>العملية</label><select id="auditAction"><option value="">الكل</option>${[...new Set(rows.map((x) => x.action).filter(Boolean))].map((x) => `<option value="${v4e(x)}">${v4e(v4actionLabel(x))}</option>`).join('')}</select></div></div></div></section>
    <section class="v4-card"><div class="v4-card-head"><div><h3>العمليات</h3><p><span id="auditCount">${rows.length}</span> عملية محفوظة</p></div><button class="v4-action ghost" data-v4-action="export-audit">${icon('download', 14)} تصدير CSV</button></div><div class="v4-card-body" id="auditRows">${v4AuditRows(rows)}</div></section>
  </div>`;
  const apply = () => {
    const q = root.querySelector('#auditQuery').value.trim().toLocaleLowerCase('ar');
    const entity = root.querySelector('#auditEntity').value;
    const user = root.querySelector('#auditUser').value;
    const action = root.querySelector('#auditAction').value;
    const filtered = rows.filter((x) => (!q || `${x.summary} ${x.userName} ${v4entityName(x.entity)} ${v4actionLabel(x.action)}`.toLocaleLowerCase('ar').includes(q)) && (!entity || x.entity === entity) && (!user || x.userId === user) && (!action || x.action === action));
    root.querySelector('#auditRows').innerHTML = v4AuditRows(filtered);
    root.querySelector('#auditCount').textContent = filtered.length;
  };
  ['auditQuery', 'auditEntity', 'auditUser', 'auditAction'].forEach((id) => root.querySelector(`#${id}`)?.addEventListener(id === 'auditQuery' ? 'input' : 'change', apply));
}

function v4AuditRows(rows) {
  if (!rows.length) return v4empty('search', 'لا توجد عمليات مطابقة', 'غيّر معايير التصفية أو نفّذ عملية جديدة.');
  return `<div class="audit-timeline">${rows.slice(0, 1000).map((x) => `<article class="audit-entry"><div class="audit-dot"></div><div class="audit-entry-main"><div class="audit-entry-head"><div><span class="v4-badge info">${v4e(v4actionLabel(x.action))}</span><b>${v4e(x.summary || v4entityName(x.entity))}</b></div><time>${v4date(x.at, true)}</time></div><p>${v4e(x.userName || 'النظام')} · ${v4e(v4entityName(x.entity))}${x.entityId ? ` · <code>${v4e(x.entityId)}</code>` : ''}</p>${x.before || x.after ? `<details><summary>عرض التغييرات</summary><div class="audit-diff"><div><small>قبل</small><pre>${v4e(v4safeJson(x.before))}</pre></div><div><small>بعد</small><pre>${v4e(v4safeJson(x.after))}</pre></div></div></details>` : ''}</div></article>`).join('')}</div>`;
}

function renderV4Trash(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Trash(root)); return; }
  const rows = v4arr(RAFF4_STATE.data.trash).filter((x) => !x.restoredAt && !x.purgedAt);
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الإدارة', 'سلة المحذوفات', 'الحذف في رَفّ مرحلتان: نقل قابل للاستعادة ثم حذف نهائي واعٍ.', '')}
    <div class="v4-note warning">الحذف النهائي لا يمكن التراجع عنه. قبل الحذف النهائي يُنصح بإنشاء نسخة احتياطية من قسم الإعدادات.</div>
    <section class="v4-card"><div class="v4-card-head"><div><h3>العناصر المحذوفة</h3><p>${rows.length} عنصرًا قابلًا للاستعادة</p></div></div><div class="v4-card-body">${rows.length ? `<div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>النوع</th><th>العنصر</th><th>سبب الحذف</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${v4e(v4entityName(x.entity))}</td><td><b>${v4e(x.snapshot?.name || x.snapshot?.title || x.snapshot?.membershipNumber || x.entityId)}</b></td><td>${v4e(x.reason || 'غير محدد')}</td><td>${v4date(x.deletedAt, true)}</td><td><div class="v4-table-actions">${v4iconButton('restore-trash', x.id, 'refresh', 'استعادة')}${v4iconButton('purge-trash', x.id, 'trash', 'حذف نهائي', 'danger')}</div></td></tr>`).join('')}</tbody></table></div>` : v4empty('trash', 'السلة فارغة', 'لا توجد عناصر محذوفة حاليًا.')}</div></section>
  </div>`;
}

function renderRaff4Settings(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderRaff4Settings(root)); return; }
  const d = RAFF4_STATE.data;
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الإدارة', 'الإعدادات والنسخ', 'خيارات متقدمة منظّمة في مجموعات واضحة؛ الإعدادات النادرة لا تظهر في مسار الباحث.', '')}
    <div class="settings-nav" role="tablist">
      <button class="active" data-v4-settings-tab="interface">الواجهة</button><button data-v4-settings-tab="library">المكتبة</button><button data-v4-settings-tab="modules">الوحدات</button><button data-v4-settings-tab="fields">الحقول المخصصة</button><button data-v4-settings-tab="backup">النسخ والسلامة</button><button data-v4-settings-tab="legacy">أدوات التوافق</button>
    </div>
    <div id="v4SettingsPanel">${v4SettingsInterface(d)}</div>
  </div>`;
  root.querySelectorAll('[data-v4-settings-tab]').forEach((btn) => btn.addEventListener('click', () => {
    root.querySelectorAll('[data-v4-settings-tab]').forEach((x) => x.classList.toggle('active', x === btn));
    const key = btn.dataset.v4SettingsTab;
    const panel = root.querySelector('#v4SettingsPanel');
    if (key === 'interface') panel.innerHTML = v4SettingsInterface(RAFF4_STATE.data);
    if (key === 'library') panel.innerHTML = v4SettingsLibrary(RAFF4_STATE.data);
    if (key === 'modules') panel.innerHTML = v4SettingsModules(RAFF4_STATE.data);
    if (key === 'fields') panel.innerHTML = v4SettingsCustomFields(RAFF4_STATE.data);
    if (key === 'backup') { panel.innerHTML = v4SettingsBackup(RAFF4_STATE.data); wireV4BackupPanel(panel); }
    if (key === 'legacy') { panel.innerHTML = '<div id="legacySettingsHost"></div>'; renderSettings(panel.querySelector('#legacySettingsHost')); }
    wireV4SettingsForms(panel);
  }));
  wireV4SettingsForms(root.querySelector('#v4SettingsPanel'));
}

function v4SettingsInterface(d) {
  const s = d.settings;
  return `<section class="v4-card settings-panel"><div class="v4-card-head"><div><h3>المظهر وإمكانية الوصول</h3><p>التغييرات تُطبّق فورًا وتحفظ محليًا</p></div></div><div class="v4-card-body"><form id="v4InterfaceSettings" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>كثافة العرض</label><select name="interfaceDensity"><option value="comfortable" ${s.interfaceDensity === 'comfortable' ? 'selected' : ''}>مريح — للمستخدم العادي</option><option value="compact" ${s.interfaceDensity === 'compact' ? 'selected' : ''}>مضغوط — للجداول الكبيرة</option></select></div><div class="v4-field"><label>حجم الواجهة</label><input name="fontScale" type="range" min="0.9" max="1.25" step="0.05" value="${v4e(s.fontScale || 1)}"><small>من 90% إلى 125%</small></div><div class="v4-field"><label>مساحة العمل الافتراضية</label><select name="workspace"><option value="researcher" ${s.workspace === 'researcher' ? 'selected' : ''}>الباحث والاستكشاف</option><option value="circulation" ${s.workspace === 'circulation' ? 'selected' : ''}>الإعارة وخدمة القراء</option><option value="cataloging" ${s.workspace === 'cataloging' ? 'selected' : ''}>الفهرسة والمجموعات</option><option value="management" ${s.workspace === 'management' ? 'selected' : ''}>الإدارة والتقارير</option><option value="all" ${s.workspace === 'all' ? 'selected' : ''}>كل الأدوات</option></select></div><label class="v4-checkbox"><input name="highContrast" type="checkbox" ${s.highContrast ? 'checked' : ''}><span>تباين مرتفع</span></label></div><div class="v4-note">تُخفي «مساحة الباحث» أدوات الإدارة المعقدة من القائمة، لكنها لا تحذفها. يمكن للموظف الانتقال لمساحة أخرى عند الحاجة.</div><div class="v4-form-actions"><button class="v4-action primary" type="submit">حفظ إعدادات الواجهة</button></div></form></div></section>`;
}

function v4SettingsLibrary(d) {
  const s = d.settings;
  return `<section class="v4-card settings-panel"><div class="v4-card-head"><div><h3>المؤسسة والتشغيل</h3><p>الفرع النشط والعملات والعطلات</p></div></div><div class="v4-card-body"><form id="v4LibrarySettings" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>نوع المؤسسة</label><select name="institutionType"><option value="library" ${s.institutionType === 'library' ? 'selected' : ''}>مكتبة</option><option value="school" ${s.institutionType === 'school' ? 'selected' : ''}>مدرسة أو مركز</option><option value="mosque" ${s.institutionType === 'mosque' ? 'selected' : ''}>مسجد أو وقف</option><option value="publisher" ${s.institutionType === 'publisher' ? 'selected' : ''}>دار نشر</option></select></div><div class="v4-field"><label>الفرع النشط</label><select name="activeBranchId">${v4selectOptions(d.branches, s.activeBranchId, 'name', 'id', 'اختر فرعًا')}</select></div><div class="v4-field"><label>العملة</label><select name="currency">${['EGP','SAR','AED','KWD','USD','EUR'].map((x) => `<option ${s.currency === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="v4-field"><label>حد تنبيه مخزون النشر</label><input name="publisherLowStockThreshold" type="number" min="0" value="${v4e(s.publisherLowStockThreshold ?? 5)}"></div><div class="v4-field span-2"><label>العطلات السنوية</label><textarea name="holidays" placeholder="YYYY-MM-DD — سطر لكل يوم">${v4e((s.holidays || []).join('\n'))}</textarea></div></div><div class="v4-form-actions"><button class="v4-action primary" type="submit">حفظ إعدادات المؤسسة</button></div></form></div></section>`;
}

function v4SettingsModules(d) {
  const s = d.settings;
  const modules = [
    ['enableLocalOpac', 'فهرس الباحث المحلي', 'واجهة قراءة فقط داخل التطبيق وعلى localhost عند تشغيل الخادم المحلي.'],
    ['enableAcquisitions', 'التزويد والمشتريات', 'طلبات الشراء والموردون والاستلام.'],
    ['enableSerials', 'الدوريات', 'الاشتراكات والأعداد المتوقعة.'],
    ['enablePublisherMode', 'وضع دار النشر', 'الطبعات والمخزون والتوزيع.'],
    ['enableFines', 'الرسوم والتعويضات', 'اختياري؛ يبقى معطلاً للمكتبات التي لا تستخدم رسومًا.'],
  ];
  return `<section class="v4-card settings-panel"><div class="v4-card-head"><div><h3>الوحدات الاختيارية</h3><p>فعّل ما تحتاجه فقط لتظل الواجهة غير مزدحمة</p></div></div><div class="v4-card-body"><form id="v4ModuleSettings" class="v4-form"><div class="module-toggle-list">${modules.map(([key, title, text]) => `<label class="module-toggle"><span><b>${v4e(title)}</b><small>${v4e(text)}</small></span><input type="checkbox" name="${key}" ${s[key] ? 'checked' : ''}></label>`).join('')}</div><div class="v4-form-actions"><button class="v4-action primary" type="submit">حفظ الوحدات</button></div></form><div class="v4-divider"></div><section class="local-opac-settings"><div><h4>خادم OPAC المحلي</h4><p class="v4-help-text">قراءة فقط، بلا اتصال بالإنترنت. يبدأ على جهازك ويستخدم بيانات عامة فقط.</p></div><div class="v4-page-actions"><button class="v4-action" data-v4-action="opac-server-status">الحالة</button><button class="v4-action primary" data-v4-action="opac-server-start">تشغيل محلي</button><button class="v4-action danger" data-v4-action="opac-server-stop">إيقاف</button></div><div id="localOpacStatus" class="v4-note" style="margin-top:12px;">لم تُقرأ حالة الخادم بعد.</div></section></div></section>`;
}

function v4SettingsCustomFields(d) {
  const rows = v4arr(d.customFields).filter((x) => !x.deletedAt);
  const scopeLabels = { record: 'السجل الببليوغرافي', item: 'النسخة المادية', patron: 'المستعير', acquisition: 'التزويد' };
  const typeLabels = { text: 'نص', number: 'رقم', date: 'تاريخ', select: 'قائمة اختيار', boolean: 'نعم/لا' };
  return `<section class="v4-card settings-panel"><div class="v4-card-head"><div><h3>الحقول المخصصة</h3><p>أضف حقولًا خاصة بالمؤسسة دون ازدحام النماذج الأساسية</p></div><button class="v4-action primary" data-v4-action="new-custom-field">${icon('plus', 14)} حقل جديد</button></div><div class="v4-card-body">${rows.length ? `<div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>الاسم</th><th>المفتاح</th><th>النطاق</th><th>النوع</th><th>إلزامي</th><th>الإجراءات</th></tr></thead><tbody>${rows.map((f) => `<tr><td><b>${v4e(f.label)}</b></td><td><code class="v4-ltr">${v4e(f.key)}</code></td><td>${v4e(scopeLabels[f.scope] || f.scope)}</td><td>${v4e(typeLabels[f.type] || f.type)}</td><td>${f.required ? 'نعم' : 'لا'}</td><td><div class="v4-table-actions">${v4iconButton('edit-custom-field', f.id, 'edit', 'تعديل')}${v4iconButton('delete-entity', f.id, 'trash', 'حذف', 'danger').replace('data-id=', 'data-entity="customFields" data-id=')}</div></td></tr>`).join('')}</tbody></table></div>` : v4empty('plus', 'لا توجد حقول مخصصة', 'أضف فقط الحقول التي لا تنتمي إلى النموذج الأساسي، لتظل الواجهة بسيطة.')}</div></section>`;
}

function openCustomFieldForm(field = null) {
  const html = `<div class="v4-modal-head"><div><h3>${field ? 'تعديل الحقل المخصص' : 'حقل مخصص جديد'}</h3><p>يظهر الحقل في القسم المناسب فقط</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="customFieldForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>اسم الحقل *</label><input name="label" required value="${v4e(field?.label || '')}" placeholder="مثال: رقم الإيداع"></div><div class="v4-field"><label>المفتاح التقني *</label><input name="key" class="v4-ltr" required value="${v4e(field?.key || '')}" placeholder="depositNumber"></div><div class="v4-field"><label>النطاق</label><select name="scope">${[['record','السجل الببليوغرافي'],['item','النسخة المادية'],['patron','المستعير'],['acquisition','التزويد']].map(([v,l]) => `<option value="${v}" ${field?.scope === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>النوع</label><select name="type">${[['text','نص'],['number','رقم'],['date','تاريخ'],['select','قائمة اختيار'],['boolean','نعم/لا']].map(([v,l]) => `<option value="${v}" ${field?.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="v4-field span-2"><label>خيارات القائمة</label><input name="options" value="${v4e((field?.options || []).join('، '))}" placeholder="يفصل بينها بفاصلة — عند اختيار نوع قائمة"></div><label class="v4-checkbox"><input name="required" type="checkbox" ${field?.required ? 'checked' : ''}><span>حقل إلزامي</span></label><label class="v4-checkbox"><input name="active" type="checkbox" ${field?.active !== false ? 'checked' : ''}><span>حقل نشط</span></label></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ الحقل</button></div></form></div>`;
  openModal(html, { onMount: (o) => {
    o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#v4Cancel').onclick = closeModal;
    o.querySelector('#customFieldForm').addEventListener('submit', async (e) => { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); payload.options = (payload.options || '').split(/[،,]/).map((x) => x.trim()).filter(Boolean); payload.required = e.currentTarget.required.checked; payload.active = e.currentTarget.active.checked; await v4mutate(() => field ? window.raff4.updateEntity('customFields', field.id, payload) : window.raff4.createEntity('customFields', payload), 'تم حفظ الحقل المخصص'); closeModal(); document.querySelector('[data-v4-settings-tab="fields"]')?.click(); });
  }});
}

function v4SettingsBackup(d) {
  return `<div class="v4-two-col"><section class="v4-card"><div class="v4-card-head"><div><h3>النسخ الاحتياطية</h3><p>أنشئ واختبر واستعد نسخًا محلية</p></div><button class="v4-action primary" data-v4-action="create-backup">${icon('plus', 14)} نسخة الآن</button></div><div class="v4-card-body" id="v4BackupList"><div class="v4-skeleton">جارٍ قراءة النسخ...</div></div></section><section class="v4-card"><div class="v4-card-head"><div><h3>سلامة البيانات</h3><p>تشخيص محافظ ثم إصلاح بموافقتك</p></div></div><div class="v4-card-body"><div id="v4IntegritySummary" class="v4-note">اضغط «فحص» لإنشاء تقرير حديث.</div><div class="v4-page-actions" style="margin-top:12px;"><button class="v4-action" data-v4-action="run-integrity">${icon('search', 14)} فحص</button><button class="v4-action primary" data-v4-action="repair-safe">${icon('check', 14)} إصلاح آمن</button><button class="v4-action ghost" data-v4-action="open-data-folder">${icon('stack', 14)} مجلد البيانات</button></div></div></section></div><section class="v4-card settings-panel" style="margin-top:14px;"><div class="v4-card-head"><div><h3>سياسة النسخ</h3><p>النسخ التلقائية تبقى محلية</p></div></div><div class="v4-card-body"><form id="v4BackupSettings" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>نسخة بعد عدد التغييرات</label><input name="backupEveryChanges" type="number" min="0" max="100000" value="${v4e(d.settings.backupEveryChanges || 0)}"><small>0 لتعطيل هذه السياسة</small></div><div class="v4-field"><label>مدة الاحتفاظ بالأيام</label><input name="retentionDays" type="number" min="1" max="3650" value="${v4e(d.settings.retentionDays || 30)}"></div><label class="v4-checkbox"><input name="backupOnClose" type="checkbox" ${d.settings.backupOnClose ? 'checked' : ''}><span>نسخة عند إغلاق البرنامج</span></label></div><div class="v4-form-actions"><button class="v4-action primary" type="submit">حفظ السياسة</button></div></form></div></section>`;
}

function wireV4SettingsForms(panel) {
  panel.querySelector('#v4InterfaceSettings')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget); const payload = Object.fromEntries(fd.entries()); payload.highContrast = event.currentTarget.highContrast.checked; payload.fontScale = Number(payload.fontScale); await v4mutate(() => window.raff4.setSettings(payload), 'تم حفظ إعدادات الواجهة'); applyV4Workspace(payload.workspace); renderRaff4Settings(document.getElementById('viewRoot'));
  });
  panel.querySelector('#v4LibrarySettings')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); payload.holidays = (payload.holidays || '').split(/\n/).map((x) => x.trim()).filter(Boolean); payload.publisherLowStockThreshold = Number(payload.publisherLowStockThreshold || 5); await v4mutate(() => window.raff4.setSettings(payload), 'تم حفظ إعدادات المؤسسة'); renderRaff4Settings(document.getElementById('viewRoot'));
  });
  panel.querySelector('#v4ModuleSettings')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const payload = {}; ['enableLocalOpac','enableAcquisitions','enableSerials','enablePublisherMode','enableFines'].forEach((k) => { payload[k] = event.currentTarget[k].checked; }); await v4mutate(() => window.raff4.setSettings(payload), 'تم حفظ الوحدات الاختيارية'); renderRaff4Settings(document.getElementById('viewRoot'));
  });
  panel.querySelector('#v4BackupSettings')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); payload.backupOnClose = event.currentTarget.backupOnClose.checked; payload.backupEveryChanges = Number(payload.backupEveryChanges || 0); payload.retentionDays = Number(payload.retentionDays || 30); await v4mutate(() => window.raff4.setSettings(payload), 'تم حفظ سياسة النسخ');
  });
}

async function wireV4BackupPanel(panel) {
  const host = panel.querySelector('#v4BackupList');
  if (!host) return;
  try {
    const rows = await window.raff4.listBackups();
    host.innerHTML = rows.length ? `<div class="backup-list">${rows.slice(0, 40).map((x) => `<div class="backup-row"><div><b>${v4e(x.name)}</b><small>${v4date(x.modifiedAt, true)} · ${v4formatBytes(x.size)}</small></div><button class="v4-action ghost" data-v4-action="restore-backup-name" data-name="${v4e(x.name)}">استعادة</button></div>`).join('')}</div>` : v4empty('refresh', 'لا توجد نسخ بعد', 'أنشئ نسخة يدوية قبل أي تغيير كبير.');
  } catch (err) { host.innerHTML = `<div class="v4-note danger">${v4e(err.message)}</div>`; }
}

function openBulkRecords() {
  const records = RAFF4_STATE.data.records.filter((x) => !x.deletedAt);
  const html = `<div class="v4-modal-head"><div><h3>تعديل جماعي للسجلات</h3><p>اختر السجلات والقيم المراد تغييرها؛ تُعرض العملية في سجل التدقيق.</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="bulkRecordsForm" class="v4-form"><div class="bulk-record-picker"><label class="v4-checkbox bulk-select-all"><input type="checkbox" id="bulkSelectAll"><span>تحديد الكل (${records.length})</span></label><div class="v4-search">${icon('search', 14)}<input id="bulkRecordSearch" placeholder="تصفية السجلات"></div><div id="bulkRecordRows" class="bulk-record-rows">${v4BulkRecordRows(records)}</div></div><div class="v4-divider"></div><div class="v4-form-grid"><div class="v4-field"><label>التصنيف/المجال</label><input name="category" placeholder="اتركه فارغًا دون تغيير"></div><div class="v4-field"><label>دار النشر</label><input name="publisher" placeholder="اتركه فارغًا دون تغيير"></div><div class="v4-field"><label>نوع المادة</label><select name="materialTypeId">${v4selectOptions(RAFF4_STATE.data.materialTypes, '', 'name', 'id', 'دون تغيير')}</select></div><div class="v4-field"><label>اللغة</label><input name="language" placeholder="دون تغيير"></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">تطبيق التعديل</button></div></form></div>`;
  openModal(html, { modalClass:'v4-wide-modal', onMount:(overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick = closeModal; overlay.querySelector('#v4Cancel').onclick = closeModal;
    const render = () => { const q = overlay.querySelector('#bulkRecordSearch').value.trim().toLocaleLowerCase('ar'); overlay.querySelector('#bulkRecordRows').innerHTML = v4BulkRecordRows(records.filter((r) => !q || `${r.title} ${r.author} ${r.referenceNumber}`.toLocaleLowerCase('ar').includes(q))); };
    overlay.querySelector('#bulkRecordSearch').addEventListener('input', render);
    overlay.querySelector('#bulkSelectAll').addEventListener('change', (e) => overlay.querySelectorAll('[name="recordIds"]').forEach((x) => { x.checked = e.target.checked; }));
    overlay.querySelector('#bulkRecordsForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const ids = [...event.currentTarget.querySelectorAll('[name="recordIds"]:checked')].map((x) => x.value); if (!ids.length) { toast('اختر سجلًا واحدًا على الأقل', 'error'); return; }
      const fd = new FormData(event.currentTarget); const patch = {}; ['category','publisher','materialTypeId','language'].forEach((k) => { const v = fd.get(k); if (v) patch[k] = v; }); if (!Object.keys(patch).length) { toast('أدخل قيمة واحدة على الأقل للتعديل', 'error'); return; }
      await v4mutate(() => window.raff4.bulkUpdateRecords(ids, patch), `تم تعديل ${ids.length} سجل`); closeModal(); renderRoute();
    });
  }});
}

function v4BulkRecordRows(records) {
  return records.map((r) => `<label class="bulk-record-row"><input type="checkbox" name="recordIds" value="${v4e(r.id)}"><span><b>${v4e(r.title)}</b><small>${v4e(r.author || '—')} · ${v4e(r.referenceNumber || 'بلا رقم')}</small></span></label>`).join('') || '<p class="v4-help-text">لا توجد نتائج.</p>';
}

function openCommandPalette() {
  const commands = [
    ['dashboard','لوحة المعلومات','الرئيسية'],['opac','البحث في فهرس الباحث','الباحث'],['circulation','فتح مكتب الإعارة','خدمة القراء'],['patrons','إدارة المستعيرين','خدمة القراء'],['inventory','بدء الجرد الميداني','الجرد'],['catalog','السجلات والمقتنيات','الفهرسة'],['authorities','الضبط الاستنادي','الفهرسة'],['acquisitions','التزويد والمشتريات','التزويد'],['reports','التقارير','الإدارة'],['settings','الإعدادات والنسخ','الإدارة'],
  ];
  const actions = [['new-record','إنشاء سجل ببليوغرافي','إجراء'],['new-patron','إضافة مستعير','إجراء'],['quick-return','إرجاع سريع','إجراء'],['run-integrity','فحص سلامة البيانات','إجراء'],['create-backup','إنشاء نسخة احتياطية','إجراء']];
  const all = [
    ...commands.filter(([route]) => v4RouteAllowed(route)).map(([route,label,group]) => ({ route,label,group })),
    ...actions.filter(([action]) => v4ActionAllowed(action)).map(([action,label,group]) => ({ action,label,group })),
  ];
  const html = `<div class="command-palette"><div class="command-search">${icon('search', 16)}<input id="commandSearch" placeholder="اكتب أمرًا أو اسم صفحة" autofocus><kbd>Esc</kbd></div><div class="command-results" id="commandResults">${v4CommandRows(all)}</div><div class="command-foot"><span>↑↓ للتنقل</span><span>Enter للتنفيذ</span></div></div>`;
  openModal(html, { modalClass:'command-modal', onMount:(overlay) => {
    overlay.classList.add('v4-modal'); const input = overlay.querySelector('#commandSearch'); let filtered = all; let index = 0;
    const paint = () => { overlay.querySelector('#commandResults').innerHTML = v4CommandRows(filtered, index); };
    input.addEventListener('input', () => { const q = input.value.trim().toLocaleLowerCase('ar'); filtered = all.filter((x) => `${x.label} ${x.group}`.toLocaleLowerCase('ar').includes(q)); index = 0; paint(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(filtered.length - 1, index + 1); paint(); } if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); paint(); } if (e.key === 'Enter' && filtered[index]) { e.preventDefault(); closeModal(); const c = filtered[index]; if (c.route) navigateTo(c.route); else v4RunAction(c.action, null, null); } if (e.key === 'Escape') closeModal(); });
    setTimeout(() => input.focus(), 20);
  }});
}

function v4CommandRows(rows, activeIndex = 0) {
  return rows.map((x, i) => `<button class="command-row ${i === activeIndex ? 'active' : ''}" ${x.route ? `data-v4-route="${v4e(x.route)}"` : `data-v4-action="${v4e(x.action)}"`}><span class="command-icon">${icon(x.route === 'catalog' ? 'book' : x.route === 'patrons' ? 'user' : 'layers', 15)}</span><span><b>${v4e(x.label)}</b><small>${v4e(x.group)}</small></span><kbd>↵</kbd></button>`).join('') || '<div class="v4-empty"><p>لا يوجد أمر مطابق.</p></div>';
}

function openUserSwitcher() {
  const d = RAFF4_STATE.data; const active = d.settings.activeUserId;
  const html = `<div class="v4-modal-head"><div><h3>تبديل المستخدم</h3><p>كل العمليات التالية تُسجل باسم المستخدم المختار</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><div class="user-switch-list">${d.users.filter((u) => !u.deletedAt && u.active !== false).map((u) => `<button class="user-switch-item ${u.id === active ? 'active' : ''}" data-v4-action="switch-user" data-id="${v4e(u.id)}"><span class="user-switch-avatar">${v4e(v4initials(u.displayName))}</span><span class="user-switch-copy"><strong>${v4e(u.displayName)}</strong><small>${v4e(u.username)} · ${v4e(u.role)}</small></span>${u.id === active ? '<span class="v4-badge success">الحالي</span>' : u.hasPin ? '<span class="v4-badge">PIN</span>' : ''}</button>`).join('')}</div></div>`;
  openModal(html, { onMount:(o) => { o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; } });
}

function openPinDialog(userId) {
  const user = RAFF4_STATE.data.users.find((u) => u.id === userId); if (!user) return;
  const html = `<div class="v4-modal-head"><div><h3>الدخول باسم ${v4e(user.displayName)}</h3><p>${user.hasPin ? 'أدخل رمز PIN المحلي' : 'لا يتطلب هذا الحساب رمزًا'}</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="pinForm" class="v4-form"><div class="v4-field"><label>رمز PIN</label><input name="pin" type="password" inputmode="numeric" autocomplete="off" autofocus ${user.hasPin ? 'required' : ''}></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">تبديل المستخدم</button></div></form></div>`;
  openModal(html, { onMount:(o) => { o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#v4Cancel').onclick = closeModal; o.querySelector('#pinForm').addEventListener('submit', async (e) => { e.preventDefault(); try { await window.raff4.authenticateUser(userId, e.currentTarget.pin.value); await refreshRaff4State(); closeModal(); toast(`مرحبًا ${user.displayName}`, 'success'); renderRoute(); } catch (err) { toast(err.message || 'رمز PIN غير صحيح', 'error'); } }); } });
}

function openIntegrityReport(report) {
  const issues = report.issues || [];
  const html = `<div class="v4-modal-head"><div><h3>تقرير سلامة البيانات</h3><p>الدرجة الحالية ${v4e(report.score)} من 100</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><div class="integrity-score"><strong>${v4e(report.score)}</strong><span>درجة السلامة</span></div>${issues.length ? `<div class="integrity-issues">${issues.map((x) => `<div class="integrity-issue ${v4e(x.severity)}"><span class="v4-badge ${x.severity === 'critical' ? 'danger' : x.severity === 'high' ? 'warning' : 'info'}">${v4e(x.severity)}</span><div><b>${v4e(x.label)}</b><small>${v4e(x.key || x.id || '')}</small></div></div>`).join('')}</div>` : v4empty('check', 'لا توجد مشكلات متقدمة', 'لم يكتشف الفحص الحالي تناقضات في نموذج رَفّ 4.')}${report.legacy ? `<details><summary>نتيجة فحص البيانات التقليدية</summary><pre class="v4-json">${v4e(v4safeJson(report.legacy))}</pre></details>` : ''}</div>`;
  openModal(html, { modalClass:'v4-wide-modal', onMount:(o) => { o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; } });
}

async function v4ExportAuditCsv() {
  const rows = await window.raff4.auditLog({});
  const csv = ['التاريخ,المستخدم,العملية,النوع,الملخص', ...rows.map((x) => [x.at, x.userName, v4actionLabel(x.action), v4entityName(x.entity), x.summary].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const html = `<div class="v4-modal-head"><div><h3>تصدير سجل التدقيق</h3><p>انسخ النص أو احفظه عبر التصدير التقليدي</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><textarea id="auditCsvText" class="v4-ltr" style="min-height:330px;width:100%;">${v4e(csv)}</textarea><div class="v4-form-actions"><button class="v4-action primary" id="copyAuditCsv">نسخ CSV</button></div></div>`;
  openModal(html, { modalClass:'v4-wide-modal', onMount:(o) => { o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#copyAuditCsv').onclick = async () => { await navigator.clipboard.writeText(o.querySelector('#auditCsvText').value); toast('تم نسخ CSV', 'success'); }; } });
}

async function v4RunAction(action, idValue, el) {
  const d = RAFF4_STATE.data;
  switch (action) {
    case 'command-palette': openCommandPalette(); break;
    case 'go-opac': navigateTo('opac'); break;
    case 'go-circulation': navigateTo('circulation'); break;
    case 'opac-available': RAFF4_STATE.opacFilters.availableOnly = !RAFF4_STATE.opacFilters.availableOnly; renderRoute(); break;
    case 'save-current-search': openSavedSearchForm(); break;
    case 'apply-saved-search': { const saved = d.savedSearches.find((x) => x.id === idValue); if (saved) { RAFF4_STATE.opacQuery = saved.query || ''; RAFF4_STATE.opacFilters = { ...RAFF4_STATE.opacFilters, ...(saved.filters || {}) }; renderRoute(); } break; }
    case 'opac-details': openV4OpacDetails(idValue); break;
    case 'new-record': openV4RecordForm(); break;
    case 'edit-record': closeModal(); openV4RecordForm(v4record(idValue)); break;
    case 'record-details': openV4RecordDetails(idValue); break;
    case 'add-items': closeModal(); openAddItems(idValue); break;
    case 'edit-item': closeModal(); openEditItem(idValue); break;
    case 'bulk-records': openBulkRecords(); break;
    case 'new-patron': openPatronForm(); break;
    case 'edit-patron': openPatronForm(v4patron(idValue)); break;
    case 'patron-details': openPatronDetails(idValue); break;
    case 'select-patron-and-circulate': RAFF4_STATE.circulation.patronId = idValue; navigateTo('circulation'); closeModal(); break;
    case 'select-circ-patron': RAFF4_STATE.circulation.patronId = idValue; renderRoute(); break;
    case 'clear-circ-patron': RAFF4_STATE.circulation.patronId = ''; renderRoute(); break;
    case 'add-circ-item': if (!RAFF4_STATE.circulation.itemIds.includes(idValue)) RAFF4_STATE.circulation.itemIds.push(idValue); renderRoute(); break;
    case 'remove-circ-item': RAFF4_STATE.circulation.itemIds = RAFF4_STATE.circulation.itemIds.filter((x) => x !== idValue); renderRoute(); break;
    case 'quick-return': openQuickReturn(); break;
    case 'renew-loan': await v4mutate(() => window.raff4.renewLoan(idValue, {}), 'تم تجديد الإعارة'); renderRoute(); break;
    case 'return-loan-items': openReturnLoanItems(idValue); break;
    case 'new-hold': openHoldForm(); break;
    case 'opac-hold': openHoldForm(idValue); break;
    case 'hold-ready': await v4mutate(() => window.raff4.updateHoldStatus(idValue, 'ready'), 'الحجز جاهز للاستلام'); renderRoute(); break;
    case 'hold-fulfilled': await v4mutate(() => window.raff4.updateHoldStatus(idValue, 'fulfilled'), 'اكتمل الحجز'); renderRoute(); break;
    case 'hold-cancel': await v4mutate(() => window.raff4.updateHoldStatus(idValue, 'cancelled'), 'تم إلغاء الحجز'); renderRoute(); break;
    case 'new-inventory': openInventoryForm(); break;
    case 'close-inventory': await v4mutate(() => window.raff4.closeInventory(idValue), 'تم إغلاق جلسة الجرد'); renderRoute(); break;
    case 'new-authority': openAuthorityForm(); break;
    case 'edit-authority': openAuthorityForm(d.authorities.find((x) => x.id === idValue)); break;
    case 'authority-duplicates': openAuthorityDuplicates(); break;
    case 'merge-authority-pair': {
      const keeper = el?.dataset.keeper; const duplicate = el?.dataset.duplicate;
      if (keeper && duplicate && confirm('سيُدمج السجل الثاني في الأول وتُحدّث المراجع المرتبطة. متابعة؟')) {
        await v4mutate(() => window.raff4.mergeAuthorities(keeper, [duplicate]), 'تم دمج السجلين الاستناديين'); closeModal(); renderRoute();
      }
      break;
    }
    case 'new-acquisition':
    case 'new-acquisitions': openAcquisitionForm(); break;
    case 'edit-acquisition':
    case 'edit-acquisitions': openAcquisitionForm(d.acquisitions.find((x) => x.id === idValue)); break;
    case 'acquisition-next': {
      const row = d.acquisitions.find((x) => x.id === idValue);
      const stages = ['requested','approved','ordered','partially_received','received'];
      const next = stages[Math.min(stages.length - 1, Math.max(0, stages.indexOf(row?.status)) + 1)];
      if (row) { await v4mutate(() => window.raff4.updateEntity('acquisitions', row.id, { status: next }), 'تم تحديث مرحلة الطلب'); renderRoute(); }
      break;
    }
    case 'new-serial':
    case 'new-serials': openSerialForm(); break;
    case 'edit-serial':
    case 'edit-serials': openSerialForm(d.serials.find((x) => x.id === idValue)); break;
    case 'new-transfer': openTransferForm(); break;
    case 'receive-transfer': { const transfer = d.transfers.find((x) => x.id === idValue); if (transfer) openReceiveTransfer(transfer); break; }
    case 'cancel-transfer': if (confirm('إلغاء عملية النقل وإعادة النسخ إلى حالة متاح؟')) { await v4mutate(() => window.raff4.cancelTransfer(idValue, 'ألغيت يدويًا'), 'تم إلغاء النقل'); renderRoute(); } break;
    case 'new-branch': openBranchForm(); break;
    case 'edit-branch': openBranchForm(d.branches.find((x) => x.id === idValue)); break;
    case 'new-location': openLocationForm(); break;
    case 'edit-location': openLocationForm(d.locations.find((x) => x.id === idValue)); break;
    case 'new-policy': openPolicyForm(); break;
    case 'edit-policy': openPolicyForm(d.policies.find((x) => x.id === idValue)); break;
    case 'new-patron-category': openSimpleNamedForm('patronCategories'); break;
    case 'edit-patron-category': openSimpleNamedForm('patronCategories', d.patronCategories.find((x) => x.id === idValue)); break;
    case 'new-material-type': openSimpleNamedForm('materialTypes'); break;
    case 'edit-material-type': openSimpleNamedForm('materialTypes', d.materialTypes.find((x) => x.id === idValue)); break;
    case 'new-custom-field': openCustomFieldForm(); break;
    case 'edit-custom-field': openCustomFieldForm(d.customFields.find((x) => x.id === idValue)); break;
    case 'new-user': openUserForm(); break;
    case 'edit-user': openUserForm(d.users.find((x) => x.id === idValue)); break;
    case 'active-user': openUserSwitcher(); break;
    case 'switch-user': closeModal(); openPinDialog(idValue); break;
    case 'new-reading-list': openReadingListForm(); break;
    case 'edit-reading-list': openReadingListForm(d.readingLists.find((x) => x.id === idValue)); break;
    case 'delete-entity': {
      const entity = el?.dataset.entity; if (!entity) break; if (!confirm(`نقل ${v4entityName(entity)} إلى سلة المحذوفات؟`)) break; await v4mutate(() => window.raff4.deleteEntity(entity, idValue, 'حذف من الواجهة'), 'تم النقل إلى السلة'); renderRoute(); break;
    }
    case 'restore-trash': await v4mutate(() => window.raff4.restoreTrash(idValue), 'تمت الاستعادة'); renderRoute(); break;
    case 'purge-trash': if (confirm('حذف نهائي لا يمكن التراجع عنه؟')) { await v4mutate(() => window.raff4.purgeTrash(idValue), 'تم الحذف النهائي'); renderRoute(); } break;
    case 'import-marc': { const r = await window.raff4.importMarc(); if (!r?.canceled) { await refreshRaff4State(); toast(`تم استيراد ${r.added || 0} سجل`, 'success'); renderRoute(); } break; }
    case 'export-marc': { const r = await window.raff4.exportMarc(); if (!r?.canceled) toast('تم حفظ ملف MARCXML', 'success'); break; }
    case 'import-marc-iso': { const r = await window.raff4.importMarcIso(); if (!r?.canceled) { await refreshRaff4State(); toast(`تم استيراد ${r.added || 0} سجل MARC`, 'success'); renderRoute(); } break; }
    case 'export-marc-iso': { const r = await window.raff4.exportMarcIso(); if (!r?.canceled) toast('تم حفظ ملف MARC ISO 2709', 'success'); break; }
    case 'import-bibtex': { const r = await window.raff4.importBibTex(); if (!r?.canceled) { await refreshRaff4State(); toast(`تم استيراد ${r.added || 0} مرجع BibTeX`, 'success'); renderRoute(); } break; }
    case 'export-bibtex': { const r = await window.raff4.exportBibTex(); if (!r?.canceled) toast('تم حفظ BibTeX', 'success'); break; }
    case 'import-ris': { const r = await window.raff4.importRis(); if (!r?.canceled) { await refreshRaff4State(); toast(`تم استيراد ${r.added || 0} مرجع RIS`, 'success'); renderRoute(); } break; }
    case 'export-ris': { const r = await window.raff4.exportRis(); if (!r?.canceled) toast('تم حفظ RIS', 'success'); break; }
    case 'export-dublin-core': { const r = await window.raff4.exportDublinCore(); if (!r?.canceled) toast('تم حفظ Dublin Core XML', 'success'); break; }
    case 'export-jsonld': { const r = await window.raff4.exportJsonLd(); if (!r?.canceled) toast('تم حفظ JSON-LD', 'success'); break; }
    case 'export-transfer': { const r = await window.raff4.exportTransfer(); if (!r?.canceled) toast('تم حفظ حزمة النقل المحلية', 'success'); break; }
    case 'import-transfer': { const r = await window.raff4.importTransfer(); if (!r?.canceled) { await refreshRaff4State(); toast('تم دمج حزمة النقل', 'success'); renderRoute(); } break; }
    case 'notifications-refresh': await window.raff4.refreshNotifications(); await refreshRaff4State(); renderNavCounts(); renderRoute(); break;
    case 'notifications-read-all': await v4mutate(() => window.raff4.markAllNotifications(true), 'تم تعليم التنبيهات كمقروءة'); renderRoute(); break;
    case 'notification-toggle': { const row = d.notifications.find((x) => x.id === idValue); if (row) await v4mutate(() => window.raff4.markNotification(idValue, !row.read), row.read ? 'أعيد التنبيه إلى غير مقروء' : 'تمت قراءة التنبيه'); renderRoute(); break; }
    case 'notification-open': { await window.raff4.markNotification(idValue, true); await refreshRaff4State(); renderNavCounts(); navigateTo(el?.dataset.route || 'dashboard'); break; }
    case 'create-backup': await v4mutate(() => window.raff4.createSnapshot('manual-v4'), 'تم إنشاء نسخة احتياطية'); if (currentRoute === 'settings') renderRoute(); break;
    case 'restore-backup': navigateTo('settings'); break;
    case 'restore-backup-name': if (confirm(`استعادة النسخة ${el?.dataset.name}؟ سيُنشئ رَفّ نسخة قبل الاستعادة.`)) { await v4mutate(() => window.raff4.restoreBackup(el.dataset.name), 'تمت استعادة النسخة'); renderRoute(); } break;
    case 'run-integrity': { const report = await window.raff4.integrity(); openIntegrityReport(report); const host = document.querySelector('#v4IntegritySummary'); if (host) host.innerHTML = `درجة السلامة <b>${report.score}/100</b> · ${report.issues.length} مشكلة متقدمة.`; break; }
    case 'repair-safe': if (confirm('سيُنشئ رَفّ نسخة احتياطية ثم يصلح المشكلات الحتمية فقط. متابعة؟')) { const result = await v4mutate(() => window.raff4.repairSafe(), 'اكتمل الإصلاح الآمن'); openIntegrityReport(result.after); } break;
    case 'open-data-folder': await window.raff.openDataFolder(); break;
    case 'open-legacy-settings': navigateTo('settings'); setTimeout(() => document.querySelector('[data-v4-settings-tab="legacy"]')?.click(), 30); break;
    case 'refresh-audit': renderRoute(); break;
    case 'export-audit': await v4ExportAuditCsv(); break;
    case 'opac-server-start': { const status = await window.raff4.startLocalOpac({ lan: false }); toast(`تم تشغيل OPAC على ${status.url}`, 'success'); const host = document.querySelector('#localOpacStatus'); if (host) host.innerHTML = `يعمل الآن: <code class="v4-ltr">${v4e(status.url)}</code>`; break; }
    case 'opac-server-stop': { await window.raff4.stopLocalOpac(); toast('تم إيقاف OPAC المحلي', 'success'); const host = document.querySelector('#localOpacStatus'); if (host) host.textContent = 'الخادم المحلي متوقف.'; break; }
    case 'opac-server-status': { const status = await window.raff4.localOpacStatus(); const host = document.querySelector('#localOpacStatus'); if (host) host.innerHTML = status.running ? `يعمل الآن: <code class="v4-ltr">${v4e(status.url)}</code>` : 'الخادم المحلي متوقف.'; break; }
    default: break;
  }
}

function initV4Extras() {
  document.addEventListener('click', async (event) => {
    const routeEl = event.target.closest('[data-v4-route]');
    if (routeEl) { event.preventDefault(); event.stopImmediatePropagation(); closeModal(); navigateTo(routeEl.dataset.v4Route); return; }
    const actionEl = event.target.closest('[data-v4-action]');
    if (!actionEl) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { await v4RunAction(actionEl.dataset.v4Action, actionEl.dataset.id || '', actionEl); }
    catch (err) { console.error(err); }
  });

  document.addEventListener('change', async (event) => {
    const status = event.target.closest('[data-v4-publisher-status]');
    if (status) {
      const r = v4record(status.dataset.v4PublisherStatus); const customFields = { ...(r.customFields || {}), publicationStatus: status.value };
      await v4mutate(() => window.raff4.updateRecord(r.id, { customFields }), 'تم تحديث حالة النشر'); return;
    }
    const printRun = event.target.closest('[data-v4-print-run]');
    if (printRun) {
      const r = v4record(printRun.dataset.v4PrintRun); const customFields = { ...(r.customFields || {}), printRun: Number(printRun.value || 0) };
      await v4mutate(() => window.raff4.updateRecord(r.id, { customFields }), 'تم تحديث دفعة الطباعة');
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); openCommandPalette(); }
  });
}

function renderV4Reports(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Reports(root)); return; }
  const d = RAFF4_STATE.data;
  const records = d.records.filter((x) => !x.deletedAt);
  const items = d.items.filter((x) => !x.deletedAt && !x.archived);
  const patrons = d.patrons.filter((x) => !x.deletedAt);
  const loans = d.loans || [];
  const open = loans.filter((x) => !x.returnedAt);
  const overdue = open.filter((x) => Date.parse(x.dueAt) < Date.now());
  const byRecord = new Map();
  for (const loan of loans) for (const itemId of loan.itemIds || []) { const item = items.find((x) => x.id === itemId); if (item) byRecord.set(item.recordId, (byRecord.get(item.recordId) || 0) + 1); }
  const topRecords = [...byRecord.entries()].map(([id, count]) => ({ record: records.find((r) => r.id === id), count })).filter((x) => x.record).sort((a, b) => b.count - a.count).slice(0, 10);
  const byCategory = new Map();
  for (const r of records) byCategory.set(r.category || 'غير مصنف', (byCategory.get(r.category || 'غير مصنف') || 0) + 1);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byPublisher = new Map();
  for (const r of records) byPublisher.set(r.publisher || 'غير محدد', (byPublisher.get(r.publisher || 'غير محدد') || 0) + 1);
  const publishers = [...byPublisher.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const inactive = records.filter((r) => !byRecord.has(r.id));
  const incomplete = records.filter((r) => !r.title || !r.author || !r.publisher || !r.referenceNumber);
  const monthly = new Map();
  for (const loan of loans) { const key = String(loan.checkedOutAt || loan.createdAt || '').slice(0, 7); if (key) monthly.set(key, (monthly.get(key) || 0) + 1); }
  const monthlyRows = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxMonthly = Math.max(1, ...monthlyRows.map((x) => x[1]));
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الإدارة والتحليل', 'التقارير ولوحة القرار', 'تقارير جاهزة ومؤشرات واضحة، مع منشئ تقرير بسيط لا يحتاج معرفة تقنية.', `<button class="v4-action" id="legacyReportsBtn">التقارير التقليدية</button><button class="v4-action primary" id="exportCurrentReport">${icon('download', 14)} حفظ الملخص PDF</button>`)}
    <div class="v4-metrics-grid">${v4metric('كل الإعارات', loans.length, 'book', 'تاريخية ومفتوحة')}${v4metric('المفتوحة', open.length, 'calendar', 'نسخ لم تُرجع بعد')}${v4metric('المتأخرة', overdue.length, 'alert', 'تحتاج متابعة', overdue.length ? 'danger' : '')}${v4metric('غير المستخدمة', inactive.length, 'stack', 'لم تُعر حتى الآن')}</div>
    <div class="v4-grid cols-2">
      <section class="v4-card"><div class="v4-card-head"><div><h3>نشاط الإعارة خلال 12 شهرًا</h3><p>عدد عمليات الإعارة المسجلة شهريًا</p></div></div><div class="v4-card-body"><div class="report-bars">${monthlyRows.length ? monthlyRows.map(([month, count]) => `<div class="report-bar-row"><span>${v4e(month)}</span><div><i style="width:${Math.max(4, count / maxMonthly * 100)}%"></i></div><b>${count}</b></div>`).join('') : '<p class="v4-help-text">لا توجد بيانات زمنية كافية بعد.</p>'}</div></div></section>
      <section class="v4-card"><div class="v4-card-head"><div><h3>أكثر الكتب إعارة</h3><p>حسب تاريخ العمليات المحلية</p></div></div><div class="v4-card-body"><div class="v4-kpi-list">${topRecords.length ? topRecords.map((x, i) => `<button class="v4-kpi-row" data-v4-action="record-details" data-id="${v4e(x.record.id)}"><span><b style="display:block;color:var(--foreground);">${i + 1}. ${v4e(x.record.title)}</b>${v4e(x.record.author || '—')}</span><b>${x.count}</b></button>`).join('') : '<p class="v4-help-text">لا توجد إعارات تاريخية بعد.</p>'}</div></div></section>
      <section class="v4-card"><div class="v4-card-head"><div><h3>توزيع التصنيفات</h3><p>أكبر مجالات المجموعة</p></div></div><div class="v4-card-body"><div class="report-bars">${v4SimpleBars(categories)}</div></div></section>
      <section class="v4-card"><div class="v4-card-head"><div><h3>دور النشر الأكثر تمثيلًا</h3><p>عدد العناوين لكل ناشر</p></div></div><div class="v4-card-body"><div class="report-bars">${v4SimpleBars(publishers)}</div></div></section>
    </div>
    <section class="v4-card"><div class="v4-card-head"><div><h3>جودة المجموعة</h3><p>قوائم قابلة للتنفيذ بدل نسب مجردة</p></div></div><div class="v4-card-body"><div class="quality-grid"><button data-report-list="incomplete"><b>${incomplete.length}</b><span>سجل ناقص البيانات الأساسية</span></button><button data-report-list="inactive"><b>${inactive.length}</b><span>كتاب لم يُعر حتى الآن</span></button><button data-report-list="no-isbn"><b>${records.filter((r) => !r.isbn13 && !r.isbn10).length}</b><span>سجل بلا ISBN</span></button><button data-report-list="no-location"><b>${records.filter((r) => !d.holdings.some((h) => h.recordId === r.id && (h.shelf || h.room))).length}</b><span>سجل بلا موقع واضح</span></button></div><div id="qualityReportRows" style="margin-top:12px;"></div></div></section>
    <section class="v4-card"><div class="v4-card-head"><div><h3>منشئ تقرير محلي</h3><p>اختر المجموعة والأعمدة والمرشح ثم اعرض النتيجة</p></div></div><div class="v4-card-body"><form id="customReportForm" class="v4-form"><div class="v4-form-grid cols-3"><div class="v4-field"><label>المصدر</label><select name="source"><option value="records">السجلات</option><option value="items">النسخ المادية</option><option value="patrons">المستعيرون</option><option value="loans">الإعارات</option><option value="acquisitions">التزويد</option></select></div><div class="v4-field"><label>المرشح</label><select name="filter"><option value="all">الكل</option><option value="active">نشط/مفتوح</option><option value="overdue">متأخر</option><option value="incomplete">ناقص البيانات</option></select></div><div class="v4-field"><label>الترتيب</label><select name="sort"><option value="newest">الأحدث</option><option value="oldest">الأقدم</option><option value="name">الاسم/العنوان</option></select></div></div><div class="v4-form-actions"><button class="v4-action primary" type="submit">إنشاء التقرير</button></div></form><div id="customReportResult" style="margin-top:12px;"></div></div></section>
  </div>`;
  root.querySelector('#legacyReportsBtn').onclick = () => { const host = root; renderReports(host); };
  root.querySelector('#exportCurrentReport').onclick = async () => {
    const html = v4BuildReportHtml({ title: 'ملخص رَفّ 4', records, items, patrons, loans, overdue, categories, publishers });
    const result = await window.raff.saveTablePdf(html, 'تقارير-رَفّ-4');
    if (result?.ok) toast('تم حفظ التقرير PDF', 'success'); else if (!result?.canceled) toast(result?.error || 'تعذر حفظ التقرير', 'error');
  };
  root.querySelectorAll('[data-report-list]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.reportList;
    const rows = key === 'incomplete' ? incomplete : key === 'inactive' ? inactive : key === 'no-isbn' ? records.filter((r) => !r.isbn13 && !r.isbn10) : records.filter((r) => !d.holdings.some((h) => h.recordId === r.id && (h.shelf || h.room)));
    root.querySelector('#qualityReportRows').innerHTML = v4RecordMiniTable(rows);
  }));
  root.querySelector('#customReportForm').addEventListener('submit', (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget); const source = fd.get('source'), filter = fd.get('filter'), sort = fd.get('sort'); let rows = [...(d[source] || [])].filter((x) => !x.deletedAt);
    if (filter === 'active') rows = source === 'loans' ? rows.filter((x) => !x.returnedAt) : rows.filter((x) => x.active !== false);
    if (filter === 'overdue') rows = source === 'loans' ? rows.filter((x) => !x.returnedAt && Date.parse(x.dueAt) < Date.now()) : [];
    if (filter === 'incomplete') rows = source === 'records' ? rows.filter((x) => !x.title || !x.author || !x.publisher || !x.referenceNumber) : [];
    const dateKey = (x) => Date.parse(x.createdAt || x.checkedOutAt || 0) || 0;
    rows.sort(sort === 'oldest' ? (a, b) => dateKey(a) - dateKey(b) : sort === 'name' ? (a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'ar') : (a, b) => dateKey(b) - dateKey(a));
    root.querySelector('#customReportResult').innerHTML = v4GenericReportTable(source, rows.slice(0, 500));
  });
}

function v4SimpleBars(entries) {
  const max = Math.max(1, ...entries.map((x) => x[1]));
  return entries.length ? entries.map(([name, count]) => `<div class="report-bar-row"><span title="${v4e(name)}">${v4e(name)}</span><div><i style="width:${Math.max(4, count / max * 100)}%"></i></div><b>${count}</b></div>`).join('') : '<p class="v4-help-text">لا توجد بيانات كافية.</p>';
}

function v4RecordMiniTable(rows) {
  if (!rows.length) return v4empty('check', 'لا توجد سجلات في هذه القائمة', 'لا تحتاج هذه النقطة إلى إجراء حاليًا.');
  return `<div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>العنوان</th><th>المؤلف</th><th>الناشر</th><th>الرقم</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr><td><b>${v4e(r.title || 'بدون عنوان')}</b></td><td>${v4e(r.author || '—')}</td><td>${v4e(r.publisher || '—')}</td><td>${v4e(r.referenceNumber || '—')}</td><td>${v4iconButton('edit-record', r.id, 'edit', 'استكمال البيانات')}</td></tr>`).join('')}</tbody></table></div>`;
}

function v4GenericReportTable(source, rows) {
  if (!rows.length) return v4empty('search', 'التقرير فارغ', 'لا توجد سجلات توافق المرشح المختار.');
  const configs = {
    records: [['title','العنوان'],['author','المؤلف'],['publisher','الناشر'],['referenceNumber','الرقم المرجعي'],['publishYear','السنة']],
    items: [['barcode','الباركود'],['status','الحالة'],['copyNumber','النسخة'],['volumeNumber','الجزء'],['condition','الحالة المادية']],
    patrons: [['membershipNumber','العضوية'],['name','الاسم'],['phone','الهاتف'],['status','الحالة'],['organization','المؤسسة']],
    loans: [['patronId','المستعير'],['checkedOutAt','الإعارة'],['dueAt','الاستحقاق'],['returnedAt','الإرجاع'],['renewalCount','التجديدات']],
    acquisitions: [['title','العنوان'],['vendor','المورد'],['status','الحالة'],['quantity','الكمية'],['unitPrice','السعر']],
  };
  const cols = configs[source] || Object.keys(rows[0]).slice(0, 5).map((x) => [x, x]);
  return `<div class="v4-table-wrap"><table class="v4-table"><thead><tr>${cols.map(([, l]) => `<th>${v4e(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cols.map(([k]) => `<td>${k === 'status' ? v4status(row[k]) : /At$/.test(k) ? v4date(row[k], true) : v4e(row[k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function v4BuildReportHtml(data) {
  const rows = data.records.slice(0, 1000).map((r) => `<tr><td>${v4e(r.referenceNumber || '')}</td><td>${v4e(r.title)}</td><td>${v4e(r.author)}</td><td>${v4e(r.publisher)}</td><td>${v4e(r.category)}</td></tr>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#2f2218;padding:24px}h1{color:#6b492c} .metrics{display:flex;gap:10px;margin:14px 0}.m{border:1px solid #d8c8b4;border-radius:10px;padding:10px;min-width:120px}.m b{display:block;font-size:22px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #d8c8b4;padding:6px;text-align:right}th{background:#efe5d7}footer{margin-top:15px;color:#7d6b59;font-size:9px}</style></head><body><h1>${v4e(data.title)}</h1><p>تقرير محلي مولد في ${v4e(new Date().toLocaleString('ar-EG'))}</p><div class="metrics"><div class="m"><span>العناوين</span><b>${data.records.length}</b></div><div class="m"><span>النسخ</span><b>${data.items.length}</b></div><div class="m"><span>المستعيرون</span><b>${data.patrons.length}</b></div><div class="m"><span>المتأخر</span><b>${data.overdue.length}</b></div></div><h2>السجلات الببليوغرافية</h2><table><thead><tr><th>الرقم</th><th>العنوان</th><th>المؤلف</th><th>الناشر</th><th>التصنيف</th></tr></thead><tbody>${rows}</tbody></table><footer>رَفّ 4 — التقرير لا يحتوي بيانات خارج الجهاز.</footer></body></html>`;
}
