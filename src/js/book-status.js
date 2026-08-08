/**
 * Copy-aware loan logic, shared by the main-process store and the renderer.
 *
 * A book is not "borrowed" or "available" as a whole — each *copy* is. A title
 * with 3 copies and 1 out on loan still has 2 copies a reader can take today.
 * Status is therefore never stored; it is derived from the loan ledger so the
 * two can never disagree.
 *
 * Multi-volume loans can also be returned progressively. `volumes` records the
 * parts originally borrowed, while `volumeReturns` maps each returned part to
 * its ISO return timestamp. `returnedAt` is only set when nothing remains out.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaffBook = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS_AVAILABLE = 'متاح';
  const STATUS_PARTIAL = 'معار جزئياً';
  const STATUS_FULL = 'معار بالكامل';

  const LOAN_FULL = 'full';       // one whole copy (all volumes) was lent
  const LOAN_VOLUME = 'volume';   // one or more selected volumes were lent

  const MS_PER_DAY = 86400000;

  function totalCopies(book) {
    const n = Number(book && book.copiesTotal);
    return n > 0 ? n : 1;
  }

  function totalVolumes(book) {
    const n = Number(book && book.volumes);
    return n > 0 ? Math.floor(n) : 1;
  }

  function isMultiVolume(book) {
    return totalVolumes(book) > 1;
  }

  /** Original selected volume numbers for a volume-level loan. */
  function loanVolumes(loan) {
    if (!loan || loan.type === LOAN_FULL) return [];
    const raw = Array.isArray(loan.volumes) ? loan.volumes : (loan.volume != null ? [loan.volume] : []);
    const out = [];
    const seen = new Set();
    for (const value of raw) {
      const v = Math.floor(Number(value));
      if (v > 0 && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out.sort((a, b) => a - b);
  }

  function isVolumeLoan(loan) {
    return !!loan && loan.type !== LOAN_FULL && loanVolumes(loan).length > 0;
  }

  /** Every volume that belonged to the loan when it was created. */
  function loanAllVolumes(loan, book) {
    if (!loan) return [];
    if (isVolumeLoan(loan)) return loanVolumes(loan);
    const count = totalVolumes(book);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  function volumeReturnMap(loan) {
    const raw = loan && loan.volumeReturns;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  /** Parts already returned. Legacy fully-returned loans count as all returned. */
  function returnedLoanVolumes(loan, book) {
    const all = loanAllVolumes(loan, book);
    if (!all.length) return [];
    if (loan && loan.returnedAt && Object.keys(volumeReturnMap(loan)).length === 0) return all;
    const map = volumeReturnMap(loan);
    return all.filter((v) => {
      const stamp = map[String(v)] ?? map[v];
      return !!stamp && !isNaN(Date.parse(stamp));
    });
  }

  /** Parts still physically out with the borrower. */
  function outstandingLoanVolumes(loan, book) {
    if (!loan || loan.returnedAt) return [];
    const returned = new Set(returnedLoanVolumes(loan, book));
    return loanAllVolumes(loan, book).filter((v) => !returned.has(v));
  }

  function isLoanActive(loan, book) {
    return outstandingLoanVolumes(loan, book).length > 0;
  }

  function volumeReturnDate(loan, volumeNo) {
    const map = volumeReturnMap(loan);
    return map[String(Number(volumeNo))] || map[Number(volumeNo)] || null;
  }

  /** Loans with at least one volume/copy still outstanding. */
  function activeLoans(book) {
    const loans = (book && book.loans) || [];
    const out = [];
    for (let i = 0; i < loans.length; i++) {
      if (isLoanActive(loans[i], book)) out.push(loans[i]);
    }
    return out;
  }

  /** Full-set loans whose complete set is still outstanding. */
  function activeFullLoans(book) {
    const count = totalVolumes(book);
    return activeLoans(book).filter((l) => !isVolumeLoan(l) && outstandingLoanVolumes(l, book).length === count);
  }

  /** Active loans that still contain a specific volume number. */
  function activeVolumeLoans(book, volumeNo) {
    const wanted = Number(volumeNo);
    return activeLoans(book).filter((l) => outstandingLoanVolumes(l, book).includes(wanted));
  }

  /** How many copies of a given volume are still out. */
  function borrowedOfVolume(book, volumeNo) {
    return activeVolumeLoans(book, volumeNo).length;
  }

  function availableOfVolume(book, volumeNo) {
    const avail = totalCopies(book) - borrowedOfVolume(book, volumeNo);
    return avail > 0 ? avail : 0;
  }

  function borrowedFullCopies(book) {
    return activeFullLoans(book).length;
  }

  /** A whole set is lendable only while every volume has a free copy. */
  function availableFullCopies(book) {
    const vols = totalVolumes(book);
    let minFree = totalCopies(book);
    for (let v = 1; v <= vols; v++) {
      const free = totalCopies(book) - borrowedOfVolume(book, v);
      if (free < minFree) minFree = free;
    }
    return minFree > 0 ? minFree : 0;
  }

  // ---- Backwards-compatible copy-level helpers ----
  function borrowedCopies(book) {
    if (totalVolumes(book) <= 1) return borrowedOfVolume(book, 1);
    // For a multi-volume title, the busiest volume determines how many
    // physical sets are unavailable at minimum.
    let busiest = 0;
    for (let v = 1; v <= totalVolumes(book); v++) {
      const out = borrowedOfVolume(book, v);
      if (out > busiest) busiest = out;
    }
    return busiest;
  }

  function availableCopies(book) {
    const avail = totalCopies(book) - borrowedCopies(book);
    return avail > 0 ? avail : 0;
  }

  /**
   * Whole-book status. For a multi-volume title we look at every volume: if no
   * volume has any copy out it's available; if every volume has every copy out
   * it's fully borrowed; otherwise it is partially borrowed.
   */
  function bookStatus(book) {
    const vols = totalVolumes(book);
    const copies = totalCopies(book);
    if (vols <= 1) {
      const out = borrowedCopies(book);
      if (out === 0) return STATUS_AVAILABLE;
      if (out >= copies) return STATUS_FULL;
      return STATUS_PARTIAL;
    }
    let anyOut = false;
    let allFull = true;
    for (let v = 1; v <= vols; v++) {
      const out = borrowedOfVolume(book, v);
      if (out > 0) anyOut = true;
      if (out < copies) allFull = false;
    }
    if (!anyOut) return STATUS_AVAILABLE;
    if (allFull) return STATUS_FULL;
    return STATUS_PARTIAL;
  }

  function canBorrow(book) {
    return availableFullCopies(book) > 0;
  }

  function canBorrowVolume(book, volumeNo) {
    const v = Number(volumeNo);
    if (!(v >= 1 && v <= totalVolumes(book))) return false;
    return availableOfVolume(book, v) > 0;
  }

  /** Whole days a loan has been (or was) held. Never negative. */
  function loanDurationDays(loan, now) {
    const start = Date.parse(loan.borrowedAt);
    if (!start) return 0;
    const end = loan.returnedAt ? Date.parse(loan.returnedAt) : (now || Date.now());
    const days = Math.floor((end - start) / MS_PER_DAY);
    return days > 0 ? days : 0;
  }

  function daysUntilDue(loan, now) {
    if (!loan.dueAt) return null;
    const due = Date.parse(loan.dueAt);
    if (!due) return null;
    return Math.ceil((due - (now || Date.now())) / MS_PER_DAY);
  }

  function isOverdue(loan, limitDays, now) {
    if (loan.returnedAt) return false;
    if (loan.dueAt) return (now || Date.now()) > Date.parse(loan.dueAt);
    return loanDurationDays(loan, now) > (limitDays || 30);
  }

  function isDueSoon(loan, windowDays, now) {
    if (loan.returnedAt || !loan.dueAt) return false;
    const d = daysUntilDue(loan, now);
    return d !== null && d >= 0 && d <= (windowDays || 7);
  }

  function currentBorrowers(book) {
    return activeLoans(book).map((l) => l.borrowerName).filter(Boolean);
  }

  function formatVolumeNumbers(values) {
    const vols = [...values].sort((a, b) => a - b);
    if (vols.length === 0) return '';
    if (vols.length === 1) return String(vols[0]);
    if (vols.length === 2) return vols[0] + ' و' + vols[1];
    return vols.slice(0, -1).join('، ') + ' و' + vols[vols.length - 1];
  }

  /** Human label for the original loan scope. */
  function loanScopeLabel(loan) {
    if (!isVolumeLoan(loan)) return 'نسخة كاملة';
    const vols = loanVolumes(loan);
    return vols.length === 1 ? ('الجزء ' + vols[0]) : ('الأجزاء ' + formatVolumeNumbers(vols));
  }

  /** Human label for only what remains out right now. */
  function outstandingScopeLabel(loan, book) {
    const vols = outstandingLoanVolumes(loan, book);
    if (!vols.length) return 'أُرجعت بالكامل';
    if (!isVolumeLoan(loan) && vols.length === totalVolumes(book)) return 'نسخة كاملة';
    return vols.length === 1 ? ('الجزء ' + vols[0]) : ('الأجزاء ' + formatVolumeNumbers(vols));
  }

  return {
    STATUS_AVAILABLE,
    STATUS_PARTIAL,
    STATUS_FULL,
    ALL_STATUSES: [STATUS_AVAILABLE, STATUS_PARTIAL, STATUS_FULL],
    LOAN_FULL,
    LOAN_VOLUME,
    totalCopies,
    totalVolumes,
    isMultiVolume,
    activeLoans,
    activeFullLoans,
    activeVolumeLoans,
    loanVolumes,
    loanAllVolumes,
    returnedLoanVolumes,
    outstandingLoanVolumes,
    isLoanActive,
    volumeReturnDate,
    isVolumeLoan,
    borrowedOfVolume,
    availableOfVolume,
    borrowedFullCopies,
    availableFullCopies,
    borrowedCopies,
    availableCopies,
    bookStatus,
    canBorrow,
    canBorrowVolume,
    loanDurationDays,
    daysUntilDue,
    isOverdue,
    isDueSoon,
    currentBorrowers,
    loanScopeLabel,
    outstandingScopeLabel,
    formatVolumeNumbers,
  };
}));
