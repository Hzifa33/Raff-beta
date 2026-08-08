'use strict';

let _loansViewState = { tab: 'loans', filter: 'open', query: '' };

function loanCenterStatus(loan) {
  if (!loan.active) return { label: 'مُعادة', cls: 'returned' };
  if (loan.overdue) return { label: `متأخرة ${loan.overdueDays} يوم`, cls: 'overdue' };
  if (loan.dueToday) return { label: 'تستحق اليوم', cls: 'today' };
  if (loan.dueSoon) return { label: 'تستحق قريباً', cls: 'soon' };
  if (loan.partialReturn) return { label: 'إرجاع جزئي', cls: 'partial' };
  return { label: 'مفتوحة', cls: 'open' };
}

function matchesLoanFilter(loan, filter) {
  if (filter === 'all') return true;
  if (filter === 'open') return loan.active;
  if (filter === 'overdue') return loan.overdue;
  if (filter === 'today') return loan.dueToday;
  if (filter === 'soon') return loan.dueSoon;
  if (filter === 'partial') return loan.partialReturn;
  if (filter === 'history') return !loan.active;
  return true;
}

function loanCenterRowHtml(loan) {
  const status = loanCenterStatus(loan);
  const canDirectReturn = loan.active;
  return `
    <div class="loan-center-row" data-book-id="${escapeHtml(loan.bookId)}" data-loan-id="${escapeHtml(loan.loanId)}">
      <div class="loan-center-main">
        <div class="loan-center-title"><b>${escapeHtml(loan.title) || 'بدون عنوان'}</b><span dir="ltr">${escapeHtml(loan.referenceNumber)}</span></div>
        <div class="loan-center-borrower">${icon('user', 13)} <strong>${escapeHtml(loan.borrowerName) || 'غير مسمى'}</strong>${loan.contact ? `<span>${escapeHtml(loan.contact)}</span>` : ''}</div>
      </div>
      <div class="loan-center-scope"><small>النطاق</small><b>${escapeHtml(loan.outstandingScope || loan.scope)}</b></div>
      <div class="loan-center-date"><small>الإعارة</small><b>${reportFormatDate(loan.borrowedAt)}</b></div>
      <div class="loan-center-date"><small>${loan.active ? 'الاستحقاق' : 'الإرجاع'}</small><b>${reportFormatDate(loan.active ? loan.dueAt : loan.returnedAt)}</b></div>
      <div class="loan-center-status ${status.cls}">${status.label}</div>
      <div class="loan-center-actions">
        <button class="btn btn-outline btn-sm" data-loan-open="${escapeHtml(loan.bookId)}">فتح</button>
        ${canDirectReturn ? `<button class="btn btn-primary btn-sm" data-loan-return="${escapeHtml(loan.loanId)}" data-book="${escapeHtml(loan.bookId)}">${icon('refresh', 13)} إرجاع</button>` : ''}
      </div>
    </div>`;
}

function borrowerCardHtml(profile) {
  return `
    <button class="borrower-card" data-borrower-name="${escapeHtml(profile.name)}">
      <span class="borrower-avatar">${escapeHtml((profile.name || '؟').trim().charAt(0) || '؟')}</span>
      <span class="borrower-card-copy"><b>${escapeHtml(profile.name)}</b><small>${escapeHtml(profile.contact || 'لا توجد وسيلة تواصل')}</small></span>
      <span class="borrower-card-metrics">
        <span><b>${profile.currentCount}</b><small>حالية</small></span>
        <span class="${profile.overdueCount ? 'danger' : ''}"><b>${profile.overdueCount}</b><small>متأخرة</small></span>
        <span><b>${profile.totalLoans}</b><small>إجمالي</small></span>
      </span>
      <span class="borrower-card-date"><small>آخر إعارة</small><b>${reportFormatDate(profile.lastLoanAt)}</b></span>
      ${icon('chevronLeft', 15)}
    </button>`;
}

function showBorrowerProfile(profile) {
  const loans = [...(profile.loans || [])].sort((a, b) => Date.parse(b.borrowedAt) - Date.parse(a.borrowedAt));
  const titleId = `borrowerProfile-${Date.now()}`;
  openModal(`
    <div class="detail-header">
      <div class="detail-title-wrap"><h3 class="detail-title" id="${titleId}">${escapeHtml(profile.name)}</h3><p class="detail-author">${escapeHtml(profile.contact || 'لا توجد وسيلة تواصل محفوظة')}</p></div>
      <button class="btn btn-ghost btn-icon" id="borrowerProfileClose" aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal-body borrower-profile-body">
      <div class="borrower-profile-stats">
        <div><b>${profile.currentCount}</b><span>إعارات حالية</span></div>
        <div class="${profile.overdueCount ? 'danger' : ''}"><b>${profile.overdueCount}</b><span>متأخرة</span></div>
        <div><b>${profile.totalLoans}</b><span>إجمالي الإعارات</span></div>
      </div>
      ${profile.contacts?.length > 1 ? `<div class="borrower-contacts"><small>وسائل التواصل المسجلة</small>${profile.contacts.map((c) => `<span>${escapeHtml(c)}</span>`).join('')}</div>` : ''}
      <div class="borrower-history">
        ${loans.map((loan) => `<button class="borrower-history-row" data-book="${escapeHtml(loan.bookId)}">
          <span><b>${escapeHtml(loan.title)}</b><small dir="ltr">${escapeHtml(loan.referenceNumber)}</small></span>
          <span>${escapeHtml(loan.scope)}</span>
          <span>${reportFormatDate(loan.borrowedAt)}</span>
          <span class="${loan.overdue ? 'danger' : loan.active ? 'active' : ''}">${loan.overdue ? 'متأخرة' : loan.active ? 'مفتوحة' : 'مُعادة'}</span>
        </button>`).join('') || '<p class="text-muted">لا توجد إعارات.</p>'}
      </div>
    </div>`, {
    labelledBy: titleId,
    modalClass: 'modal-wide',
    onMount: (overlay) => {
      overlay.querySelector('#borrowerProfileClose').addEventListener('click', closeModal);
      overlay.querySelectorAll('[data-book]').forEach((row) => row.addEventListener('click', () => {
        closeModal();
        showBookDetails(row.dataset.book);
      }));
    },
  });
}

