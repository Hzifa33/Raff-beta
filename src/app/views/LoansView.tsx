import React, { useMemo, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { Icon } from '../components/Icons';
import { Book } from '../types';
import { useVirtualStream } from '../lib/useVirtualStream';

export function LoansView() {
  const {
    lang,
    loans,
    loanFilter,
    borrowers,
    books,
    stats,
    setLoanFilter,
    setInspectedBook,
    setReturningBook,
  } = useRaffStore();
  const isAr = lang === 'ar';
  const [subTab, setSubTab] = useState<'center' | 'borrowers'>('center');
  const [query, setQuery] = useState('');

  // O(1) Book Lookup Map to eliminate 2.5 million nested search iterations
  const booksMap = useMemo(() => {
    const map = new Map<string, Book>();
    for (let i = 0; i < books.length; i++) {
      map.set(books[i].id, books[i]);
    }
    return map;
  }, [books]);

  const filteredLoans = useMemo(() => {
    if (!query.trim()) return loans;
    const q = query.toLowerCase();
    return loans.filter((l) => {
      return (
        l.title.toLowerCase().includes(q) ||
        l.borrowerName.toLowerCase().includes(q) ||
        l.referenceNumber.toLowerCase().includes(q) ||
        (l.contact || '').toLowerCase().includes(q)
      );
    });
  }, [loans, query]);

  const filteredBorrowers = useMemo(() => {
    if (!query.trim()) return borrowers;
    const q = query.toLowerCase();
    return borrowers.filter((b) => {
      return (
        b.name.toLowerCase().includes(q) ||
        (b.contact || '').toLowerCase().includes(q)
      );
    });
  }, [borrowers, query]);

  const loansStream = useVirtualStream(filteredLoans, { initialCount: 60, step: 50 });
  const borrowersStream = useVirtualStream(filteredBorrowers, { initialCount: 40, step: 40 });

  const filterPills: { id: string; ar: string; en: string }[] = [
    { id: 'open', ar: 'الإعارات النشطة', en: 'Open Loans' },
    { id: 'overdue', ar: 'المتأخرة', en: 'Overdue' },
    { id: 'soon', ar: 'تستحق قريباً', en: 'Due Soon' },
    { id: 'partial', ar: 'مرتجعة جزئياً', en: 'Partial Return' },
    { id: 'history', ar: 'سجل المرتجعات', en: 'Returned History' },
    { id: 'all', ar: 'الكل', en: 'All Loans' },
  ];

  const fmt = (n: number | undefined | null) => Number(n || 0).toLocaleString('en-US');

  return (
    <div className="stage-view">
      {/* Top KPI & Sub-Navigation Header */}
      <div
        className="glass-panel"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`btn ${subTab === 'center' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('center')}
          >
            <Icon.Book />
            <span>{isAr ? 'مركز الإعارات والاستحقاق' : 'Circulation & Due Center'}</span>
          </button>
          <button
            className={`btn ${subTab === 'borrowers' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTab('borrowers')}
          >
            <Icon.Users />
            <span>
              {isAr
                ? `دليل المستعيرين (${fmt(borrowers.length)})`
                : `Borrowers Directory (${fmt(borrowers.length)})`}
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {subTab === 'center' && (
            <div style={{ display: 'flex', gap: 4 }}>
              {filterPills.map((fp) => (
                <button
                  key={fp.id}
                  className={`btn ${loanFilter === fp.id ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ height: 28, padding: '0 9px', fontSize: 11.5 }}
                  onClick={() => setLoanFilter(fp.id)}
                >
                  {isAr ? fp.ar : fp.en}
                </button>
              ))}
            </div>
          )}

          <input
            className="vertix-input"
            style={{ width: 220, height: 30 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? 'بحث بالمستعير، الكتاب، الهاتف...'
                : 'Filter by borrower, title, phone...'
            }
          />
        </div>
      </div>

      {/* Summary Strip */}
      <div className="overview-kpi-row" style={{ flexShrink: 0 }}>
        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'النسخ المستعارة حالياً' : 'Currently Borrowed'}</div>
            <div className="stat-value">{fmt(stats?.borrowedCopies)}</div>
          </div>
          <span className="status-badge status-partial">
            {isAr ? 'نشط' : 'Active'}
          </span>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'المستعيرون النشطون' : 'Active Borrowers'}</div>
            <div className="stat-value">{fmt(stats?.activeBorrowers)}</div>
          </div>
          <span className="status-badge status-available">
            {fmt(borrowers.length)} {isAr ? 'مسجل' : 'total'}
          </span>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'تستحق خلال 3 أيام' : 'Due Within 3 Days'}</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(stats?.dueSoonLoans)}</div>
          </div>
          <span className="status-badge status-partial">
            {isAr ? 'قريباً' : 'Soon'}
          </span>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'إعارات متأخرة' : 'Overdue Loans'}</div>
            <div className="stat-value" style={{ color: 'var(--crimson)' }}>{fmt(stats?.overdueLoans)}</div>
          </div>
          <span className="status-badge status-overdue">
            {isAr ? 'متأخر' : 'Overdue'}
          </span>
        </div>
      </div>

      {/* Main Scrollable Table / Directory */}
      {subTab === 'center' ? (
        filteredLoans.length === 0 ? (
          <div className="empty-state-card">
            <Icon.Users style={{ width: 32, height: 32, color: 'var(--brand-accent)' }} />
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>
              {isAr ? 'لا توجد إعارات ضمن هذا التصنيف حالياً' : 'No loans found in this category'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isAr
                ? 'يمكنك تسجيل إعارة جديدة من الفهرس أو عبر قارئ الباركود.'
                : 'You can record a new loan from the Catalogue or Barcode Scanner.'}
            </div>
          </div>
        ) : (
          <div className="catalogue-table-wrap">
            <table className="catalogue-table">
              <thead>
                <tr>
                  <th>{isAr ? 'الرقم المرجعي' : 'Reference'}</th>
                  <th>{isAr ? 'عنوان الكتاب' : 'Book Title'}</th>
                  <th>{isAr ? 'المستعير' : 'Borrower'}</th>
                  <th>{isAr ? 'التواصل' : 'Contact'}</th>
                  <th>{isAr ? 'النطاق / الأجزاء' : 'Scope / Volumes'}</th>
                  <th>{isAr ? 'تاريخ الإعارة' : 'Borrowed On'}</th>
                  <th>{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                  <th>{isAr ? 'الحالة' : 'Status'}</th>
                  <th>{isAr ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {loansStream.visibleItems.map((item) => {
                  const parentBook = booksMap.get(item.bookId);
                  return (
                    <tr key={item.loanId}>
                      <td>
                        <span className="ref-chip">{item.referenceNumber}</span>
                      </td>
                      <td
                        style={{ fontWeight: 700, cursor: 'pointer' }}
                        onClick={() => parentBook && setInspectedBook(parentBook)}
                      >
                        {item.title}
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.borrowerName}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                        {item.contact || '—'}
                      </td>
                      <td>
                        <span className="meta-pill">{item.outstandingScope || item.scope}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-numeric)', fontSize: 11.5 }}>
                        {item.borrowedAt ? item.borrowedAt.slice(0, 10) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-numeric)', fontSize: 11.5 }}>
                        {item.dueAt ? item.dueAt.slice(0, 10) : '—'}
                      </td>
                      <td>
                        {!item.active ? (
                          <span className="status-badge status-available">
                            {isAr ? 'مُرتجع' : 'Returned'}
                          </span>
                        ) : item.overdue ? (
                          <span className="status-badge status-overdue">
                            {isAr
                              ? `متأخر (${item.overdueDays} يوم)`
                              : `Overdue (${item.overdueDays}d)`}
                          </span>
                        ) : item.dueSoon || item.dueToday ? (
                          <span className="status-badge status-partial">
                            {isAr ? 'يستحق قريباً' : 'Due Soon'}
                          </span>
                        ) : (
                          <span className="status-badge status-available">
                            {isAr ? 'سارٍ' : 'Active'}
                          </span>
                        )}
                      </td>
                      <td>
                        {item.active && parentBook && (
                          <button
                            className="btn btn-primary"
                            style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                            onClick={() =>
                              setReturningBook({ book: parentBook, loanId: item.loanId })
                            }
                          >
                            {isAr ? 'إرجاع' : 'Return'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loansStream.hasMore && (
              <div
                ref={loansStream.sentinelRef}
                style={{ padding: '12px 0', textAlign: 'center' }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={loansStream.loadMore}
                  style={{ fontSize: 12, height: 30 }}
                >
                  <Icon.Refresh style={{ width: 13, height: 13 }} />
                  <span>
                    {isAr
                      ? `تحميل المزيد (+50) — معروض ${loansStream.showingCount.toLocaleString('en-US')} من ${loansStream.totalCount.toLocaleString('en-US')}`
                      : `Load More (+50) — showing ${loansStream.showingCount.toLocaleString('en-US')} of ${loansStream.totalCount.toLocaleString('en-US')}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )
      ) : filteredBorrowers.length === 0 ? (
        <div className="empty-state-card">
          <Icon.Users style={{ width: 32, height: 32, color: 'var(--brand-accent)' }} />
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {isAr ? 'لا يوجد مستعيرون مسجلون حالياً' : 'No borrowers registered yet'}
          </div>
        </div>
      ) : (
        <div className="scroll-region">
          <div className="discover-grid">
            {borrowersStream.visibleItems.map((prof) => (
              <div key={prof.name} className="book-bento-card" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{prof.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {prof.contact || (isAr ? 'بدون رقم تواصل' : 'No contact number')}
                    </div>
                  </div>
                  <span
                    className={`status-badge ${
                      prof.overdueCount > 0
                        ? 'status-overdue'
                        : prof.currentCount > 0
                        ? 'status-partial'
                        : 'status-available'
                    }`}
                  >
                    {prof.currentCount} {isAr ? 'نشط' : 'active'}
                  </span>
                </div>

                <div className="book-meta-strip">
                  <span className="meta-pill">
                    {isAr ? 'إجمالي الإعارات:' : 'Total Loans:'} {fmt(prof.totalLoans)}
                  </span>
                  <span className="meta-pill">
                    {isAr ? 'المتأخرة:' : 'Overdue:'} {fmt(prof.overdueCount)}
                  </span>
                </div>

                {(prof.loans || []).slice(0, 3).map((ln) => (
                  <div
                    key={ln.loanId}
                    style={{
                      fontSize: 11.5,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: 'var(--bg-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{ln.title}</span>
                    <span className="ref-chip" style={{ fontSize: 10 }}>{ln.referenceNumber}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {borrowersStream.hasMore && (
            <div
              ref={borrowersStream.sentinelRef}
              style={{ padding: '16px 0', textAlign: 'center' }}
            >
              <button
                className="btn btn-ghost"
                onClick={borrowersStream.loadMore}
                style={{ fontSize: 12, height: 32 }}
              >
                <Icon.Refresh style={{ width: 14, height: 14 }} />
                <span>
                  {isAr
                    ? `تحميل المزيد (+40) — معروض ${borrowersStream.showingCount.toLocaleString('en-US')} من ${borrowersStream.totalCount.toLocaleString('en-US')}`
                    : `Load More (+40) — showing ${borrowersStream.showingCount.toLocaleString('en-US')} of ${borrowersStream.totalCount.toLocaleString('en-US')}`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
