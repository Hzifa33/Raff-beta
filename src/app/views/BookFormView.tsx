import React, { useEffect, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { Icon } from '../components/Icons';
import { invokeRaff } from '../lib/ipc';
import { renderBarcodeSVG } from '../lib/domain';

export const BookFormView: React.FC = () => {
  const editingBook = useRaffStore((s) => s.editingBook);
  const meta = useRaffStore((s) => s.meta);
  const addBook = useRaffStore((s) => s.addBook);
  const updateBook = useRaffStore((s) => s.updateBook);
  const setEditingBook = useRaffStore((s) => s.setEditingBook);
  const setActiveTab = useRaffStore((s) => s.setActiveTab);
  const pushToast = useRaffStore((s) => s.pushToast);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
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
  const [notes, setNotes] = useState('');
  const [language, setLanguage] = useState('العربية');

  useEffect(() => {
    if (editingBook) {
      setTitle(editingBook.title);
      setAuthor(editingBook.author);
      setPublisher(editingBook.publisher);
      setReferenceNumber(editingBook.referenceNumber);
      setCategory(editingBook.category);
      setEdition(editingBook.edition);
      setPublishYear(editingBook.publishYear);
      setCopiesTotal(editingBook.copiesTotal);
      setVolumes(editingBook.volumes);
      setPrice(editingBook.price != null ? String(editingBook.price) : '');
      setSeries(editingBook.series);
      setSeriesOrder(editingBook.seriesOrder);
      setKeywords((editingBook.keywords || []).join('، '));
      setCondition(editingBook.condition || 'جيدة');
      setAcquisition(editingBook.acquisition || '');
      setShelf(editingBook.shelf || '');
      setNotes(editingBook.notes || '');
      setLanguage(editingBook.language || 'العربية');
    } else {
      invokeRaff<string>('peek_next_reference_number').then((nextRef) => {
        if (nextRef) setReferenceNumber(nextRef);
      });
    }
  }, [editingBook]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title,
        author,
        publisher,
        referenceNumber,
        category,
        edition,
        publishYear,
        copiesTotal: Number(copiesTotal) || 1,
        volumes: Number(volumes) || 1,
        price: price.trim() !== '' ? Number(price) : null,
        series,
        seriesOrder,
        keywords: keywords
          .split(/[,،]/)
          .map((s) => s.trim())
          .filter(Boolean),
        condition,
        acquisition,
        shelf,
        notes,
        language,
      };
      if (editingBook) {
        await updateBook(editingBook.id, payload);
        setEditingBook(null);
        setActiveTab('catalogue');
      } else {
        await addBook(payload);
        setActiveTab('catalogue');
      }
    } catch (err: any) {
      pushToast(err?.message || 'تعذر حفظ الكتاب', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Plus />
          </div>
          <div>
            <h1 className="stage-title">
              {editingBook ? `تعديل كتاب: ${editingBook.title}` : 'إضافة كتاب جديد إلى الفهرس'}
            </h1>
            <p className="stage-subtitle">
              توليد تلقائي للرقم المرجعي القياسي وفحص فوري للتكرار والباركود
            </p>
          </div>
        </div>
        {editingBook && (
          <button
            className="btn-soft"
            onClick={() => {
              setEditingBook(null);
              setActiveTab('catalogue');
            }}
          >
            إلغاء التعديل
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="vertix-card" style={{ gap: '22px' }}>
        <div className="form-grid">
          <div className="field-group">
            <label>عنوان الكتاب *</label>
            <input
              className="vertix-input"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مقدمة ابن خلدون"
            />
          </div>

          <div className="field-group">
            <label>المؤلف</label>
            <input
              className="vertix-input"
              list="raff-authors"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="اسم المؤلف أو المحقق"
            />
            <datalist id="raff-authors">
              {(meta?.authors || []).map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div className="field-group">
            <label>دار النشر</label>
            <input
              className="vertix-input"
              list="raff-publishers"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="مثال: مؤسسة الرسالة"
            />
            <datalist id="raff-publishers">
              {(meta?.publishers || []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="field-group">
            <label>الرقم المرجعي الفريد (raf-XXXX أو مخصص)</label>
            <input
              className="vertix-input"
              style={{ direction: 'ltr', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="raf-0001"
            />
          </div>

          <div className="field-group">
            <label>التصنيف الموضوعي</label>
            <input
              className="vertix-input"
              list="raff-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="مثال: التاريخ والحضارة"
            />
            <datalist id="raff-categories">
              {(meta?.categories || []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="field-group">
            <label>الرف / الموقع المكاني</label>
            <input
              className="vertix-input"
              list="raff-shelves"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder="مثال: A-01"
            />
            <datalist id="raff-shelves">
              {(meta?.shelves || []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field-group">
            <label>إجمالي النسخ</label>
            <input
              type="number"
              min={1}
              className="vertix-input"
              value={copiesTotal}
              onChange={(e) => setCopiesTotal(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div className="field-group">
            <label>عدد الأجزاء / المجلدات</label>
            <input
              type="number"
              min={1}
              className="vertix-input"
              value={volumes}
              onChange={(e) => setVolumes(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div className="field-group">
            <label>الطبعة</label>
            <input
              className="vertix-input"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              placeholder="مثال: الثالثة المحققة"
            />
          </div>

          <div className="field-group">
            <label>سنة النشر</label>
            <input
              className="vertix-input"
              value={publishYear}
              onChange={(e) => setPublishYear(e.target.value)}
              placeholder="2024"
            />
          </div>

          <div className="field-group">
            <label>السعر التقديري للنسخة</label>
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

          <div className="field-group">
            <label>الحالة المادية للنسخة</label>
            <select
              className="vertix-select"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="جيدة">جيدة</option>
              <option value="مقبولة">مقبولة</option>
              <option value="تالفة">تالفة</option>
              <option value="مفقودة">مفقودة</option>
            </select>
          </div>

          <div className="field-group">
            <label>السلسلة</label>
            <input
              className="vertix-input"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="اسم السلسلة العلمية إن وجد"
            />
          </div>

          <div className="field-group">
            <label>الكلمات المفتاحية (افصل بفاصلة)</label>
            <input
              className="vertix-input"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="تاريخ، تراجم، تحقيق..."
            />
          </div>
        </div>

        <div className="field-group">
          <label>ملاحظات الفهرسة والتحقيق</label>
          <textarea
            className="vertix-textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي تفاصيل إضافية حول النسخة أو التحقيق..."
          />
        </div>

        {/* Live Barcode Preview Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            background: 'var(--bg-surface-muted)',
            padding: '16px 20px',
            borderRadius: '18px',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>
              معاينة باركود Code 128B الفوري
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              جاهز للطباعة والمسح الضوئي بمجرد حفظ السجل
            </div>
          </div>
          <div
            className="barcode-preview-plate"
            dangerouslySetInnerHTML={{
              __html: renderBarcodeSVG(referenceNumber || 'raf-0001', {
                height: 40,
                moduleWidth: 1.6,
              }),
            }}
          />
          <button type="submit" className="btn-primary-orange">
            <Icon.Check />
            <span>{editingBook ? 'حفظ التعديلات' : 'إضافة الكتاب إلى المكتبة'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