let _loansViewCache = {
  loans: null,
  borrowerDetails: null,
  borrowerDetailsPromise: null,
  loanPromise: null,
};

function invalidateLoansViewCache() {
  _loansViewCache.loans = null;
  _loansViewCache.borrowerDetails = null;
  _loansViewCache.borrowerDetailsPromise = null;
  _loansViewCache.loanPromise = null;
}

// refreshState() already rebuilds the borrower summaries in RAFF_STATE.meta.
// Reuse them for the directory so switching tabs never performs a second
// expensive IPC scan. The complete loan history is fetched lazily only when
// an administrator opens one borrower profile.
if (typeof onStateChange === 'function') onStateChange(() => invalidateLoansViewCache());

async function getLoanCenterCached({ force = false } = {}) {
  if (!force && Array.isArray(_loansViewCache.loans)) return { ok: true, loans: _loansViewCache.loans };
  if (!force && _loansViewCache.loanPromise) return _loansViewCache.loanPromise;
  const promise = window.raff.getLoanCenter().then((res) => {
    if (res?.ok) _loansViewCache.loans = res.loans || [];
    return res;
  }).finally(() => { _loansViewCache.loanPromise = null; });
  _loansViewCache.loanPromise = promise;
  return promise;
}

async function getBorrowerDetailsCached() {
  if (Array.isArray(_loansViewCache.borrowerDetails)) return _loansViewCache.borrowerDetails;
  if (_loansViewCache.borrowerDetailsPromise) return _loansViewCache.borrowerDetailsPromise;
  _loansViewCache.borrowerDetailsPromise = window.raff.getBorrowers()
    .then((res) => {
      if (!res?.ok) throw new Error(res?.error || 'تعذر تحميل سجل المستعير');
      _loansViewCache.borrowerDetails = res.borrowers || [];
      return _loansViewCache.borrowerDetails;
    })
    .finally(() => { _loansViewCache.borrowerDetailsPromise = null; });
  return _loansViewCache.borrowerDetailsPromise;
}

function borrowerSummaries() {
  return Array.isArray(RAFF_STATE.meta?.borrowerProfiles) ? RAFF_STATE.meta.borrowerProfiles : [];
}

