'use strict';

const ROUTES = {
  dashboard: { title: 'لوحة المعلومات', subtitle: 'نظرة عملية هادئة على المجموعة والخدمة اليومية', render: (root) => renderV4Dashboard(root) },
  opac: { title: 'فهرس الباحث', subtitle: 'ابحث عن الكتاب ومكانه وإتاحته دون أدوات إدارية معقدة', render: (root) => renderV4Opac(root) },
  'reading-lists': { title: 'قوائم القراءة', subtitle: 'قوائم محلية للباحثين والبرامج الثقافية', render: (root) => renderV4ReadingLists(root) },
  notifications: { title: 'التنبيهات', subtitle: 'المواعيد والحجوزات والتزويد والنقل في مركز واحد', render: (root) => renderV4Notifications(root) },
  circulation: { title: 'مكتب الإعارة', subtitle: 'إعارة وإرجاع وتجديد سريع قائم على النسخ المادية', render: (root) => renderV4Circulation(root) },
  patrons: { title: 'المستعيرون', subtitle: 'العضويات وسجل الاستخدام والقيود المحلية', render: (root) => renderV4Patrons(root) },
  holds: { title: 'الحجوزات', subtitle: 'قوائم الانتظار وتجهيز النسخ للاستلام', render: (root) => renderV4Holds(root) },
  inventory: { title: 'الجرد الميداني', subtitle: 'جلسات مسح بالباركود ومقارنة الموجود بالسجل', render: (root) => renderV4Inventory(root) },
  catalog: { title: 'السجلات والمقتنيات', subtitle: 'سجل ببليوغرافي ثم مقتنى ثم نسخة مادية مستقلة', render: (root) => renderV4Catalog(root) },
  authorities: { title: 'الضبط الاستنادي', subtitle: 'توحيد المؤلفين والموضوعات والسلاسل ومنع التكرار', render: (root) => renderV4Authorities(root) },
  exchange: { title: 'الاستيراد والتبادل', subtitle: 'MARCXML وBibTeX وRIS وحزم نقل محلية', render: (root) => renderV4Exchange(root) },
  acquisitions: { title: 'التزويد والمشتريات', subtitle: 'طلبات الشراء والموردون والاستلام والميزانيات', render: (root) => renderV4Acquisitions(root) },
  serials: { title: 'الدوريات', subtitle: 'الاشتراكات والأعداد المتوقعة والمتأخرة', render: (root) => renderV4Serials(root) },
  publisher: { title: 'وضع دار النشر', subtitle: 'الإصدارات والطبعات والمخزون والتوزيع محليًا', render: (root) => renderV4Publisher(root) },
  branches: { title: 'الفروع والمواقع', subtitle: 'هيكل المكتبة والقاعات والخزائن والرفوف', render: (root) => renderV4Branches(root) },
  policies: { title: 'سياسات الإعارة', subtitle: 'قواعد حسب نوع المستعير والمادة والفرع', render: (root) => renderV4Policies(root) },
  users: { title: 'المستخدمون والصلاحيات', subtitle: 'حسابات محلية وأدوار واضحة وسجل عمليات', render: (root) => renderV4Users(root) },
  audit: { title: 'سجل التدقيق', subtitle: 'تاريخ محلي لكل عملية حساسة', render: (root) => renderV4Audit(root) },
  trash: { title: 'سلة المحذوفات', subtitle: 'استعادة آمنة قبل الحذف النهائي', render: (root) => renderV4Trash(root) },
  search: { title: 'البحث المتقدم التقليدي', subtitle: 'بحث حي داخل بيانات الإصدار السابق', render: (root, ctx) => renderBookBrowser(root, ctx) },
  add: { title: 'إضافة سريعة', subtitle: 'إضافة كتاب بالحقول الأساسية ثم إكماله من السجل المتقدم', render: (root) => renderAddForm(root, null) },
  library: { title: 'السجل التقليدي', subtitle: 'عرض توافق للإصدارات السابقة', render: (root) => {
    const quick = document.getElementById('quickSearchInput');
    if (quick) quick.value = '';
    renderLibraryTable(root);
  } },
  stats: { title: 'الإحصائيات التقليدية', subtitle: 'أرقام وتحليلات حول المكتبة', render: (root) => renderStats(root) },
  reports: { title: 'التقارير ولوحة القرار', subtitle: 'تحليلات المجموعة والإعارة والجودة وتقارير قابلة للتصدير', render: (root) => renderV4Reports(root) },
  scan: { title: 'المسح والباركود', subtitle: 'استدعاء النسخ وملصقات الباركود', render: (root) => renderScanView(root) },
  settings: { title: 'الإعدادات والنسخ', subtitle: 'الواجهة والوحدات والخصوصية والنسخ الاحتياطية', render: (root) => renderRaff4Settings(root) },
  edit: { title: 'تعديل بيانات الكتاب', subtitle: '', render: (root, ctx) => renderAddForm(root, ctx.book) },
};

