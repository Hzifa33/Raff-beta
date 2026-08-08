'use strict';

const ROUTES = {
  dashboard: { title: 'لوحة المعلومات', subtitle: 'نظرة عامة على مكتبتك', render: (root) => renderDashboard(root) },
  search: { title: 'البحث المتقدم', subtitle: 'بحث استكشافي حي ببطاقات — للعثور السريع على كتاب', render: (root, ctx) => renderBookBrowser(root, ctx) },
  add: { title: 'إضافة كتاب جديد', subtitle: 'سجّل بيانات كتاب جديد في المكتبة', render: (root) => renderAddForm(root, null) },
  library: { title: 'السجل الكامل', subtitle: 'عرض منظم قابل للفرز، بما في ذلك وقت الإضافة', render: (root) => {
    const quick = document.getElementById('quickSearchInput');
    if (quick) quick.value = '';
    renderLibraryTable(root);
  } },
  loans: { title: 'الإعارات والمستعيرون', subtitle: 'متابعة الإعارات المفتوحة والمتأخرة ودليل المستعيرين', render: (root) => renderLoansView(root) },
  stats: { title: 'الإحصائيات', subtitle: 'أرقام وتحليلات حول مكتبتك', render: (root) => renderStats(root) },
  reports: { title: 'الاستدعاء', subtitle: 'استدعِ مستعيراً أو دار نشر أو مؤلفاً واحصل على تحليل كامل بالأرقام', render: (root) => renderReports(root) },
  scan: { title: 'المسح الضوئي والباركود', subtitle: 'امسح باركود كتاب لعرض بياناته فوراً، أو اطبع ملصقات الباركود', render: (root) => renderScanView(root) },
  settings: { title: 'الإعدادات والنسخ', subtitle: 'الهوية والملصقات ومدة الإعارة والنسخ الاحتياطي', render: (root) => renderSettings(root) },
  edit: { title: 'تعديل بيانات الكتاب', subtitle: '', render: (root, ctx) => renderAddForm(root, ctx.book) },
};

let currentRoute = 'dashboard';
let _globalScanner = null;
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

let _sidebarTransitionTimer = null;