function renderLoansContent(root, loans) {
  const borrowers = borrowerSummaries();
  const q = normalizeArabic(_loansViewState.query);
  const filteredLoans = loans.filter((loan) => matchesLoanFilter(loan, _loansViewState.filter))
    .filter((loan) => !q || normalizeArabic(`${loan.title} ${loan.referenceNumber} ${loan.borrowerName} ${loan.contact} ${loan.scope}`).includes(q));
  const filteredBorrowers = borrowers.filter((p) => !q || normalizeArabic(`${p.name} ${p.contact} ${(p.contacts || []).join(' ')}`).includes(q));

  const counts = {
    open: loans.filter((l) => l.active).length,
    overdue: loans.filter((l) => l.overdue).length,
    today: loans.filter((l) => l.dueToday).length,
    soon: loans.filter((l) => l.dueSoon).length,
    partial: loans.filter((l) => l.partialReturn).length,
    history: loans.filter((l) => !l.active).length,
  };

  root.innerHTML = `
    <div class="panel loans-center-panel">
      <div class="loans-center-head">
        <div class="loans-main-tabs">
          <button class="${_loansViewState.tab === 'loans' ? 'active' : ''}" data-loans-tab="loans">${icon('book', 14)} الإعارات</button>
          <button class="${_loansViewState.tab === 'borrowers' ? 'active' : ''}" data-loans-tab="borrowers">${icon('user', 14)} دليل المستعيرين <span>${borrowers.length}</span></button>
        </div>
        <label class="loans-search">${icon('search', 15)}<input id="loansQuery" value="${escapeHtml(_loansViewState.query)}" placeholder="ابحث بالكتاب أو المستعير أو الرقم…" /></label>
      </div>

      ${_loansViewState.tab === 'loans' ? `
        <div class="loan-filter-tabs">
          ${[
            ['open', 'المفتوحة', counts.open], ['today', 'اليوم', counts.today], ['soon', 'قريباً', counts.soon],
            ['overdue', 'المتأخرة', counts.overdue], ['partial', 'إرجاع جزئي', counts.partial], ['history', 'السجل', counts.history], ['all', 'الكل', loans.length],
          ].map(([key, label, count]) => `<button class="${_loansViewState.filter === key ? 'active' : ''} ${key === 'overdue' && count ? 'danger' : ''}" data-loan-filter="${key}"><span>${label}</span><b>${count}</b></button>`).join('')}
        </div>
        <div class="loan-center-list">
          ${filteredLoans.length ? filteredLoans.map(loanCenterRowHtml).join('') : `<div class="empty-state compact">${icon('book', 30)}<h3>لا توجد إعارات مطابقة</h3><p>غيّر التبويب أو عبارة البحث.</p></div>`}
        </div>` : `
        <div class="borrowers-directory">
          ${filteredBorrowers.length ? filteredBorrowers.map(borrowerCardHtml).join('') : `<div class="empty-state compact">${icon('user', 30)}<h3>لا يوجد مستعيرون مطابقون</h3></div>`}
        </div>`}
    </div>`;

  root.querySelectorAll('[data-loans-tab]').forEach((btn) => btn.addEventListener('click', () => {
    if (_loansViewState.tab === btn.dataset.loansTab) return;
    _loansViewState.tab = btn.dataset.loansTab;
    if (_loansViewState.tab === 'loans' && !Array.isArray(_loansViewCache.loans)) {
      renderLoansView(root);
      return;
    }
    // Pure local render: no IPC, no database rescan.
    renderLoansContent(root, Array.isArray(_loansViewCache.loans) ? _loansViewCache.loans : loans);
  }));
  root.querySelectorAll('[data-loan-filter]').forEach((btn) => btn.addEventListener('click', () => {
    if (_loansViewState.filter === btn.dataset.loanFilter) return;
    _loansViewState.filter = btn.dataset.loanFilter;
    renderLoansContent(root, loans);
  }));
  let searchTimer = null;
  const searchInput = root.querySelector('#loansQuery');
  searchInput?.addEventListener('input', (event) => {
    _loansViewState.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderLoansContent(root, loans);
      root.querySelector('#loansQuery')?.focus({ preventScroll: true });
      const input = root.querySelector('#loansQuery');
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    }, 90);
  });
  root.querySelectorAll('[data-loan-open]').forEach((btn) => btn.addEventListener('click', () => showBookDetails(btn.dataset.loanOpen)));
  root.querySelectorAll('[data-loan-return]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'تسجيل إرجاع الإعارة؟', message: 'سيُسجّل إرجاع كل الأجزاء المتبقية في هذه الإعارة.', confirmLabel: 'تسجيل الإرجاع', danger: false });
    if (!ok) return;
    btn.disabled = true;
    const res = await window.raff.returnLoan(btn.dataset.book, btn.dataset.loanReturn);
    if (!res.ok) { btn.disabled = false; toast(res.error, 'error'); return; }
    invalidateLoansViewCache();
    await refreshState();
    renderNavCounts();
    toast('تم تسجيل الإرجاع', 'success');
    renderLoansView(root, { force: true });
  }));
  root.querySelectorAll('[data-borrower-name]').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.dataset.borrowerName;
    const summary = borrowers.find((p) => p.name === name);
    btn.classList.add('is-loading-profile');
    btn.disabled = true;
    try {
      const profiles = await getBorrowerDetailsCached();
      const profile = profiles.find((p) => p.name === name) || summary;
      if (profile) showBorrowerProfile(profile);
    } catch (error) {
      toast(error?.message || 'تعذر تحميل سجل المستعير', 'error');
    } finally {
      if (btn.isConnected) { btn.classList.remove('is-loading-profile'); btn.disabled = false; }
    }
  }));
}

async function renderLoansView(root, { force = false } = {}) {
  // The borrower directory is already summarized in RAFF_STATE.meta, so it can
  // paint immediately even after revisiting the route with a cold loan cache.
  if (_loansViewState.tab === 'borrowers' && !force && !Array.isArray(_loansViewCache.loans)) {
    renderLoansContent(root, []);
    getLoanCenterCached().catch(() => {}); // warm the loan tab quietly.
    return;
  }

  if (!Array.isArray(_loansViewCache.loans) || force) {
    root.innerHTML = `<div class="panel loans-center-panel"><div class="loading-state">${icon('refresh', 18)} جارٍ تحميل الإعارات…</div></div>`;
    const loanRes = await getLoanCenterCached({ force });
    if (!root.isConnected || currentRoute !== 'loans') return;
    if (!loanRes?.ok) {
      root.innerHTML = `<div class="panel"><div class="empty-state">${icon('lock', 30)}<h3>يتطلب وضع الإدارة</h3><p>افتح وضع الإدارة لعرض الإعارات والمستعيرين.</p></div></div>`;
      return;
    }
  }
  renderLoansContent(root, _loansViewCache.loans || []);
}
