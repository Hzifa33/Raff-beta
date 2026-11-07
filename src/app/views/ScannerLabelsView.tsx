import React, { useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import {
  cleanReferenceText,
  computeBookAvailability,
  LABEL_FIT_SCRIPT,
  renderBarcodeSVG,
} from '../lib/domain';
import { Icon } from '../components/Icons';

export function ScannerLabelsView() {
  const {
    lang,
    books,
    settings,
    setInspectedBook,
    setBorrowingBook,
    setReturningBook,
    updateSettings,
    pushToast,
  } = useRaffStore();
  const isAr = lang === 'ar';

  const [scanInput, setScanInput] = useState('');
  const [scanAction, setScanAction] = useState<'inspect' | 'borrow' | 'return'>('inspect');
  const [selectedForPrint, setSelectedForPrint] = useState<string[]>(
    books.slice(0, 8).map((b) => b.id)
  );
  const [searchPrint, setSearchPrint] = useState('');

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = cleanReferenceText(scanInput);
    if (!cleaned) return;
    const found = books.find(
      (b) => b.referenceNumber.toLowerCase() === cleaned.toLowerCase()
    );
    if (!found) {
      pushToast(
        'error',
        isAr
          ? `لم يتم العثور على كتاب بالرقم المرجعي: ${cleaned}`
          : `No book found with reference: ${cleaned}`
      );
      return;
    }

    const avail = computeBookAvailability(found);
    if (scanAction === 'borrow') {
      if (avail.availableCopies > 0) {
        setBorrowingBook(found);
      } else {
        pushToast(
          'warning',
          isAr ? 'جميع نسخ الكتاب مستعارة حالياً' : 'All copies are currently borrowed'
        );
      }
    } else if (scanAction === 'return') {
      if (avail.activeLoans.length > 0) {
        setReturningBook({ book: found });
      } else {
        pushToast(
          'info',
          isAr ? 'لا توجد إعارات نشطة لهذا الكتاب' : 'No active loans for this book'
        );
      }
    } else {
      setInspectedBook(found);
    }
    setScanInput('');
  };

  const togglePrintBook = (id: string) => {
    setSelectedForPrint((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const printSelectedSheet = () => {
    const chosen = books.filter((b) => selectedForPrint.includes(b.id));
    if (chosen.length === 0) {
      pushToast(
        'warning',
        isAr ? 'اختر كتاباً واحداً على الأقل للطباعة' : 'Select at least one book to print'
      );
      return;
    }

    const cols = settings.labelColumns || 4;
    const cardsHtml = chosen
      .map((b) => {
        const svg = renderBarcodeSVG(b.referenceNumber, {
          height: 36,
          moduleWidth: 1.5,
          color: '#111111',
          background: '#ffffff',
        });
        return `
          <div class="label-box">
            <div class="inst" data-fit data-max-pt="8" data-min-pt="5" data-max-lines="1">${
              settings.institutionName || 'مكتبة رَفّ'
            }</div>
            <div class="title" data-fit data-max-pt="9.5" data-min-pt="5.5" data-max-lines="2">${
              b.title
            }</div>
            <div class="meta">
              ${settings.labelShowShelf && b.shelf ? `<span>رف: ${b.shelf}</span>` : ''}
              ${
                settings.labelShowPrice && b.price
                  ? `<span>${b.price} ر.س</span>`
                  : ''
              }
            </div>
            <div class="bc">${svg}</div>
          </div>
        `;
      })
      .join('');

    const html = `<!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>ملصقات باركود رَفّ A4</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
          .sheet { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 6mm; }
          .label-box { border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; text-align: center; page-break-inside: avoid; }
          .inst { font-size: 7.5pt; color: #555; font-weight: 700; margin-bottom: 2px; }
          .title { font-size: 9pt; font-weight: 700; margin-bottom: 4px; }
          .meta { font-size: 7pt; color: #444; display: flex; justify-content: center; gap: 8px; margin-bottom: 4px; }
          .bc svg { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <div class="sheet">${cardsHtml}</div>
        ${LABEL_FIT_SCRIPT}
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
      </body>
      </html>`;

    const win = window.open('', '_blank', 'width=980,height=720');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      pushToast('info', isAr ? 'تم تجهيز صفحة الملصقات' : 'Label sheet prepared');
    }
  };

  const filteredBooks = books.filter((b) => {
    if (!searchPrint.trim()) return true;
    const q = searchPrint.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.referenceNumber.toLowerCase().includes(q) ||
      (b.shelf || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="stage-view">
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {/* Column 1: Hardware Barcode Wedge & Instant Action Station */}
        <div className="glass-panel panel-flex-col" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon.Barcode style={{ color: 'var(--brand-accent)' }} />
                  <span>{isAr ? 'محطة قارئ الباركود الفورية' : 'Hardware Barcode Station'}</span>
                </div>
                <div className="section-subtitle">
                  {isAr
                    ? `التقاط تلقائي بسرعة ${settings.scannerGapMs}ms (${settings.scannerTerminator})`
                    : `Auto-wedge capture at ${settings.scannerGapMs}ms (${settings.scannerTerminator})`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                type="button"
                className={`btn ${scanAction === 'inspect' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setScanAction('inspect')}
              >
                {isAr ? 'عرض البطاقة' : 'Inspect'}
              </button>
              <button
                type="button"
                className={`btn ${scanAction === 'borrow' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setScanAction('borrow')}
              >
                {isAr ? 'إعارة سريعة' : 'Quick Borrow'}
              </button>
              <button
                type="button"
                className={`btn ${scanAction === 'return' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setScanAction('return')}
              >
                {isAr ? 'إرجاع سريع' : 'Quick Return'}
              </button>
            </div>

            <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: 6 }}>
              <input
                className="vertix-input"
                style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="raf-0001..."
              />
              <button type="submit" className="btn btn-primary">
                {isAr ? 'تنفيذ' : 'Go'}
              </button>
            </form>

            {/* Label Sheet Quick Options */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                {isAr ? 'إعدادات شبكة الملصقات (A4)' : 'A4 Label Sheet Configuration'}
              </div>

              <div className="input-group">
                <label className="input-label">
                  {isAr ? 'عدد الأعمدة في صفحة A4' : 'Columns per A4 Sheet'}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([3, 4, 5] as const).map((col) => (
                    <button
                      key={col}
                      type="button"
                      className={`btn ${settings.labelColumns === col ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ flex: 1 }}
                      onClick={() => updateSettings({ labelColumns: col })}
                    >
                      {col} {isAr ? 'أعمدة' : 'Cols'}
                    </button>
                  ))}
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.labelShowShelf}
                  onChange={(e) => updateSettings({ labelShowShelf: e.target.checked })}
                />
                <span>{isAr ? 'إظهار موقع الرف على الملصق' : 'Show shelf location on label'}</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.labelShowPrice}
                  onChange={(e) => updateSettings({ labelShowPrice: e.target.checked })}
                />
                <span>{isAr ? 'إظهار السعر على الملصق' : 'Show price on label'}</span>
              </label>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', height: 36 }}
            onClick={printSelectedSheet}
          >
            <Icon.Printer />
            <span>
              {isAr
                ? `طباعة الملصقات المحددة (${selectedForPrint.length.toLocaleString('en-US')})`
                : `Print Selected Labels (${selectedForPrint.length.toLocaleString('en-US')})`}
            </span>
          </button>
        </div>

        {/* Column 2: A4 Label Studio & Book Picker */}
        <div className="glass-panel panel-flex-col">
          <div className="section-header">
            <div>
              <div className="section-title">
                <Icon.Printer style={{ color: 'var(--brand-accent)' }} />
                <span>{isAr ? 'استوديو معاينة وتحديد ملصقات الكتب' : 'Label Print Studio & Selection'}</span>
              </div>
              <div className="section-subtitle">
                {isAr
                  ? 'انقر على أي بطاقة لتضمينها أو استبعادها من ورقة الطباعة'
                  : 'Click any card to toggle inclusion in the A4 print sheet'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="vertix-input"
                style={{ width: 190, height: 30 }}
                value={searchPrint}
                onChange={(e) => setSearchPrint(e.target.value)}
                placeholder={isAr ? 'تصفية الكتب...' : 'Filter books...'}
              />
              <button
                className="btn btn-ghost"
                style={{ height: 30 }}
                onClick={() => setSelectedForPrint(filteredBooks.map((b) => b.id))}
              >
                {isAr ? 'تحديد الكل' : 'Select All'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ height: 30 }}
                onClick={() => setSelectedForPrint([])}
              >
                {isAr ? 'إلغاء الكل' : 'Clear'}
              </button>
            </div>
          </div>

          <div className="scroll-region">
            {filteredBooks.length === 0 ? (
              <div className="empty-state-card">
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {isAr ? 'لا توجد كتب مطابقة لعرض الملصقات' : 'No matching books to display labels'}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${settings.labelColumns || 4}, 1fr)`,
                  gap: 10,
                }}
              >
                {filteredBooks.map((b) => {
                  const isSelected = selectedForPrint.includes(b.id);
                  const svg = renderBarcodeSVG(b.referenceNumber, {
                    height: 36,
                    moduleWidth: 1.45,
                    color: '#1c1613',
                    background: '#ffffff',
                  });
                  return (
                    <div
                      key={b.id}
                      onClick={() => togglePrintBook(b.id)}
                      style={{
                        background: '#ffffff',
                        color: '#1c1613',
                        borderRadius: 10,
                        padding: 10,
                        border: isSelected
                          ? '2px solid var(--brand-accent)'
                          : '1px solid rgba(0,0,0,0.12)',
                        boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                        opacity: isSelected ? 1 : 0.65,
                        cursor: 'pointer',
                        textAlign: 'center',
                        position: 'relative',
                        transition: 'all 0.16s ease',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: '#6b5e53',
                          marginBottom: 2,
                        }}
                      >
                        {settings.institutionName || (isAr ? 'مكتبة رَفّ' : 'RAFF Library')}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: 4,
                        }}
                      >
                        {b.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#574c43',
                          marginBottom: 6,
                          display: 'flex',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        {settings.labelShowShelf && b.shelf && <span>{b.shelf}</span>}
                        {settings.labelShowPrice && b.price && <span>{b.price} ر.س</span>}
                      </div>
                      <div
                        style={{ display: 'flex', justifyContent: 'center', overflow: 'hidden' }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