let currentRoute = 'dashboard';
let currentCtx = {};

/* =========================================================
   Visual preferences: light/dark mode + collapsible sidebar
   ========================================================= */
const UI_PREFS = {
  theme: 'raff.theme',
  sidebar: 'raff.sidebarCollapsed',
};

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, { persist = true } = {}) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) {
    try { localStorage.setItem(UI_PREFS.theme, next); } catch (_) {}
  }

  const nextLabel = next === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
  [document.getElementById('topbarThemeToggle')]
    .filter(Boolean)
    .forEach((btn) => {
      btn.title = `التبديل إلى ${nextLabel}`;
      btn.setAttribute('aria-label', `التبديل إلى ${nextLabel}`);
      btn.setAttribute('aria-pressed', String(next === 'dark'));
    });
}

function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

function sidebarIsCollapsed() {
  return document.body.classList.contains('sidebar-collapsed');
}

function applySidebarState(collapsed, { persist = true } = {}) {
  document.documentElement.classList.remove('sidebar-precollapsed');
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  document.body.classList.toggle('sidebar-expanded', !collapsed);
  hideSidebarTooltip();
  if (persist) {
    try { localStorage.setItem(UI_PREFS.sidebar, String(!!collapsed)); } catch (_) {}
  }

  const label = collapsed ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية';
  const rail = document.getElementById('sidebarToggle');
  if (rail) {
    rail.title = label;
    rail.setAttribute('aria-label', label);
    rail.setAttribute('aria-expanded', String(!collapsed));
  }
  const topRail = document.getElementById('topbarSidebarToggle');
  if (topRail) {
    topRail.title = label;
    topRail.setAttribute('aria-label', label);
    topRail.setAttribute('aria-expanded', String(!collapsed));
  }
}

function toggleSidebar() {
  applySidebarState(!sidebarIsCollapsed());
}

let _sidebarTooltip = null;
let _sidebarTooltipTarget = null;

function ensureSidebarTooltip() {
  if (_sidebarTooltip) return _sidebarTooltip;
  const el = document.createElement('div');
  el.className = 'sidebar-tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  _sidebarTooltip = el;
  return el;
}

function hideSidebarTooltip() {
  if (!_sidebarTooltip) return;
  _sidebarTooltip.hidden = true;
  _sidebarTooltip.classList.remove('is-visible');
  _sidebarTooltipTarget = null;
}

function showSidebarTooltip(target) {
  if (!sidebarIsCollapsed() || !target) return;
  const label = target.dataset.tooltip || target.getAttribute('aria-label') || '';
  if (!label) return;

  const tip = ensureSidebarTooltip();
  tip.textContent = label;
  tip.hidden = false;
  tip.classList.add('is-visible');
  _sidebarTooltipTarget = target;

  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const gap = 10;
  const left = Math.max(8, rect.left - tipRect.width - gap);
  const top = Math.min(
    window.innerHeight - tipRect.height - 8,
    Math.max(8, rect.top + (rect.height - tipRect.height) / 2)
  );
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function initSidebarTooltips() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.nav-item, .credit-link').forEach((el) => {
    const label = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    if (label) el.dataset.tooltip = label;
    // Native title bubbles are clipped by the application rail and may appear
    // at inconsistent positions. The dedicated tooltip below is accessible,
    // immediate and always rendered outside the clipped shell.
    el.removeAttribute('title');
  });

  sidebar.addEventListener('pointerover', (event) => {
    const target = event.target.closest('.nav-item, .credit-link');
    if (target && target !== _sidebarTooltipTarget) showSidebarTooltip(target);
  });
  sidebar.addEventListener('pointerout', (event) => {
    const target = event.target.closest('.nav-item, .credit-link');
    if (!target) return;
    if (!event.relatedTarget || !target.contains(event.relatedTarget)) hideSidebarTooltip();
  });
  sidebar.addEventListener('focusin', (event) => {
    const target = event.target.closest('.nav-item, .credit-link');
    if (target) showSidebarTooltip(target);
  });
  sidebar.addEventListener('focusout', hideSidebarTooltip);
  sidebar.addEventListener('scroll', hideSidebarTooltip, { passive: true });
  window.addEventListener('resize', hideSidebarTooltip, { passive: true });
}

function initAppearanceControls() {
  let savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem(UI_PREFS.sidebar) === 'true'; } catch (_) {}
  applyTheme(currentTheme(), { persist: false });
  applySidebarState(savedCollapsed, { persist: false });

  document.getElementById('topbarThemeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('topbarSidebarToggle')?.addEventListener('click', toggleSidebar);
  initSidebarTooltips();
}

