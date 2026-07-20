'use strict';

/* ========================================================================
   رَفّ 4 — Offline professional workspaces
   This renderer layer keeps the researcher experience calm and exposes
   advanced tools progressively through role-oriented workspaces.
   ======================================================================== */

const RAFF4_STATE = {
  data: null,
  opacQuery: '',
  opacFilters: { availableOnly: false, branchId: '', category: '', materialTypeId: '' },
  catalogQuery: '',
  patronQuery: '',
  circulation: { patronId: '', itemIds: [] },
  activeInventoryId: '',
};

const V4_STATUS = {
  available: ['متاح', 'success'], on_loan: ['معار', 'danger'], reserved: ['محجوز', 'warning'],
  lost: ['مفقود', 'danger'], damaged: ['تالف', 'danger'], maintenance: ['صيانة', 'warning'],
  withdrawn: ['مسحوب', 'muted'], in_transit: ['قيد النقل', 'info'],
  active: ['نشط', 'success'], suspended: ['موقوف', 'danger'], expired: ['منتهي', 'warning'],
  waiting: ['قائمة انتظار', 'warning'], ready: ['جاهز للاستلام', 'success'], fulfilled: ['مكتمل', 'info'],
  cancelled: ['ملغى', 'muted'], requested: ['مطلوب', 'info'], approved: ['معتمد', 'success'],
  ordered: ['تم الطلب', 'warning'], partially_received: ['استلام جزئي', 'warning'], received: ['مستلم', 'success'],
  open: ['مفتوحة', 'success'], closed: ['مغلقة', 'muted'],
};

const V4_ENTITY_LABELS = {
  patrons: 'المستعير', holds: 'الحجز', policies: 'السياسة', branches: 'الفرع', users: 'المستخدم',
  authorities: 'السجل الاستنادي', acquisitions: 'طلب التزويد', serials: 'الدورية',
  savedSearches: 'البحث المحفوظ', readingLists: 'قائمة القراءة', notifications: 'الإشعار',
  customFields: 'الحقل المخصص', patronCategories: 'فئة المستعير', materialTypes: 'نوع المادة', locations: 'الموقع',
};

function v4e(value) { return escapeHtml(value == null ? '' : String(value)); }
function v4arr(value) { return Array.isArray(value) ? value : []; }
function v4date(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return withTime ? d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('ar-EG', { dateStyle: 'medium' });
}
function v4money(value) {
  const n = Number(value) || 0;
  const currency = RAFF4_STATE.data?.settings?.currency || 'EGP';
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n); }
  catch (_) { return `${n.toLocaleString('ar-EG')} ${currency}`; }
}
function v4status(status) {
  const [label, tone] = V4_STATUS[status] || [status || 'غير محدد', 'muted'];
  return `<span class="v4-badge ${tone}">${v4e(label)}</span>`;
}
function v4empty(iconName, title, text, action = '') {
  return `<div class="v4-empty"><div class="v4-empty-inner"><div class="v4-empty-icon">${icon(iconName, 22)}</div><h3>${v4e(title)}</h3><p>${v4e(text)}</p>${action}</div></div>`;
}
function v4metric(label, value, iconName, foot = '', tone = '') {
  return `<div class="v4-metric ${tone}"><div class="v4-metric-top"><span class="v4-metric-label">${v4e(label)}</span><span class="v4-metric-icon">${icon(iconName, 16)}</span></div><div class="v4-metric-value">${v4e(value)}</div><div class="v4-metric-foot">${v4e(foot)}</div></div>`;
}
function v4pageHead(eyebrow, title, subtitle, actions = '') {
  return `<div class="v4-page-head"><div class="v4-page-head-copy"><div class="v4-eyebrow">${icon('layers', 13)} ${v4e(eyebrow)}</div><h2>${v4e(title)}</h2><p>${v4e(subtitle)}</p></div><div class="v4-page-actions">${actions}</div></div>`;
}
function v4action(label, action, iconName = 'plus', cls = '') {
  return `<button type="button" class="v4-action ${cls}" data-v4-action="${v4e(action)}">${icon(iconName, 15)}<span>${v4e(label)}</span></button>`;
}
function v4iconButton(action, idValue, iconName = 'edit', label = '', cls = '') {
  return `<button type="button" class="v4-icon-btn ${cls}" data-v4-action="${v4e(action)}" data-id="${v4e(idValue)}" aria-label="${v4e(label || action)}" title="${v4e(label || action)}">${icon(iconName, 14)}</button>`;
}
function v4selectOptions(rows, selected = '', labelKey = 'name', valueKey = 'id', emptyLabel = 'اختر') {
  return `<option value="">${v4e(emptyLabel)}</option>${v4arr(rows).filter((x) => !x.deletedAt && x.active !== false).map((x) => `<option value="${v4e(x[valueKey])}" ${x[valueKey] === selected ? 'selected' : ''}>${v4e(x[labelKey])}</option>`).join('')}`;
}
function v4record(recordId) { return RAFF4_STATE.data?.records?.find((r) => r.id === recordId); }
function v4item(itemId) { return RAFF4_STATE.data?.items?.find((i) => i.id === itemId); }
function v4patron(patronId) { return RAFF4_STATE.data?.patrons?.find((p) => p.id === patronId); }
function v4holding(holdingId) { return RAFF4_STATE.data?.holdings?.find((h) => h.id === holdingId); }
function v4branch(branchId) { return RAFF4_STATE.data?.branches?.find((b) => b.id === branchId); }
function v4activeUser() { return RAFF4_STATE.data?.users?.find((u) => u.id === RAFF4_STATE.data?.settings?.activeUserId); }

const V4_ROLE_WORKSPACE = {
  viewer: 'researcher', circulation: 'circulation', inventory: 'circulation',
  cataloger: 'cataloging', publisher: 'cataloging', librarian: 'all', admin: 'all',
};
const V4_ROLE_ROUTES = {
  viewer: new Set(['dashboard', 'opac', 'reading-lists']),
  circulation: new Set(['dashboard', 'opac', 'reading-lists', 'notifications', 'circulation', 'patrons', 'holds', 'scan']),
  inventory: new Set(['dashboard', 'opac', 'notifications', 'inventory', 'scan', 'catalog']),
  cataloger: new Set(['dashboard', 'opac', 'reading-lists', 'catalog', 'authorities', 'exchange', 'reports', 'scan']),
  publisher: new Set(['dashboard', 'opac', 'reading-lists', 'catalog', 'authorities', 'exchange', 'acquisitions', 'publisher', 'reports']),
  librarian: null,
  admin: null,
};
function v4EffectiveWorkspace() {
  const role = v4activeUser()?.role || 'admin';
  return ['admin', 'librarian'].includes(role)
    ? (RAFF4_STATE.data?.settings?.workspace || 'all')
    : (V4_ROLE_WORKSPACE[role] || 'researcher');
}
function v4RouteAllowed(route) {
  const role = v4activeUser()?.role || 'admin';
  const allowed = V4_ROLE_ROUTES[role];
  return !allowed || allowed.has(route);
}
function v4ActionAllowed(action) {
  const role = v4activeUser()?.role || 'admin';
  if (['admin', 'librarian'].includes(role)) return true;
  const scopes = {
    'new-record': ['cataloger', 'publisher'], 'new-patron': ['circulation'],
    'quick-return': ['circulation'], 'run-integrity': [], 'create-backup': [],
  };
  return !scopes[action] || scopes[action].includes(role);
}
function v4activeItems(recordId) { return v4arr(RAFF4_STATE.data?.items).filter((i) => i.recordId === recordId && !i.deletedAt && !i.archived); }
function v4openLoans() { return v4arr(RAFF4_STATE.data?.loans).filter((l) => !l.returnedAt); }
function v4dueDays(loan) { return Math.ceil(((Date.parse(loan.dueAt) || Date.now()) - Date.now()) / 86400000); }
function v4initials(name) { return (name || 'م').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || 'م'; }
function v4cover(record, large = false) {
  const cls = large ? 'record-cover-large' : 'opac-cover';
  return `<div class="${cls}">${record.coverDataUrl ? `<img src="${v4e(record.coverDataUrl)}" alt="غلاف ${v4e(record.title)}">` : v4e((record.title || 'ر')[0])}</div>`;
}
function v4loading(root, label = 'جارٍ تجهيز مساحة العمل...') {
  root.innerHTML = `<div class="v4-page">${v4empty('refresh', label, 'تُقرأ البيانات محليًا من جهازك فقط.')}</div>`;
}

async function refreshRaff4State() {
  if (!window.raff4) return null;
  RAFF4_STATE.data = await window.raff4.snapshot();
  const settings = RAFF4_STATE.data.settings || {};
  document.documentElement.dataset.density = settings.interfaceDensity || 'comfortable';
  document.documentElement.dataset.highContrast = String(!!settings.highContrast);
  document.documentElement.style.fontSize = `${Math.round((Number(settings.fontScale) || 1) * 100)}%`;
  updateV4Identity();
  return RAFF4_STATE.data;
}

async function v4mutate(task, successMessage = 'تم الحفظ بنجاح') {
  try {
    const result = await task();
    await refreshRaff4State();
    await refreshState();
    renderNavCounts();
    toast(successMessage, 'success');
    return result;
  } catch (err) {
    toast(err?.message || 'تعذر تنفيذ العملية', 'error', 4500);
    throw err;
  }
}

function updateV4Identity() {
  const data = RAFF4_STATE.data;
  if (!data) return;
  const user = v4activeUser();
  const workspace = v4EffectiveWorkspace();
  const select = document.getElementById('workspaceSelect');
  const switcher = document.getElementById('workspaceSwitcher');
  const mayChooseWorkspace = ['admin', 'librarian'].includes(user?.role || 'admin');
  if (select) { select.value = workspace; select.disabled = !mayChooseWorkspace; }
  if (switcher) switcher.hidden = !mayChooseWorkspace;
  document.querySelectorAll('.nav-item[data-route]').forEach((button) => {
    const allowed = v4RouteAllowed(button.dataset.route);
    button.dataset.permissionHidden = allowed ? 'false' : 'true';
    button.hidden = !allowed;
  });
  const quickAdd = document.getElementById('quickAddBtn');
  if (quickAdd) quickAdd.hidden = !v4ActionAllowed('new-record');
  applyV4Workspace(workspace, false);
  const name = document.getElementById('activeUserName');
  const avatar = document.getElementById('activeUserAvatar');
  if (name) name.textContent = user?.displayName || 'مدير النظام';
  if (avatar) avatar.textContent = v4initials(user?.displayName);
}

function applyV4Workspace(workspace, navigate = true) {
  const valid = ['researcher', 'circulation', 'cataloging', 'management', 'all'];
  const next = valid.includes(workspace) ? workspace : 'researcher';
  document.body.dataset.workspace = next;
  document.querySelectorAll('.nav-section[data-workspaces]').forEach((section) => {
    const values = section.dataset.workspaces.split(/\s+/);
    const workspaceVisible = values.includes(next) || (values.includes('all') && next === 'all');
    const hasAllowedRoute = [...section.querySelectorAll('.nav-item[data-route]')].some((button) => button.dataset.permissionHidden !== 'true');
    section.hidden = !workspaceVisible || !hasAllowedRoute;
  });
  if (navigate) {
    const landing = { researcher: 'opac', circulation: 'circulation', cataloging: 'catalog', management: 'dashboard', all: 'dashboard' }[next];
    if (landing && typeof navigateTo === 'function') navigateTo(landing);
  }
}

function initV4Shell() {
  document.getElementById('workspaceSelect')?.addEventListener('change', async (event) => {
    const workspace = event.target.value;
    await v4mutate(() => window.raff4.setSettings({ workspace }), 'تم تغيير مساحة العمل');
    applyV4Workspace(workspace, true);
  });
  document.getElementById('commandPaletteBtn')?.addEventListener('click', openCommandPalette);
  document.getElementById('activeUserBtn')?.addEventListener('click', openUserSwitcher);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault(); openCommandPalette();
    }
  });
}

/* ============================= Dashboard ============================= */

function renderV4Dashboard(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Dashboard(root)); return; }
  const d = RAFF4_STATE.data;
  const s = d.stats || {};
  const workspace = v4EffectiveWorkspace();
  const workspaceLabel = {
    researcher: 'الباحث والاستكشاف', circulation: 'الإعارة وخدمة القراء',
    cataloging: 'الفهرسة والمجموعات', management: 'الإدارة والتقارير', all: 'كل الأدوات',
  }[workspace];
  const overdueLoans = v4openLoans().filter((l) => v4dueDays(l) < 0).sort((a, b) => v4dueDays(a) - v4dueDays(b)).slice(0, 5);
  const recentAudit = v4arr(d.audit).slice(0, 6);
  const workflow = workspace === 'researcher'
    ? [
        ['ابحث في الفهرس', 'اعثر على عنوان أو مؤلف أو موضوع', 'opac'],
        ['افتح تفاصيل الكتاب', 'اعرف الرف والنسخ المتاحة', 'opac'],
        ['كوّن قائمة قراءة', 'احفظ الكتب للعودة إليها', 'reading-lists'],
        ['اطلب حجزًا', 'أضف حجزًا محليًا عبر أمين المكتبة', 'holds'],
      ]
    : workspace === 'circulation'
      ? [
          ['حدد المستعير', 'ابحث بالاسم أو رقم العضوية', 'circulation'],
          ['امسح النسخ', 'استخدم الباركود أو اختر من القائمة', 'circulation'],
          ['أتمم الإعارة', 'تطبق السياسة تلقائيًا', 'circulation'],
          ['تابع المتأخرات', 'جدّد أو استلم النسخ', 'circulation'],
        ]
      : workspace === 'cataloging'
        ? [
            ['أنشئ السجل', 'أدخل البيانات الأساسية أولًا', 'catalog'],
            ['أضف المقتنى', 'حدد الفرع والرف ورقم الطلب', 'catalog'],
            ['أنشئ النسخ', 'باركود مستقل لكل نسخة وجزء', 'catalog'],
            ['راجع الجودة', 'استخدم الضبط الاستنادي والفحص', 'authorities'],
          ]
        : [
            ['راجع المؤشرات', 'ابدأ بما يحتاج تدخلًا اليوم', 'dashboard'],
            ['راقب الجودة', 'اكتمال السجلات وسلامة البيانات', 'settings'],
            ['حلل الأداء', 'تقارير الإعارة والمجموعة', 'stats'],
            ['راجع السجل', 'كل العمليات موثقة محليًا', 'audit'],
          ];

  root.innerHTML = `<div class="v4-page">
    <section class="v4-welcome">
      <div class="v4-welcome-copy">
        <div class="v4-eyebrow">${icon('book', 13)} رَفّ 4.0 · محلي بالكامل</div>
        <h2>مساحة عمل هادئة، مهما كانت المكتبة كبيرة.</h2>
        <p>أنت الآن في مساحة <strong>${v4e(workspaceLabel)}</strong>. يعرض رَفّ الأدوات المرتبطة بمهمتك فقط، بينما تبقى الوظائف المتقدمة منظمة داخل مساحات مستقلة حتى لا تزدحم الواجهة على الباحث أو المستخدم العادي.</p>
        <div class="v4-welcome-actions">
          ${workspace === 'researcher' ? v4action('ابدأ البحث', 'go-opac', 'search', 'primary') : ''}
          ${workspace === 'circulation' ? v4action('افتح مكتب الإعارة', 'go-circulation', 'book', 'primary') : ''}
          ${workspace === 'cataloging' ? v4action('أضف سجلًا احترافيًا', 'new-record', 'plus', 'primary') : ''}
          ${workspace === 'management' || workspace === 'all' ? v4action('راجع سلامة البيانات', 'run-integrity', 'alert', 'primary') : ''}
          ${v4action('لوحة الأوامر', 'command-palette', 'search')}
        </div>
      </div>
      <aside class="v4-focus-panel">
        <h3>ما يحتاج انتباهك اليوم</h3>
        <div class="v4-focus-list">
          <div class="v4-focus-item"><span>إعارات متأخرة</span><b>${s.overdue || 0}</b></div>
          <div class="v4-focus-item"><span>حجوزات نشطة</span><b>${s.holds || 0}</b></div>
          <div class="v4-focus-item"><span>جلسات جرد مفتوحة</span><b>${s.inventorySessions || 0}</b></div>
          <div class="v4-focus-item"><span>اكتمال الفهرسة</span><b>${s.completeness || 0}%</b></div>
        </div>
      </aside>
    </section>

    <section class="v4-grid cols-4">
      ${v4metric('السجلات الببليوغرافية', s.records || 0, 'book', 'عنوان وإصدار موحد')}
      ${v4metric('النسخ المادية', s.items || 0, 'copies', `${s.availableItems || 0} متاحة`, 'success')}
      ${v4metric('الإعارات المفتوحة', s.openLoans || 0, 'calendar', `${s.overdue || 0} متأخرة`, s.overdue ? 'danger' : '')}
      ${v4metric('المستعيرون', s.patrons || 0, 'user', `${s.activePatrons || 0} حسابًا نشطًا`)}
    </section>

    <section class="v4-card pad">
      <div class="v4-split-label"><div><h3 style="margin:0;font-size:12.5px;">مسار العمل المقترح</h3><p class="v4-help-text" style="margin:4px 0 0;">خطوات واضحة مرتبطة بالمساحة الحالية، وليست قائمة أدوات مبعثرة.</p></div><span class="v4-badge info">${v4e(workspaceLabel)}</span></div>
      <div class="v4-workflow" style="margin-top:14px;">
        ${workflow.map(([title, text, route]) => `<button class="v4-workflow-step" data-v4-route="${route}"><strong>${v4e(title)}</strong><span>${v4e(text)}</span></button>`).join('')}
      </div>
    </section>

    <section class="v4-grid main-aside">
      <div class="v4-card">
        <div class="v4-card-head"><div><h3>${icon('calendar', 14)} المتابعة العاجلة</h3><p>الإعارات الأشد تأخرًا أولًا</p></div>${s.overdue ? `<span class="v4-badge danger">${s.overdue} متأخرة</span>` : `<span class="v4-badge success">لا توجد متأخرات</span>`}</div>
        <div class="v4-card-body" style="padding:0;">
          ${overdueLoans.length ? `<table class="v4-table"><thead><tr><th>المستعير</th><th>العنوان</th><th>الاستحقاق</th><th>التأخير</th></tr></thead><tbody>${overdueLoans.map((loan) => {
            const patron = v4patron(loan.patronId); const record = v4record(v4item(loan.itemIds?.[0])?.recordId);
            return `<tr><td><b>${v4e(patron?.name || 'غير معروف')}</b><div class="muted">${v4e(patron?.membershipNumber || '')}</div></td><td>${v4e(record?.title || '—')}</td><td>${v4date(loan.dueAt)}</td><td>${v4status('expired')} <span class="muted">${Math.abs(v4dueDays(loan))} يومًا</span></td></tr>`;
          }).join('')}</tbody></table>` : v4empty('check', 'كل شيء في موعده', 'لا توجد إعارات متأخرة تحتاج متابعة الآن.')}
        </div>
      </div>
      <div class="v4-card">
        <div class="v4-card-head"><div><h3>${icon('note', 14)} النشاط الأخير</h3><p>سجل محلي غير قابل للتعديل</p></div><button class="v4-icon-btn" data-v4-route="audit" aria-label="فتح السجل">${icon('search', 14)}</button></div>
        <div class="audit-list">
          ${recentAudit.length ? recentAudit.map((row) => `<div class="audit-row" style="grid-template-columns:24px 1fr;"><span class="audit-dot">${icon(row.action === 'delete' ? 'trash' : row.action === 'checkout' ? 'book' : 'edit', 11)}</span><div class="audit-main"><strong>${v4e(row.summary)}</strong><small>${v4e(row.userName)} · ${v4date(row.at, true)}</small></div></div>`).join('') : v4empty('info', 'لا يوجد نشاط بعد', 'ستظهر هنا العمليات المهمة تلقائيًا.')}
        </div>
      </div>
    </section>
  </div>`;
}

