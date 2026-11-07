import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { Icon } from '../components/Icons';
import {
  computeBookAvailability,
  LABEL_FIT_SCRIPT,
  referenceIdentity,
  renderBarcodeSVG,
} from '../lib/domain';
import { Book } from '../types';

export const ScannerLabelsView: React.FC = () => {
  const books = useRaffStore((s) => s.books);
  const meta = useRaffStore((s) => s.meta);
  const settings = useRaffStore((s) => s.settings);
  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);
  const openPrintCenter = useRaffStore((s) => s.openPrintCenter);
  const pushToast = useRaffStore((s) => s.pushToast);

  const [scanInput, setScanInput] = useState('');
  const [scannedBook, setScannedBook] = useState<Book | null>(null);
  const [labelScope, setLabelScope] = useState<'all' | 'category' | 'shelf'>('all');
  const [chosenCategory, setChosenCategory] = useState('');
  const [chosenShelf, setChosenShelf] = useState('');
  const [cols, setCols] = useState<3 | 4 | 5>(settings?.labelColumns || 4);

  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  const lookupByRef = (rawCode: string) => {
    const idKey = referenceIdentity(rawCode);
    if (!idKey) return;
    const found = books.find((b) => referenceIdentity(b.referenceNumber) === idKey);
    if (found) {
      setScannedBook(found);
      pushToast(`تم التعرف على الباركود: ${found.title} (${found.referenceNumber})`);
    } else {
      pushToast(`لم يتم العثور على كتاب بالرقم المرجعي: ${rawCode}`, 'error');
    }
  };

  // Global Hardware Wedge Barcode Listener
  useEffect(() => {
    const gapLimit = settings?.scannerGapMs || 35;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const now = performance.now();
      if (now - lastKeyTimeRef.current > gapLimit * 2.5) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.length >= 3) {
          e.preventDefault();
          const code = bufferRef.current;
          bufferRef.current = '';
          setScanInput(code);
          lookupByRef(code);
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [books, settings]);

  const labelsList = useMemo(() => {
    return books.filter((b) => {
      if (b.archivedAt) return false;
      if (labelScope === 'category' && chosenCategory) {
        return b.category === chosenCategory;
      }
      if (labelScope === 'shelf' && chosenShelf) {
        return b.shelf === chosenShelf;
      }
      return true;
    });
  }, [books, labelScope, chosenCategory, chosenShelf]);

  const handlePrintStudioSheet = () => {
    if (labelsList.length === 0) {
      pushToast('لا توجد كتب مطابقة لطباعة الملصقات', 'info');
      return;
    }
    const cards = labelsList
      .map(
        (b) => `
      <div class="label-card">
        <div class="inst" data-fit data-max-pt="7.5" data-min-pt="5" data-max-lines="1">${
          settings?.institutionName || 'مكتبة رف'
        }</div>
        <div class="title" data-fit data-max-pt="9.5" data-min-pt="5.5" data-max-lines="2">${
          b.title
        }</div>
        <div class="svg-wrap">${renderBarcodeSVG(b.referenceNumber, {
          height: 36,
          moduleWidth: 1.55,
        })}</div>
        <div class="meta">${b.shelf ? `رف: ${b.shelf}` : ''} ${
          b.price && settings?.labelShowPrice ? `· ${b.price} ر.س` : ''
        }</div>
      </div>`
      )
      .join('');

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: 'IBM Plex Sans Arabic', 'Readex Pro', sans-serif; margin: 0; background: #fff; color: #221913; }
      .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 5mm; }
      .label-card { border: 1px solid #d9d0c1; border-radius: 8px; padding: 8px; text-align: center; display: flex; flex-direction: column; gap: 4px; align-items: center; break-inside: avoid; }
      .inst { font-family: 'Readex Pro', sans-serif; font-size: 7pt; color: #544a41; font-weight: 700; width: 100%; }
      .title { font-family: 'Amiri', 'Readex Pro', serif; font-size: 9pt; font-weight: 700; width: 100%; }
      .svg-wrap svg { max-width: 100%; height: auto; }
      .meta { font-size: 7pt; color: #544a41; font-weight: 600; }
    </style></head><body><div class="grid">${cards}</div>${LABEL_FIT_SCRIPT}</body></html>`;

    openPrintCenter(`استوديو طباعة الملصقات (${labelsList.length} ملصق)`, html);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Barcode />
          </div>
          <div>
            <h1 className="stage-title">الماسح الضوئي واستوديو ملصقات الباركود</h1>
            <p className="stage-subtitle">
              دعم كامل لقارئات الباركود الليزرية (Code 128B) وطباعة صفحات A4 بمقاسات ذكية
            </p>
          </div>
        </div>
      </div>

      {/* Live Scanner Box */}
      <div className="vertix-card" style={{ gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800 }}>
              قارئ الباركود الفوري (Hardware Wedge & Manual)
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              امسح الباركود مباشرة بجهاز القارئ في أي وقت، أو أدخل الرقم المرجعي يدوياً:
            </p>
          </div>
          <span className="status-badge available">متصل وجاهز للمسح ({settings?.scannerGapMs || 35}ms)</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookupByRef(scanInput);
          }}
          style={{ display: 'flex', gap: '10px' }}
        >
          <input
            type="text"
            className="vertix-input"
            style={{ direction: 'ltr', fontFamily: 'var(--font-mono)', fontSize: '15px' }}
            placeholder="امسح أو اكتب الرقم المرجعي مثل raf-0001 ثم اضغط Enter..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
          />
          <button type="submit" className="btn-primary-orange">
            بحث بالباركود
          </button>
        </form>

        {scannedBook && (
          <div
            style={{
              background: 'var(--bg-surface-muted)',
              padding: '18px',
              borderRadius: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              border: '1px solid var(--accent-orange)',
            }}
          >
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="ref-mono-pill">{scannedBook.referenceNumber}</span>
                <span className={`status-badge ${computeBookAvailability(scannedBook).state}`}>
                  {computeBookAvailability(scannedBook).state === 'available'
                    ? 'متاح للإعارة'
                    : 'مستعار حالياً'}
                </span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginTop: '8px' }}>
                {scannedBook.title}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {scannedBook.author} · {scannedBook.publisher} · الرف: {scannedBook.shelf || '—'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div
                className="barcode-preview-plate"
                dangerouslySetInnerHTML={{
                  __html: renderBarcodeSVG(scannedBook.referenceNumber, {
                    height: 38,
                    moduleWidth: 1.5,
                  }),
                }}
              />
              <button
                className="btn-primary-orange"
                onClick={() => setSelectedBookId(scannedBook.id)}
              >
                إدارة الإعارة / التفاصيل
              </button>
            </div>
          </div>
        )}
      </div>

      {/* A4 Barcode Label Studio */}
      <div className="vertix-card" style={{ gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800 }}>
              استوديو طباعة ملصقات الباركود (A4 Label Studio)
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              تحجيم تلقائي ذكي للنصوص الطويلة بدون قص أو نقاط حذف ({labelsList.length} ملصق محدد)
            </p>
          </div>
          <button className="btn-primary-orange" onClick={handlePrintStudioSheet}>
            <Icon.Printer />
            <span>معاينة وطباعة صفحة الملصقات ({labelsList.length})</span>
          </button>
        </div>

        <div className="form-grid">
          <div className="field-group">
            <label>نطاق الملصقات</label>
            <select
              className="vertix-select"
              value={labelScope}
              onChange={(e) => setLabelScope(e.target.value as any)}
            >
              <option value="all">كل كتب المكتبة ({books.length})</option>
              <option value="category">حسب التصنيف</option>
              <option value="shelf">حسب الرف</option>
            </select>
          </div>

          {labelScope === 'category' && (
            <div className="field-group">
              <label>اختر التصنيف</label>
              <select
                className="vertix-select"
                value={chosenCategory}
                onChange={(e) => setChosenCategory(e.target.value)}
              >
                <option value="">كل التصنيفات</option>
                {(meta?.categories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {labelScope === 'shelf' && (
            <div className="field-group">
              <label>اختر الرف</label>
              <select
                className="vertix-select"
                value={chosenShelf}
                onChange={(e) => setChosenShelf(e.target.value)}
              >
                <option value="">كل الرفوف</option>
                {(meta?.shelves || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-group">
            <label>عدد الأعمدة في صفحة A4</label>
            <select
              className="vertix-select"
              value={cols}
              onChange={(e) => setCols(Number(e.target.value) as 3 | 4 | 5)}
            >
              <option value={3}>3 أعمدة (ملصقات كبيرة)</option>
              <option value={4}>4 أعمدة (قياسي)</option>
              <option value={5}>5 أعمدة (مكثف)</option>
            </select>
          </div>
        </div>

        {/* Live Preview Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '12px',
          }}
        >
          {labelsList.slice(0, 8).map((b) => (
            <div
              key={b.id}
              style={{
                background: '#faf8f4',
                color: '#2b211b',
                border: '1px solid #d9d5ca',
                borderRadius: '14px',
                padding: '12px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '10.5px', color: '#544a41', fontWeight: 700, fontFamily: 'var(--font-ui)' }}>
                {settings?.institutionName || 'مكتبة رف'}
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: '#221913' }}>
                {b.title}
              </div>
              <div
                dangerouslySetInnerHTML={{
                  __html: renderBarcodeSVG(b.referenceNumber, {
                    height: 34,
                    moduleWidth: 1.45,
                  }),
                }}
              />
              <div style={{ fontSize: '11px', color: '#544a41', fontWeight: 600 }}>
                {b.shelf ? `رف: ${b.shelf}` : ''} {b.volumes > 1 ? `· ${b.volumes} مجلد` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