function navigateTo(route, ctx = {}) {
  hideSidebarTooltip();
  if (typeof v4RouteAllowed === 'function' && RAFF4_STATE?.data && !v4RouteAllowed(route)) {
    toast('هذه الصفحة غير متاحة لدور المستخدم الحالي', 'error');
    route = v4RouteAllowed('dashboard') ? 'dashboard' : 'opac';
    ctx = {};
  }
  currentRoute = route;
  currentCtx = ctx;
  renderRoute();
}

function renderRoute() {
  const def = ROUTES[currentRoute] || ROUTES.dashboard;
  document.getElementById('pageTitle').textContent = def.title;
  document.getElementById('pageSubtitle').textContent = def.subtitle;

  document.querySelectorAll('.nav-item').forEach((el) => {
    const navRoute = el.dataset.route;
    const active = navRoute === currentRoute || (navRoute === 'library' && currentRoute === 'edit');
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  const root = document.getElementById('viewRoot');
  root.classList.remove('view-enter');
  def.render(root, currentCtx);
  root.scrollTop = 0;
  // Restart the subtle route transition without delaying interaction.
  void root.offsetWidth;
  root.classList.add('view-enter');
}

function renderNavCounts() {
  const el = document.getElementById('navLibraryCount');
  const advancedCount = RAFF4_STATE?.data?.records?.filter((r) => !r.deletedAt).length;
  if (el) el.textContent = Number.isFinite(advancedCount) ? advancedCount : RAFF_STATE.books.length;
  const note = document.getElementById('navNotificationCount');
  const unread = RAFF4_STATE?.data?.notifications?.filter((n) => !n.read).length || 0;
  if (note) { note.textContent = unread; note.hidden = unread === 0; }
}

/* ---- Global click delegation: nav buttons, book row edit/delete, empty-state CTAs ---- */
document.addEventListener('click', async (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    navigateTo(navBtn.dataset.nav);
    return;
  }

  const navItem = e.target.closest('.nav-item[data-route]');
  if (navItem) {
    navigateTo(navItem.dataset.route);
    return;
  }

  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    const book = RAFF_STATE.books.find((b) => b.id === editBtn.dataset.id);
    if (book) navigateTo('edit', { book });
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    const book = RAFF_STATE.books.find((b) => b.id === deleteBtn.dataset.id);
    if (book) await deleteBookWithUndo(book);
    return;
  }

  // Clicking anywhere else on a row opens its details.
  const row = e.target.closest('.book-row[data-action="details"]');
  if (row) {
    showBookDetails(row.dataset.id);
    return;
  }

  // Library table rows.
  const libRow = e.target.closest('.lib-row[data-id]');
  if (libRow) {
    showBookDetails(libRow.dataset.id);
    return;
  }

  // Overdue banner items.
  const overdueItem = e.target.closest('.overdue-item[data-book]');
  if (overdueItem) {
    showBookDetails(overdueItem.dataset.book);
  }
});

/** Re-renders the current view; browsing views update in place to keep scroll. */
function refreshCurrentView() {
  if (currentRoute === 'search') {
    updateBookResults({ resetScroll: false });
  } else if (currentRoute === 'library') {
    if (typeof updateLibraryResults === 'function') updateLibraryResults();
    else renderRoute();
  } else {
    renderRoute();
  }
}

/* ---- Keyboard access for book rows ---- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest?.('.book-row[data-action="details"], .lib-row[data-id]');
  if (!row) return;
  e.preventDefault();
  showBookDetails(row.dataset.id);
});

/* ---- Topbar quick search ----
   Navigating on every keystroke would rebuild the view and pull focus out of
   this input. Once we're already on a browsing route we only refresh results. */
document.getElementById('quickSearchInput').addEventListener('input', (e) => {
  const value = e.target.value;
  if (currentRoute === 'opac') {
    RAFF4_STATE.opacQuery = value;
    const opacInput = document.getElementById('opacSearchInput');
    if (opacInput && opacInput.value !== value) {
      opacInput.value = value;
      opacInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else {
    RAFF4_STATE.opacQuery = value;
    navigateTo('opac');
  }
});

document.getElementById('quickAddBtn').addEventListener('click', () => { if (typeof openV4RecordForm === 'function') openV4RecordForm(); else navigateTo('add'); });

/* ---- Predictive suggestions for the topbar search ---- */
createAutocomplete(document.getElementById('quickSearchInput'), {
  getPool: () => RAFF_STATE.suggestions,
  onSelect: (label) => {
    RAFF4_STATE.opacQuery = label;
    navigateTo('opac');
  },
  typeLabels: SUGGESTION_TYPE_LABELS,
});

document.getElementById('devCreditLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.raff.openExternal('https://Hzifa33.github.io');
});

/* ---- Keyboard shortcuts ---- */
document.addEventListener('keydown', (e) => {
  const quick = document.getElementById('quickSearchInput');

  // Familiar desktop shortcuts: Ctrl+B toggles the rail; Ctrl+Shift+L toggles appearance.
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleSidebar();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    toggleTheme();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    quick.focus();
    quick.select();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (RAFF4_STATE?.data) openV4RecordForm(); else navigateTo('add');
    return;
  }
  // Ctrl+S saves whichever book form is open.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const form = document.getElementById('bookForm');
    if (form) {
      e.preventDefault();
      form.querySelector('button[type=submit]').click();
    }
    return;
  }
  // Escape clears the quick search when it holds focus.
  if (e.key === 'Escape' && document.activeElement === quick && quick.value) {
    quick.value = '';
    _browserFilters.query = '';
    if (currentRoute === 'search') {
      syncFilterInputValue('');
      updateBookResults({ resetScroll: true });
    }
  }
});