/* =============================== OPAC ================================ */

async function v4searchOpac(root) {
  const records = await window.raff4.search(RAFF4_STATE.opacQuery, RAFF4_STATE.opacFilters);
  const host = root.querySelector('#opacResults');
  const count = root.querySelector('#opacResultCount');
  if (!host) return;
  if (count) count.textContent = `${records.length.toLocaleString('ar-EG')} نتيجة`;
  host.innerHTML = records.length ? records.map((record) => {
    const holding = v4arr(record.holdings)[0];
    const branch = v4branch(holding?.branchId);
    return `<article class="opac-card" tabindex="0" data-v4-action="opac-details" data-id="${v4e(record.id)}">
      ${v4cover(record)}
      <div class="opac-copy">
        <h3>${v4e(record.title || 'بدون عنوان')}</h3>
        <p>${v4e(record.author || record.contributors?.[0]?.name || 'مؤلف غير محدد')}</p>
        <div class="opac-meta"><span class="v4-badge ${record.availableCount ? 'success' : 'danger'}">${record.availableCount ? `${record.availableCount} متاح` : 'غير متاح'}</span>${record.category ? `<span class="v4-badge">${v4e(record.category)}</span>` : ''}</div>
        <div class="opac-location">${icon('building', 11)} ${v4e(branch?.name || 'المكتبة الرئيسية')} · ${v4e(holding?.shelf || 'رف غير محدد')}</div>
      </div>
    </article>`;
  }).join('') : v4empty('search', 'لا توجد نتائج مطابقة', 'جرّب كلمة أقصر، أو أزل مرشح الإتاحة أو الفرع.');
}

function renderV4Opac(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Opac(root)); return; }
  const d = RAFF4_STATE.data;
  const categories = [...new Set(v4arr(d.records).filter((r) => !r.deletedAt).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  root.innerHTML = `<div class="v4-page">
    <section class="opac-hero">
      <div class="v4-eyebrow" style="justify-content:center;">${icon('search', 13)} فهرس عام محلي</div>
      <h2>ابحث في المكتبة ببساطة</h2>
      <p>واجهة قراءة فقط للباحثين والزوار. لا تعرض خيارات الإدارة أو الفهرسة، وتعمل دون حساب أو اتصال بالإنترنت.</p>
      <label class="opac-search">
        ${icon('search', 19)}
        <input id="opacSearchInput" type="search" autocomplete="off" value="${v4e(RAFF4_STATE.opacQuery)}" placeholder="عنوان، مؤلف، موضوع، سلسلة، ISBN أو رقم مرجعي...">
      </label>
      <div class="opac-filter-row">
        <button class="opac-filter-chip ${RAFF4_STATE.opacFilters.availableOnly ? 'active' : ''}" data-v4-action="opac-available">المتاح الآن</button>
        <select class="v4-filter" id="opacBranchFilter" aria-label="الفرع">${v4selectOptions(d.branches, RAFF4_STATE.opacFilters.branchId, 'name', 'id', 'كل الفروع')}</select>
        <select class="v4-filter" id="opacCategoryFilter" aria-label="التصنيف"><option value="">كل التصنيفات</option>${categories.map((x) => `<option value="${v4e(x)}" ${RAFF4_STATE.opacFilters.category === x ? 'selected' : ''}>${v4e(x)}</option>`).join('')}</select>
        <select class="v4-filter" id="opacMaterialFilter" aria-label="نوع المادة">${v4selectOptions(d.materialTypes, RAFF4_STATE.opacFilters.materialTypeId, 'name', 'id', 'كل المواد')}</select>
      </div>
      <div class="opac-saved-searches">
        <button class="v4-action ghost" data-v4-action="save-current-search">${icon('plus', 13)} حفظ البحث الحالي</button>
        ${v4arr(d.savedSearches).filter((x) => !x.deletedAt).map((x) => `<span class="saved-search-chip"><button data-v4-action="apply-saved-search" data-id="${v4e(x.id)}">${v4e(x.name)}</button><button class="saved-search-remove" data-v4-action="delete-entity" data-entity="savedSearches" data-id="${v4e(x.id)}" aria-label="حذف البحث">×</button></span>`).join('') || '<span class="v4-help-text">احفظ عمليات البحث المتكررة لتظهر هنا.</span>'}
      </div>
    </section>
    <div class="v4-split-label"><div><h3 style="margin:0;font-size:12px;">نتائج الفهرس</h3><p class="v4-help-text" style="margin:3px 0 0;">انقر على الكتاب لمعرفة مكانه ونسخه وأجزائه.</p></div><span class="v4-badge info" id="opacResultCount">—</span></div>
    <section class="opac-results" id="opacResults"></section>
  </div>`;
  let timer;
  root.querySelector('#opacSearchInput')?.addEventListener('input', (event) => {
    RAFF4_STATE.opacQuery = event.target.value;
    clearTimeout(timer); timer = setTimeout(() => v4searchOpac(root), 130);
  });
  root.querySelector('#opacBranchFilter')?.addEventListener('change', (event) => { RAFF4_STATE.opacFilters.branchId = event.target.value; v4searchOpac(root); });
  root.querySelector('#opacCategoryFilter')?.addEventListener('change', (event) => { RAFF4_STATE.opacFilters.category = event.target.value; v4searchOpac(root); });
  root.querySelector('#opacMaterialFilter')?.addEventListener('change', (event) => { RAFF4_STATE.opacFilters.materialTypeId = event.target.value; v4searchOpac(root); });
  v4searchOpac(root);
}

function openSavedSearchForm() {
  const html = `<div class="v4-modal-head"><div><h3>حفظ البحث الحالي</h3><p>سيُحفظ نص البحث والمرشحات على هذا الجهاز فقط</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="savedSearchForm" class="v4-form"><div class="v4-field"><label>اسم البحث *</label><input name="name" required maxlength="160" placeholder="مثال: كتب التاريخ المتاحة"></div><label class="v4-checkbox"><input name="pinned" type="checkbox" checked><span>إظهاره في فهرس الباحث</span></label><div class="v4-note"><b>النص:</b> ${v4e(RAFF4_STATE.opacQuery || 'كل السجلات')}</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ البحث</button></div></form></div>`;
  openModal(html, { onMount: (o) => {
    o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#v4Cancel').onclick = closeModal;
    o.querySelector('#savedSearchForm').addEventListener('submit', async (e) => { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); payload.pinned = e.currentTarget.pinned.checked; payload.query = RAFF4_STATE.opacQuery; payload.filters = { ...RAFF4_STATE.opacFilters }; await v4mutate(() => window.raff4.createEntity('savedSearches', payload), 'تم حفظ البحث'); closeModal(); renderRoute(); });
  }});
}

function openV4OpacDetails(recordId) {
  const r = v4record(recordId); if (!r) return;
  const items = v4activeItems(r.id);
  const holdings = v4arr(RAFF4_STATE.data.holdings).filter((h) => h.recordId === r.id && !h.deletedAt);
  const lists = v4arr(RAFF4_STATE.data.readingLists).filter((x) => !x.deletedAt);
  const html = `<div class="v4-modal-head"><div><h3>${v4e(r.title)}</h3><p>${v4e(r.author || r.contributors?.[0]?.name || 'مؤلف غير محدد')}</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div>
  <div class="v4-modal-body">
    <div class="record-detail-layout">
      <section class="v4-card pad">
        <div class="record-summary">${v4cover(r, true)}<div><div class="v4-eyebrow">${v4e(r.materialTypeId || 'مادة مكتبية')}</div><h2 style="margin:0;font:700 22px/1.5 var(--font-display);">${v4e(r.title)}</h2>${r.subtitle ? `<p style="margin:4px 0;color:var(--muted-foreground);">${v4e(r.subtitle)}</p>` : ''}<p style="margin:9px 0 0;font-size:11px;">${v4e(r.author || '')}</p><div class="opac-meta" style="margin-top:10px;"><span class="v4-badge ${items.some((x) => x.status === 'available') ? 'success' : 'danger'}">${items.filter((x) => x.status === 'available').length} متاح من ${items.length}</span>${r.category ? `<span class="v4-badge">${v4e(r.category)}</span>` : ''}</div></div></div>
        ${r.summary ? `<div class="v4-divider" style="margin:16px 0;"></div><h3 style="font-size:11.5px;">نبذة</h3><p style="color:var(--muted-foreground);font-size:10.5px;line-height:1.8;">${v4e(r.summary)}</p>` : ''}
        <div class="record-facts">
          <div class="record-fact"><small>الناشر</small><b>${v4e(r.publisher || '—')}</b></div>
          <div class="record-fact"><small>سنة النشر</small><b>${v4e(r.publishYear || '—')}</b></div>
          <div class="record-fact"><small>الطبعة</small><b>${v4e(r.edition || '—')}</b></div>
          <div class="record-fact"><small>ISBN</small><b class="v4-ltr">${v4e(r.isbn13 || r.isbn10 || '—')}</b></div>
          <div class="record-fact"><small>السلسلة</small><b>${v4e(r.series || '—')}</b></div>
          <div class="record-fact"><small>اللغة</small><b>${v4e(r.language || '—')}</b></div>
        </div>
      </section>
      <aside class="v4-card">
        <div class="v4-card-head"><div><h3>${icon('building', 14)} مكان الكتاب</h3><p>الفروع والرفوف والنسخ المتاحة</p></div></div>
        <div class="v4-card-body"><div class="v4-kpi-list">${holdings.map((h) => {
          const branch = v4branch(h.branchId); const hItems = items.filter((i) => i.holdingId === h.id); const avail = hItems.filter((i) => i.status === 'available').length;
          return `<div class="v4-kpi-row"><span><b style="display:block;color:var(--foreground);">${v4e(branch?.name || 'فرع')}</b>${v4e([h.room, h.section, h.shelf].filter(Boolean).join(' · ') || 'الموقع غير محدد')}</span><b>${avail}/${hItems.length}</b></div>`;
        }).join('') || '<p class="v4-help-text">لم يُحدَّد موقع بعد.</p>'}</div></div>
        <div class="v4-card-footer"><button class="v4-action primary" data-v4-action="opac-hold" data-id="${v4e(r.id)}" style="width:100%;">${icon('calendar', 14)} طلب حجز</button></div>
      </aside>
    </div>
    <div class="v4-card" style="margin-top:15px;"><div class="v4-card-head"><div><h3>${icon('layers', 14)} النسخ والأجزاء</h3><p>الإتاحة محسوبة لكل نسخة مادية بصورة مستقلة</p></div></div><div class="v4-card-body"><div class="item-grid">${items.map((i) => {
      const h = v4holding(i.holdingId); return `<div class="item-card"><div class="item-card-head"><b>نسخة ${i.copyNumber}${i.volumeNumber > 1 ? ` · جزء ${i.volumeNumber}` : ''}</b>${v4status(i.status)}</div><code>${v4e(i.barcode)}</code><p class="v4-help-text" style="margin:7px 0 0;">${v4e(h?.shelf || 'رف غير محدد')} · ${v4e(i.condition || 'حالة غير محددة')}</p></div>`;
    }).join('')}</div></div></div>
    <div class="v4-card" style="margin-top:15px;"><div class="v4-card-head"><div><h3>${icon('note', 14)} أضف إلى قائمة قراءة</h3><p>القوائم محفوظة محليًا على هذا الجهاز</p></div></div><div class="v4-card-body"><div class="v4-toolbar"><select class="v4-select" id="opacListSelect" style="flex:1;">${v4selectOptions(lists, '', 'name', 'id', 'اختر قائمة')}</select><button class="v4-action" id="opacAddToList">${icon('plus', 14)} إضافة</button><button class="v4-action ghost" id="opacNewList">قائمة جديدة</button></div></div></div>
  </div>`;
  openModal(html, { modalClass: 'v4-wide-modal', onMount: (overlay) => {
    overlay.classList.add('v4-modal');
    overlay.querySelector('#v4ModalClose')?.addEventListener('click', closeModal);
    overlay.querySelector('#opacNewList')?.addEventListener('click', () => openReadingListForm(null, r.id));
    overlay.querySelector('#opacAddToList')?.addEventListener('click', async () => {
      const listId = overlay.querySelector('#opacListSelect').value;
      const list = RAFF4_STATE.data.readingLists.find((x) => x.id === listId);
      if (!list) { toast('اختر قائمة أولًا', 'error'); return; }
      await v4mutate(() => window.raff4.updateEntity('readingLists', list.id, { recordIds: [...new Set([...(list.recordIds || []), r.id])] }), 'أُضيف الكتاب إلى القائمة');
      closeModal();
    });
  }});
}

