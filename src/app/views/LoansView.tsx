import React, { useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { Icon } from '../components/Icons';
import { BorrowerProfile } from '../types';

export const LoansView: React.FC = () => {
  const loans = useRaffStore((s) => s.loans);
  const loanFilter = useRaffStore((s) => s.loanFilter);
  const borrowers = useRaffStore((s) => s.borrowers);
  const loadLoansCenter = useRaffStore((s) => s.loadLoansCenter);
  const returnLoan = useRaffStore((s) => s.returnLoan);
  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);

  const [subTab, setSubTab] = useState<'loans' | 'borrowers'>('loans');
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerProfile | null>(null);

  const filters = [
    { id: 'open', label: 'الإعارات النشطة' },
    { id: 'overdue', label: 'المتأخرات' },
    { id: 'soon', label: 'تستحق قريباً' },
    { id: 'partial', label: 'إرجاع جزئي' },
    { id: 'history', label: 'سجل المُرجعة' },
    { id: 'all', label: 'الكل' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Users />
          </div>
          <div>
            <h1 className="stage-title">مركز الإعارات ودليل المستعيرين</h1>
            <p className="stage-subtitle">
              تتبّع الإعارات الكاملة والجزئية واسترداد الأجزاء تدريجياً
            </p>
          </div>
        </div>

        <div className="nav-pill-group">
          <button
            className={`nav-pill-btn ${subTab === 'loans' ? 'active' : ''}`}
            onClick={() => setSubTab('loans')}
          >
            مركز الإعارات ({loans.length})
          </button>
          <button
            className={`nav-pill-btn ${subTab === 'borrowers' ? 'active' : ''}`}
            onClick={() => setSubTab('borrowers')}
          >
            دليل المستعيرين ({borrowers.length})
          </button>
        </div>
      </div>

      {subTab === 'loans' ? (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <button
                key={f.id}
                className={loanFilter === f.id ? 'btn-obsidian' : 'btn-soft'}
                onClick={() => loadLoansCenter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="vertix-table-wrap">
            <table className="vertix-table">
              <thead>
                <tr>
                  <th>الرقم المرجعي</th>
                  <th>الكتاب</th>
                  <th>المستعير</th>
                  <th>التواصل</th>
                  <th>النطاق المتبقي</th>
                  <th>تاريخ الإعارة</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((item) => (
                  <tr key={item.loanId}>
                    <td>
                      <span className="ref-mono-pill">{item.referenceNumber}</span>
                    </td>
                    <td
                      style={{ fontWeight: 800, cursor: 'pointer' }}
                      onClick={() => setSelectedBookId(item.bookId)}
                    >
                      {item.title}
                    </td>
                    <td style={{ fontWeight: 700 }}>{item.borrowerName}</td>
                    <td>{item.contact || '—'}</td>
                    <td>
                      <span className="meta-chip">{item.outstandingScope || item.scope}</span>
                      {item.partialReturn && (
                        <span
                          className="status-badge partial"
                          style={{ marginInlineStart: '6px' }}
                        >
                          أُعيد: ج{item.returnedParts.join('، ج')}
                        </span>
                      )}
                    </td>
                    <td>{item.borrowedAt?.slice(0, 10) || '—'}</td>
                    <td>{item.dueAt?.slice(0, 10) || '—'}</td>
                    <td>
                      {!item.active ? (
                        <span className="status-badge available">مُرجع</span>
                      ) : item.overdue ? (
                        <span className="status-badge borrowed">
                          متأخر ({item.overdueDays} يوم)
                        </span>
                      ) : (
                        <span className="status-badge partial">نشط</span>
                      )}
                    </td>
                    <td>
                      {item.active && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-primary-orange"
                            style={{ padding: '6px 12px', fontSize: '11.5px' }}
                            onClick={() => returnLoan(item.bookId, item.loanId)}
                          >
                            إرجاع الكل
                          </button>
                          {item.outstandingParts.length > 1 && (
                            <button
                              className="btn-soft"
                              style={{ padding: '6px 12px', fontSize: '11.5px' }}
                              onClick={() => setSelectedBookId(item.bookId)}
                            >
                              إرجاع جزئي
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="books-grid">
          {borrowers.map((prof) => (
            <div
              key={prof.name}
              className="book-vertix-card"
              onClick={() => setSelectedBorrower(prof)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div className="book-card-title">{prof.name}</div>
                  <div className="book-card-author">{prof.contact || 'بدون رقم تواصل'}</div>
                </div>
                <span
                  className={`status-badge ${
                    prof.overdueCount > 0
                      ? 'borrowed'
                      : prof.currentCount > 0
                      ? 'partial'
                      : 'available'
                  }`}
                >
                  نشط: {prof.currentCount}
                </span>
              </div>

              <div className="book-card-meta-strip">
                <span className="meta-chip">إجمالي الإعارات: {prof.totalLoans}</span>
                {prof.overdueCount > 0 && (
                  <span className="meta-chip" style={{ color: 'var(--status-borrowed)' }}>
                    متأخرات: {prof.overdueCount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Borrower Profile Modal */}
      {selectedBorrower && (
        <div className="modal-backdrop" onClick={() => setSelectedBorrower(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800 }}>
                  ملف المستعير: {selectedBorrower.name}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  وسائل التواصل: {selectedBorrower.contacts.join(' · ') || '—'}
                </p>
              </div>
              <button className="btn-soft" onClick={() => setSelectedBorrower(null)}>
                إغلاق
              </button>
            </div>

            <div className="vertix-table-wrap">
              <table className="vertix-table">
                <thead>
                  <tr>
                    <th>الرقم المرجعي</th>
                    <th>الكتاب</th>
                    <th>النطاق</th>
                    <th>تاريخ الإعارة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBorrower.loans || []).map((l) => (
                    <tr key={l.loanId}>
                      <td>
                        <span className="ref-mono-pill">{l.referenceNumber}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{l.title}</td>
                      <td>{l.scope || 'نسخة كاملة'}</td>
                      <td>{l.borrowedAt?.slice(0, 10)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            !l.active ? 'available' : l.overdue ? 'borrowed' : 'partial'
                          }`}
                        >
                          {!l.active ? 'مُرجع' : l.overdue ? 'متأخر' : 'نشط'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
