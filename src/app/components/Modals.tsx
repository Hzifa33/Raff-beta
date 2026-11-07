import React, { useMemo, useRef, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import {
  computeBookAvailability,
  getLoanOutstandingVolumes,
  loanScopeLabel,
  renderBarcodeSVG,
} from '../lib/domain';
import { Icon } from './Icons';

export const BookDetailModal: React.FC = () => {
  const selectedBookId = useRaffStore((s) => s.selectedBookId);
  const books = useRaffStore((s) => s.books);
  const meta = useRaffStore((s) => s.meta);
  const auth = useRaffStore((s) => s.auth);

  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);
  const setEditingBook = useRaffStore((s) => s.setEditingBook);
  const setActiveTab = useRaffStore((s) => s.setActiveTab);
  const borrowCopy = useRaffStore((s) => s.borrowCopy);
  const returnLoan = useRaffStore((s) => s.returnLoan);
  const returnLoanParts = useRaffStore((s) => s.returnLoanParts);
  const removeBook = useRaffStore((s) => s.removeBook);
  const updateBook = useRaffStore((s) => s.updateBook);
  const pushToast = useRaffStore((s) => s.pushToast);

  const book = useMemo(
    () => books.find((b) => b.id === selectedBookId) || null,
    [books, selectedBookId]
  );

  const [borrowerName, setBorrowerName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [loanType, setLoanType] = useState<'full' | 'partial'>('full');
  const [selectedVols, setSelectedVols] = useState<number[]>([]);
  const [editingRef, setEditingRef] = useState(false);
  const [refInput, setRefInput] = useState('');
  const [partReturnMap, setPartReturnMap] = useState<Record<string, number[]>>({});

  if (!book) return null;

  const isAdmin = !auth || auth.mode === 'admin';
  const avail = computeBookAvailability(book);

  const handleBorrowerChange = (val: string) => {
    setBorrowerName(val);
    const prof = (meta?.borrowerProfiles || []).find(
      (p) => p.name.toLowerCase() === val.trim().toLowerCase()
    );
    if (prof && prof.contact && !contact) {
      setContact(prof.contact);
    }
  };

  const toggleVolumeSelection = (v: number) => {
    setSelectedVols((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  const handleBorrowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await borrowCopy(book.id, {
        borrowerName,
        contact,
        note,
        type: book.volumes > 1 ? loanType : 'full',
        volumes: loanType === 'partial' ? selectedVols : [],
      });
      setBorrowerName('');
      setContact('');
      setNote('');
      setSelectedVols([]);
    } catch (err: any) {
      pushToast(err?.message || 'تعذر تسجيل الإعارة', 'error');
    }
  };

  const handleSaveRef = async () => {
    try {
      await updateBook(book.id, { referenceNumber: refInput });
      setEditingRef(false);
    } catch (err: any) {
      pushToast(err?.message || 'الرقم المرجعي مستخدم بالفعل', 'error');
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setSelectedBookId(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!editingRef ? (
                <span
                  className="ref-mono-pill"
                  style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (isAdmin) {
                      setRefInput(book.referenceNumber);
                      setEditingRef(true);
                    }
                  }}
                >
                  {book.referenceNumber}
                </span>
              ) : (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    className="vertix-input"
                    style={{ width: '130px', padding: '4px 8px', direction: 'ltr' }}
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                  />
                  <button className="btn-primary-orange" onClick={handleSaveRef}>
                    حفظ
                  </button>
                </div>
              )}
              <span className={`status-badge ${avail.state}`}>
                {avail.state === 'available'
                  ? 'متاح'
                  : avail.state === 'partial'
                  ? 'مستعار جزئياً'
                  : 'مستعار بالكامل'}
              </span>
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '24px',
                fontWeight: 700,
                lineHeight: 1.38,
                marginTop: '8px',
              }}
            >
              {book.title}
            </h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              {book.author || '—'} · {book.publisher || '—'} · {book.category || '—'}
            </p>
          </div>

          <button className="btn-soft" onClick={() => setSelectedBookId(null)}>
            إغلاق
          </button>
        </div>

        {/* Metadata Chips & Barcode */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            background: 'var(--bg-surface-muted)',
            padding: '14px 18px',
            borderRadius: '18px',
          }}
        >
          <div className="book-card-meta-strip">
            <span className="meta-chip">
              النسخ المتاحة: {avail.availableCopies}/{avail.copiesTotal}
            </span>
            <span className="meta-chip">عدد الأجزاء: {book.volumes}</span>
            {book.shelf && <span className="meta-chip">الرف: {book.shelf}</span>}
            {book.edition && <span className="meta-chip">الطبعة: {book.edition}</span>}
            {book.publishYear && <span className="meta-chip">السنة: {book.publishYear}</span>}
            {isAdmin && book.price && (
              <span className="meta-chip">السعر: {book.price} ر.س</span>
            )}
          </div>
          <div
            className="barcode-preview-plate"
            dangerouslySetInnerHTML={{
              __html: renderBarcodeSVG(book.referenceNumber, {
                height: 36,
                moduleWidth: 1.5,
              }),
            }}
          />
        </div>

        {/* Multi-Volume Availability Strip */}
        {book.volumes > 1 && (
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '8px' }}>
              خريطة توفر الأجزاء ({avail.availableVolumes.length} متاح من {book.volumes}):
            </div>
            <div className="volumes-strip">
              {Array.from({ length: book.volumes }, (_, idx) => idx + 1).map((v) => {
                const free = avail.availableVolumes.includes(v);
                return (
                  <span key={v} className={`vol-pill ${free ? 'free' : 'busy'}`}>
                    الجزء {v} ({free ? 'متاح' : 'مستعار'})
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Loans & Progressive Volume Return (Admin Only) */}
        {isAdmin && avail.activeLoans.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
              الإعارات النشطة حالياً ({avail.activeLoans.length})
            </h3>
            {avail.activeLoans.map((l) => {
              const outstanding = getLoanOutstandingVolumes(l);
              const pickedForReturn = partReturnMap[l.id] || [];
              return (
                <div
                  key={l.id}
                  style={{
                    background: 'var(--bg-surface-muted)',
                    padding: '14px 16px',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px' }}>
                        المستعير: {l.borrowerName}{' '}
                        {l.contact ? `(${l.contact})` : ''}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        النطاق المتبقي: {loanScopeLabel(l, true) || 'نسخة كاملة'} · الاستحقاق:{' '}
                        {l.dueAt?.slice(0, 10)}
                      </div>
                    </div>
                    <button
                      className="btn-primary-orange"
                      style={{ padding: '7px 14px', fontSize: '12px' }}
                      onClick={() => returnLoan(book.id, l.id)}
                    >
                      إرجاع الإعارة بالكامل
                    </button>
                  </div>

                  {/* Progressive Partial Volume Return Picker */}
                  {l.type === 'partial' && outstanding.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {outstanding.map((v) => {
                          const checked = pickedForReturn.includes(v);
                          return (
                            <button
                              key={v}
                              type="button"
                              className={checked ? 'btn-obsidian' : 'btn-soft'}
                              style={{ padding: '4px 10px', fontSize: '11.5px' }}
                              onClick={() => {
                                const next = checked
                                  ? pickedForReturn.filter((x) => x !== v)
                                  : [...pickedForReturn, v];
                                setPartReturnMap({ ...partReturnMap, [l.id]: next });
                              }}
                            >
                              إرجاع ج{v}
                            </button>
                          );
                        })}
                      </div>
                      {pickedForReturn.length > 0 && (
                        <button
                          className="btn-obsidian"
                          style={{ padding: '6px 12px', fontSize: '11.5px' }}
                          onClick={async () => {
                            await returnLoanParts(book.id, l.id, pickedForReturn);
                            setPartReturnMap({ ...partReturnMap, [l.id]: [] });
                          }}
                        >
                          تأكيد إرجاع الأجزاء المحددة ({pickedForReturn.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* New Borrow Form (Admin Only & if copies/volumes available) */}
        {isAdmin && avail.availableCopies > 0 && (
          <form
            onSubmit={handleBorrowSubmit}
            style={{
              background: 'var(--bg-surface-muted)',
              padding: '16px 18px',
              borderRadius: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>تسجيل إعارة جديدة</h3>
            <div className="form-grid">
              <div className="field-group">
                <label>اسم المستعير *</label>
                <input
                  className="vertix-input"
                  required
                  list="raff-borrowers-list"
                  value={borrowerName}
                  onChange={(e) => handleBorrowerChange(e.target.value)}
                  placeholder="اسم الباحث أو المستعير..."
                />
                <datalist id="raff-borrowers-list">
                  {(meta?.borrowers || []).map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div className="field-group">
                <label>وسيلة التواصل (يُملأ تلقائياً للمستعير السابق)</label>
                <input
                  className="vertix-input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="05XXXXXXXX"
                />
              </div>
            </div>

            {book.volumes > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={loanType === 'full' ? 'btn-obsidian' : 'btn-soft'}
                    onClick={() => setLoanType('full')}
                  >
                    إعارة النسخة كاملة ({book.volumes} أجزاء)
                  </button>
                  <button
                    type="button"
                    className={loanType === 'partial' ? 'btn-obsidian' : 'btn-soft'}
                    onClick={() => setLoanType('partial')}
                  >
                    إعارة أجزاء محددة فقط
                  </button>
                </div>

                {loanType === 'partial' && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {avail.availableVolumes.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={selectedVols.includes(v) ? 'btn-primary-orange' : 'btn-soft'}
                        style={{ padding: '5px 11px', fontSize: '12px' }}
                        onClick={() => toggleVolumeSelection(v)}
                      >
                        الجزء {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                className="vertix-input"
                style={{ maxWidth: '340px' }}
                placeholder="ملاحظة على الإعارة (اختياري)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className="btn-primary-orange">
                تأكيد الإعارة
              </button>
            </div>
          </form>
        )}

        {/* Footer Actions */}
        {isAdmin && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              className="btn-soft"
              onClick={() => {
                setEditingBook(book);
                setSelectedBookId(null);
                setActiveTab('add');
              }}
            >
              تعديل بيانات الكتاب
            </button>
            <button
              className="btn-soft"
              style={{ color: 'var(--status-borrowed)' }}
              onClick={async () => {
                try {
                  await removeBook(book.id);
                } catch (err: any) {
                  pushToast(err?.message || 'لا يمكن حذف الكتاب', 'error');
                }
              }}
            >
              نقل إلى سلة المهملات
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminLoginModal: React.FC = () => {
  const show = useRaffStore((s) => s.showLoginModal);
  const auth = useRaffStore((s) => s.auth);
  const setShow = useRaffStore((s) => s.setShowLoginModal);
  const loginAdmin = useRaffStore((s) => s.loginAdmin);

  const [password, setPassword] = useState('');
  const [capsLock, setCapsLock] = useState(false);

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await loginAdmin(password);
    if (ok) setPassword('');
  };

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="kpi-icon-badge">
              <Icon.Lock />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>فتح وضع الإدارة</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                محمي بتشفير Scrypt · المحاولات المتبقية: {auth?.remainingAttempts ?? 5}
              </p>
            </div>
          </div>
          <button className="btn-soft" onClick={() => setShow(false)}>
            إغلاق
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field-group">
            <label>كلمة مرور المسؤول</label>
            <input
              type="password"
              className="vertix-input"
              autoFocus
              value={password}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور..."
            />
          </div>

          {capsLock && (
            <span className="status-badge partial">تنبيه: مفتاح Caps Lock قيد التشغيل</span>
          )}

          <button type="submit" className="btn-primary-orange" style={{ justifyContent: 'center' }}>
            دخول إلى وضع الإدارة
          </button>
        </form>
      </div>
    </div>
  );
};

export const PrintCenterModal: React.FC = () => {
  const show = useRaffStore((s) => s.showPrintModal);
  const title = useRaffStore((s) => s.printTitle);
  const html = useRaffStore((s) => s.printHtmlContent);
  const close = useRaffStore((s) => s.closePrintCenter);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  if (!show) return null;

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal-card"
        style={{ maxWidth: '960px', height: '86vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>{title}</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              مركز الطباعة والتصدير الفوري إلى PDF — مكتبة رف 4.0
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary-orange" onClick={handlePrint}>
              <Icon.Printer />
              <span>طباعة / حفظ كملف PDF</span>
            </button>
            <button className="btn-soft" onClick={close}>
              إغلاق
            </button>
          </div>
        </div>

        <iframe
          ref={iframeRef}
          title={title}
          srcDoc={html}
          style={{
            flex: 1,
            width: '100%',
            border: '1px solid var(--border-subtle)',
            borderRadius: '18px',
            background: '#ffffff',
          }}
        />
      </div>
    </div>
  );
};