/* =========================== Reading lists =========================== */

function renderV4ReadingLists(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4ReadingLists(root)); return; }
  const lists = v4arr(RAFF4_STATE.data.readingLists).filter((x) => !x.deletedAt);
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('مساحة الباحث', 'قوائم القراءة', 'اجمع الكتب حول موضوع أو مشروع بحثي دون تغيير بيانات الفهرس.', v4action('قائمة جديدة', 'new-reading-list', 'plus', 'primary'))}
    ${lists.length ? `<div class="entity-cards">${lists.map((list) => {
      const records = v4arr(list.recordIds).map(v4record).filter(Boolean);
      return `<article class="entity-card"><div class="entity-card-head"><div><h3>${v4e(list.name)}</h3><p>${v4e(list.description || 'قائمة قراءة محلية')}</p></div><div class="v4-table-actions">${v4iconButton('edit-reading-list', list.id, 'edit', 'تعديل')}${v4iconButton('delete-entity', list.id, 'trash', 'حذف', 'danger').replace('data-id=', 'data-entity="readingLists" data-id=')}</div></div><div class="entity-card-meta"><div><small>عدد الكتب</small><b>${records.length}</b></div><div><small>الظهور في الفهرس</small><b>${list.publicInOpac === false ? 'خاص' : 'ظاهر'}</b></div></div><div style="margin-top:11px;display:flex;flex-wrap:wrap;gap:5px;">${records.slice(0, 6).map((r) => `<button class="v4-badge" data-v4-action="opac-details" data-id="${v4e(r.id)}">${v4e(r.title)}</button>`).join('')}${records.length > 6 ? `<span class="v4-badge info">+${records.length - 6}</span>` : ''}</div></article>`;
    }).join('')}</div>` : v4empty('note', 'لا توجد قوائم قراءة', 'أنشئ قائمة لموضوع بحثي أو مقرر أو خطة قراءة.', v4action('إنشاء أول قائمة', 'new-reading-list', 'plus', 'primary'))}
  </div>`;
}

function openReadingListForm(list = null, initialRecordId = '') {
  const html = `<div class="v4-modal-head"><div><h3>${list ? 'تعديل قائمة القراءة' : 'قائمة قراءة جديدة'}</h3><p>تنظيم شخصي بسيط للباحث والقارئ</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form class="v4-form" id="readingListForm"><div class="v4-form-grid"><div class="v4-field"><label>اسم القائمة</label><input name="name" required maxlength="160" value="${v4e(list?.name || '')}"></div><div class="v4-field"><label>الخصوصية</label><select name="publicInOpac"><option value="true" ${list?.publicInOpac !== false ? 'selected' : ''}>ظاهرة في فهرس الباحث</option><option value="false" ${list?.publicInOpac === false ? 'selected' : ''}>خاصة</option></select></div><div class="v4-field span-2"><label>الوصف</label><textarea name="description">${v4e(list?.description || '')}</textarea></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">${icon('check', 14)} حفظ</button></div></form></div>`;
  openModal(html, { onMount: (overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick = closeModal; overlay.querySelector('#v4Cancel').onclick = closeModal;
    overlay.querySelector('#readingListForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const fd = new FormData(event.currentTarget);
      const payload = { name: fd.get('name'), description: fd.get('description'), publicInOpac: fd.get('publicInOpac') === 'true', recordIds: list?.recordIds || (initialRecordId ? [initialRecordId] : []) };
      await v4mutate(() => list ? window.raff4.updateEntity('readingLists', list.id, payload) : window.raff4.createEntity('readingLists', payload), 'تم حفظ قائمة القراءة');
      closeModal(); if (currentRoute === 'reading-lists') renderRoute();
    });
  }});
}

/* ============================ Circulation ============================ */

function renderV4Circulation(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Circulation(root)); return; }
  const d = RAFF4_STATE.data;
  const selectedPatron = v4patron(RAFF4_STATE.circulation.patronId);
  const selectedItems = RAFF4_STATE.circulation.itemIds.map(v4item).filter(Boolean);
  const openLoans = v4openLoans().sort((a, b) => v4dueDays(a) - v4dueDays(b));
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('خدمة القراء', 'مكتب الإعارة', 'مسار موحد: اختر المستعير، امسح النسخ، راجع السياسة، ثم أتمم العملية.', `${v4action('مستعير جديد', 'new-patron', 'plus')}${v4action('إرجاع سريع', 'quick-return', 'refresh', 'primary')}`)}
    <section class="circulation-desk">
      <div class="circ-panel">
        <div class="circ-panel-title"><h3>1. المستعير</h3><p>ابحث بالاسم أو رقم العضوية</p></div>
        <div class="circ-panel-body"><div class="v4-search">${icon('search', 15)}<input id="circPatronSearch" placeholder="اسم المستعير أو P-00001"></div><div id="circPatronResults" style="margin-top:8px;"></div>${selectedPatron ? `<div class="circ-selected-patron"><div class="v4-split-label"><div><strong>${v4e(selectedPatron.name)}</strong><small>${v4e(selectedPatron.membershipNumber)} · ${v4e(selectedPatron.phone || selectedPatron.email || 'لا توجد وسيلة تواصل')}</small></div>${v4status(selectedPatron.status)}</div><button class="v4-action ghost" data-v4-action="clear-circ-patron" style="margin-top:8px;width:100%;">تغيير المستعير</button></div>` : ''}</div>
      </div>
      <div class="circ-panel">
        <div class="circ-panel-title"><h3>2. النسخ المراد إعارتها</h3><p>امسح باركود النسخة أو ابحث بالعنوان</p></div>
        <div class="circ-panel-body"><div class="v4-search">${icon('barcode', 15)}<input id="circItemSearch" class="circ-scan-input" placeholder="باركود النسخة أو عنوان الكتاب"></div><div id="circItemResults" style="margin-top:8px;"></div><div class="circ-basket" id="circBasket" style="margin-top:12px;">${selectedItems.length ? selectedItems.map((item) => { const r = v4record(item.recordId); return `<div class="circ-basket-item"><div><strong>${v4e(r?.title || 'نسخة')}</strong><small>${v4e(item.barcode)} · نسخة ${item.copyNumber}${item.volumeNumber > 1 ? ` · جزء ${item.volumeNumber}` : ''}</small></div><button class="v4-icon-btn danger" data-v4-action="remove-circ-item" data-id="${v4e(item.id)}">${icon('x', 14)}</button></div>`; }).join('') : `<div class="v4-empty" style="min-height:110px;padding:15px;"><div class="v4-empty-inner"><p>لم تُضف أي نسخة بعد.</p></div></div>`}</div><div class="v4-form-grid" style="margin-top:12px;"><div class="v4-field"><label>تاريخ الاستحقاق الاختياري</label><input type="date" id="circDueDate"></div><div class="v4-field"><label>ملاحظة</label><input id="circNote" placeholder="اختياري"></div></div><button class="v4-action primary" id="circCheckoutBtn" style="width:100%;margin-top:12px;" ${!selectedPatron || !selectedItems.length ? 'disabled' : ''}>${icon('check', 15)} إتمام إعارة ${selectedItems.length || ''} نسخة</button><p class="v4-help-text" style="margin:8px 0 0;">تُحسب المدة والحد الأقصى والتجديدات من سياسة الإعارة المناسبة تلقائيًا.</p></div>
      </div>
    </section>

    <section class="v4-card"><div class="v4-card-head"><div><h3>${icon('calendar', 14)} الإعارات المفتوحة</h3><p>المتأخر أولًا، مع تجديد وإرجاع مباشر</p></div><span class="v4-badge info">${openLoans.length} إعارة</span></div><div class="v4-card-body" style="padding:0;">${openLoans.length ? `<div class="v4-table-wrap" style="border:0;border-radius:0;"><table class="v4-table"><thead><tr><th>المستعير</th><th>الكتاب والنسخة</th><th>الاستحقاق</th><th>التجديدات</th><th>إجراءات</th></tr></thead><tbody>${openLoans.map((loan) => {
      const patron = v4patron(loan.patronId); const outstanding = (loan.itemIds || []).filter((x) => !(loan.returnedItemIds || []).includes(x)); const first = v4item(outstanding[0]); const rec = v4record(first?.recordId); const days = v4dueDays(loan);
      return `<tr><td><b>${v4e(patron?.name || 'غير معروف')}</b><div class="muted">${v4e(patron?.membershipNumber || '')}</div></td><td><b>${v4e(rec?.title || '—')}</b><div class="muted">${outstanding.length} نسخة/جزء</div></td><td>${v4date(loan.dueAt)}<div class="muted">${days < 0 ? `${Math.abs(days)} يوم تأخير` : `متبقي ${days} يوم`}</div></td><td>${loan.renewalCount || 0}</td><td><div class="v4-table-actions">${v4iconButton('renew-loan', loan.id, 'refresh', 'تجديد')}${v4iconButton('return-loan-items', loan.id, 'check', 'إرجاع')}</div></td></tr>`;
    }).join('')}</tbody></table></div>` : v4empty('check', 'لا توجد إعارات مفتوحة', 'كل النسخ الموجودة في السجل متاحة حاليًا.')}</div></section>
  </div>`;
  wireCirculation(root);
}

function wireCirculation(root) {
  const patronInput = root.querySelector('#circPatronSearch');
  const patronResults = root.querySelector('#circPatronResults');
  patronInput?.addEventListener('input', () => {
    const q = patronInput.value.trim().toLocaleLowerCase('ar');
    if (!q) { patronResults.innerHTML = ''; return; }
    const rows = v4arr(RAFF4_STATE.data.patrons).filter((p) => !p.deletedAt && `${p.name} ${p.membershipNumber} ${p.phone}`.toLocaleLowerCase('ar').includes(q)).slice(0, 6);
    patronResults.innerHTML = rows.map((p) => `<button class="user-switch-item" data-v4-action="select-circ-patron" data-id="${v4e(p.id)}"><span class="user-switch-avatar">${v4e(v4initials(p.name))}</span><span class="user-switch-copy"><strong>${v4e(p.name)}</strong><small>${v4e(p.membershipNumber)} · ${v4e(p.phone || 'بلا هاتف')}</small></span>${v4status(p.status)}</button>`).join('') || '<p class="v4-help-text">لا توجد نتيجة مطابقة.</p>';
  });
  const itemInput = root.querySelector('#circItemSearch');
  const itemResults = root.querySelector('#circItemResults');
  itemInput?.addEventListener('input', () => {
    const q = itemInput.value.trim().toLocaleLowerCase('ar');
    if (!q) { itemResults.innerHTML = ''; return; }
    const selected = new Set(RAFF4_STATE.circulation.itemIds);
    const rows = v4arr(RAFF4_STATE.data.items).filter((i) => !i.deletedAt && !i.archived && i.status === 'available' && !selected.has(i.id)).filter((i) => {
      const r = v4record(i.recordId); return `${i.barcode} ${r?.title || ''} ${r?.author || ''}`.toLocaleLowerCase('ar').includes(q);
    }).slice(0, 8);
    itemResults.innerHTML = rows.map((i) => { const r = v4record(i.recordId); return `<button class="user-switch-item" data-v4-action="add-circ-item" data-id="${v4e(i.id)}"><span class="user-switch-avatar">${icon('book', 15)}</span><span class="user-switch-copy"><strong>${v4e(r?.title || 'نسخة')}</strong><small>${v4e(i.barcode)} · نسخة ${i.copyNumber}${i.volumeNumber > 1 ? ` · جزء ${i.volumeNumber}` : ''}</small></span><span class="v4-badge success">متاح</span></button>`; }).join('') || '<p class="v4-help-text">لا توجد نسخة متاحة مطابقة.</p>';
  });
  root.querySelector('#circCheckoutBtn')?.addEventListener('click', async () => {
    const dueAt = root.querySelector('#circDueDate').value;
    const note = root.querySelector('#circNote').value;
    await v4mutate(() => window.raff4.checkout({ patronId: RAFF4_STATE.circulation.patronId, itemIds: RAFF4_STATE.circulation.itemIds, dueAt: dueAt || undefined, note }), 'تم تسجيل الإعارة');
    RAFF4_STATE.circulation = { patronId: '', itemIds: [] }; renderRoute();
  });
}

function openQuickReturn() {
  const html = `<div class="v4-modal-head"><div><h3>إرجاع سريع</h3><p>امسح باركود نسخة معارة لتسجيل إرجاعها فورًا</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><div class="inventory-scan-zone">${icon('scan', 24)}<h3>باركود النسخة</h3><input id="quickReturnCode" autofocus placeholder="امسح أو اكتب الباركود ثم Enter"><div class="inventory-result" id="quickReturnResult"></div></div></div>`;
  openModal(html, { onMount: (overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick = closeModal;
    const input = overlay.querySelector('#quickReturnCode'); const result = overlay.querySelector('#quickReturnResult');
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return; event.preventDefault();
      const item = RAFF4_STATE.data.items.find((i) => i.barcode.toLocaleLowerCase() === input.value.trim().toLocaleLowerCase() && i.status === 'on_loan');
      if (!item) { result.innerHTML = '<span class="v4-badge danger">النسخة غير موجودة أو ليست معارة</span>'; return; }
      await v4mutate(() => window.raff4.returnItems({ itemIds: [item.id] }), 'تم تسجيل الإرجاع');
      result.innerHTML = `<span class="v4-badge success">تم إرجاع ${v4e(v4record(item.recordId)?.title || 'النسخة')}</span>`; input.value = ''; input.focus();
    });
  }});
}

function openReturnLoanItems(loanId) {
  const loan = RAFF4_STATE.data.loans.find((l) => l.id === loanId); if (!loan) return;
  const outstanding = (loan.itemIds || []).filter((x) => !(loan.returnedItemIds || []).includes(x));
  const html = `<div class="v4-modal-head"><div><h3>إرجاع النسخ المحددة</h3><p>يمكن إرجاع جزء أو نسخة مع إبقاء البقية مفتوحة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="returnItemsForm" class="v4-form"><div class="item-grid">${outstanding.map((itemId) => { const i = v4item(itemId); const r = v4record(i?.recordId); return `<label class="item-card v4-checkbox" style="height:auto;padding:12px;"><input type="checkbox" name="itemId" value="${v4e(itemId)}" checked><span><b>${v4e(r?.title || 'نسخة')}</b><small style="display:block;">${v4e(i?.barcode || '')}</small></span></label>`; }).join('')}</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">تسجيل الإرجاع</button></div></form></div>`;
  openModal(html, { onMount: (overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick = closeModal; overlay.querySelector('#v4Cancel').onclick = closeModal;
    overlay.querySelector('#returnItemsForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const ids = [...event.currentTarget.querySelectorAll('input[name=itemId]:checked')].map((x) => x.value);
      await v4mutate(() => window.raff4.returnItems({ itemIds: ids }), 'تم تسجيل الإرجاع'); closeModal(); renderRoute();
    });
  }});
}

/* =============================== Patrons ============================== */