/* ---- Custom title bar window controls ---- */
(function initWindowControls() {
  const root = document.querySelector('.app-root');
  const maxBtn = document.getElementById('winMaximize');

  const applyState = ({ maximized }) => {
    root.classList.toggle('is-maximized', !!maximized);
    maxBtn.title = maximized ? 'استعادة' : 'تكبير';
    maxBtn.setAttribute('aria-label', maxBtn.title);
  };

  document.getElementById('winMinimize').addEventListener('click', () => window.raff.minimize());
  maxBtn.addEventListener('click', () => window.raff.toggleMaximize());
  document.getElementById('winClose').addEventListener('click', () => window.raff.close());

  // Double-clicking the drag area toggles maximize, matching OS behaviour.
  document.querySelector('.titlebar-drag').addEventListener('dblclick', () => window.raff.toggleMaximize());

  window.raff.onWindowStateChange(applyState);
  window.raff.isMaximized().then((maximized) => applyState({ maximized }));
})();

/* ---- Init ---- */
/**
 * Full-reference identity used by scanner/manual lookup. It cleans harmless
 * formatting differences but never compares a suffix, so raf-0001 and
 * raf-1001 remain different books.
 */
function referenceLookupIdentity(value) {
  const cleaned = (value ?? '').toString()
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
  const canonical = /^raf-(\d+)$/i.exec(cleaned);
  if (canonical) return 'raff:' + canonical[1].replace(/^0+(?=\d)/, '');
  return cleaned ? 'custom:' + cleaned.toLocaleLowerCase('en-US') : '';
}

function findBookByReference(ref) {
  const needle = referenceLookupIdentity(ref);
  if (!needle) return null;
  return RAFF_STATE.books.find((b) => referenceLookupIdentity(b.referenceNumber) === needle) || null;
}

/**
 * Handles a scanned or typed code from anywhere in the app. If it matches a
 * book, we jump to the scan view and show its data sheet; otherwise we report
 * that nothing matched so mislabelled books are caught immediately.
 */
function handleScannedCode(code) {
  const book = findBookByReference(code);
  if (book) {
    _lastScannedId = book.id;
    if (currentRoute !== 'scan') navigateTo('scan');
    else renderRoute();
    // Let the view render, then show the sheet.
    setTimeout(() => { if (typeof showScannedBook === 'function') showScannedBook(book.id); }, 30);
    toast(`تم العثور على: ${book.title || 'كتاب'}`, 'success', 1800);
  } else {
    toast(`لا يوجد كتاب بالرقم المرجعي: ${code}`, 'error', 3000);
  }
}

let _lastScannedId = null;

(async function init() {
  initAppearanceControls();
  await refreshState();
  if (typeof refreshRaff4State === 'function') await refreshRaff4State();
  if (typeof initV4Shell === 'function') initV4Shell();
  if (typeof initV4Extras === 'function') initV4Extras();
  renderNavCounts();
  renderRoute();

  // Global barcode-scanner listener: the advanced circulation and inventory
  // views consume their focused scan fields first; other scans fall back to
  // the compatible 2.x lookup screen.
  if (typeof RaffScanner !== 'undefined') {
    RaffScanner.createScanner({
      onScan: (code) => {
        const activeInventory = currentRoute === 'inventory' && RAFF4_STATE.activeInventoryId;
        if (activeInventory) {
          window.raff4.scanInventory(activeInventory, code).then(async () => { await refreshRaff4State(); renderRoute(); toast('تم تسجيل النسخة في الجرد', 'success'); }).catch((err) => toast(err.message, 'error'));
          return;
        }
        const circInput = currentRoute === 'circulation' ? document.getElementById('circItemSearch') : null;
        if (circInput) { circInput.value = code; circInput.dispatchEvent(new Event('input', { bubbles: true })); return; }
        handleScannedCode(code);
      },
    });
  }
})();
