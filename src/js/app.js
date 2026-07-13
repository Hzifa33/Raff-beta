'use strict';

const ROUTES = {
  dashboard: { title: 'لوحة المعلومات', subtitle: 'نظرة عامة على مكتبتك', render: (root) => renderDashboard(root) },
  search: { title: 'البحث المتقدم', subtitle: 'بحث استكشافي حي ببطاقات — للعثور السريع على كتاب', render: (root, ctx) => renderBookBrowser(root, ctx) },
  add: { title: 'إضافة كتاب جديد', subtitle: 'سجّل بيانات كتاب جديد في المكتبة', render: (root) => renderAddForm(root, null) },
  library: { title: 'السجل الكامل', subtitle: 'جدول قابل للفرز بكل أعمدة المكتبة', render: (root) => {
    const quick = document.getElementById('quickSearchInput');
    if (quick) quick.value = '';
    renderLibraryTable(root);
  } },
  stats: { title: 'الإحصائيات', subtitle: 'أرقام وتحليلات حول مكتبتك', render: (root) => renderStats(root) },
  reports: { title: 'الاستدعاء', subtitle: 'استدعِ مستعيراً أو دار نشر أو مؤلفاً واحصل على تحليل كامل بالأرقام', render: (root) => renderReports(root) },
  scan: { title: 'المسح الضوئي والباركود', subtitle: 'امسح باركود كتاب لعرض بياناته فوراً، أو اطبع ملصقات الباركود', render: (root) => renderScanView(root) },
  settings: { title: 'الإعدادات والنسخ', subtitle: 'الهوية والملصقات ومدة الإعارة والنسخ الاحتياطي', render: (root) => renderSettings(root) },
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
  const modeLabel = document.getElementById('themeModeLabel');
  if (modeLabel) modeLabel.textContent = nextLabel;
  [document.getElementById('sidebarThemeToggle'), document.getElementById('topbarThemeToggle')]
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

function initAppearanceControls() {
  let savedCollapsed = false;
  try { savedCollapsed = localStorage.getItem(UI_PREFS.sidebar) === 'true'; } catch (_) {}
  applyTheme(currentTheme(), { persist: false });
  applySidebarState(savedCollapsed, { persist: false });

  document.getElementById('sidebarThemeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('topbarThemeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('topbarSidebarToggle')?.addEventListener('click', toggleSidebar);
}

function navigateTo(route, ctx = {}) {
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
    el.classList.toggle('active', navRoute === currentRoute || (navRoute === 'library' && currentRoute === 'edit'));
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
  document.getElementById('navLibraryCount').textContent = RAFF_STATE.books.length;
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
  _browserFilters.query = value;

  if (currentRoute === 'search') {
    syncFilterInputValue(value);
    scheduleBookResults();
  } else {
    _browserFilters.field = 'all';
    navigateTo('search', { presetQuery: value });
  }
});

document.getElementById('quickAddBtn').addEventListener('click', () => navigateTo('add'));

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
    navigateTo('add');
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
 * Finds a book by exact reference number (case-insensitive, trimmed). Returns
 * the book or null. Used by the barcode scanner and manual lookup.
 */
function findBookByReference(ref) {
  if (!ref) return null;
  const needle = ref.trim().toLowerCase();
  return RAFF_STATE.books.find((b) => (b.referenceNumber || '').trim().toLowerCase() === needle) || null;
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
  renderNavCounts();
  renderRoute();

  // Global barcode-scanner listener: works no matter which view is open.
  if (typeof RaffScanner !== 'undefined') {
    RaffScanner.createScanner({
      onScan: (code) => handleScannedCode(code),
    });
  }
})();