function renderV4Patrons(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Patrons(root)); return; }
  const q = RAFF4_STATE.patronQuery.toLocaleLowerCase('ar');
  const rows = v4arr(RAFF4_STATE.data.patrons).filter((p) => !p.deletedAt).filter((p) => !q || `${p.name} ${p.membershipNumber} ${p.phone} ${p.email}`.toLocaleLowerCase('ar').includes(q));
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('خدمة القراء', 'المستعيرون والعضويات', 'ملف مستقل لكل مستعير، مع سجل إعارات وحجوزات وقيود واضحة.', v4action('مستعير جديد', 'new-patron', 'plus', 'primary'))}
    <div class="v4-toolbar"><label class="v4-search">${icon('search', 15)}<input id="patronSearch" value="${v4e(RAFF4_STATE.patronQuery)}" placeholder="اسم، رقم عضوية، هاتف أو بريد"></label><select class="v4-filter" id="patronStatus"><option value="">كل الحالات</option><option value="active">نشط</option><option value="suspended">موقوف</option><option value="expired">منتهي</option></select><span class="v4-badge info">${rows.length} مستعير</span></div>
    <div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>المستعير</th><th>العضوية</th><th>التواصل</th><th>الفئة</th><th>الإعارات المفتوحة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody id="patronRows">${v4PatronRows(rows)}</tbody></table></div>
  </div>`;
  let timer;
  root.querySelector('#patronSearch')?.addEventListener('input', (event) => { RAFF4_STATE.patronQuery = event.target.value; clearTimeout(timer); timer = setTimeout(() => renderV4Patrons(root), 120); });
  root.querySelector('#patronStatus')?.addEventListener('change', (event) => {
    const status = event.target.value; const filtered = rows.filter((p) => !status || p.status === status); root.querySelector('#patronRows').innerHTML = v4PatronRows(filtered);
  });
}

function v4PatronRows(rows) {
  return rows.map((p) => {
    const category = RAFF4_STATE.data.patronCategories.find((x) => x.id === p.categoryId);
    const open = v4openLoans().filter((l) => l.patronId === p.id);
    return `<tr data-v4-action="patron-details" data-id="${v4e(p.id)}" style="cursor:pointer;"><td><b>${v4e(p.name)}</b><div class="muted">${v4e(p.organization || p.guardianName || '')}</div></td><td class="mono">${v4e(p.membershipNumber)}</td><td>${v4e(p.phone || p.email || '—')}</td><td>${v4e(category?.name || 'قارئ')}</td><td>${open.length}</td><td>${v4status(p.status)}</td><td><div class="v4-table-actions">${v4iconButton('edit-patron', p.id, 'edit', 'تعديل')}${v4iconButton('delete-entity', p.id, 'trash', 'حذف', 'danger').replace('data-id=', 'data-entity="patrons" data-id=')}</div></td></tr>`;
  }).join('') || `<tr><td colspan="7">${v4empty('user', 'لا توجد نتائج', 'غيّر عبارة البحث أو أضف مستعيرًا جديدًا.')}</td></tr>`;
}

function openPatronForm(patron = null) {
  const d = RAFF4_STATE.data;
  const html = `<div class="v4-modal-head"><div><h3>${patron ? 'تعديل بيانات المستعير' : 'إضافة مستعير جديد'}</h3><p>الحقول الأساسية أولًا، والتفاصيل الإضافية اختيارية</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="patronForm" class="v4-form">
    <div class="v4-form-grid"><div class="v4-field"><label>الاسم الكامل *</label><input name="name" required value="${v4e(patron?.name || '')}"></div><div class="v4-field"><label>رقم العضوية</label><input name="membershipNumber" class="v4-ltr" value="${v4e(patron?.membershipNumber || '')}" placeholder="يُولّد تلقائيًا"></div><div class="v4-field"><label>الهاتف</label><input name="phone" class="v4-ltr" value="${v4e(patron?.phone || '')}"></div><div class="v4-field"><label>البريد الإلكتروني</label><input name="email" type="email" class="v4-ltr" value="${v4e(patron?.email || '')}"></div><div class="v4-field"><label>الفئة</label><select name="categoryId">${v4selectOptions(d.patronCategories, patron?.categoryId || 'patron_general')}</select></div><div class="v4-field"><label>الحالة</label><select name="status"><option value="active" ${patron?.status !== 'suspended' && patron?.status !== 'expired' ? 'selected' : ''}>نشط</option><option value="suspended" ${patron?.status === 'suspended' ? 'selected' : ''}>موقوف</option><option value="expired" ${patron?.status === 'expired' ? 'selected' : ''}>منتهي</option></select></div></div>
    <details class="v4-form-section"><summary>بيانات إضافية</summary><div class="v4-form-section-content v4-form-grid"><div class="v4-field"><label>المؤسسة أو المدرسة</label><input name="organization" value="${v4e(patron?.organization || '')}"></div><div class="v4-field"><label>ولي الأمر</label><input name="guardianName" value="${v4e(patron?.guardianName || '')}"></div><div class="v4-field span-2"><label>العنوان</label><input name="address" value="${v4e(patron?.address || '')}"></div><div class="v4-field"><label>انتهاء العضوية</label><input name="expiresAt" type="date" value="${patron?.expiresAt ? new Date(patron.expiresAt).toISOString().slice(0,10) : ''}"></div><label class="v4-checkbox"><input name="privacyConsent" type="checkbox" ${patron?.privacyConsent ? 'checked' : ''}><span>تمت الموافقة على حفظ بيانات التواصل محليًا</span></label><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes">${v4e(patron?.notes || '')}</textarea></div>${v4CustomFieldInputs('patron', patron?.customFields || {})}</div></details>
    <div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button type="submit" class="v4-action primary">${icon('check', 14)} حفظ المستعير</button></div>
  </form></div>`;
  openModal(html, { onMount: (overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick = closeModal; overlay.querySelector('#v4Cancel').onclick = closeModal;
    overlay.querySelector('#patronForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const fd = new FormData(event.currentTarget); const payload = Object.fromEntries(fd.entries()); payload.privacyConsent = !!event.currentTarget.privacyConsent.checked;
      payload.customFields = v4ReadCustomFields(event.currentTarget, 'patron', patron?.customFields || {}); for (const key of Object.keys(payload)) if (key.startsWith('custom__')) delete payload[key];
      await v4mutate(() => patron ? window.raff4.updateEntity('patrons', patron.id, payload) : window.raff4.createEntity('patrons', payload), 'تم حفظ بيانات المستعير'); closeModal(); if (currentRoute === 'patrons') renderRoute();
    });
  }});
}

function openPatronDetails(patronId) {
  const p = v4patron(patronId); if (!p) return;
  const loans = v4arr(RAFF4_STATE.data.loans).filter((l) => l.patronId === p.id);
  const holds = v4arr(RAFF4_STATE.data.holds).filter((h) => h.patronId === p.id && !h.deletedAt);
  const html = `<div class="v4-modal-head"><div><h3>${v4e(p.name)}</h3><p>${v4e(p.membershipNumber)} · ملف المستعير</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><div class="v4-grid main-aside"><section class="v4-card pad"><div class="record-summary"><div class="record-cover-large" style="height:112px;">${v4e(v4initials(p.name))}</div><div><h2 style="margin:0;font:700 21px var(--font-display);">${v4e(p.name)}</h2><p class="v4-help-text">${v4e(p.phone || p.email || 'لا توجد وسيلة تواصل')}</p><div style="margin-top:8px;">${v4status(p.status)}</div></div></div><div class="record-facts"><div class="record-fact"><small>رقم العضوية</small><b class="v4-ltr">${v4e(p.membershipNumber)}</b></div><div class="record-fact"><small>الفئة</small><b>${v4e(RAFF4_STATE.data.patronCategories.find((x) => x.id === p.categoryId)?.name || 'قارئ')}</b></div><div class="record-fact"><small>المؤسسة</small><b>${v4e(p.organization || '—')}</b></div><div class="record-fact"><small>انتهاء العضوية</small><b>${v4date(p.expiresAt)}</b></div></div>${p.notes ? `<div class="v4-note" style="margin-top:13px;">${v4e(p.notes)}</div>` : ''}</section><aside class="v4-card"><div class="v4-card-head"><h3>ملخص النشاط</h3></div><div class="v4-card-body"><div class="v4-kpi-list"><div class="v4-kpi-row"><span>إعارات مفتوحة</span><b>${loans.filter((l) => !l.returnedAt).length}</b></div><div class="v4-kpi-row"><span>إعارات سابقة</span><b>${loans.filter((l) => l.returnedAt).length}</b></div><div class="v4-kpi-row"><span>حجوزات نشطة</span><b>${holds.filter((h) => ['waiting','ready'].includes(h.status)).length}</b></div><div class="v4-kpi-row"><span>مرات التأخير</span><b>${loans.filter((l) => l.returnedAt && Date.parse(l.returnedAt) > Date.parse(l.dueAt)).length}</b></div></div></div><div class="v4-card-footer"><button class="v4-action" data-v4-action="select-patron-and-circulate" data-id="${v4e(p.id)}" style="width:100%;">${icon('book',14)} بدء إعارة</button></div></aside></div><div class="v4-card" style="margin-top:14px;"><div class="v4-card-head"><h3>سجل الإعارات</h3><span class="v4-badge info">${loans.length}</span></div><div class="v4-card-body" style="padding:0;">${loans.length ? `<table class="v4-table"><thead><tr><th>العنوان</th><th>الإعارة</th><th>الاستحقاق</th><th>الإرجاع</th></tr></thead><tbody>${loans.map((l) => { const rec = v4record(v4item(l.itemIds?.[0])?.recordId); return `<tr><td>${v4e(rec?.title || '—')}</td><td>${v4date(l.checkedOutAt)}</td><td>${v4date(l.dueAt)}</td><td>${l.returnedAt ? v4date(l.returnedAt) : v4status(v4dueDays(l) < 0 ? 'expired' : 'on_loan')}</td></tr>`; }).join('')}</tbody></table>` : v4empty('book','لا توجد إعارات','لم يسجل لهذا المستعير أي إعارة بعد.')}</div></div></div>`;
  openModal(html, { modalClass:'v4-wide-modal', onMount:(overlay) => { overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick=closeModal; }});
}

/* ================================ Holds =============================== */

function renderV4Holds(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Holds(root)); return; }
  const holds = v4arr(RAFF4_STATE.data.holds).filter((x) => !x.deletedAt).sort((a,b) => (a.position||0)-(b.position||0));
  root.innerHTML = `<div class="v4-page">${v4pageHead('خدمة القراء','الحجوزات وقوائم الانتظار','الحجز مرتبط بالسجل الببليوغرافي، ويمنع التجديد وفق السياسة عند الحاجة.',v4action('حجز جديد','new-hold','plus','primary'))}<div class="v4-grid cols-4">${v4metric('في الانتظار',holds.filter((h)=>h.status==='waiting').length,'calendar')}${v4metric('جاهزة للاستلام',holds.filter((h)=>h.status==='ready').length,'check','تنتهي تلقائيًا حسب المدة','success')}${v4metric('مكتملة',holds.filter((h)=>h.status==='fulfilled').length,'book')}${v4metric('ملغاة أو منتهية',holds.filter((h)=>['cancelled','expired'].includes(h.status)).length,'x')}</div><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>الترتيب</th><th>المستعير</th><th>الكتاب</th><th>الفرع</th><th>الحالة</th><th>الانتهاء</th><th>إجراءات</th></tr></thead><tbody>${holds.map((h)=>{const p=v4patron(h.patronId),r=v4record(h.recordId),b=v4branch(h.branchId);return `<tr><td>${h.position||'—'}</td><td><b>${v4e(p?.name||'—')}</b><div class="muted">${v4e(p?.membershipNumber||'')}</div></td><td>${v4e(r?.title||'—')}</td><td>${v4e(b?.name||'—')}</td><td>${v4status(h.status)}</td><td>${v4date(h.expiresAt)}</td><td><div class="v4-table-actions">${h.status==='waiting'?v4iconButton('hold-ready',h.id,'check','جاهز للاستلام'):''}${h.status==='ready'?v4iconButton('hold-fulfilled',h.id,'book','إكمال الحجز'):''}${['waiting','ready'].includes(h.status)?v4iconButton('hold-cancel',h.id,'x','إلغاء','danger'):''}</div></td></tr>`;}).join('')||`<tr><td colspan="7">${v4empty('calendar','لا توجد حجوزات','أنشئ حجزًا لمستعير عندما لا تتوفر نسخة أو لتنظيم قائمة الانتظار.')}</td></tr>`}</tbody></table></div></div>`;
}

function openHoldForm(recordId='') {
  const d=RAFF4_STATE.data;
  const html=`<div class="v4-modal-head"><div><h3>حجز جديد</h3><p>اختر المستعير والعنوان والفرع</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="holdForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>المستعير</label><select name="patronId" required>${v4selectOptions(d.patrons,'','name')}</select></div><div class="v4-field"><label>الكتاب</label><select name="recordId" required>${v4selectOptions(d.records,recordId,'title')}</select></div><div class="v4-field"><label>فرع الاستلام</label><select name="branchId">${v4selectOptions(d.branches,d.settings.activeBranchId)}</select></div><div class="v4-field"><label>انتهاء الحجز الاختياري</label><input name="expiresAt" type="date"></div><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes"></textarea></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">إنشاء الحجز</button></div></form></div>`;
  openModal(html,{onMount:(overlay)=>{overlay.classList.add('v4-modal');overlay.querySelector('#v4ModalClose').onclick=closeModal;overlay.querySelector('#v4Cancel').onclick=closeModal;overlay.querySelector('#holdForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());await v4mutate(()=>window.raff4.placeHold(payload),'تم إنشاء الحجز');closeModal();if(currentRoute==='holds')renderRoute();});}});
}

/* =============================== Inventory ============================ */

function renderV4Inventory(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Inventory(root)); return; }
  const sessions=v4arr(RAFF4_STATE.data.inventorySessions);
  const open=sessions.find((x)=>x.id===RAFF4_STATE.activeInventoryId&&x.status==='open')||sessions.find((x)=>x.status==='open');
  if(open) RAFF4_STATE.activeInventoryId=open.id;
  root.innerHTML=`<div class="v4-page">${v4pageHead('خدمة القراء والمجموعات','الجرد الميداني بالباركود','جلسة جرد قابلة للإيقاف والاستكمال، مع كشف المفقود والمكرر والموجود في مكان خاطئ.',v4action('جلسة جرد جديدة','new-inventory','plus','primary'))}${open?`<section class="inventory-session-card"><div class="inventory-session-head"><div><h3 style="margin:0;font-size:12px;">${v4e(open.name)}</h3><p class="v4-help-text" style="margin:3px 0 0;">بدأت ${v4date(open.startedAt,true)} · ${v4e(v4branch(open.branchId)?.name||'كل الفروع')}</p></div><div class="v4-page-actions"><span class="v4-badge success">جلسة مفتوحة</span><button class="v4-action danger" data-v4-action="close-inventory" data-id="${v4e(open.id)}">إغلاق الجرد</button></div></div><div class="v4-card-body"><div class="v4-split-label"><span class="v4-help-text">تم مسح ${open.scanned.length} من ${open.expectedItemIds.length}</span><b>${open.expectedItemIds.length?Math.round(open.scanned.length/open.expectedItemIds.length*100):100}%</b></div><div class="inventory-progress" style="margin-top:7px;"><span style="width:${open.expectedItemIds.length?Math.min(100,open.scanned.length/open.expectedItemIds.length*100):100}%;"></span></div><div class="inventory-scan-zone" style="margin-top:16px;">${icon('scan',26)}<h3>امسح باركود النسخة</h3><p class="v4-help-text">التركيز يبقى في الحقل لتسريع الجرد المتتابع.</p><input id="inventoryCode" autofocus placeholder="BARCODE"><div class="inventory-result" id="inventoryResult"></div></div><div class="v4-grid cols-3" style="margin-top:14px;">${v4metric('تم مسحه',open.scanned.length,'check')}${v4metric('أكواد غير معروفة',open.unknownCodes.length,'alert','راجع الملصقات','warning')}${v4metric('مسح مكرر',open.duplicateScans.length,'refresh')}</div></div></section>`:''}<section class="v4-card"><div class="v4-card-head"><div><h3>سجل جلسات الجرد</h3><p>النتائج محفوظة للمراجعة والتصدير</p></div><span class="v4-badge info">${sessions.length} جلسة</span></div><div class="v4-card-body" style="padding:0;">${sessions.length?`<table class="v4-table"><thead><tr><th>الجلسة</th><th>الفرع/الرف</th><th>المتوقع</th><th>الممسوح</th><th>الحالة</th><th>النتيجة</th></tr></thead><tbody>${sessions.map((s)=>`<tr><td><b>${v4e(s.name)}</b><div class="muted">${v4date(s.startedAt,true)}</div></td><td>${v4e(v4branch(s.branchId)?.name||'—')}<div class="muted">${v4e(s.shelf||'كل الرفوف')}</div></td><td>${s.expectedItemIds.length}</td><td>${s.scanned.length}</td><td>${v4status(s.status)}</td><td>${s.report?`<span class="v4-badge ${s.report.missing.length?'danger':'success'}">${s.report.missing.length} مفقودة</span>`:'—'}</td></tr>`).join('')}</tbody></table>`:v4empty('scan','لا توجد جلسات جرد','ابدأ جلسة وحدد الفرع والرف ثم امسح النسخ الموجودة فعليًا.')}</div></section></div>`;
  if(open){const input=root.querySelector('#inventoryCode'),result=root.querySelector('#inventoryResult');input?.addEventListener('keydown',async(e)=>{if(e.key!=='Enter')return;e.preventDefault();const code=input.value.trim();if(!code)return;try{const r=await window.raff4.scanInventory(open.id,code);await refreshRaff4State();const labels={ok:['تم تسجيل النسخة','success'],misplaced:['النسخة في موقع مختلف','warning'],unknown:['الباركود غير معروف','danger'],duplicate:['تم مسح النسخة من قبل','warning']};const [label,tone]=labels[r.status]||['تم','info'];result.innerHTML=`<span class="v4-badge ${tone}">${v4e(label)}${r.item?` · ${v4e(v4record(r.item.recordId)?.title||r.item.barcode)}`:''}</span>`;input.value='';input.focus();setTimeout(()=>{if(currentRoute==='inventory')renderV4Inventory(root);},450);}catch(err){result.innerHTML=`<span class="v4-badge danger">${v4e(err.message)}</span>`;}});}
}

function openInventoryForm(){const d=RAFF4_STATE.data;const html=`<div class="v4-modal-head"><div><h3>جلسة جرد جديدة</h3><p>حدد نطاقًا صغيرًا لتكون النتائج واضحة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="inventoryForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>اسم الجلسة</label><input name="name" placeholder="جرد قسم التاريخ"></div><div class="v4-field"><label>الفرع</label><select name="branchId">${v4selectOptions(d.branches,d.settings.activeBranchId)}</select></div><div class="v4-field"><label>الرف</label><input name="shelf" placeholder="اختياري — اتركه فارغًا لكل الرفوف"></div><div class="v4-field"><label>الموقع المحفوظ</label><select name="locationId">${v4selectOptions(d.locations,'','name','id','دون موقع محدد')}</select></div><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes"></textarea></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">بدء الجرد</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#inventoryForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());const session=await v4mutate(()=>window.raff4.startInventory(payload),'بدأت جلسة الجرد');RAFF4_STATE.activeInventoryId=session.id;closeModal();renderRoute();});}});}

/* =============================== Catalog ============================== */

function renderV4Catalog(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Catalog(root)); return; }
  const d = RAFF4_STATE.data;
  const q = RAFF4_STATE.catalogQuery.toLocaleLowerCase('ar');
  const records = v4arr(d.records).filter((r) => !r.deletedAt).filter((r) => !q || `${r.title} ${r.subtitle} ${r.author} ${r.publisher} ${r.referenceNumber} ${r.isbn13} ${(r.subjects || []).join(' ')}`.toLocaleLowerCase('ar').includes(q));
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الفهرسة والمجموعات', 'السجلات والمقتنيات والنسخ', 'يفصل رَفّ بين وصف الكتاب، ومكان اقتنائه، وكل نسخة مادية قابلة للإعارة.', `${v4action('سجل احترافي جديد', 'new-record', 'plus', 'primary')}${v4action('تعديل جماعي', 'bulk-records', 'edit')}`)}
    <div class="v4-toolbar"><label class="v4-search">${icon('search', 15)}<input id="catalogSearch" value="${v4e(RAFF4_STATE.catalogQuery)}" placeholder="عنوان، مؤلف، ناشر، ISBN، موضوع أو رقم مرجعي"></label><select class="v4-filter" id="catalogAvailability"><option value="">كل حالات الإتاحة</option><option value="available">له نسخة متاحة</option><option value="none">لا توجد نسخة متاحة</option></select><select class="v4-filter" id="catalogBranch">${v4selectOptions(d.branches, '', 'name', 'id', 'كل الفروع')}</select><span class="v4-badge info">${records.length} سجل</span></div>
    <section class="v4-card"><div class="v4-card-head"><div><h3>${icon('book', 14)} مجموعة المكتبة</h3><p>انقر على سجل لإدارة المقتنيات والنسخ والتاريخ</p></div><div class="v4-page-actions"><button class="v4-action" data-v4-action="import-marc">${icon('upload', 14)} MARCXML</button><button class="v4-action" data-v4-action="export-marc">${icon('download', 14)} تصدير MARC</button></div></div><div id="catalogRows">${v4CatalogRows(records)}</div></section>
  </div>`;
  let timer;
  root.querySelector('#catalogSearch')?.addEventListener('input', (event) => { RAFF4_STATE.catalogQuery = event.target.value; clearTimeout(timer); timer = setTimeout(() => renderV4Catalog(root), 120); });
  const applyFilters = () => {
    const availability = root.querySelector('#catalogAvailability').value;
    const branchId = root.querySelector('#catalogBranch').value;
    const filtered = records.filter((r) => {
      const items = v4activeItems(r.id); const avail = items.some((i) => i.status === 'available');
      if (availability === 'available' && !avail) return false;
      if (availability === 'none' && avail) return false;
      if (branchId) {
        const holdingIds = new Set(d.holdings.filter((h) => h.recordId === r.id && h.branchId === branchId).map((h) => h.id));
        if (!items.some((i) => holdingIds.has(i.holdingId))) return false;
      }
      return true;
    });
    root.querySelector('#catalogRows').innerHTML = v4CatalogRows(filtered);
  };
  root.querySelector('#catalogAvailability')?.addEventListener('change', applyFilters);
  root.querySelector('#catalogBranch')?.addEventListener('change', applyFilters);
}

function v4CatalogRows(records) {
  if (!records.length) return v4empty('book', 'لا توجد سجلات مطابقة', 'غيّر البحث أو أنشئ سجلًا ببليوغرافيًا جديدًا.', v4action('سجل جديد', 'new-record', 'plus', 'primary'));
  return records.map((r) => {
    const items = v4activeItems(r.id); const available = items.filter((i) => i.status === 'available').length;
    const holding = RAFF4_STATE.data.holdings.find((h) => h.recordId === r.id && !h.deletedAt);
    return `<article class="catalog-record" tabindex="0" data-v4-action="record-details" data-id="${v4e(r.id)}">
      <div class="catalog-record-cover">${r.coverDataUrl ? `<img src="${v4e(r.coverDataUrl)}" alt="">` : v4e((r.title || 'ر')[0])}</div>
      <div><h3>${v4e(r.title || 'بدون عنوان')}</h3><p>${v4e(r.author || r.contributors?.[0]?.name || 'مؤلف غير محدد')} · ${v4e(r.publisher || 'ناشر غير محدد')} ${r.publishYear ? `· ${v4e(r.publishYear)}` : ''}</p><div class="opac-meta" style="margin-top:5px;">${r.referenceNumber ? `<span class="v4-badge">${v4e(r.referenceNumber)}</span>` : ''}${r.isbn13 ? `<span class="v4-badge info">ISBN</span>` : ''}${r.category ? `<span class="v4-badge">${v4e(r.category)}</span>` : ''}</div></div>
      <div class="catalog-record-stat"><b>${items.length}</b><small>نسخة/جزء</small></div>
      <div class="catalog-record-stat secondary"><b>${available}</b><small>متاح</small></div>
      <div class="v4-table-actions">${v4iconButton('edit-record', r.id, 'edit', 'تعديل')}${v4iconButton('record-details', r.id, 'search', 'التفاصيل')}</div>
    </article>`;
  }).join('');
}

function v4CustomFieldInputs(scope, values = {}) {
  const fields = v4arr(RAFF4_STATE.data?.customFields).filter((f) => !f.deletedAt && f.active !== false && f.scope === scope);
  if (!fields.length) return '<div class="v4-note span-2">لا توجد حقول مخصصة لهذا القسم. يمكن إضافتها من الإعدادات والنسخ.</div>';
  return fields.map((f) => {
    const name = `custom__${f.key}`; const value = values?.[f.key] ?? '';
    let control = `<input name="${v4e(name)}" value="${v4e(value)}" ${f.required ? 'required' : ''}>`;
    if (f.type === 'number') control = `<input name="${v4e(name)}" type="number" value="${v4e(value)}" ${f.required ? 'required' : ''}>`;
    if (f.type === 'date') control = `<input name="${v4e(name)}" type="date" value="${v4e(value)}" ${f.required ? 'required' : ''}>`;
    if (f.type === 'select') control = `<select name="${v4e(name)}" ${f.required ? 'required' : ''}><option value="">اختر</option>${v4arr(f.options).map((x) => `<option value="${v4e(x)}" ${String(value) === String(x) ? 'selected' : ''}>${v4e(x)}</option>`).join('')}</select>`;
    if (f.type === 'boolean') control = `<label class="v4-checkbox"><input name="${v4e(name)}" type="checkbox" ${value === true || value === 'true' ? 'checked' : ''}><span>${v4e(f.label)}</span></label>`;
    return f.type === 'boolean' ? `<div class="v4-field">${control}</div>` : `<div class="v4-field"><label>${v4e(f.label)}${f.required ? ' *' : ''}</label>${control}</div>`;
  }).join('');
}

function v4ReadCustomFields(form, scope, existing = {}) {
  const result = { ...(existing || {}) };
  for (const field of v4arr(RAFF4_STATE.data?.customFields).filter((f) => !f.deletedAt && f.active !== false && f.scope === scope)) {
    const input = form.elements[`custom__${field.key}`]; if (!input) continue;
    if (field.type === 'boolean') result[field.key] = !!input.checked;
    else if (field.type === 'number') result[field.key] = input.value === '' ? '' : Number(input.value);
    else result[field.key] = input.value;
  }
  return result;
}

function openV4RecordForm(record = null) {
  const d = RAFF4_STATE.data;
  const holding = record ? d.holdings.find((h) => h.recordId === record.id && !h.deletedAt) : null;
  const items = record ? v4activeItems(record.id) : [];
  const copies = record ? Math.max(1, ...items.map((i) => Number(i.copyNumber) || 1)) : 1;
  const volumes = record ? Math.max(1, ...items.map((i) => Number(i.volumeNumber) || 1)) : 1;
  const contributors = v4arr(record?.contributors).map((x) => `${x.name}|${x.role}`).join('\n');
  const subjects = v4arr(record?.subjects).join('، ');
  const html = `<div class="v4-modal-head"><div><h3>${record ? 'تعديل السجل الببليوغرافي' : 'سجل ببليوغرافي جديد'}</h3><p>النموذج الأساسي قصير، والتفاصيل المتخصصة مطوية افتراضيًا</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div>
  <div class="v4-modal-body"><form id="recordForm" class="v4-form">
    <section class="v4-form-section" open><summary>البيانات الأساسية</summary><div class="v4-form-section-content v4-form-grid">
      <div class="v4-field span-2"><label>العنوان الرئيسي *</label><input name="title" required maxlength="300" value="${v4e(record?.title || '')}" autofocus></div>
      <div class="v4-field span-2"><label>العنوان الفرعي</label><input name="subtitle" value="${v4e(record?.subtitle || '')}"></div>
      <div class="v4-field"><label>المؤلف الرئيسي</label><input name="author" value="${v4e(record?.author || '')}"></div>
      <div class="v4-field"><label>الناشر</label><input name="publisher" value="${v4e(record?.publisher || '')}"></div>
      <div class="v4-field"><label>التصنيف/المجال</label><input name="category" value="${v4e(record?.category || '')}"></div>
      <div class="v4-field"><label>سنة النشر</label><input name="publishYear" inputmode="numeric" value="${v4e(record?.publishYear || '')}"></div>
      <div class="v4-field"><label>الطبعة</label><input name="edition" value="${v4e(record?.edition || '')}"></div>
      <div class="v4-field"><label>اللغة</label><input name="language" value="${v4e(record?.language || 'العربية')}"></div>
    </div></section>

    <section class="v4-form-section" open><summary>المقتنى والنسخ</summary><div class="v4-form-section-content v4-form-grid cols-3">
      <div class="v4-field"><label>الفرع</label><select name="branchId">${v4selectOptions(d.branches, holding?.branchId || d.settings.activeBranchId)}</select></div>
      <div class="v4-field"><label>القسم/القاعة</label><input name="section" value="${v4e(holding?.section || '')}"></div>
      <div class="v4-field"><label>الرف</label><input name="shelf" value="${v4e(holding?.shelf || '')}"></div>
      <div class="v4-field"><label>رقم الطلب</label><input name="callNumber" value="${v4e(holding?.callNumber || record?.referenceNumber || '')}"></div>
      <div class="v4-field"><label>السياسة</label><select name="circulationPolicyId">${v4selectOptions(d.policies, holding?.circulationPolicyId || 'policy_default')}</select></div>
      ${record ? `<div class="v4-field"><label>عدد النسخ الحالية</label><input value="${copies}" disabled></div>` : `<div class="v4-field"><label>عدد النسخ</label><input name="copiesTotal" type="number" min="1" max="10000" value="1"></div>`}
      ${record ? `<div class="v4-field"><label>عدد الأجزاء الحالية</label><input value="${volumes}" disabled></div>` : `<div class="v4-field"><label>عدد الأجزاء</label><input name="volumes" type="number" min="1" max="1000" value="1"></div>`}
      <div class="v4-field"><label>حالة النسخ الجديدة</label><select name="condition"><option>جيدة</option><option>مقبولة</option><option>تالفة</option><option>مفقودة</option></select></div>
      <div class="v4-field"><label>مصدر الاقتناء</label><input name="acquisitionSource" value="${v4e(items[0]?.acquisitionSource || '')}" placeholder="شراء، إهداء، وقف..."></div>
      <div class="v4-field"><label>السعر للوحدة</label><input name="price" type="number" min="0" step="0.01" value="${v4e(items[0]?.price ?? '')}"></div>
    </div></section>

    <details class="v4-form-section"><summary>المعرفات والنشر</summary><div class="v4-form-section-content v4-form-grid cols-3">
      <div class="v4-field"><label>ISBN-13</label><input name="isbn13" class="v4-ltr" value="${v4e(record?.isbn13 || '')}"><small id="isbn13Hint">يُتحقق منه محليًا دون اتصال.</small></div>
      <div class="v4-field"><label>ISBN-10</label><input name="isbn10" class="v4-ltr" value="${v4e(record?.isbn10 || '')}"><small id="isbn10Hint">اختياري للطبعات القديمة.</small></div>
      <div class="v4-field"><label>ISSN</label><input name="issn" class="v4-ltr" value="${v4e(record?.issn || '')}"></div>
      <div class="v4-field"><label>مكان النشر</label><input name="publicationPlace" value="${v4e(record?.publicationPlace || '')}"></div>
      <div class="v4-field"><label>نوع المادة</label><select name="materialTypeId">${v4selectOptions(d.materialTypes, record?.materialTypeId || 'material_book')}</select></div>
      <div class="v4-field"><label>الرقم المرجعي</label><input name="referenceNumber" class="v4-ltr" value="${v4e(record?.referenceNumber || '')}" placeholder="يُولد تلقائيًا"></div>
      <div class="v4-field"><label>السلسلة</label><input name="series" value="${v4e(record?.series || '')}"></div>
      <div class="v4-field"><label>الترتيب داخل السلسلة</label><input name="seriesOrder" value="${v4e(record?.seriesOrder || '')}"></div>
      <div class="v4-field"><label>عدد الصفحات</label><input name="pageCount" inputmode="numeric" value="${v4e(record?.pageCount || '')}"></div>
      <div class="v4-field"><label>المقاس</label><input name="dimensions" value="${v4e(record?.dimensions || '')}"></div>
      <div class="v4-field"><label>نوع الغلاف</label><input name="coverType" value="${v4e(record?.coverType || '')}"></div>
      <div class="v4-field"><label>الجمهور المستهدف</label><input name="audience" value="${v4e(record?.audience || '')}"></div>
    </div></details>

    <details class="v4-form-section"><summary>المساهمون والموضوعات</summary><div class="v4-form-section-content v4-form-grid">
      <div class="v4-field"><label>المساهمون</label><textarea name="contributors" placeholder="اسم الشخص|الدور — سطر لكل مساهم">${v4e(contributors)}</textarea><small>مثال: محمود شاكر|محقق</small></div>
      <div class="v4-field"><label>الموضوعات والكلمات المفتاحية</label><textarea name="subjects" placeholder="تفصل بفاصلة عربية أو إنجليزية">${v4e(subjects)}</textarea></div>
      <div class="v4-field span-2"><label>الملخص</label><textarea name="summary" style="min-height:120px;">${v4e(record?.summary || '')}</textarea></div>
    </div></details>

    <details class="v4-form-section"><summary>الغلاف والحقول المخصصة</summary><div class="v4-form-section-content v4-form-grid">
      <div class="v4-field span-2"><label>صورة الغلاف المحلية</label><input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp"><small>تُحفظ داخل ملف البيانات كصورة محلية؛ لا تُرفع إلى أي خادم.</small></div>
      <div class="v4-field span-2"><label>ملاحظات داخلية</label><textarea name="notes">${v4e(record?.notes || '')}</textarea></div>
      ${v4CustomFieldInputs('record', record?.customFields || {})}
    </div></details>

    <div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button type="submit" class="v4-action primary">${icon('check', 14)} ${record ? 'حفظ التعديلات' : 'إنشاء السجل والنسخ'}</button></div>
  </form></div>`;
  openModal(html, { modalClass:'v4-wide-modal', onMount:(overlay) => {
    overlay.classList.add('v4-modal'); overlay.querySelector('#v4ModalClose').onclick=closeModal; overlay.querySelector('#v4Cancel').onclick=closeModal;
    for (const name of ['isbn13','isbn10']) overlay.querySelector(`[name=${name}]`)?.addEventListener('blur', async (event) => {
      if (!event.target.value) return; const result = await window.raff4.validateIsbn(event.target.value); const hint = overlay.querySelector(`#${name}Hint`); hint.textContent = result.valid ? `${result.type} صحيح` : `${result.type === 'unknown' ? 'الطول غير صحيح' : result.type + ' غير صحيح'}`; hint.style.color = result.valid ? 'var(--success)' : 'var(--destructive)';
    });
    overlay.querySelector('#recordForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const fd=new FormData(event.currentTarget); const payload=Object.fromEntries(fd.entries());
      payload.contributors=(payload.contributors||'').split(/\n/).map((line)=>{const [name,role='مؤلف']=line.split('|');return {name:name.trim(),role:role.trim()};}).filter((x)=>x.name);
      payload.subjects=(payload.subjects||'').split(/[،,]/).map((x)=>x.trim()).filter(Boolean);
      payload.customFields=v4ReadCustomFields(event.currentTarget,'record',record?.customFields||{});
      for(const key of Object.keys(payload)) if(key.startsWith('custom__')) delete payload[key];
      const file=event.currentTarget.coverFile.files[0];
      if(file){ if(file.size>2*1024*1024){toast('حجم الغلاف يجب ألا يتجاوز 2 ميجابايت','error');return;} payload.coverDataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}); }
      delete payload.coverFile;
      await v4mutate(()=>record?window.raff4.updateRecord(record.id,payload):window.raff4.createRecord(payload),record?'تم تحديث السجل':'تم إنشاء السجل والنسخ');closeModal();if(currentRoute==='catalog')renderRoute();
    });
  }});
}

