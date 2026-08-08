'use strict';

/* Settings module extracted for Raff 3.0 maintainability. */
function renderSettings(root) {
  const meta = RAFF_STATE.meta;
  const st = RAFF_STATE.settings || {};
  const cols = (st.labelColumns >= 1 && st.labelColumns <= 5) ? st.labelColumns : 4;
  const lblSize = st.labelSize === 'medium' ? 'medium' : 'small';
  const loanDays = st.loanDurationDays || 30;

  const tab = _settingsTab || 'brand';
  const exportRow = (title, desc, id) => `
    <div class="setting-action">
      <div>
        <div class="setting-action-title">${title}</div>
        <div class="setting-action-desc">${desc}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="${id}">${icon('download')} تصدير</button>
    </div>`;

  const TABS = [
    { key: 'brand', label: 'الهوية والملصقات', icon: 'printer' },
    { key: 'loan', label: 'الإعارة', icon: 'calendar' },
    { key: 'scanner', label: 'قارئ الباركود', icon: 'scan' },
    { key: 'security', label: 'الوصول والحماية', icon: 'user' },
    { key: 'export', label: 'التصدير', icon: 'download' },
    { key: 'backup', label: 'النسخ والصيانة', icon: 'copies' },
    { key: 'records', label: 'السجل والمحذوفات', icon: 'note' },
    { key: 'system', label: 'النظام', icon: 'info' },
  ];

  const panelBrand = `
    <div class="settings-two-col">
      <div>
        <div class="field">
          <label>اسم المكتبة / المؤسسة</label>
          <input type="text" id="setInstName" value="${escapeHtml(st.institutionName || '')}" placeholder="مثال: مكتبة المسجد المركزي" maxlength="120" />
        </div>
        <div class="field">
          <label>شعار المؤسسة</label>
          <div class="logo-row">
            <div class="logo-preview" id="logoPreview">
              ${st.logo ? `<img src="${st.logo}" alt="الشعار">` : `<span class="logo-empty">${icon('barcode', 22)} لا يوجد شعار</span>`}
            </div>
            <div class="logo-actions">
              <button class="btn btn-outline btn-sm" id="logoPickBtn">${icon('upload', 14)} اختيار صورة</button>
              <button class="btn btn-ghost btn-sm ${st.logo ? '' : 'hidden'}" id="logoClearBtn">${icon('trash', 14)} إزالة</button>
            </div>
          </div>
          <span class="hint">PNG أو JPG أو SVG — يُحفظ محلياً داخل المكتبة فقط.</span>
        </div>
      </div>
      <div class="label-opts">
        <div class="label-opt-cols">
          <label>عدد الأعمدة (A4)</label>
          <div class="chip-toggle" id="setCols">
            ${[3, 4, 5].map((n) => `<button data-cols="${n}" class="${n === cols ? 'active' : ''}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="label-opt-cols">
          <label>حجم الملصق</label>
          <div class="chip-toggle" id="setSize">
            <button data-size="small" class="${lblSize === 'small' ? 'active' : ''}">صغير</button>
            <button data-size="medium" class="${lblSize === 'medium' ? 'active' : ''}">متوسط</button>
          </div>
        </div>
        <label class="toggle-row"><input type="checkbox" id="setPrice" ${st.labelShowPrice !== false ? 'checked' : ''}> إظهار السعر على الملصق</label>
        <label class="toggle-row"><input type="checkbox" id="setShelf" ${st.labelShowShelf !== false ? 'checked' : ''}> إظهار الرف على الملصق</label>
        <label class="toggle-row"><input type="checkbox" id="setMicro" ${st.labelShowMicrotext !== false ? 'checked' : ''}> معلومات دقيقة خفية</label>
        <button class="btn btn-outline btn-sm" id="previewLabelsBtn" style="margin-top:6px;justify-content:center;">${icon('printer', 14)} معاينة الملصقات</button>
      </div>
    </div>`;

  const panelLoan = `
    <div class="loan-setting">
      <div class="field">
        <label>${icon('calendar', 14)} مدة الإعارة الافتراضية (بالأيام)</label>
        <div class="loan-days-row">
          <div class="chip-toggle" id="setLoanChips">
            ${[7, 14, 30, 60, 90].map((n) => `<button data-days="${n}" class="${n === loanDays ? 'active' : ''}">${n}</button>`).join('')}
          </div>
          <div class="loan-days-custom">
            <span>أو مخصّص:</span>
            <input type="number" id="setLoanCustom" min="1" max="3650" value="${loanDays}" />
            <span>يوم</span>
          </div>
        </div>
        <span class="hint">عند إعارة كتاب دون تحديد تاريخ إرجاع، يُحسب الاستحقاق بعد هذه المدة. تجاوز هذا التاريخ يُعدّ تأخيراً.</span>
      </div>
      <div class="loan-current-note">
        ${icon('info', 14)} <span>مدة الإعارة الحالية: <b>${loanDays} يوماً</b>. يُطبَّق التغيير على <b>الإعارات الجديدة فقط</b> افتراضياً.</span>
      </div>
      <div class="loan-apply-existing">
        <div>
          <div class="setting-action-title">تطبيق على الإعارات القائمة</div>
          <div class="setting-action-desc">إعادة حساب تاريخ استحقاق كل الإعارات المفتوحة (الجديدة والقديمة) بناءً على المدة الحالية</div>
        </div>
        <button class="btn btn-outline btn-sm" id="applyLoanExisting">${icon('refresh', 14)} تطبيق على الكل</button>
      </div>
    </div>`;

  const panelExport = `
    ${exportRow('نسخة احتياطية كاملة (JSON)', 'قابلة للاستيراد لاحقاً على أي جهاز', 'exportJsonBtn')}
    ${exportRow('جدول بيانات (CSV)', 'لفتحه في Excel', 'exportCsvBtn')}
    ${exportRow('ملف نصي (TXT)', 'قائمة مقروءة بجميع الكتب', 'exportTxtBtn')}
    ${exportRow('تقرير المكتبة (PDF)', 'جدول منسّق جاهز للطباعة', 'exportPdfBtn')}
    ${exportRow('المستعيرون (PDF)', 'الأسماء والكتب ويوم الإعارة', 'exportBorrowersBtn')}
    ${exportRow('المتأخرون فقط (PDF)', 'المتأخرون مع أيام التأخير', 'exportOverduePdfBtn')}
    ${exportRow('الإعارات المتأخرة (CSV)', 'المتأخرة فقط مع وسيلة التواصل', 'exportOverdueBtn')}`;

  const panelScanner = `
    <div class="settings-two-col scanner-settings">
      <div>
        <div class="field"><label>أقصى فاصل بين ضغطات القارئ</label><div class="inline-number"><input id="setScannerGap" type="number" min="10" max="250" value="${Number(st.scannerGapMs) || 35}"><span>مللي ثانية</span></div><span class="hint">القيمة الأصغر أدق للقارئ السريع. ارفعها لقارئ Bluetooth البطيء.</span></div>
        <div class="field"><label>زر إنهاء المسح</label><select id="setScannerTerminator"><option value="Enter" ${st.scannerTerminator !== 'Tab' ? 'selected' : ''}>Enter</option><option value="Tab" ${st.scannerTerminator === 'Tab' ? 'selected' : ''}>Tab</option></select></div>
        <button class="btn btn-primary btn-sm" id="saveScannerBtn">${icon('check', 14)} حفظ وتطبيق</button>
      </div>
      <div class="scanner-test-box">
        <div class="setting-action-title">اختبار القارئ</div>
        <p class="setting-action-desc">ضع المؤشر هنا ثم امسح باركودًا. سيظهر النص والفواصل الزمنية دون تغيير أي بيانات.</p>
        <input id="scannerTestInput" data-no-scan type="text" placeholder="امسح هنا للاختبار" autocomplete="off">
        <div id="scannerTestResult" class="scanner-test-result">لم يُجر اختبار بعد</div>
      </div>
    </div>`;

  const panelSecurity = `
    <div class="security-status-card ${RAFF_AUTH?.configured ? 'is-protected' : 'is-open'}">
      <div class="security-status-icon">${icon(RAFF_AUTH?.configured ? 'check' : 'alert', 22)}</div>
      <div><div class="setting-action-title">${RAFF_AUTH?.configured ? 'وضع الإدارة محمي بكلمة مرور' : 'وضع الإدارة غير محمي بعد'}</div><div class="setting-action-desc">في وضع البحث العام لا تظهر أدوات الإضافة أو التعديل أو الحذف، وتُرفض عملياتها من طبقة البرنامج الداخلية أيضاً.</div></div>
    </div>
    <div class="setting-action">
      <div><div class="setting-action-title">${RAFF_AUTH?.configured ? 'تغيير كلمة المرور وسؤال الاسترداد' : 'إعداد كلمة مرور الإدارة'}</div><div class="setting-action-desc">تُحفظ كلمة المرور وإجابة الاسترداد كبصمات Scrypt مملّحة، ولا تُخزنان كنص قابل للقراءة.</div></div>
      <button class="btn btn-outline btn-sm" id="securitySetupBtn">${icon('edit')} ${RAFF_AUTH?.configured ? 'تعديل' : 'إعداد'}</button>
    </div>
    <label class="toggle-row access-start-toggle"><input type="checkbox" id="startPublicMode" ${RAFF_AUTH?.startInPublicMode !== false ? 'checked' : ''}> بدء البرنامج دائماً في وضع البحث العام</label>
    ${RAFF_AUTH?.configured ? `<div class="danger-zone"><div><div class="setting-action-title" style="color:var(--danger);">إزالة حماية الإدارة</div><div class="setting-action-desc">سيصبح الانتقال إلى الإدارة متاحاً بلا كلمة مرور.</div></div><button class="btn btn-danger btn-sm" id="removeProtectionBtn">${icon('trash')} إزالة الحماية</button></div>` : ''}`;

  const panelRecords = `
    <div class="records-grid">
      <section><div class="records-heading"><div><div class="setting-action-title">سجل النشاط المحلي</div><div class="setting-action-desc">آخر عمليات الإضافة والتعديل والإعارة والاستيراد والصيانة</div></div></div><div id="activityList" class="settings-loading">جارٍ تحميل السجل…</div></section>
      <section><div class="records-heading"><div><div class="setting-action-title">سلة المحذوفات</div><div class="setting-action-desc">تبقى الكتب المحذوفة 30 يوماً ويمكن استعادتها</div></div><button class="btn btn-ghost btn-sm" id="purgeTrashBtn">إفراغ السلة</button></div><div id="trashList" class="settings-loading">جارٍ تحميل المحذوفات…</div></section>
    </div>`;

  const panelBackup = `
    <div class="maintenance-layout">
      <div class="maintenance-actions-grid">
        <section class="maintenance-card">
          <span class="maintenance-card-icon">${icon('copies', 17)}</span>
          <div class="maintenance-card-copy"><div class="setting-action-title">نسخة أمان فورية</div><div class="setting-action-desc">حفظ لقطة داخلية مع الاحتفاظ اليومي والأسبوعي الذكي.</div></div>
          <button class="btn btn-outline btn-sm" id="backupBtn">إنشاء نسخة</button>
        </section>
        <section class="maintenance-card">
          <span class="maintenance-card-icon">${icon('upload', 17)}</span>
          <div class="maintenance-card-copy"><div class="setting-action-title">دمج مكتبة من JSON</div><div class="setting-action-desc">إضافة الكتب غير المكررة دون استبدال إعدادات المكتبة الحالية.</div></div>
          <button class="btn btn-outline btn-sm" id="mergeJsonBtn">دمج</button>
        </section>
        <section class="maintenance-card">
          <span class="maintenance-card-icon">${icon('refresh', 17)}</span>
          <div class="maintenance-card-copy"><div class="setting-action-title">استعادة نسخة كاملة</div><div class="setting-action-desc">إرجاع الكتب والإعدادات والسجلات كما كانت في ملف النسخة.</div></div>
          <button class="btn btn-outline btn-sm" id="restoreJsonBtn">استعادة</button>
        </section>
        <section class="maintenance-card">
          <span class="maintenance-card-icon">${icon('check', 17)}</span>
          <div class="maintenance-card-copy"><div class="setting-action-title">فحص سلامة البيانات</div><div class="setting-action-desc">فحص الأرقام والنسخ والإعارات مع خيار إصلاح آمن ونسخة احتياطية.</div></div>
          <button class="btn btn-outline btn-sm" id="integrityBtn">فحص الآن</button>
        </section>
      </div>

      <section class="backup-list-wrap maintenance-backups">
        <div class="maintenance-section-head"><div><div class="setting-action-title">النسخ الداخلية المتاحة</div><div class="setting-action-desc">أحدث النسخ المحلية التي يمكن الرجوع إليها مباشرة.</div></div></div>
        <div id="backupList" class="settings-loading">جارٍ قراءة النسخ…</div>
      </section>

      <section class="maintenance-data-card">
        <div><div class="setting-action-title">مجلد بيانات البرنامج</div><div class="setting-action-desc">قاعدة البيانات والنسخ الاحتياطية وملف الحماية المحلي.</div></div>
        <button class="btn btn-outline btn-sm" id="openFolderBtn">${icon('building')} فتح المجلد</button>
      </section>

      <div class="danger-zone maintenance-danger">
        <div><div class="setting-action-title" style="color:var(--danger);">حذف جميع بيانات المكتبة</div><div class="setting-action-desc">تُنشأ نسخة أمان تلقائياً قبل الحذف، ولا تُحذف إعدادات الحماية.</div></div>
        <button class="btn btn-danger btn-sm" id="resetAllBtn">${icon('trash')} حذف الكل</button>
      </div>
    </div>`;

  const panelSystem = `
    <div class="system-stats">
      <div class="system-stat"><span class="system-stat-value">${RAFF_STATE.books.length}</span><span class="system-stat-label">كتاب</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.authors.length}</span><span class="system-stat-label">مؤلف</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.publishers.length}</span><span class="system-stat-label">دار نشر</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.series.length}</span><span class="system-stat-label">سلسلة</span></div>
    </div>
    <div class="db-path">
      <span class="setting-action-desc">مسار ملف البيانات</span>
      <code title="${escapeHtml(meta.filePath)}">${escapeHtml(meta.filePath)}</code>
    </div>`;

  const panels = { brand: panelBrand, loan: panelLoan, scanner: panelScanner, security: panelSecurity, export: panelExport, backup: panelBackup, records: panelRecords, system: panelSystem };

  root.innerHTML = `
    <div class="panel settings-tabbed">
      <div class="settings-tabs" id="settingsTabs">
        ${TABS.map((t) => `<button class="settings-tab ${t.key === tab ? 'active' : ''}" data-tab="${t.key}">${icon(t.icon, 15)}<span>${t.label}</span></button>`).join('')}
      </div>
      <div class="settings-tab-body" id="settingsTabBody">${panels[tab]}</div>
    </div>`;

  root.querySelector('#settingsTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn || btn.dataset.tab === _settingsTab) return;
    _settingsTab = btn.dataset.tab;
    root.querySelectorAll('.settings-tab[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === _settingsTab));
    const body = root.querySelector('#settingsTabBody');
    body.innerHTML = panels[_settingsTab];
    body.scrollTop = 0;
    wireSettingsHandlers(root, _settingsTab);
  });

  wireSettingsHandlers(root, tab);
}

// Declared at module scope so the tab selection persists across re-renders.
let _settingsTab = 'brand';

/**
 * Attaches handlers for whichever settings tab is currently rendered. Each
 * lookup is guarded (the element only exists on its tab), so one function
 * safely serves every tab.
 */
function wireSettingsHandlers(root, tab) {
  const $ = (sel) => root.querySelector(sel);
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

  const saveSetting = async (patch) => {
    const updated = await window.raff.updateSettings(patch);
    RAFF_STATE.settings = updated;
  };

  // ---- Brand / labels tab ----
  const instInput = $('#setInstName');
  if (instInput) {
    let instTimer = null;
    instInput.addEventListener('input', () => {
      if (instTimer) clearTimeout(instTimer);
      instTimer = setTimeout(() => saveSetting({ institutionName: instInput.value }), 400);
    });
  }
  on('#logoPickBtn', 'click', async () => {
    const filePath = await raffOpenFile({ title: 'اختيار شعار المؤسسة', description: 'اختر صورة لا يتجاوز حجمها 500 كيلوبايت.', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'], confirmLabel: 'استخدام هذا الشعار' });
    if (!filePath) return;
    const image = await window.raff.readImageDataUrl(filePath);
    if (!image?.ok) { toast(image?.error || 'تعذّر قراءة الصورة', 'error'); return; }
    await saveSetting({ logo: image.dataUrl });
    $('#logoPreview').innerHTML = `<img src="${image.dataUrl}" alt="الشعار">`;
    $('#logoClearBtn').classList.remove('hidden');
    toast('تم حفظ الشعار', 'success', 1600);
  });
  on('#logoClearBtn', 'click', async () => {
    await saveSetting({ logo: '' });
    $('#logoPreview').innerHTML = `<span class="logo-empty">${icon('barcode', 22)} لا يوجد شعار</span>`;
    $('#logoClearBtn').classList.add('hidden');
    toast('تم إزالة الشعار', 'success', 1600);
  });
  on('#setCols', 'click', (e) => {
    const btn = e.target.closest('button[data-cols]');
    if (!btn) return;
    root.querySelectorAll('#setCols button').forEach((b) => b.classList.toggle('active', b === btn));
    saveSetting({ labelColumns: Number(btn.dataset.cols) });
  });
  on('#setSize', 'click', (e) => {
    const btn = e.target.closest('button[data-size]');
    if (!btn) return;
    root.querySelectorAll('#setSize button').forEach((b) => b.classList.toggle('active', b === btn));
    saveSetting({ labelSize: btn.dataset.size });
  });
  on('#setPrice', 'change', (e) => saveSetting({ labelShowPrice: e.target.checked }));
  on('#setShelf', 'change', (e) => saveSetting({ labelShowShelf: e.target.checked }));
  on('#setMicro', 'change', (e) => saveSetting({ labelShowMicrotext: e.target.checked }));
  on('#previewLabelsBtn', 'click', () => {
    const sample = RAFF_STATE.books.slice(0, 6);
    if (!sample.length) { toast('لا توجد كتب للمعاينة', 'error'); return; }
    printBarcodeLabels(sample, 'معاينة');
  });

  // ---- Loan tab ----
  on('#setLoanChips', 'click', (e) => {
    const btn = e.target.closest('button[data-days]');
    if (!btn) return;
    const days = Number(btn.dataset.days);
    root.querySelectorAll('#setLoanChips button').forEach((b) => b.classList.toggle('active', b === btn));
    const custom = $('#setLoanCustom'); if (custom) custom.value = days;
    saveSetting({ loanDurationDays: days });
    const note = $('.loan-current-note b'); if (note) note.textContent = `${days} يوماً`;
  });
  const loanCustom = $('#setLoanCustom');
  if (loanCustom) {
    let lt = null;
    loanCustom.addEventListener('input', () => {
      if (lt) clearTimeout(lt);
      lt = setTimeout(() => {
        const days = Math.max(1, Math.min(3650, Math.floor(Number(loanCustom.value) || 30)));
        root.querySelectorAll('#setLoanChips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === days));
        saveSetting({ loanDurationDays: days });
        const note = $('.loan-current-note b'); if (note) note.textContent = `${days} يوماً`;
      }, 500);
    });
  }
  on('#applyLoanExisting', 'click', async () => {
    const days = (RAFF_STATE.settings || {}).loanDurationDays || 30;
    const ok = await confirmModal({
      title: 'تطبيق المدة على كل الإعارات القائمة؟',
      message: `سيُعاد حساب تاريخ الاستحقاق لكل الإعارات المفتوحة على أساس ${days} يوماً من تاريخ إعارة كل كتاب. قد يغيّر ذلك حالة بعض الإعارات (متأخر/ضمن المدة). هل تريد المتابعة؟`,
      confirmLabel: 'نعم، طبّق على الكل',
    });
    if (!ok) return;
    const res = await window.raff.applyLoanDuration(days);
    await refreshState();
    renderNavCounts();
    toast(`تم تحديث ${res.updated} إعارة`, 'success');
  });

  // ---- Scanner tab ----
  on('#saveScannerBtn', 'click', async () => {
    const gap = Math.max(10, Math.min(250, Math.floor(Number($('#setScannerGap')?.value) || 35)));
    const terminator = $('#setScannerTerminator')?.value === 'Tab' ? 'Tab' : 'Enter';
    await saveSetting({ scannerGapMs: gap, scannerTerminator: terminator });
    window.restartGlobalScanner?.();
    toast('تم حفظ إعدادات القارئ وتطبيقها', 'success');
  });
  const scannerTestInput = $('#scannerTestInput');
  if (scannerTestInput) {
    let last = 0; let chars = []; let gaps = [];
    scannerTestInput.addEventListener('keydown', (e) => {
      const now = performance.now();
      if (last && e.key.length === 1) gaps.push(Math.round(now - last));
      last = now;
      const terminator = $('#setScannerTerminator')?.value === 'Tab' ? 'Tab' : 'Enter';
      if (e.key === terminator) {
        e.preventDefault();
        const code = scannerTestInput.value.trim() || chars.join('');
        const maxGap = gaps.length ? Math.max(...gaps) : 0;
        const result = $('#scannerTestResult');
        result.innerHTML = code
          ? `<b>${escapeHtml(code)}</b><span>أكبر فاصل: ${maxGap} ms · ${code.length} محارف</span>`
          : 'لم يصل كود صالح';
        scannerTestInput.value = ''; chars = []; gaps = []; last = 0;
      } else if (e.key.length === 1) chars.push(e.key);
    });
  }

  // ---- Security tab ----
  on('#securitySetupBtn', 'click', () => showSecuritySetupModal({ firstSetup: !RAFF_AUTH?.configured }));
  on('#startPublicMode', 'change', async (e) => {
    const res = await window.raff.authUpdatePreferences({ startInPublicMode: e.target.checked });
    if (!res.ok) { e.target.checked = !e.target.checked; return toast(res.error || 'تعذر حفظ التفضيل', 'error'); }
    RAFF_AUTH = { ...RAFF_AUTH, ...res.state };
    toast('تم حفظ وضع بدء التشغيل', 'success', 1600);
  });
  on('#removeProtectionBtn', 'click', async () => {
    const ok = await confirmModal({ title: 'إزالة كلمة مرور الإدارة؟', message: 'سيظل وضع البحث العام موجوداً، لكن يمكن لأي شخص فتح الإدارة دون كلمة مرور.', confirmLabel: 'إزالة الحماية' });
    if (!ok) return;
    const res = await window.raff.authRemoveProtection();
    if (!res.ok) return toast(res.error || 'تعذر إزالة الحماية', 'error');
    await refreshAfterAuthChange(res.state);
    toast('تمت إزالة حماية الإدارة', 'success');
  });

  // ---- Export tab ----
  on('#exportJsonBtn', 'click', async () => {
    const filePath = await raffSaveFile({ title: 'حفظ نسخة احتياطية كاملة', defaultName: `raff-backup-${raffFileDateStamp()}.json`, extensions: ['json'] });
    if (!filePath) return;
    const r = await window.raff.exportJson(filePath);
    if (r.ok) toast('تم حفظ النسخة الاحتياطية بنجاح', 'success'); else toast(r.error || 'تعذّر حفظ النسخة', 'error');
  });
  on('#exportCsvBtn', 'click', async () => {
    const filePath = await raffSaveFile({ title: 'تصدير جدول بيانات', defaultName: `raff-library-${raffFileDateStamp()}.csv`, extensions: ['csv'] });
    if (!filePath) return;
    const r = await window.raff.exportCsv(filePath);
    if (r.ok) toast('تم تصدير الملف بصيغة CSV', 'success'); else toast(r.error || 'تعذّر التصدير', 'error');
  });
  on('#exportTxtBtn', 'click', async () => {
    const filePath = await raffSaveFile({ title: 'تصدير ملف نصي', defaultName: `raff-library-${raffFileDateStamp()}.txt`, extensions: ['txt'] });
    if (!filePath) return;
    const r = await window.raff.exportTxt(filePath);
    if (r.ok) toast('تم تصدير الملف النصي بنجاح', 'success'); else toast(r.error || 'تعذّر التصدير', 'error');
  });
  on('#exportPdfBtn', 'click', async (e) => {
    const filePath = await raffSaveFile({ title: 'حفظ تقرير المكتبة PDF', defaultName: `raff-library-${raffFileDateStamp()}.pdf`, extensions: ['pdf'] });
    if (!filePath) return;
    const btn = e.currentTarget; const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'جارٍ التصدير...';
    try {
      const res = await window.raff.exportPdf(filePath);
      if (res.ok) toast('تم تصدير ملف PDF بنجاح', 'success');
      else toast('فشل تصدير PDF: ' + (res.error || 'خطأ غير معروف'), 'error');
    } finally { btn.disabled = false; btn.innerHTML = original; }
  });
  on('#exportBorrowersBtn', 'click', () => exportBorrowersPdf({ overdueOnly: false }));
  on('#exportOverduePdfBtn', 'click', () => exportBorrowersPdf({ overdueOnly: true }));
  on('#exportOverdueBtn', 'click', async () => {
    const filePath = await raffSaveFile({ title: 'تصدير الإعارات المتأخرة', defaultName: `raff-overdue-${raffFileDateStamp()}.csv`, extensions: ['csv'] });
    if (!filePath) return;
    const r = await window.raff.exportOverdueCsv(filePath);
    if (r.ok) toast(`تم تصدير ${r.count} إعارة متأخرة`, 'success'); else toast(r.error || 'تعذّر التصدير', 'error');
  });

  // ---- Backup tab ----
  on('#backupBtn', 'click', async () => {
    const res = await window.raff.backup();
    toast(res.ok ? 'تم إنشاء نسخة أمان' : 'تعذّر إنشاء النسخة', res.ok ? 'success' : 'error');
  });
  const backupList = $('#backupList');
  if (backupList) {
    window.raff.getRecoveryState().then((res) => {
      const items = res?.backups || [];
      backupList.innerHTML = items.length ? items.map((b) => `<div class="backup-row"><div><b>${formatDateTimeShort(b.createdAt)}</b><span>${b.books ?? '—'} كتاب · ${Math.max(1, Math.round((b.size || 0) / 1024))} KB</span></div><button class="btn btn-ghost btn-sm" data-restore-backup="${escapeHtml(b.filePath)}">استعادة</button></div>`).join('') : '<div class="records-empty">لا توجد نسخ داخلية بعد</div>';
      backupList.querySelectorAll('[data-restore-backup]').forEach((btn) => btn.addEventListener('click', async () => {
        const ok = await confirmModal({ title: 'استعادة النسخة الداخلية؟', message: 'ستُنشأ نسخة أمان من الحالة الحالية أولاً، ثم تُستعاد النسخة المختارة.', confirmLabel: 'استعادة', danger: false });
        if (!ok) return;
        const result = await window.raff.restoreListedBackup(btn.dataset.restoreBackup);
        if (!result.ok) return toast(result.error || 'فشلت الاستعادة', 'error');
        await refreshState(); renderNavCounts(); renderRoute();
        toast(`تمت استعادة ${result.books} كتاب`, 'success');
      }));
    });
  }
  on('#openFolderBtn', 'click', () => raffBrowseDataFolder());
  on('#integrityBtn', 'click', async () => {
    const res = await window.raff.integrityCheck();
    if (res.ok) showIntegrityReport(res.report); else toast('تعذّر إجراء الفحص', 'error');
  });
  on('#mergeJsonBtn', 'click', async () => {
    const filePath = await raffOpenFile({ title: 'دمج كتب من ملف JSON', extensions: ['json'], confirmLabel: 'دمج هذا الملف' });
    if (!filePath) return;
    const res = await window.raff.mergeJson(filePath);
    if (res.ok) {
      toast(`تم دمج ${res.added} كتاب${res.skipped ? ` وتجاهل ${res.skipped} مكرر` : ''}`, 'success');
      await refreshState(); renderNavCounts(); renderRoute();
    } else if (res.error) toast('فشل الدمج: ' + res.error, 'error');
  });
  on('#restoreJsonBtn', 'click', async () => {
    const ok = await confirmModal({ title: 'استعادة نسخة كاملة؟', message: 'ستُنشأ نسخة أمان من الحالة الحالية ثم تُستبدل الكتب والإعدادات والسجلات بما في الملف المختار. إعدادات كلمة مرور الإدارة محفوظة منفصلة ولن تتغير.', confirmLabel: 'اختيار نسخة واستعادتها', danger: false });
    if (!ok) return;
    const filePath = await raffOpenFile({ title: 'اختيار نسخة رَفّ كاملة', extensions: ['json'], confirmLabel: 'استعادة هذا الملف' });
    if (!filePath) return;
    const res = await window.raff.restoreJson(filePath);
    if (res.ok) {
      await refreshState(); renderNavCounts(); renderRoute();
      toast(`تمت استعادة ${res.books ?? RAFF_STATE.books.length} كتاب`, 'success');
    } else if (res.error) toast('فشلت الاستعادة: ' + res.error, 'error');
  });
  const activityList = $('#activityList');
  if (activityList) {
    window.raff.getActivity(200).then((res) => {
      const items = res?.activity || [];
      activityList.innerHTML = items.length ? items.map((a) => `<div class="activity-row"><span class="activity-dot"></span><div><b>${escapeHtml(a.message)}</b><small>${formatDateTimeShort(a.createdAt)}</small></div></div>`).join('') : '<div class="records-empty">لا يوجد نشاط مسجل بعد</div>';
    });
  }
  const trashList = $('#trashList');
  if (trashList) {
    window.raff.getTrash().then((res) => {
      const items = res?.items || [];
      trashList.innerHTML = items.length ? items.map((t) => `<div class="trash-row"><div><b>${escapeHtml(t.book?.title || 'بدون عنوان')}</b><span>${escapeHtml(t.book?.referenceNumber || '')} · حُذف ${formatDateTimeShort(t.deletedAt)}</span></div><button class="btn btn-outline btn-sm" data-restore-trash="${escapeHtml(t.id)}">استعادة</button></div>`).join('') : '<div class="records-empty">سلة المحذوفات فارغة</div>';
      trashList.querySelectorAll('[data-restore-trash]').forEach((btn) => btn.addEventListener('click', async () => {
        const result = await window.raff.restoreBook(btn.dataset.restoreTrash);
        if (!result?.ok && result?.error) return toast(result.error, 'error');
        await refreshState(); renderNavCounts(); renderSettings(root);
        toast('تمت استعادة الكتاب', 'success');
      }));
    });
  }
  on('#purgeTrashBtn', 'click', async () => {
    const ok = await confirmModal({ title: 'إفراغ سلة المحذوفات؟', message: 'لن يمكن استعادة الكتب الموجودة فيها بعد ذلك.', confirmLabel: 'إفراغ السلة' });
    if (!ok) return;
    const res = await window.raff.purgeTrash();
    if (!res.ok) return toast(res.error || 'تعذر إفراغ السلة', 'error');
    renderSettings(root); toast(`تم حذف ${res.count} سجل نهائياً`, 'success');
  });

  on('#resetAllBtn', 'click', async () => {
    const ok = await confirmModal({
      title: 'حذف جميع بيانات المكتبة؟',
      message: 'ستُنشأ نسخة أمان تلقائياً قبل الحذف يمكن الرجوع إليها من مجلد البيانات. هل تريد المتابعة؟',
      confirmLabel: 'حذف كل شيء',
    });
    if (!ok) return;
    await window.raff.resetAll();
    await refreshState(); renderNavCounts();
    toast('تم حذف جميع البيانات (مع حفظ نسخة أمان)', 'success');
    navigateTo('dashboard');
  });
  void tab;
}
