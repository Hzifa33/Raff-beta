import React, { useEffect, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { invokeRaff } from '../lib/ipc';
import { renderBarcodeSVG } from '../lib/domain';
import { Icon } from '../components/Icons';

export function BookFormView() {
  const { lang, meta, settings, addBook, setActiveTab, setLabelPreviewBook } = useRaffStore();
  const isAr = lang === 'ar';

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [nextRefHint, setNextRefHint] = useState('raf-0001');
  const [category, setCategory] = useState('');
  const [edition, setEdition] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [copiesTotal, setCopiesTotal] = useState(1);
  const [volumes, setVolumes] = useState(1);
  const [price, setPrice] = useState('');
  const [series, setSeries] = useState('');
  const [seriesOrder, setSeriesOrder] = useState('');
  const [keywords, setKeywords] = useState('');
  const [condition, setCondition] = useState('جيدة');
  const [acquisition, setAcquisition] = useState('');
  const [shelf, setShelf] = useState('');
  const [language, setLanguage] = useState('العربية');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    invokeRaff<string>('peek_next_reference_number')
      .then((ref) => {
        if (ref) setNextRefHint(ref);
      })
      .catch(() => {});
  }, []);

  const effectiveRef = referenceNumber.trim() || nextRefHint;
  const barcodeSvg = renderBarcodeSVG(effectiveRef, {
    height: 44,
    moduleWidth: 1.75,
    color: '#1c1613',
    background: '#ffffff',
  });

  const resetForm = async () => {
    setTitle('');
    setAuthor('');
    setPublisher('');
    setReferenceNumber('');
    setCategory('');
    setEdition('');
    setPublishYear('');
    setCopiesTotal(1);
    setVolumes(1);
    setPrice('');
    setSeries('');
    setSeriesOrder('');
    setKeywords('');
    setCondition('جيدة');
    setAcquisition('');
    setShelf('');
    setLanguage('العربية');
    setNotes('');
    const next = await invokeRaff<string>('peek_next_reference_number');
    if (next) setNextRefHint(next);
  };

  const handleSubmit = async (e: React.FormEvent, printAfter = false) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    const created = await addBook({
      title,
      author,
      publisher,
      referenceNumber: referenceNumber.trim(),
      category,
      edition,
      publishYear,
      copiesTotal: Number(copiesTotal) || 1,
      volumes: Number(volumes) || 1,
      price: price ? Number(price) : null,
      series,
      seriesOrder,
      keywords: keywords
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean),
      condition,
      acquisition,
      shelf,
      language,
      notes,
    });
    setSubmitting(false);
    if (created) {
      await resetForm();
      if (printAfter) {
        setLabelPreviewBook(created);
      }
    }
  };

  return (
    <div className="stage-view">
      <form
        onSubmit={(e) => handleSubmit(e, false)}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 310px',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {/* Main Form Panel (Fits inside viewport with internal scroll if window is small) */}
        <div className="glass-panel panel-flex-col">
          <div className="section-header">
            <div>
              <div className="section-title">
                <Icon.Plus style={{ color: 'var(--brand-accent)' }} />
                <span>{isAr ? 'بطاقة فهرسة وإضافة كتاب جديد' : 'Add & Index New Book'}</span>
              </div>
              <div className="section-subtitle">
                {isAr
                  ? 'يتم توليد الرقم المرجعي والباركود تلقائياً مع منع التكرار'
                  : 'Automatic reference numbering, barcode generation & duplicate prevention'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7 }}>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                {isAr ? 'تفريغ الحقول' : 'Clear Form'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!title.trim() || submitting}
                onClick={(e) => handleSubmit(e as any, true)}
              >
                <Icon.Printer />
                <span>{isAr ? 'حفظ وطباعة ملصق' : 'Save & Print Label'}</span>
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!title.trim() || submitting}
              >
                <Icon.Check />
                <span>{isAr ? 'حفظ وإضافة للفهرس' : 'Save to Catalogue'}</span>
              </button>
            </div>
          </div>

          <div className="scroll-region">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">
                  {isAr ? 'عنوان الكتاب *' : 'Book Title *'}
                </label>
                <input
                  required
                  className="vertix-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isAr ? 'مثال: مقدمة ابن خلدون' : 'e.g. The Muqaddimah'}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  {isAr ? 'الرقم المرجعي (تلقائي أو مخصص)' : 'Reference No. (Auto or Custom)'}
                </label>
                <input
                  className="vertix-input"
                  style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder={nextRefHint}
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'المؤلف / المحقق' : 'Author / Editor'}</label>
                <input
                  list="authors-list"
                  className="vertix-input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={isAr ? 'اسم المؤلف...' : 'Author name...'}
                />
                <datalist id="authors-list">
                  {(meta?.authors || []).map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'دار النشر' : 'Publisher'}</label>
                <input
                  list="publishers-list"
                  className="vertix-input"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder={isAr ? 'اسم دار النشر...' : 'Publisher...'}
                />
                <datalist id="publishers-list">
                  {(meta?.publishers || []).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'التصنيف الموضوعي' : 'Subject Category'}</label>
                <input
                  list="categories-list"
                  className="vertix-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={isAr ? 'مثال: التاريخ، الأدب...' : 'e.g. History, Literature...'}
                />
                <datalist id="categories-list">
                  {(meta?.categories || []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'عدد النسخ' : 'Total Copies'}</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="vertix-input"
                  value={copiesTotal}
                  onChange={(e) => setCopiesTotal(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'عدد الأجزاء / المجلدات' : 'Volumes / Parts'}</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="vertix-input"
                  value={volumes}
                  onChange={(e) => setVolumes(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'موقع الرف / الخزانة' : 'Shelf Location'}</label>
                <input
                  list="shelves-list"
                  className="vertix-input"
                  value={shelf}
                  onChange={(e) => setShelf(e.target.value)}
                  placeholder={isAr ? 'مثال: A-01' : 'e.g. A-01'}
                />
                <datalist id="shelves-list">
                  {(meta?.shelves || []).map((sh) => (
                    <option key={sh} value={sh} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'الطبعة' : 'Edition'}</label>
                <input
                  className="vertix-input"
                  value={edition}
                  onChange={(e) => setEdition(e.target.value)}
                  placeholder={isAr ? 'الأولى، الثانية المحققة...' : '1st, Revised...'}
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'سنة النشر' : 'Publish Year'}</label>
                <input
                  className="vertix-input"
                  value={publishYear}
                  onChange={(e) => setPublishYear(e.target.value)}
                  placeholder="2024 / 1446"
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'السعر للنسخة' : 'Price per Copy'}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="vertix-input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'السلسلة' : 'Series Name'}</label>
                <input
                  list="series-list"
                  className="vertix-input"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder={isAr ? 'اسم السلسلة العلمية...' : 'Series title...'}
                />
                <datalist id="series-list">
                  {(meta?.series || []).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'الترتيب في السلسلة' : 'Series Number'}</label>
                <input
                  className="vertix-input"
                  value={seriesOrder}
                  onChange={(e) => setSeriesOrder(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'حالة النسخة واللغة' : 'Condition & Language'}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <select
                    className="vertix-select"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    <option value="جيدة">{isAr ? 'جيدة' : 'Good'}</option>
                    <option value="مقبولة">{isAr ? 'مقبولة' : 'Fair'}</option>
                    <option value="تالفة">{isAr ? 'تالفة' : 'Damaged'}</option>
                    <option value="مفقودة">{isAr ? 'مفقودة' : 'Missing'}</option>
                  </select>
                  <input
                    className="vertix-input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder={isAr ? 'العربية' : 'Arabic'}
                  />
                </div>
              </div>

              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">
                  {isAr ? 'الكلمات المفتاحية (مفصولة بفاصلة)' : 'Keywords (comma-separated)'}
                </label>
                <input
                  className="vertix-input"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={isAr ? 'تاريخ، تراجم، فقه، تحقيق...' : 'history, biography, classic...'}
                />
              </div>

              <div className="input-group">
                <label className="input-label">{isAr ? 'مصدر الاقتناء' : 'Acquisition Source'}</label>
                <input
                  className="vertix-input"
                  value={acquisition}
                  onChange={(e) => setAcquisition(e.target.value)}
                  placeholder={isAr ? 'شراء، إهداء، وقف...' : 'Purchase, Gift, Endowment...'}
                />
              </div>

              <div className="input-group" style={{ gridColumn: 'span 3' }}>
                <label className="input-label">{isAr ? 'ملاحظات الفهرسة' : 'Cataloguing Notes'}</label>
                <textarea
                  rows={2}
                  className="vertix-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? 'ملاحظات حول الطبعة أو المجلدات...' : 'Additional notes about edition or binding...'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Side Live Label & Barcode Plate Preview */}
        <div className="glass-panel panel-flex-col" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon.Barcode style={{ color: 'var(--brand-accent)' }} />
                  <span>{isAr ? 'معاينة الملصق والباركود' : 'Live Label & Barcode'}</span>
                </div>
                <div className="section-subtitle">Code 128B · {effectiveRef}</div>
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                color: '#1c1613',
                borderRadius: 12,
                padding: 14,
                border: '1px solid rgba(0,0,0,0.12)',
                textAlign: 'center',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b5e53', marginBottom: 4 }}>
                {settings.institutionName || (isAr ? 'مكتبة رَفّ' : 'RAFF Library')}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>
                {title.trim() || (isAr ? 'عنوان الكتاب يظهر هنا' : 'Book Title Preview')}
              </div>
              <div style={{ fontSize: 11, color: '#574c43', marginBottom: 8 }}>
                {author.trim() || (isAr ? 'اسم المؤلف' : 'Author Name')}
                {shelf.trim() ? ` · ${shelf.trim()}` : ''}
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: barcodeSvg }}
              />
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
                fontSize: 11.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الرقم المرجعي:' : 'Reference:'}
                </span>
                <span className="ref-chip">{effectiveRef}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'النسخ × الأجزاء:' : 'Copies × Volumes:'}
                </span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>
                  {copiesTotal} × {volumes}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{isAr ? 'الرف:' : 'Shelf:'}</span>
                <span style={{ fontWeight: 700 }}>{shelf || '—'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', height: 36 }}
              disabled={!title.trim() || submitting}
            >
              <Icon.Check />
              <span>{isAr ? 'إضافة وحفظ في القاعدة' : 'Save Book to Database'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={() => setActiveTab('catalogue')}
            >
              {isAr ? 'العودة إلى الفهرس الشامل' : 'Back to Full Catalogue'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