function openV4RecordDetails(recordId) {
  const r=v4record(recordId); if(!r)return;
  const items=v4activeItems(r.id), holdings=RAFF4_STATE.data.holdings.filter((h)=>h.recordId===r.id&&!h.deletedAt), loans=RAFF4_STATE.data.loans.filter((l)=>(l.itemIds||[]).some((id)=>items.some((i)=>i.id===id)));
  const html=`<div class="v4-modal-head"><div><h3>${v4e(r.title)}</h3><p>السجل الببليوغرافي والمقتنيات والنسخ</p></div><div class="v4-page-actions"><button class="v4-action" data-v4-action="edit-record" data-id="${v4e(r.id)}">${icon('edit',14)} تعديل</button><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div></div><div class="v4-modal-body"><div class="record-detail-layout"><section class="v4-card pad"><div class="record-summary">${v4cover(r,true)}<div><div class="v4-eyebrow">${v4e(RAFF4_STATE.data.materialTypes.find((x)=>x.id===r.materialTypeId)?.name||'كتاب')}</div><h2 style="margin:0;font:700 22px/1.45 var(--font-display);">${v4e(r.title)}</h2>${r.subtitle?`<p class="v4-help-text">${v4e(r.subtitle)}</p>`:''}<p style="font-size:11px;">${v4e(r.author||'مؤلف غير محدد')}</p><div class="opac-meta">${r.referenceNumber?`<span class="v4-badge">${v4e(r.referenceNumber)}</span>`:''}${r.isbn13?`<span class="v4-badge info">${v4e(r.isbn13)}</span>`:''}</div></div></div>${r.summary?`<div class="v4-divider" style="margin:16px 0;"></div><p class="v4-help-text" style="font-size:10.5px;">${v4e(r.summary)}</p>`:''}<div class="record-facts"><div class="record-fact"><small>الناشر</small><b>${v4e(r.publisher||'—')}</b></div><div class="record-fact"><small>النشر</small><b>${v4e([r.publicationPlace,r.publishYear].filter(Boolean).join(' · ')||'—')}</b></div><div class="record-fact"><small>الطبعة</small><b>${v4e(r.edition||'—')}</b></div><div class="record-fact"><small>السلسلة</small><b>${v4e(r.series||'—')}</b></div><div class="record-fact"><small>الموضوعات</small><b>${v4e((r.subjects||[]).join('، ')||'—')}</b></div><div class="record-fact"><small>اكتمال البيانات</small><b>${[r.title,r.author,r.publisher,r.referenceNumber,r.category,r.publishYear].filter(Boolean).length}/6</b></div></div></section><aside class="v4-card"><div class="v4-card-head"><div><h3>ملخص النسخ</h3><p>كل نسخة لها باركود وحالة مستقلان</p></div></div><div class="v4-card-body"><div class="v4-kpi-list"><div class="v4-kpi-row"><span>إجمالي النسخ والأجزاء</span><b>${items.length}</b></div><div class="v4-kpi-row"><span>متاح</span><b>${items.filter((i)=>i.status==='available').length}</b></div><div class="v4-kpi-row"><span>معار</span><b>${items.filter((i)=>i.status==='on_loan').length}</b></div><div class="v4-kpi-row"><span>محجوز</span><b>${items.filter((i)=>i.status==='reserved').length}</b></div><div class="v4-kpi-row"><span>إجمالي الإعارات التاريخية</span><b>${loans.length}</b></div></div></div><div class="v4-card-footer"><button class="v4-action primary" data-v4-action="add-items" data-id="${v4e(r.id)}" style="width:100%;">${icon('plus',14)} إضافة نسخ</button></div></aside></div>
  <div class="v4-card" style="margin-top:14px;"><div class="v4-card-head"><div><h3>المقتنيات والمواقع</h3><p>الفرع والقاعة والرف ورقم الطلب</p></div></div><div class="v4-card-body"><div class="entity-cards">${holdings.map((h)=>`<div class="entity-card"><div class="entity-card-head"><div><h3>${v4e(v4branch(h.branchId)?.name||'فرع')}</h3><p>${v4e([h.room,h.section,h.shelf].filter(Boolean).join(' · ')||'مكان غير محدد')}</p></div><span class="v4-badge">${v4e(h.callNumber||'بلا رقم طلب')}</span></div><div class="entity-card-meta"><div><small>النسخ</small><b>${items.filter((i)=>i.holdingId===h.id).length}</b></div><div><small>المتاح</small><b>${items.filter((i)=>i.holdingId===h.id&&i.status==='available').length}</b></div></div></div>`).join('')}</div></div></div>
  <div class="v4-card" style="margin-top:14px;"><div class="v4-card-head"><div><h3>النسخ المادية</h3><p>انقر على تعديل لتغيير الحالة أو الباركود أو الموقع</p></div></div><div class="v4-card-body"><div class="item-grid">${items.map((i)=>`<div class="item-card"><div class="item-card-head"><div><b>نسخة ${i.copyNumber}${i.volumeNumber>1?` · جزء ${i.volumeNumber}`:''}</b><code style="display:block;margin-top:3px;">${v4e(i.barcode)}</code></div>${v4status(i.status)}</div><p class="v4-help-text">${v4e(v4holding(i.holdingId)?.shelf||'رف غير محدد')} · ${v4e(i.condition||'—')}</p><div class="v4-table-actions">${v4iconButton('edit-item',i.id,'edit','تعديل النسخة')}</div></div>`).join('')}</div></div></div></div>`;
  openModal(html,{modalClass:'v4-wide-modal',onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;}});
}