function applySidebarState(collapsed, { persist = true } = {}) {
  document.documentElement.classList.remove('sidebar-precollapsed');
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  document.body.classList.toggle('sidebar-expanded', !collapsed);
  document.getElementById('sidebar')?.classList.toggle('is-collapsed', !!collapsed);
  document.body.classList.add('sidebar-transitioning');
  clearTimeout(_sidebarTransitionTimer);
  _sidebarTransitionTimer = setTimeout(() => document.body.classList.remove('sidebar-transitioning'), 390);
  hideSidebarTooltip();
  if (persist) {
    try { localStorage.setItem(UI_PREFS.sidebar, String(!!collapsed)); } catch (_) {}
  }

  const label = collapsed ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية';
  const rail = document.getElementById('sidebarToggle');
  if (rail) {
    rail.dataset.tooltip = label;
    rail.setAttribute('aria-label', label);
    rail.setAttribute('aria-expanded', String(!collapsed));
    rail.removeAttribute('title');
  }
  const topRail = document.getElementById('topbarSidebarToggle');
  if (topRail) {
    topRail.dataset.tooltip = label;
    topRail.setAttribute('aria-label', label);
    topRail.setAttribute('aria-expanded', String(!collapsed));
    topRail.removeAttribute('title');
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
  const label = target.getAttribute('aria-label') || target.dataset.tooltip || '';
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

  sidebar.querySelectorAll('.nav-item, .credit-link, .access-mode-switch').forEach((el) => {
    const label = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    if (label) el.dataset.tooltip = label;
    // Native title bubbles are clipped by the application rail and may appear
    // at inconsistent positions. The dedicated tooltip below is accessible,
    // immediate and always rendered outside the clipped shell.
    el.removeAttribute('title');
  });

  sidebar.addEventListener('pointerover', (event) => {
    const target = event.target.closest('.nav-item, .credit-link, .access-mode-switch');
    if (target && target !== _sidebarTooltipTarget) showSidebarTooltip(target);
  });
  sidebar.addEventListener('pointerout', (event) => {
    const target = event.target.closest('.nav-item, .credit-link, .access-mode-switch');
    if (!target) return;
    if (!event.relatedTarget || !target.contains(event.relatedTarget)) hideSidebarTooltip();
  });
  sidebar.addEventListener('focusin', (event) => {
    const target = event.target.closest('.nav-item, .credit-link, .access-mode-switch');
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
  if (!isAdminMode() && !allowedPublicRoute(route)) {
    showAdminLoginModal();
    return;
  }
  currentRoute = route;
  currentCtx = ctx;
  renderRoute();
}

function renderRoute() {
  if (!isAdminMode() && !allowedPublicRoute(currentRoute)) {
    currentRoute = 'search';
    currentCtx = {};
  }
  const def = ROUTES[currentRoute] || (isAdminMode() ? ROUTES.dashboard : ROUTES.search);
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
  const library = document.getElementById('navLibraryCount');
  if (library) library.textContent = RAFF_STATE.books.length;
  const loans = document.getElementById('navLoansCount');
  if (loans) {
    const open = RAFF_STATE.books.reduce((sum, book) => sum + (book.loans || []).filter((loan) => RaffBook.isLoanActive(loan, book)).length, 0);
    loans.textContent = open;
    loans.hidden = open === 0;
  }
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
    if (!await requireAdminMode()) return;
    const book = RAFF_STATE.books.find((b) => b.id === editBtn.dataset.id);
    if (book) navigateTo('edit', { book });
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    if (!await requireAdminMode()) return;
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
  _browserFilters.query = value;

  if (currentRoute === 'search') {
    syncFilterInputValue(value);
    scheduleBookResults();
  } else {
    _browserFilters.field = 'all';
    navigateTo('search', { presetQuery: value });
  }
});

document.getElementById('quickAddBtn').addEventListener('click', async () => { if (await requireAdminMode()) navigateTo('add'); });

/* ---- Predictive suggestions for the topbar search ---- */
createAutocomplete(document.getElementById('quickSearchInput'), {
  getPool: () => RAFF_STATE.suggestions,
  onSelect: (label) => {
    _browserFilters.query = label;
    _browserFilters.field = 'all';
    if (currentRoute === 'search') {
      syncFilterInputValue(label);
      updateBookResults({ resetScroll: true });
    } else {
      navigateTo('search', { presetQuery: label });
    }
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
    if (isAdminMode()) navigateTo('add');
    else showAdminLoginModal();
    return;
  }
  // Ctrl+S saves whichever book form is open.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const form = document.getElementById('bookForm');
    if (form && isAdminMode()) {
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

function showDatabaseRecoveryModal(recovery) {
  const backups = recovery.backups || [];
  const titleId = `dbRecoveryTitle-${Date.now()}`;
  openModal(`
    <div class="modal-body recovery-modal-body">
      <div class="security-modal-head">
        <div class="security-modal-icon danger">${icon('alert', 20)}</div>
        <div><h3 class="modal-title" id="${titleId}">تعذر فتح قاعدة البيانات السابقة</h3><p class="text-muted">حُفظ الملف غير المقروء وبدأ البرنامج بقاعدة آمنة جديدة. اختر نسخة احتياطية لاستعادة المكتبة.</p></div>
      </div>
      <div class="backup-recovery-list">
        ${backups.length ? backups.map((b) => `<button class="backup-recovery-item" data-backup-path="${(b.filePath || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><span><b>${b.books ?? '—'} كتاب</b><small>${new Date(b.createdAt).toLocaleString('ar-EG')}</small></span><span>${Math.max(1, Math.round((b.size || 0) / 1024))} ك.ب</span></button>`).join('') : '<p class="text-muted">لم يُعثر على نسخة احتياطية جاهزة.</p>'}
      </div>
      <div class="form-actions"><button class="btn btn-ghost" id="recoveryOpenFolder">فتح مجلد البيانات</button><button class="btn btn-outline" id="recoveryContinue">المتابعة بقاعدة جديدة</button></div>
    </div>`, {
    labelledBy: titleId,
    modalClass: 'modal-medium',
    onMount: (overlay) => {
      overlay.querySelector('#recoveryContinue').addEventListener('click', closeModal);
      overlay.querySelector('#recoveryOpenFolder').addEventListener('click', () => raffBrowseDataFolder());
      overlay.querySelectorAll('[data-backup-path]').forEach((btn) => btn.addEventListener('click', async () => {
        const ok = await confirmModal({ title: 'استعادة هذه النسخة؟', message: 'ستستبدل النسخة قاعدة البيانات الجديدة الفارغة، مع إنشاء نسخة أمان قبل الاستعادة.', confirmLabel: 'استعادة', danger: false });
        if (!ok) return;
        const result = await window.raff.restoreListedBackup(btn.dataset.backupPath);
        if (!result.ok) { toast(result.error || 'فشلت الاستعادة', 'error'); return; }
        closeModal();
        await refreshState(); renderNavCounts(); navigateTo('dashboard');
        toast(`تمت استعادة ${result.books} كتاب`, 'success');
      }));
    },
  });
}

function restartGlobalScanner() {
  try { _globalScanner?.destroy?.(); } catch (_) {}
  _globalScanner = null;
  if (typeof RaffScanner === 'undefined') return;
  _globalScanner = RaffScanner.createScanner({
    maxGap: Number(RAFF_STATE.settings?.scannerGapMs) || 35,
    terminator: RAFF_STATE.settings?.scannerTerminator || 'Enter',
    onScan: (code) => handleScannedCode(code),
  });
}
window.restartGlobalScanner = restartGlobalScanner;

(async function init() {
  initAppearanceControls();
  await initAccessControl();
  await refreshState();
  if (!isAdminMode()) currentRoute = 'search';
  applyAccessMode({ rerender: false });
  renderNavCounts();
  renderRoute();

  // Global barcode-scanner listener: works no matter which view is open and
  // honours the locally-configured timing sensitivity.
  restartGlobalScanner();

  if (isAdminMode()) {
    const recovery = await window.raff.getRecoveryState();
    if (recovery.ok && recovery.notice) showDatabaseRecoveryModal(recovery);
  }
})();
