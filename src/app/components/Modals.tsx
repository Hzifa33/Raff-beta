import React, { useEffect, useState } from 'react';
import { useRaffStore, isAdminState } from '../store/useRaffStore';
import {
  computeBookAvailability,
  getLoanOutstandingVolumes,
  isLoanActive,
  loanScopeLabel,
  renderBarcodeSVG,
} from '../lib/domain';
import { Icon } from './Icons';
import { printHtml } from '../lib/print';

export function BookInspectorModal() {
  const {
    lang,
    inspectedBook,
    auth,
    setInspectedBook,
    setEditingBook,
    setBorrowingBook,
    setReturningBook,
    setLabelPreviewBook,
    removeBook,
  } = useRaffStore();
  const isAr = lang === 'ar';
  const isAdmin = isAdminState(auth);

  if (!inspectedBook) return null;
  const b = inspectedBook;
  const avail = computeBookAvailability(b);
  const svg = renderBarcodeSVG(b.referenceNumber, {
    height: 44,
    moduleWidth: 1.7,
    color: '#1c1613',
    background: '#ffffff',
  });

  return (
    <div className="modal-backdrop" onClick={() => setInspectedBook(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="ref-chip">{b.referenceNumber}</span>
              <span
                className={`status-badge ${
                  avail.state === 'available'
                    ? 'status-available'
                    : avail.state === 'partial'
                    ? 'status-partial'
                    : 'status-borrowed'
                }`}
              >
                {avail.state === 'available'
                  ? isAr
                    ? 'متاح'
                    : 'Available'
                  : avail.state === 'partial'
                  ? isAr
                    ? 'مستعار جزئياً'
                    : 'Partially Borrowed'
                  : isAr
                  ? 'مستعار بالكامل'
                  : 'Fully Borrowed'}
              </span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-editorial)', fontSize: 20, fontWeight: 700 }}>
              {b.title}
            </h3>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {b.author || (isAr ? 'بدون مؤلف' : 'Unknown Author')}
              {b.publisher ? ` · ${b.publisher}` : ''}
            </div>
          </div>

          <button className="win-ctrl-btn" onClick={() => setInspectedBook(null)}>
            <Icon.Close />
          </button>
        </div>

        {/* Metadata Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border-subtle)',
            fontSize: 12,
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'التصنيف:' : 'Category:'}</span>{' '}
            <strong>{b.category || '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'الرف:' : 'Shelf:'}</span>{' '}
            <strong>{b.shelf || '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'النسخ المتاحة:' : 'Copies:'}</span>{' '}
            <strong>
              {avail.availableCopies} / {avail.copiesTotal}
            </strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'الأجزاء:' : 'Volumes:'}</span>{' '}
            <strong>{b.volumes}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'الطبعة / السنة:' : 'Edition / Year:'}</span>{' '}
            <strong>
              {b.edition || '—'} {b.publishYear ? `(${b.publishYear})` : ''}
            </strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'السعر:' : 'Price:'}</span>{' '}
            <strong>{b.price ? `${b.price} ${isAr ? 'ر.س' : 'SAR'}` : '—'}</strong>
          </div>
          {b.series && (
            <div style={{ gridColumn: 'span 3' }}>
              <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'السلسلة:' : 'Series:'}</span>{' '}
              <strong>
                {b.series} {b.seriesOrder ? `(#${b.seriesOrder})` : ''}
              </strong>
            </div>
          )}
          {b.notes && (
            <div style={{ gridColumn: 'span 3' }}>
              <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'ملاحظات:' : 'Notes:'}</span>{' '}
              <span>{b.notes}</span>
            </div>
          )}
        </div>

        {/* Barcode Plate */}
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            background: '#ffffff',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        {/* Active Loans inside Book Inspector */}
        {isAdmin && avail.activeLoans.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>
              {isAr ? 'الإعارات النشطة على هذا الكتاب:' : 'Active Loans on This Book:'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {avail.activeLoans.map((ln) => (
                <div
                  key={ln.id}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong>{ln.borrowerName}</strong> ·{' '}
                    <span>{loanScopeLabel(ln, true) || (isAr ? 'نسخة كاملة' : 'Full Copy')}</span>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ height: 26, fontSize: 11 }}
                    onClick={() => {
                      setInspectedBook(null);
                      setReturningBook({ book: b, loanId: ln.id });
                    }}
                  >
                    {isAr ? 'إرجاع' : 'Return'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {isAdmin && avail.availableCopies > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setInspectedBook(null);
                  setBorrowingBook(b);
                }}
              >
                {isAr ? 'إعارة الكتاب' : 'Borrow Book'}
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                setInspectedBook(null);
                setLabelPreviewBook(b);
              }}
            >
              <Icon.Printer />
              <span>{isAr ? 'طباعة ملصق' : 'Print Label'}</span>
            </button>
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setInspectedBook(null);
                  setEditingBook(b);
                }}
              >
                {isAr ? 'تعديل البيانات' : 'Edit Book'}
              </button>
              <button className="btn btn-danger" onClick={() => removeBook(b.id)}>
                {isAr ? 'نقل للمهملات' : 'Move to Trash'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EditBookModal() {
  const { lang, editingBook, setEditingBook, updateBook } = useRaffStore();
  const isAr = lang === 'ar';
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (editingBook) {
      setForm({
        title: editingBook.title,
        author: editingBook.author,
        publisher: editingBook.publisher,
        referenceNumber: editingBook.referenceNumber,
        category: editingBook.category,
        shelf: editingBook.shelf,
        copiesTotal: editingBook.copiesTotal,
        volumes: editingBook.volumes,
        price: editingBook.price ?? '',
        publishYear: editingBook.publishYear,
        edition: editingBook.edition,
        notes: editingBook.notes,
      });
    }
  }, [editingBook]);

  if (!editingBook) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateBook(editingBook.id, {
      ...form,
      copiesTotal: Math.max(1, Number(form.copiesTotal) || 1),
      volumes: Math.max(1, Number(form.volumes) || 1),
      price: form.price !== '' ? Number(form.price) : null,
    });
  };

  return (
    <div className="modal-backdrop" onClick={() => setEditingBook(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div className="section-title">
            {isAr ? 'تعديل بيانات الكتاب' : 'Edit Book Metadata'}
          </div>
          <button className="win-ctrl-btn" onClick={() => setEditingBook(null)}>
            <Icon.Close />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="input-group" style={{ gridColumn: 'span 2' }}>
            <label className="input-label">{isAr ? 'العنوان *' : 'Title *'}</label>
            <input
              required
              className="vertix-input"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'المؤلف' : 'Author'}</label>
            <input
              className="vertix-input"
              value={form.author || ''}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'دار النشر' : 'Publisher'}</label>
            <input
              className="vertix-input"
              value={form.publisher || ''}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'الرقم المرجعي' : 'Reference No.'}</label>
            <input
              className="vertix-input"
              style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}
              value={form.referenceNumber || ''}
              onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'التصنيف' : 'Category'}</label>
            <input
              className="vertix-input"
              value={form.category || ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'الرف' : 'Shelf'}</label>
            <input
              className="vertix-input"
              value={form.shelf || ''}
              onChange={(e) => setForm({ ...form, shelf: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'السعر' : 'Price'}</label>
            <input
              type="number"
              step="0.01"
              className="vertix-input"
              value={form.price ?? ''}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'عدد النسخ' : 'Copies'}</label>
            <input
              type="number"
              min={1}
              className="vertix-input"
              value={form.copiesTotal || 1}
              onChange={(e) => setForm({ ...form, copiesTotal: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">{isAr ? 'عدد الأجزاء' : 'Volumes'}</label>
            <input
              type="number"
              min={1}
              className="vertix-input"
              value={form.volumes || 1}
              onChange={(e) => setForm({ ...form, volumes: e.target.value })}
            />
          </div>

          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingBook(null)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary">
              <Icon.Check />
              <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BorrowModal() {
  const { lang, borrowingBook, settings, meta, setBorrowingBook, borrowCopy } = useRaffStore();
  const isAr = lang === 'ar';
  const [borrowerName, setBorrowerName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [durationDays, setDurationDays] = useState(settings.loanDurationDays || 30);
  const [loanType, setLoanType] = useState<'full' | 'partial'>('full');
  const [selectedVols, setSelectedVols] = useState<number[]>([]);

  useEffect(() => {
    setDurationDays(settings.loanDurationDays || 30);
    setLoanType('full');
    setSelectedVols([]);
  }, [borrowingBook, settings.loanDurationDays]);

  if (!borrowingBook) return null;
  const avail = computeBookAvailability(borrowingBook);

  const toggleVolume = (v: number) => {
    setSelectedVols((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim()) return;
    await borrowCopy(borrowingBook.id, {
      borrowerName: borrowerName.trim(),
      contact: contact.trim(),
      note: note.trim(),
      durationDays,
      type: borrowingBook.volumes > 1 && loanType === 'partial' ? 'partial' : 'full',
      volumes: selectedVols,
    });
    setBorrowerName('');
    setContact('');
    setNote('');
  };

  return (
    <div className="modal-backdrop" onClick={() => setBorrowingBook(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div>
            <div className="section-title">
              {isAr ? `تسجيل إعارة: ${borrowingBook.title}` : `Borrow Book: ${borrowingBook.title}`}
            </div>
            <div className="section-subtitle">{borrowingBook.referenceNumber}</div>
          </div>
          <button className="win-ctrl-btn" onClick={() => setBorrowingBook(null)}>
            <Icon.Close />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="input-group">
            <label className="input-label">{isAr ? 'اسم المستعير *' : 'Borrower Name *'}</label>
            <input
              required
              list="borrowers-datalist"
              className="vertix-input"
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              placeholder={isAr ? 'الاسم الكامل للمستعير...' : 'Borrower full name...'}
            />
            <datalist id="borrowers-datalist">
              {(meta?.borrowers || []).map((br) => (
                <option key={br} value={br} />
              ))}
            </datalist>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="input-group">
              <label className="input-label">{isAr ? 'رقم الجوال / التواصل' : 'Phone / Contact'}</label>
              <input
                className="vertix-input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="05xxxxxxxx"
              />
            </div>

            <div className="input-group">
              <label className="input-label">{isAr ? 'مدة الإعارة (بالأيام)' : 'Duration (Days)'}</label>
              <input
                type="number"
                min={1}
                max={365}
                className="vertix-input"
                value={durationDays}
                onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 30))}
              />
            </div>
          </div>

          {borrowingBook.volumes > 1 && (
            <div className="input-group">
              <label className="input-label">{isAr ? 'نطاق الإعارة' : 'Loan Scope'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn ${loanType === 'full' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLoanType('full')}
                >
                  {isAr ? 'نسخة كاملة بجميع الأجزاء' : 'Full Copy (All Volumes)'}
                </button>
                <button
                  type="button"
                  className={`btn ${loanType === 'partial' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLoanType('partial')}
                >
                  {isAr ? 'إعارة أجزاء محددة فقط' : 'Select Specific Volumes'}
                </button>
              </div>

              {loanType === 'partial' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {Array.from({ length: borrowingBook.volumes }, (_, i) => i + 1).map((v) => {
                    const isAvail = avail.availableVolumes.includes(v);
                    const picked = selectedVols.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={!isAvail}
                        onClick={() => toggleVolume(v)}
                        className={`btn ${picked ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ height: 28, padding: '0 10px' }}
                      >
                        {isAr ? `ج ${v}` : `Vol ${v}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">{isAr ? 'ملاحظات الإعارة' : 'Loan Notes'}</label>
            <input
              className="vertix-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setBorrowingBook(null)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary">
              <Icon.Check />
              <span>{isAr ? 'تأكيد الإعارة' : 'Confirm Loan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReturnLoanModal() {
  const { lang, returningBook, setReturningBook, returnLoan, returnLoanParts } = useRaffStore();
  const isAr = lang === 'ar';
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [selectedVols, setSelectedVols] = useState<number[]>([]);

  useEffect(() => {
    if (returningBook) {
      const openLoans = (returningBook.book.loans || []).filter(isLoanActive);
      const target = returningBook.loanId || openLoans[0]?.id || '';
      setSelectedLoanId(target);
      const ln = openLoans.find((l) => l.id === target);
      if (ln && ln.type === 'partial') {
        setSelectedVols(getLoanOutstandingVolumes(ln));
      } else {
        setSelectedVols([]);
      }
    }
  }, [returningBook]);

  if (!returningBook) return null;
  const openLoans = (returningBook.book.loans || []).filter(isLoanActive);
  const currentLoan = openLoans.find((l) => l.id === selectedLoanId) || openLoans[0];

  if (!currentLoan) return null;
  const outstandingVols = getLoanOutstandingVolumes(currentLoan);

  const handleConfirm = async () => {
    if (
      currentLoan.type === 'partial' &&
      selectedVols.length > 0 &&
      selectedVols.length < outstandingVols.length
    ) {
      await returnLoanParts(returningBook.book.id, currentLoan.id, selectedVols);
    } else {
      await returnLoan(returningBook.book.id, currentLoan.id);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setReturningBook(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div className="section-title">
            {isAr ? `إرجاع إعارة: ${returningBook.book.title}` : `Return Loan: ${returningBook.book.title}`}
          </div>
          <button className="win-ctrl-btn" onClick={() => setReturningBook(null)}>
            <Icon.Close />
          </button>
        </div>

        {openLoans.length > 1 && (
          <div className="input-group" style={{ marginBottom: 10 }}>
            <label className="input-label">{isAr ? 'اختر المستعير' : 'Select Borrower'}</label>
            <select
              className="vertix-select"
              value={currentLoan.id}
              onChange={(e) => setSelectedLoanId(e.target.value)}
            >
              {openLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.borrowerName} ({loanScopeLabel(l, true) || (isAr ? 'نسخة كاملة' : 'Full Copy')})
                </option>
              ))}
            </select>
          </div>
        )}

        {currentLoan.type === 'partial' && outstandingVols.length > 1 && (
          <div className="input-group" style={{ marginBottom: 12 }}>
            <label className="input-label">
              {isAr ? 'الأجزاء المراد إرجاعها الآن:' : 'Select Volumes to Return:'}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {outstandingVols.map((v) => {
                const picked = selectedVols.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`btn ${picked ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() =>
                      setSelectedVols((prev) =>
                        prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                      )
                    }
                  >
                    {isAr ? `الجزء ${v}` : `Volume ${v}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setReturningBook(null)}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            <Icon.Check />
            <span>{isAr ? 'تأكيد الإرجاع' : 'Confirm Return'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function BulkUpdateModal() {
  const { lang, bulkModalOpen, selectedBookIds, setBulkModalOpen, bulkUpdateBooks } =
    useRaffStore();
  const isAr = lang === 'ar';
  const [category, setCategory] = useState('');
  const [shelf, setShelf] = useState('');
  const [publisher, setPublisher] = useState('');

  if (!bulkModalOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => setBulkModalOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div className="section-title">
            {isAr
              ? `تعديل جماعي (${selectedBookIds.length} كتاب)`
              : `Bulk Edit (${selectedBookIds.length} Books)`}
          </div>
          <button className="win-ctrl-btn" onClick={() => setBulkModalOpen(false)}>
            <Icon.Close />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="input-group">
            <label className="input-label">{isAr ? 'توحيد التصنيف' : 'Set Category'}</label>
            <input
              className="vertix-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">{isAr ? 'توحيد موقع الرف' : 'Set Shelf'}</label>
            <input
              className="vertix-input"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">{isAr ? 'توحيد دار النشر' : 'Set Publisher'}</label>
            <input
              className="vertix-input"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setBulkModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                bulkUpdateBooks({
                  ...(category ? { category } : {}),
                  ...(shelf ? { shelf } : {}),
                  ...(publisher ? { publisher } : {}),
                })
              }
            >
              {isAr ? 'تطبيق التعديلات' : 'Apply Bulk Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LabelPreviewModal() {
  const { lang, labelPreviewBook, settings, setLabelPreviewBook } = useRaffStore();
  const isAr = lang === 'ar';

  if (!labelPreviewBook) return null;
  const svg = renderBarcodeSVG(labelPreviewBook.referenceNumber, {
    height: 48,
    moduleWidth: 1.8,
    color: '#111111',
    background: '#ffffff',
  });

  const handlePrintSingle = () => {
    printHtml(`<!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>${labelPreviewBook.title}</title>
        <style>
          @page { margin: 6mm; }
          body { font-family: system-ui, sans-serif; text-align: center; padding: 16px; margin: 0; background: #fff; color: #111; }
          .label-card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; display: inline-block; max-width: 320px; }
          .inst { font-size: 8.5pt; color: #555; font-weight: 700; margin-bottom: 3px; }
          .title { font-size: 11pt; font-weight: 700; margin-bottom: 6px; }
          .shelf { font-size: 8pt; color: #444; margin-bottom: 6px; font-weight: 600; }
          .bc svg { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <div class="label-card">
          <div class="inst">${settings.institutionName || 'مكتبة رَفّ'}</div>
          <div class="title">${labelPreviewBook.title}</div>
          ${labelPreviewBook.shelf ? `<div class="shelf">الرف: ${labelPreviewBook.shelf}</div>` : ''}
          <div class="bc">${svg}</div>
        </div>
      </body></html>`);
  };

  return (
    <div className="modal-backdrop" onClick={() => setLabelPreviewBook(null)}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div className="section-title">
            {isAr ? 'معاينة وطباعة ملصق الباركود' : 'Barcode Label Preview'}
          </div>
          <button className="win-ctrl-btn" onClick={() => setLabelPreviewBook(null)}>
            <Icon.Close />
          </button>
        </div>

        <div
          style={{
            background: '#ffffff',
            color: '#111111',
            borderRadius: 12,
            padding: 16,
            textAlign: 'center',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>
            {settings.institutionName || (isAr ? 'مكتبة رَفّ' : 'RAFF Library')}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, margin: '4px 0' }}>
            {labelPreviewBook.title}
          </div>
          <div
            style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => setLabelPreviewBook(null)}>
            {isAr ? 'إغلاق' : 'Close'}
          </button>
          <button className="btn btn-primary" onClick={handlePrintSingle}>
            <Icon.Printer />
            <span>{isAr ? 'طباعة الملصق الآن' : 'Print Label Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminLoginModal() {
  const {
    lang,
    auth,
    adminLoginModalOpen,
    setAdminLoginModalOpen,
    loginAdmin,
    recoverAdminPassword,
  } = useRaffStore();
  const isAr = lang === 'ar';
  const [password, setPassword] = useState('');
  const [recoverMode, setRecoverMode] = useState(false);
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');

  if (!adminLoginModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await loginAdmin(password);
    if (ok) setPassword('');
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await recoverAdminPassword(answer, newPassword);
    if (ok) {
      setRecoverMode(false);
      setAnswer('');
      setNewPassword('');
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setAdminLoginModalOpen(false)}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="section-header">
          <div className="section-title">
            <Icon.Lock style={{ color: 'var(--brand-accent)' }} />
            <span>
              {recoverMode
                ? isAr
                  ? 'استرداد كلمة مرور المسؤول'
                  : 'Recover Admin Password'
                : isAr
                ? 'فتح وضع الإدارة'
                : 'Unlock Admin Mode'}
            </span>
          </div>
          <button className="win-ctrl-btn" onClick={() => setAdminLoginModalOpen(false)}>
            <Icon.Close />
          </button>
        </div>

        {!recoverMode ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">
                {isAr ? 'أدخل كلمة مرور المسؤول' : 'Enter Admin Password'}
              </label>
              <input
                autoFocus
                type="password"
                className="vertix-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {auth?.recoveryConfigured ? (
                <button
                  type="button"
                  onClick={() => setRecoverMode(true)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--brand-accent)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                </button>
              ) : (
                <span />
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAdminLoginModalOpen(false)}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" className="btn btn-primary">
                  {isAr ? 'دخول الإدارة' : 'Unlock'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRecover} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
              {isAr ? 'سؤال الأمان:' : 'Security Question:'} "{auth.recoveryQuestion}"
            </div>
            <input
              required
              className="vertix-input"
              placeholder={isAr ? 'إجابة سؤال الأمان...' : 'Security answer...'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <input
              required
              type="password"
              className="vertix-input"
              placeholder={isAr ? 'كلمة المرور الجديدة...' : 'New password...'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRecoverMode(false)}
              >
                {isAr ? 'رجوع' : 'Back'}
              </button>
              <button type="submit" className="btn btn-primary">
                {isAr ? 'تعيين وفتح الإدارة' : 'Reset & Unlock'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