function openAddItems(recordId){const r=v4record(recordId);if(!r)return;const html=`<div class="v4-modal-head"><div><h3>إضافة نسخ إلى ${v4e(r.title)}</h3><p>يُنشئ رَفّ باركودًا مستقلًا لكل نسخة وجزء</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="addItemsForm" class="v4-form"><div class="v4-field"><label>عدد النسخ الجديدة</label><input name="copies" type="number" min="1" max="10000" value="1" autofocus></div><div class="v4-note">ستُضاف النسخ إلى المقتنى الحالي وتظهر فورًا في الجرد والإعارة والباركود.</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">إضافة النسخ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#addItemsForm').addEventListener('submit',async(e)=>{e.preventDefault();const copies=e.currentTarget.copies.value;await v4mutate(()=>window.raff4.addItems(r.id,{copies}),'تمت إضافة النسخ');closeModal();if(currentRoute==='catalog')renderRoute();});}});}

function openEditItem(itemId){const i=v4item(itemId);if(!i)return;const html=`<div class="v4-modal-head"><div><h3>تعديل النسخة</h3><p>${v4e(i.barcode)}</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="itemForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field span-2"><label>الباركود</label><input name="barcode" class="v4-ltr" required value="${v4e(i.barcode)}"></div><div class="v4-field"><label>الحالة التشغيلية</label><select name="status">${[['available','متاح'],['on_loan','معار'],['reserved','محجوز'],['lost','مفقود'],['damaged','تالف'],['maintenance','صيانة'],['withdrawn','مسحوب'],['in_transit','قيد النقل']].map(([v,l])=>`<option value="${v}" ${i.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>حالة النسخة</label><input name="condition" value="${v4e(i.condition||'')}"></div><div class="v4-field"><label>المقتنى/الموقع</label><select name="holdingId">${RAFF4_STATE.data.holdings.filter((h)=>h.recordId===i.recordId&&!h.deletedAt).map((h)=>`<option value="${v4e(h.id)}" ${i.holdingId===h.id?'selected':''}>${v4e(v4branch(h.branchId)?.name||'فرع')} · ${v4e(h.shelf||'رف')}</option>`).join('')}</select></div><div class="v4-field"><label>السعر</label><input name="price" type="number" min="0" step="0.01" value="${v4e(i.price??'')}"></div><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes">${v4e(i.notes||'')}</textarea></div>${v4CustomFieldInputs('item', i.customFields || {})}</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#itemForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.customFields=v4ReadCustomFields(e.currentTarget,'item',i.customFields||{});for(const key of Object.keys(payload))if(key.startsWith('custom__'))delete payload[key];await v4mutate(()=>window.raff4.updateItem(i.id,payload),'تم تحديث النسخة');closeModal();if(currentRoute==='catalog')renderRoute();});}});}

/* ======================== Authorities & quality ====================== */

function renderV4Authorities(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Authorities(root)); return; }
  const rows=v4arr(RAFF4_STATE.data.authorities).filter((x)=>!x.deletedAt);
  const byType={person:'أشخاص',corporate:'جهات',subject:'موضوعات',publisher:'دور نشر',series:'سلاسل',place:'أماكن'};
  root.innerHTML=`<div class="v4-page">${v4pageHead('الفهرسة والمجموعات','الضبط الاستنادي','وحّد أسماء المؤلفين والموضوعات والسلاسل مع الاحتفاظ بالأشكال البديلة للبحث.',`${v4action('سجل استنادي جديد','new-authority','plus','primary')}${v4action('كشف المتشابهات','authority-duplicates','search')}`)}<div class="v4-grid cols-3">${Object.entries(byType).map(([type,label])=>v4metric(label,rows.filter((x)=>x.type===type).length,type==='person'?'user':type==='subject'?'tag':'building')).join('')}</div><div class="v4-toolbar"><label class="v4-search">${icon('search',15)}<input id="authoritySearch" placeholder="الشكل المعتمد أو أحد الأشكال البديلة"></label><select class="v4-filter" id="authorityType"><option value="">كل الأنواع</option>${Object.entries(byType).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><span class="v4-badge info">${rows.length} سجل</span></div><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>الشكل المعتمد</th><th>النوع</th><th>الأشكال البديلة</th><th>بيانات التمييز</th><th>إجراءات</th></tr></thead><tbody id="authorityRows">${authorityRows(rows,byType)}</tbody></table></div></div>`;
  const filter=()=>{const q=root.querySelector('#authoritySearch').value.toLocaleLowerCase('ar'),type=root.querySelector('#authorityType').value;const out=rows.filter((x)=>(!type||x.type===type)&&(!q||`${x.preferred} ${(x.variants||[]).join(' ')}`.toLocaleLowerCase('ar').includes(q)));root.querySelector('#authorityRows').innerHTML=authorityRows(out,byType);};
  root.querySelector('#authoritySearch').addEventListener('input',filter);root.querySelector('#authorityType').addEventListener('change',filter);
}
function authorityRows(rows,byType){return rows.map((a)=>`<tr><td><b>${v4e(a.preferred)}</b><div class="muted">${v4e(a.country||'')}</div></td><td><span class="v4-badge">${v4e(byType[a.type]||a.type)}</span></td><td>${v4e((a.variants||[]).join('، ')||'—')}</td><td>${v4e([a.birthYear,a.deathYear].filter(Boolean).join('–')||a.notes||'—')}</td><td><div class="v4-table-actions">${v4iconButton('edit-authority',a.id,'edit','تعديل')}${v4iconButton('delete-entity',a.id,'trash','حذف','danger').replace('data-id=','data-entity="authorities" data-id=')}</div></td></tr>`).join('')||`<tr><td colspan="5">${v4empty('user','لا توجد سجلات استنادية','أضف اسمًا معتمدًا للمؤلف أو الموضوع، ثم أدرج أشكاله البديلة.')}</td></tr>`;}
function openAuthorityForm(authority=null){const html=`<div class="v4-modal-head"><div><h3>${authority?'تعديل سجل استنادي':'سجل استنادي جديد'}</h3><p>الشكل المعتمد يظهر في الفهرسة، والبدائل تساعد البحث</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="authorityForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>النوع</label><select name="type">${[['person','شخص'],['corporate','جهة'],['subject','موضوع'],['publisher','دار نشر'],['series','سلسلة'],['place','مكان']].map(([v,l])=>`<option value="${v}" ${authority?.type===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>الشكل المعتمد *</label><input name="preferred" required value="${v4e(authority?.preferred||'')}"></div><div class="v4-field span-2"><label>الأشكال البديلة</label><input name="variants" value="${v4e((authority?.variants||[]).join('، '))}" placeholder="تفصل بفاصلة"></div><div class="v4-field"><label>سنة الميلاد/التأسيس</label><input name="birthYear" value="${v4e(authority?.birthYear||'')}"></div><div class="v4-field"><label>سنة الوفاة/الانتهاء</label><input name="deathYear" value="${v4e(authority?.deathYear||'')}"></div><div class="v4-field"><label>البلد</label><input name="country" value="${v4e(authority?.country||'')}"></div><div class="v4-field"><label>ملاحظات تمييز</label><input name="notes" value="${v4e(authority?.notes||'')}"></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#authorityForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.variants=payload.variants.split(/[،,]/).map((x)=>x.trim()).filter(Boolean);await v4mutate(()=>authority?window.raff4.updateEntity('authorities',authority.id,payload):window.raff4.createEntity('authorities',payload),'تم حفظ السجل الاستنادي');closeModal();if(currentRoute==='authorities')renderRoute();});}});}
function openAuthorityDuplicates(){const rows=v4arr(RAFF4_STATE.data.authorities).filter((x)=>!x.deletedAt);const pairs=[];const norm=(s)=>(s||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim().toLowerCase();for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=norm(rows[i].preferred),b=norm(rows[j].preferred);if(a&&b&&(a===b||a.includes(b)||b.includes(a)||(rows[i].variants||[]).some((v)=>norm(v)===b)||(rows[j].variants||[]).some((v)=>norm(v)===a)))pairs.push([rows[i],rows[j]]);}const html=`<div class="v4-modal-head"><div><h3>السجلات المتشابهة المحتملة</h3><p>تنبيه للمراجعة، وليس دمجًا تلقائيًا</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body">${pairs.length?`<div class="v4-kpi-list">${pairs.map(([a,b])=>`<div class="v4-kpi-row"><span><b style="display:block;color:var(--foreground);">${v4e(a.preferred)}</b>${v4e(b.preferred)}</span><button class="v4-action" data-v4-action="merge-authority-pair" data-keeper="${v4e(a.id)}" data-duplicate="${v4e(b.id)}">اعتماد الأول ودمج الثاني</button></div>`).join('')}</div>`:v4empty('check','لا توجد تشابهات واضحة','لم يعثر رَفّ على سجلات تستحق المراجعة الآن.')}</div>`;openModal(html,{modalClass:'v4-wide-modal',onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;}});}

/* ====================== Acquisitions & serials ======================= */

function renderV4Acquisitions(root){renderV4EntityPage(root,{entity:'acquisitions',eyebrow:'التزويد والمشتريات',title:'طلبات التزويد والموردون',subtitle:'تتبّع الطلب من الاقتراح والاعتماد إلى الاستلام، محليًا دون نظام محاسبي معقد.',newLabel:'طلب جديد',columns:[['title','العنوان'],['vendor','المورد'],['status','الحالة'],['quantity','الكمية'],['unitPrice','سعر الوحدة'],['expectedAt','المتوقع']],renderCell:(row,key)=>key==='status'?v4status(row.status):key==='unitPrice'?v4money(row.unitPrice):key==='expectedAt'?v4date(row.expectedAt):v4e(row[key]||'—'),extraActions:(row)=>row.status!=='received'&&row.status!=='cancelled'?v4iconButton('acquisition-next',row.id,'check','تحديث المرحلة'):''});}
function renderV4Serials(root){renderV4EntityPage(root,{entity:'serials',eyebrow:'التزويد والدوريات',title:'الدوريات والاشتراكات',subtitle:'تابع الأعداد المتوقعة والمستلمة والمفقودة ومواعيد انتهاء الاشتراك.',newLabel:'دورية جديدة',columns:[['title','الدورية'],['issn','ISSN'],['frequency','التكرار'],['vendor','المورد'],['nextExpectedAt','العدد المتوقع'],['active','الحالة']],renderCell:(row,key)=>key==='nextExpectedAt'?v4date(row[key]):key==='active'?v4status(row.active===false?'expired':'active'):key==='frequency'?v4e({weekly:'أسبوعية',monthly:'شهرية',quarterly:'ربع سنوية',semiannual:'نصف سنوية',annual:'سنوية',irregular:'غير منتظمة'}[row[key]]||row[key]):v4e(row[key]||'—')});}
function renderV4EntityPage(root,config){if(!RAFF4_STATE.data){v4loading(root);refreshRaff4State().then(()=>renderV4EntityPage(root,config));return;}const rows=v4arr(RAFF4_STATE.data[config.entity]).filter((x)=>!x.deletedAt);root.innerHTML=`<div class="v4-page">${v4pageHead(config.eyebrow,config.title,config.subtitle,v4action(config.newLabel,`new-${config.entity}`,'plus','primary'))}<div class="v4-toolbar"><label class="v4-search">${icon('search',15)}<input id="entitySearch" placeholder="بحث داخل السجلات"></label><span class="v4-badge info">${rows.length} سجل</span></div><div class="v4-table-wrap"><table class="v4-table"><thead><tr>${config.columns.map(([,l])=>`<th>${v4e(l)}</th>`).join('')}<th>إجراءات</th></tr></thead><tbody id="entityRows">${v4EntityRows(rows,config)}</tbody></table></div></div>`;root.querySelector('#entitySearch').addEventListener('input',(e)=>{const q=e.target.value.toLocaleLowerCase('ar');root.querySelector('#entityRows').innerHTML=v4EntityRows(rows.filter((r)=>JSON.stringify(r).toLocaleLowerCase('ar').includes(q)),config);});}
function v4EntityRows(rows,c){return rows.map((r)=>`<tr>${c.columns.map(([k])=>`<td>${c.renderCell?c.renderCell(r,k):v4e(r[k]||'—')}</td>`).join('')}<td><div class="v4-table-actions">${c.extraActions?c.extraActions(r):''}${v4iconButton(`edit-${c.entity}`,r.id,'edit','تعديل')}${v4iconButton('delete-entity',r.id,'trash','حذف','danger').replace('data-id=',`data-entity="${c.entity}" data-id=`)}</div></td></tr>`).join('')||`<tr><td colspan="${c.columns.length+1}">${v4empty('note','لا توجد سجلات','أضف أول سجل لبدء هذه الوحدة.')}</td></tr>`;}
function openAcquisitionForm(row=null){const d=RAFF4_STATE.data;const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل طلب التزويد':'طلب تزويد جديد'}</h3><p>بيانات مختصرة يمكن استكمالها مع تقدم الطلب</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="acqForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field span-2"><label>العنوان المطلوب *</label><input name="title" required value="${v4e(row?.title||'')}"></div><div class="v4-field"><label>المورد</label><input name="vendor" value="${v4e(row?.vendor||'')}"></div><div class="v4-field"><label>طالب الشراء</label><input name="requestedBy" value="${v4e(row?.requestedBy||'')}"></div><div class="v4-field"><label>الفرع</label><select name="branchId">${v4selectOptions(d.branches,row?.branchId||d.settings.activeBranchId)}</select></div><div class="v4-field"><label>الحالة</label><select name="status">${[['requested','مطلوب'],['approved','معتمد'],['ordered','تم الطلب'],['partially_received','استلام جزئي'],['received','مستلم'],['cancelled','ملغى']].map(([v,l])=>`<option value="${v}" ${row?.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>الكمية</label><input name="quantity" type="number" min="1" value="${v4e(row?.quantity||1)}"></div><div class="v4-field"><label>سعر الوحدة</label><input name="unitPrice" type="number" min="0" step="0.01" value="${v4e(row?.unitPrice||0)}"></div><div class="v4-field"><label>الميزانية/البند</label><input name="budget" value="${v4e(row?.budget||'')}"></div><div class="v4-field"><label>رقم الفاتورة</label><input name="invoiceNumber" value="${v4e(row?.invoiceNumber||'')}"></div><div class="v4-field"><label>التاريخ المتوقع</label><input name="expectedAt" type="date" value="${row?.expectedAt?new Date(row.expectedAt).toISOString().slice(0,10):''}"></div><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes">${v4e(row?.notes||'')}</textarea></div>${v4CustomFieldInputs('acquisition', row?.customFields || {})}</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openEntityFormModal(html,'acqForm','acquisitions',row);}
function openSerialForm(row=null){const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل الدورية':'دورية جديدة'}</h3><p>إدارة الاشتراك والأعداد المتوقعة والمفقودة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="serialForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field span-2"><label>اسم الدورية *</label><input name="title" required value="${v4e(row?.title||'')}"></div><div class="v4-field"><label>ISSN</label><input name="issn" class="v4-ltr" value="${v4e(row?.issn||'')}"></div><div class="v4-field"><label>التكرار</label><select name="frequency">${[['weekly','أسبوعية'],['monthly','شهرية'],['quarterly','ربع سنوية'],['semiannual','نصف سنوية'],['annual','سنوية'],['irregular','غير منتظمة']].map(([v,l])=>`<option value="${v}" ${row?.frequency===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>المورد</label><input name="vendor" value="${v4e(row?.vendor||'')}"></div><div class="v4-field"><label>آخر عدد مستلم</label><input name="lastIssue" value="${v4e(row?.lastIssue||'')}"></div><div class="v4-field"><label>بداية الاشتراك</label><input name="startAt" type="date" value="${row?.startAt?new Date(row.startAt).toISOString().slice(0,10):''}"></div><div class="v4-field"><label>نهاية الاشتراك</label><input name="endAt" type="date" value="${row?.endAt?new Date(row.endAt).toISOString().slice(0,10):''}"></div><div class="v4-field"><label>العدد المتوقع التالي</label><input name="nextExpectedAt" type="date" value="${row?.nextExpectedAt?new Date(row.nextExpectedAt).toISOString().slice(0,10):''}"></div><div class="v4-field"><label>الأعداد المفقودة</label><input name="missingIssues" value="${v4e((row?.missingIssues||[]).join('، '))}"></div><label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>اشتراك نشط</span></label><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes">${v4e(row?.notes||'')}</textarea></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#serialForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.missingIssues=payload.missingIssues.split(/[،,]/).map((x)=>x.trim()).filter(Boolean);payload.active=e.currentTarget.active.checked;await v4mutate(()=>row?window.raff4.updateEntity('serials',row.id,payload):window.raff4.createEntity('serials',payload),'تم حفظ الدورية');closeModal();if(currentRoute==='serials')renderRoute();});}});}
function openEntityFormModal(html,formId,entity,row){openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector(`#${formId}`).addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());if(entity==='acquisitions'){payload.customFields=v4ReadCustomFields(e.currentTarget,'acquisition',row?.customFields||{});for(const key of Object.keys(payload))if(key.startsWith('custom__'))delete payload[key];}await v4mutate(()=>row?window.raff4.updateEntity(entity,row.id,payload):window.raff4.createEntity(entity,payload),`تم حفظ ${V4_ENTITY_LABELS[entity]||'السجل'}`);closeModal();if(currentRoute)renderRoute();});}});}

/* ==================== Branches, policies and users =================== */

function renderV4Branches(root) {
  if (!RAFF4_STATE.data) { v4loading(root); refreshRaff4State().then(() => renderV4Branches(root)); return; }
  const d = RAFF4_STATE.data;
  const rows = d.branches.filter((x) => !x.deletedAt);
  const transfers = v4arr(d.transfers).filter((x) => !x.deletedAt).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const statusLabels = { draft: 'مسودة', in_transit: 'قيد النقل', received: 'مستلم', cancelled: 'ملغى' };
  root.innerHTML = `<div class="v4-page">
    ${v4pageHead('الإدارة', 'الفروع والمواقع', 'نظّم الفروع والقاعات والرفوف، وانقل النسخ بينها مع تتبع واضح للحالة.', `${v4action('فرع جديد', 'new-branch', 'plus', 'primary')}${v4action('موقع/رف جديد', 'new-location', 'plus')}${rows.length > 1 ? v4action('نقل نسخ', 'new-transfer', 'copies') : ''}`)}
    <div class="entity-cards">${rows.map((b) => {
      const holdings = d.holdings.filter((h) => h.branchId === b.id && !h.deletedAt);
      const items = d.items.filter((i) => !i.deletedAt && !i.archived && holdings.some((h) => h.id === i.holdingId));
      return `<article class="entity-card"><div class="entity-card-head"><div><h3>${v4e(b.name)}</h3><p>${v4e(b.address || 'لا يوجد عنوان مسجل')}</p></div>${v4status(b.active === false ? 'expired' : 'active')}</div><div class="entity-card-meta"><div><small>الكود</small><b>${v4e(b.code)}</b></div><div><small>المقتنيات</small><b>${holdings.length}</b></div><div><small>النسخ</small><b>${items.length}</b></div><div><small>المتاح</small><b>${items.filter((i) => i.status === 'available').length}</b></div></div><div class="v4-table-actions" style="margin-top:10px;">${v4iconButton('edit-branch', b.id, 'edit', 'تعديل')}${b.id !== 'branch_main' ? v4iconButton('delete-entity', b.id, 'trash', 'حذف', 'danger').replace('data-id=', 'data-entity="branches" data-id=') : ''}</div></article>`;
    }).join('')}</div>

    <section class="v4-card"><div class="v4-card-head"><div><h3>المواقع والرفوف المحفوظة</h3><p>قوالب جاهزة للاستخدام أثناء الفهرسة والجرد والاستلام</p></div><span class="v4-badge info">${d.locations.filter((x) => !x.deletedAt).length}</span></div><div class="v4-card-body"><div class="entity-cards">${d.locations.filter((x) => !x.deletedAt).map((l) => `<div class="entity-card"><div class="entity-card-head"><div><h3>${v4e(l.name)}</h3><p>${v4e(v4branch(l.branchId)?.name || '—')} · ${v4e([l.room, l.shelf].filter(Boolean).join(' · ') || 'بلا تفاصيل')}</p></div><div class="v4-table-actions">${v4iconButton('edit-location', l.id, 'edit', 'تعديل')}${v4iconButton('delete-entity', l.id, 'trash', 'حذف', 'danger').replace('data-id=', 'data-entity="locations" data-id=')}</div></div></div>`).join('') || '<p class="v4-help-text">لا توجد مواقع محفوظة بعد.</p>'}</div></div></section>

    <section class="v4-card"><div class="v4-card-head"><div><h3>حركة النسخ بين الفروع</h3><p>تظل النسخة «قيد النقل» حتى يؤكد فرع الوجهة استلامها</p></div>${rows.length > 1 ? `<button class="v4-action primary" data-v4-action="new-transfer">${icon('plus', 14)} نقل جديد</button>` : ''}</div><div class="v4-card-body">${transfers.length ? `<div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>من</th><th>إلى</th><th>النسخ</th><th>الحالة</th><th>الإرسال</th><th>الإجراءات</th></tr></thead><tbody>${transfers.map((t) => `<tr><td>${v4e(v4branch(t.fromBranchId)?.name || '—')}</td><td>${v4e(v4branch(t.toBranchId)?.name || '—')}</td><td><b>${(t.itemIds || []).length}</b></td><td><span class="v4-badge ${t.status === 'received' ? 'success' : t.status === 'cancelled' ? 'danger' : 'info'}">${v4e(statusLabels[t.status] || t.status)}</span></td><td>${v4date(t.sentAt || t.createdAt, true)}</td><td><div class="v4-table-actions">${t.status === 'in_transit' ? `${v4iconButton('receive-transfer', t.id, 'check', 'استلام')}${v4iconButton('cancel-transfer', t.id, 'x', 'إلغاء', 'danger')}` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : v4empty('copies', 'لا توجد عمليات نقل', rows.length > 1 ? 'ابدأ عملية نقل وحدد النسخ المادية المتاحة.' : 'أضف فرعًا ثانيًا لتفعيل نقل النسخ.')}</div></section>
  </div>`;
}

function openTransferForm() {
  const d = RAFF4_STATE.data;
  const fromBranchId = d.settings.activeBranchId;
  const candidates = d.items.filter((item) => {
    if (item.deletedAt || item.archived || item.status !== 'available') return false;
    const holding = d.holdings.find((h) => h.id === item.holdingId && !h.deletedAt);
    return holding?.branchId === fromBranchId;
  });
  const html = `<div class="v4-modal-head"><div><h3>نقل نسخ بين الفروع</h3><p>تتحول النسخ إلى «قيد النقل» حتى يؤكد فرع الوجهة الاستلام</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="transferForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>فرع الإرسال</label><input value="${v4e(v4branch(fromBranchId)?.name || 'الفرع النشط')}" disabled><input type="hidden" name="fromBranchId" value="${v4e(fromBranchId)}"></div><div class="v4-field"><label>فرع الوجهة *</label><select name="toBranchId" required><option value="">اختر الفرع</option>${d.branches.filter((b) => !b.deletedAt && b.active !== false && b.id !== fromBranchId).map((b) => `<option value="${v4e(b.id)}">${v4e(b.name)}</option>`).join('')}</select></div><div class="v4-field span-2"><label>النسخ المتاحة *</label><div class="transfer-item-picker">${candidates.length ? candidates.map((i) => { const r = v4record(i.recordId); return `<label class="bulk-record-row"><input type="checkbox" name="itemIds" value="${v4e(i.id)}"><span><b>${v4e(r?.title || 'كتاب')}</b><small><code class="v4-ltr">${v4e(i.barcode)}</code> · نسخة ${i.copyNumber || 1}${Number(i.volumeNumber) > 1 ? ` · جزء ${i.volumeNumber}` : ''}</small></span></label>`; }).join('') : '<p class="v4-help-text">لا توجد نسخ متاحة في الفرع النشط.</p>'}</div></div><div class="v4-field span-2"><label>ملاحظات الإرسال</label><textarea name="notes"></textarea></div></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit" ${candidates.length ? '' : 'disabled'}>تأكيد الإرسال</button></div></form></div>`;
  openModal(html, { modalClass: 'v4-wide-modal', onMount: (o) => {
    o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#v4Cancel').onclick = closeModal;
    o.querySelector('#transferForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const payload = Object.fromEntries(fd.entries()); payload.itemIds = fd.getAll('itemIds');
      if (!payload.itemIds.length) { toast('اختر نسخة واحدة على الأقل', 'error'); return; }
      await v4mutate(() => window.raff4.createTransfer(payload), 'تم إرسال النسخ إلى فرع الوجهة'); closeModal(); renderRoute();
    });
  }});
}

function openReceiveTransfer(transfer) {
  const d = RAFF4_STATE.data;
  const locations = d.locations.filter((l) => !l.deletedAt && l.active !== false && l.branchId === transfer.toBranchId);
  const html = `<div class="v4-modal-head"><div><h3>استلام النسخ المنقولة</h3><p>${v4e(v4branch(transfer.toBranchId)?.name || 'فرع الوجهة')} · ${(transfer.itemIds || []).length} نسخة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x', 15)}</button></div><div class="v4-modal-body"><form id="receiveTransferForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>موقع محفوظ</label><select name="locationId">${v4selectOptions(locations, '', 'name', 'id', 'دون موقع محدد')}</select></div><div class="v4-field"><label>الرف</label><input name="shelf" placeholder="مثال: أ-03"></div><div class="v4-field span-2"><label>ملاحظات الاستلام</label><textarea name="notes"></textarea></div></div><div class="v4-note">سيُنشئ رَفّ مقتنى في فرع الوجهة عند الحاجة، ويعيد النسخ إلى حالة «متاح».</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">تأكيد الاستلام</button></div></form></div>`;
  openModal(html, { onMount: (o) => {
    o.classList.add('v4-modal'); o.querySelector('#v4ModalClose').onclick = closeModal; o.querySelector('#v4Cancel').onclick = closeModal;
    o.querySelector('#receiveTransferForm').addEventListener('submit', async (e) => { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); await v4mutate(() => window.raff4.receiveTransfer(transfer.id, payload), 'تم استلام النسخ وتحديث مواقعها'); closeModal(); renderRoute(); });
  }});
}

function openBranchForm(row=null){const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل الفرع':'فرع جديد'}</h3><p>فرع مكتبة أو مخزن أو قاعة قراءة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="branchForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>اسم الفرع *</label><input name="name" required value="${v4e(row?.name||'')}"></div><div class="v4-field"><label>الكود</label><input name="code" class="v4-ltr" value="${v4e(row?.code||'')}"></div><div class="v4-field"><label>النوع</label><select name="type">${[['library','مكتبة'],['publisher','دار نشر'],['warehouse','مخزن'],['reading_room','قاعة قراءة']].map(([v,l])=>`<option value="${v}" ${row?.type===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>الهاتف</label><input name="phone" class="v4-ltr" value="${v4e(row?.phone||'')}"></div><div class="v4-field span-2"><label>العنوان</label><input name="address" value="${v4e(row?.address||'')}"></div><div class="v4-field span-2"><label>ملاحظات</label><textarea name="notes">${v4e(row?.notes||'')}</textarea></div><label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>فرع نشط</span></label></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#branchForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.active=e.currentTarget.active.checked;await v4mutate(()=>row?window.raff4.updateEntity('branches',row.id,payload):window.raff4.createEntity('branches',payload),'تم حفظ الفرع');closeModal();renderRoute();});}});}
function openLocationForm(row=null){const d=RAFF4_STATE.data;const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل الموقع':'موقع جديد'}</h3><p>قالب للقاعة والخزانة والرف</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="locationForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>اسم الموقع *</label><input name="name" required value="${v4e(row?.name||'')}"></div><div class="v4-field"><label>الكود</label><input name="code" value="${v4e(row?.code||'')}"></div><div class="v4-field"><label>الفرع</label><select name="branchId">${v4selectOptions(d.branches,row?.branchId||d.settings.activeBranchId)}</select></div><div class="v4-field"><label>القاعة/الخزانة</label><input name="room" value="${v4e(row?.room||'')}"></div><div class="v4-field"><label>الرف</label><input name="shelf" value="${v4e(row?.shelf||'')}"></div><label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>موقع نشط</span></label></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#locationForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.active=e.currentTarget.active.checked;await v4mutate(()=>row?window.raff4.updateEntity('locations',row.id,payload):window.raff4.createEntity('locations',payload),'تم حفظ الموقع');closeModal();renderRoute();});}});}

function renderV4Policies(root){if(!RAFF4_STATE.data){v4loading(root);refreshRaff4State().then(()=>renderV4Policies(root));return;}const d=RAFF4_STATE.data,rows=d.policies.filter((x)=>!x.deletedAt);root.innerHTML=`<div class="v4-page">${v4pageHead('الإدارة','سياسات الإعارة','قواعد واضحة حسب فئة المستعير ونوع المادة والفرع، بدل إعداد عام واحد.',`${v4action('سياسة جديدة','new-policy','plus','primary')}${v4action('فئة مستعير','new-patron-category','plus')}${v4action('نوع مادة','new-material-type','plus')}`)}<div class="entity-cards">${rows.map((p)=>`<article class="entity-card"><div class="entity-card-head"><div><h3>${v4e(p.name)}</h3><p>${v4e(d.patronCategories.find((x)=>x.id===p.patronCategoryId)?.name||'كل الفئات')} · ${v4e(d.materialTypes.find((x)=>x.id===p.materialTypeId)?.name||'كل المواد')}</p></div>${v4status(p.active===false?'expired':'active')}</div><div class="entity-card-meta"><div><small>مدة الإعارة</small><b>${p.loanDays} يومًا</b></div><div><small>الحد الأقصى</small><b>${p.maxItems} مواد</b></div><div><small>التجديد</small><b>${p.maxRenewals} مرات</b></div><div><small>الحجز</small><b>${p.allowHolds?'مسموح':'ممنوع'}</b></div></div><div class="v4-table-actions" style="margin-top:10px;">${v4iconButton('edit-policy',p.id,'edit','تعديل')}${p.id!=='policy_default'?v4iconButton('delete-entity',p.id,'trash','حذف','danger').replace('data-id=','data-entity="policies" data-id='):''}</div></article>`).join('')}</div><div class="v4-grid cols-2"><section class="v4-card"><div class="v4-card-head"><h3>فئات المستعيرين</h3></div><div class="v4-card-body"><div class="v4-kpi-list">${d.patronCategories.filter((x)=>!x.deletedAt).map((x)=>`<div class="v4-kpi-row"><span><b style="display:block;color:var(--foreground);">${v4e(x.name)}</b>${x.loanDays} يومًا · ${x.maxItems} مواد</span><div class="v4-table-actions">${v4iconButton('edit-patron-category',x.id,'edit','تعديل')}${x.id!=='patron_general'?v4iconButton('delete-entity',x.id,'trash','حذف','danger').replace('data-id=','data-entity="patronCategories" data-id='):''}</div></div>`).join('')}</div></div></section><section class="v4-card"><div class="v4-card-head"><h3>أنواع المواد</h3></div><div class="v4-card-body"><div class="v4-kpi-list">${d.materialTypes.filter((x)=>!x.deletedAt).map((x)=>`<div class="v4-kpi-row"><span><b style="display:block;color:var(--foreground);">${v4e(x.name)}</b>${x.referenceOnly?'للاطلاع الداخلي':x.loanable?'قابلة للإعارة':'غير قابلة للإعارة'}</span><div class="v4-table-actions">${v4iconButton('edit-material-type',x.id,'edit','تعديل')}${x.id!=='material_book'?v4iconButton('delete-entity',x.id,'trash','حذف','danger').replace('data-id=','data-entity="materialTypes" data-id='):''}</div></div>`).join('')}</div></div></section></div></div>`;}
function openPolicyForm(row=null){const d=RAFF4_STATE.data;const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل سياسة الإعارة':'سياسة إعارة جديدة'}</h3><p>تطبق القاعدة الأكثر تحديدًا تلقائيًا</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="policyForm" class="v4-form"><div class="v4-form-grid cols-3"><div class="v4-field span-3"><label>اسم السياسة *</label><input name="name" required value="${v4e(row?.name||'')}"></div><div class="v4-field"><label>فئة المستعير</label><select name="patronCategoryId">${v4selectOptions(d.patronCategories,row?.patronCategoryId||'patron_general')}</select></div><div class="v4-field"><label>نوع المادة</label><select name="materialTypeId">${v4selectOptions(d.materialTypes,row?.materialTypeId||'material_book')}</select></div><div class="v4-field"><label>الفرع</label><select name="branchId">${v4selectOptions(d.branches,row?.branchId||'','name','id','كل الفروع')}</select></div><div class="v4-field"><label>مدة الإعارة بالأيام</label><input name="loanDays" type="number" min="1" value="${v4e(row?.loanDays||30)}"></div><div class="v4-field"><label>فترة السماح</label><input name="graceDays" type="number" min="0" value="${v4e(row?.graceDays||0)}"></div><div class="v4-field"><label>الحد الأقصى للمواد</label><input name="maxItems" type="number" min="1" value="${v4e(row?.maxItems||5)}"></div><div class="v4-field"><label>التجديدات</label><input name="maxRenewals" type="number" min="0" value="${v4e(row?.maxRenewals||2)}"></div><div class="v4-field"><label>الرسم اليومي الاختياري</label><input name="finePerDay" type="number" min="0" step="0.01" value="${v4e(row?.finePerDay||0)}"></div><div class="v4-field"><label>حد الرسم</label><input name="maxFine" type="number" min="0" step="0.01" value="${v4e(row?.maxFine||0)}"></div><label class="v4-checkbox"><input name="allowHolds" type="checkbox" ${row?.allowHolds!==false?'checked':''}><span>السماح بالحجز</span></label><label class="v4-checkbox"><input name="allowRenewalWhenHeld" type="checkbox" ${row?.allowRenewalWhenHeld?'checked':''}><span>السماح بالتجديد مع وجود حجز</span></label><label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>سياسة نشطة</span></label></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ السياسة</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#policyForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());for(const k of ['allowHolds','allowRenewalWhenHeld','active'])payload[k]=e.currentTarget[k].checked;await v4mutate(()=>row?window.raff4.updateEntity('policies',row.id,payload):window.raff4.createEntity('policies',payload),'تم حفظ السياسة');closeModal();renderRoute();});}});}
function openSimpleNamedForm(entity,row=null){const labels={patronCategories:['فئة مستعير','الحد الأقصى','مدة الإعارة'],materialTypes:['نوع مادة','قابلية الإعارة','الاطلاع الداخلي']};const [title]=labels[entity];const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل':'إضافة'} ${title}</h3><p>قيمة محلية تظهر في النماذج والسياسات</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="simpleNamedForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>الاسم *</label><input name="name" required value="${v4e(row?.name||'')}"></div><div class="v4-field"><label>الكود</label><input name="code" value="${v4e(row?.code||'')}"></div>${entity==='patronCategories'?`<div class="v4-field"><label>الحد الأقصى</label><input name="maxItems" type="number" min="1" value="${v4e(row?.maxItems||5)}"></div><div class="v4-field"><label>مدة الإعارة</label><input name="loanDays" type="number" min="1" value="${v4e(row?.loanDays||30)}"></div>`:`<label class="v4-checkbox"><input name="loanable" type="checkbox" ${row?.loanable!==false?'checked':''}><span>قابل للإعارة</span></label><label class="v4-checkbox"><input name="referenceOnly" type="checkbox" ${row?.referenceOnly?'checked':''}><span>للاطلاع الداخلي فقط</span></label>`}<label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>نشط</span></label></div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#simpleNamedForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());for(const k of ['loanable','referenceOnly','active'])if(e.currentTarget[k])payload[k]=e.currentTarget[k].checked;await v4mutate(()=>row?window.raff4.updateEntity(entity,row.id,payload):window.raff4.createEntity(entity,payload),'تم الحفظ');closeModal();renderRoute();});}});}

function renderV4Users(root){if(!RAFF4_STATE.data){v4loading(root);refreshRaff4State().then(()=>renderV4Users(root));return;}const d=RAFF4_STATE.data,rows=d.users.filter((x)=>!x.deletedAt);const roleLabels={admin:'مدير النظام',librarian:'أمين مكتبة',cataloger:'مفهرس',circulation:'موظف إعارة',inventory:'موظف جرد',viewer:'قراءة فقط',publisher:'مسؤول دار نشر'};root.innerHTML=`<div class="v4-page">${v4pageHead('الإدارة','المستخدمون والصلاحيات','حسابات محلية بأدوار واضحة، مع رمز PIN اختياري وسجل لكل عملية.',v4action('مستخدم جديد','new-user','plus','primary'))}<div class="v4-note warning">المستخدم الافتراضي «مدير النظام» لا يطلب رمزًا حتى تضبط رمز PIN. لا تُخزن الرموز كنص صريح.</div><div class="entity-cards">${rows.map((u)=>`<article class="entity-card"><div class="entity-card-head"><div style="display:flex;gap:10px;align-items:center;"><span class="user-switch-avatar">${v4e(v4initials(u.displayName))}</span><div><h3>${v4e(u.displayName)}</h3><p>${v4e(u.username)} · ${v4e(roleLabels[u.role]||u.role)}</p></div></div>${u.id===d.settings.activeUserId?'<span class="v4-badge success">نشط الآن</span>':v4status(u.active===false?'expired':'active')}</div><div class="entity-card-meta"><div><small>الدور</small><b>${v4e(roleLabels[u.role]||u.role)}</b></div><div><small>رمز PIN</small><b>${u.hasPin?'مفعّل':'غير مفعّل'}</b></div></div><div class="v4-table-actions" style="margin-top:10px;">${v4iconButton('switch-user',u.id,'user','تبديل المستخدم')}${v4iconButton('edit-user',u.id,'edit','تعديل')}${u.id!=='user_admin'?v4iconButton('delete-entity',u.id,'trash','حذف','danger').replace('data-id=','data-entity="users" data-id='):''}</div></article>`).join('')}</div></div>`;}
function openUserForm(row=null){const html=`<div class="v4-modal-head"><div><h3>${row?'تعديل المستخدم':'مستخدم جديد'}</h3><p>حدد الدور ثم أضف رمز PIN عند الحاجة</p></div><button class="v4-icon-btn" id="v4ModalClose">${icon('x',15)}</button></div><div class="v4-modal-body"><form id="userForm" class="v4-form"><div class="v4-form-grid"><div class="v4-field"><label>الاسم الظاهر *</label><input name="displayName" required value="${v4e(row?.displayName||'')}"></div><div class="v4-field"><label>اسم الدخول *</label><input name="username" class="v4-ltr" required value="${v4e(row?.username||'')}"></div><div class="v4-field"><label>الدور</label><select name="role">${[['admin','مدير النظام'],['librarian','أمين مكتبة'],['cataloger','مفهرس'],['circulation','موظف إعارة'],['inventory','موظف جرد'],['viewer','قراءة فقط'],['publisher','مسؤول دار نشر']].map(([v,l])=>`<option value="${v}" ${row?.role===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="v4-field"><label>${row?'رمز PIN جديد (اتركه فارغًا للإبقاء)':'رمز PIN اختياري'}</label><input name="pin" type="password" inputmode="numeric" maxlength="32"></div><label class="v4-checkbox"><input name="active" type="checkbox" ${row?.active!==false?'checked':''}><span>حساب نشط</span></label></div><div class="v4-note">الأدوار تضبط مساحة العمل المقترحة، ويمكن توسيع الصلاحيات الدقيقة لاحقًا من ملف المستخدم.</div><div class="v4-form-actions"><button type="button" class="v4-action ghost" id="v4Cancel">إلغاء</button><button class="v4-action primary" type="submit">حفظ المستخدم</button></div></form></div>`;openModal(html,{onMount:(o)=>{o.classList.add('v4-modal');o.querySelector('#v4ModalClose').onclick=closeModal;o.querySelector('#v4Cancel').onclick=closeModal;o.querySelector('#userForm').addEventListener('submit',async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.active=e.currentTarget.active.checked;if(!payload.pin)delete payload.pin;await v4mutate(()=>row?window.raff4.updateEntity('users',row.id,payload):window.raff4.createEntity('users',payload),'تم حفظ المستخدم');closeModal();renderRoute();});}});}

