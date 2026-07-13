'use strict';

/* =========================================================
   Shared helpers
   ========================================================= */
function escapeHtml(str) {
  return (str ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortBooks(books, sortKey) {
  const arr = [...books];
  switch (sortKey) {
    case 'oldest': return arr.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    case 'newest':
    default: return arr.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

function statusBadgeHtml(book) {
  const status = RaffBook.bookStatus(book);
  const cls = status === RaffBook.STATUS_AVAILABLE ? 'badge-available'
    : status === RaffBook.STATUS_PARTIAL ? 'badge-partial'
    : 'badge-borrowed';
  return `<span class="badge ${cls}">${status}</span>`;
}

function copiesMeterHtml(book) {
  const total = RaffBook.totalCopies(book);
  const avail = RaffBook.availableFullCopies(book);
  const pct = total ? (avail / total) * 100 : 0;
  const suffix = RaffBook.isMultiVolume(book) ? ' مجموعة' : '';
  return `
    <div class="copies-cell" title="${avail} متاحة من ${total}${suffix}">
      <div class="copies-text"><strong>${avail}</strong> / ${total}</div>
      <div class="copies-track"><div class="copies-fill" style="width:${pct}%;"></div></div>
    </div>`;
}

function renderBookRow(book) {
  const spine = spineColorFor(book.category || book.author);
  return `
    <div class="book-row" data-id="${book.id}" data-action="details" role="button" tabindex="0">
      <div class="spine" style="background:${spine};"></div>
      <div class="book-title-cell">
        <div class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title) || 'بدون عنوان'}</div>
        <div class="book-ref">${icon('hash')}<span>${escapeHtml(book.referenceNumber)}</span></div>
      </div>
      <div class="book-meta-cell">
        <span class="book-meta-label">المؤلف</span>
        <span class="book-meta-value">${escapeHtml(book.author) || '—'}</span>
      </div>
      <div class="book-meta-cell hide-narrow">
        <span class="book-meta-label">دار النشر</span>
        <span class="book-meta-value">${escapeHtml(book.publisher) || '—'}</span>
      </div>
      <div class="book-meta-cell hide-narrow hide-md">
        <span class="book-meta-label">المجال</span>
        <span class="book-meta-value">${escapeHtml(book.category) || '—'}</span>
      </div>
      ${copiesMeterHtml(book)}
      <div class="book-status-cell">${statusBadgeHtml(book)}</div>
      <div class="row-actions">
        <button class="btn btn-outline btn-icon" data-action="edit" data-id="${book.id}" title="تعديل" aria-label="تعديل">${icon('edit')}</button>
        <button class="btn btn-outline btn-icon" data-action="delete" data-id="${book.id}" title="حذف" aria-label="حذف">${icon('trash')}</button>
      </div>
    </div>`;
}

/**
 * Confirms, deletes, then offers a real undo. Deleting a catalogued book is
 * destructive and easy to do by mistake, so the record is kept in memory and
 * restored verbatim (same id and reference number) if the user undoes.
 */
async function deleteBookWithUndo(book) {
  const ok = await confirmModal({
    title: 'حذف هذا الكتاب؟',
    message: `سيتم حذف "${escapeHtml(book.title)}" من سجل المكتبة. يمكنك التراجع مباشرة بعد الحذف.`,
    confirmLabel: 'حذف',
  });
  if (!ok) return false;

  const snapshot = { ...book };
  await window.raff.removeBook(book.id);
  await refreshState();
  renderNavCounts();
  renderRoute();

  toast('تم حذف الكتاب', 'success', 6000, {
    label: 'تراجع',
    onClick: async () => {
      await window.raff.restoreBook(snapshot);
      await refreshState();
      renderNavCounts();
      renderRoute();
      toast('تمت استعادة الكتاب', 'success', 2200);
    },
  });
  return true;
}

/* =========================================================
   Book details modal
   ========================================================= */
function showBookDetails(bookId) {
  const book = RAFF_STATE.books.find((b) => b.id === bookId);
  if (!book) return;

  const spine = spineColorFor(book.category || book.author);
  const total = RaffBook.totalCopies(book);
  const volCount = RaffBook.totalVolumes(book);
  const multi = RaffBook.isMultiVolume(book);
  const fullAvail = RaffBook.availableFullCopies(book);
  const loans = [...(book.loans || [])].sort(
    (a, b) => Date.parse(b.borrowedAt) - Date.parse(a.borrowedAt)
  );
  const openLoans = loans.filter((l) => !l.returnedAt);
  const canBorrowFull = RaffBook.canBorrow(book);
  // For a multi-volume book, borrowing is possible if any single volume is free.
  const anyVolumeFree = multi && Array.from({ length: volCount }, (_, i) => i + 1)
    .some((v) => RaffBook.canBorrowVolume(book, v));
  const canBorrowAny = canBorrowFull || anyVolumeFree;
  const today = new Date().toISOString().slice(0, 10);
  const configuredLoanDays = Number(RAFF_STATE.settings?.loanDurationDays) || 30;
  const dueDefault = new Date(Date.now() + configuredLoanDays * 86400000).toISOString().slice(0, 10);
  const defaultBorrowScope = canBorrowFull ? 'full' : 'volume';
  const firstAvailableVolume = multi
    ? Array.from({ length: volCount }, (_, i) => i + 1).find((v) => RaffBook.canBorrowVolume(book, v))
    : null;

  const loanRow = (l) => {
    const days = RaffBook.loanDurationDays(l);
    const overdue = RaffBook.isOverdue(l, 30);
    const dueSoon = !overdue && RaffBook.isDueSoon(l, 7);
    const scope = RaffBook.loanScopeLabel(l);
    const isVol = RaffBook.isVolumeLoan(l);
    const dLeft = RaffBook.daysUntilDue(l);
    const allParts = RaffBook.loanAllVolumes(l, book);
    const outstandingParts = RaffBook.outstandingLoanVolumes(l, book);
    const returnedParts = RaffBook.returnedLoanVolumes(l, book);
    const returnedSet = new Set(returnedParts);
    const canReturnSpecificPart = multi && !l.returnedAt && outstandingParts.length > 1;
    const partiallyReturned = !l.returnedAt && returnedParts.length > 0 && outstandingParts.length > 0;
    let dueBadge = '';
    if (!l.returnedAt) {
      if (overdue) dueBadge = `<span class="due-badge over">متأخر ${dLeft !== null ? Math.abs(dLeft) + ' يوم' : ''}</span>`;
      else if (dueSoon) dueBadge = `<span class="due-badge soon">يستحق خلال ${dLeft} يوم</span>`;
      else if (l.dueAt) dueBadge = `<span class="due-badge ok">يستحق ${reportFormatDate(l.dueAt)}</span>`;
    }
    const extra = (l.contact || l.note)
      ? `<div class="loan-extra">${l.contact ? `<span class="loan-contact">${icon('user', 11)} ${escapeHtml(l.contact)}</span>` : ''}${l.note ? `<span class="loan-note">${escapeHtml(l.note)}</span>` : ''}</div>`
      : '';

    const partsStatus = multi ? `
      <div class="loan-parts-status" aria-label="حالة أجزاء الإعارة">
        ${allParts.map((v) => {
          const wasReturned = returnedSet.has(v) || !!l.returnedAt;
          const returnedOn = RaffBook.volumeReturnDate(l, v) || (l.returnedAt ? l.returnedAt : null);
          const title = wasReturned
            ? `الجزء ${v} — أُرجع${returnedOn ? ` في ${reportFormatDate(returnedOn)}` : ''}`
            : `الجزء ${v} — ما زال معاراً`;
          return `<span class="loan-part-chip ${wasReturned ? 'is-returned' : 'is-open'}" title="${escapeHtml(title)}">ج${v}${wasReturned ? icon('check', 10) : ''}</span>`;
        }).join('')}
        ${partiallyReturned ? `<span class="loan-remaining-label">المتبقي: ${escapeHtml(RaffBook.outstandingScopeLabel(l, book))}</span>` : ''}
      </div>` : '';

    const actionHtml = l.returnedAt
      ? `<span class="loan-state returned">أُرجع</span>`
      : canReturnSpecificPart
        ? `<div class="loan-return-actions">
            <button class="btn btn-outline btn-sm" data-toggle-return-parts="${l.id}">${icon('layers', 13)} إرجاع جزء</button>
            <button class="btn btn-ghost btn-sm" data-return-loan="${l.id}">${icon('refresh', 13)} إرجاع الكل</button>
          </div>`
        : `<button class="btn btn-outline btn-sm" data-return-loan="${l.id}">${icon('refresh')} إرجاع</button>`;

    const returnPicker = canReturnSpecificPart ? `
      <div class="loan-return-picker hidden" data-return-picker="${l.id}">
        <div class="loan-return-picker-head">
          <div>
            <b>إرجاع جزء محدد</b>
            <small>حدد جزءاً واحداً أو عدة أجزاء عادت الآن، وستبقى بقية الأجزاء معارة.</small>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" data-cancel-return-parts="${l.id}" aria-label="إغلاق">${icon('x', 13)}</button>
        </div>
        <div class="loan-return-grid" role="group" aria-label="الأجزاء المراد إرجاعها">
          ${outstandingParts.map((v) => `<label class="loan-return-option">
            <input type="checkbox" name="returnVolume-${l.id}" value="${v}" />
            <span class="loan-return-check">${icon('check', 11)}</span>
            <span>الجزء ${v}</span>
          </label>`).join('')}
        </div>
        <div class="loan-return-picker-actions">
          <button class="btn btn-primary btn-sm" data-confirm-return-parts="${l.id}">${icon('check', 13)} تسجيل إرجاع المحدد</button>
          <button class="btn btn-ghost btn-sm" data-cancel-return-parts="${l.id}">إلغاء</button>
        </div>
      </div>` : '';

    return `
      <div class="loan-row ${l.returnedAt ? 'is-returned' : partiallyReturned ? 'is-partial-return' : overdue ? 'is-overdue' : dueSoon ? 'is-duesoon' : ''}" data-loan-row="${l.id}">
        <div class="loan-main">
          <div class="loan-who">
            <span class="loan-name">${escapeHtml(l.borrowerName)}
              <span class="loan-scope ${isVol ? 'scope-vol' : 'scope-full'}">${scope}</span>
            </span>
            <span class="loan-dates">${reportFormatDate(l.borrowedAt)}${l.returnedAt ? ` ← ${reportFormatDate(l.returnedAt)}` : ''} ${dueBadge}</span>
          </div>
          <span class="loan-days ${overdue ? 'overdue' : ''}">${days} يوم</span>
          ${actionHtml}
        </div>
        ${partsStatus}
        ${returnPicker}
        ${extra}
      </div>`;
  };

  const metaChip = (label, value, iconName) => value
    ? `<div class="meta-chip"><span class="meta-chip-label">${icon(iconName, 12)} ${label}</span><span class="meta-chip-value">${escapeHtml(value)}</span></div>`
    : '';

  const priceStr = typeof book.price === 'number' ? formatPrice(book.price) : null;

  // Per-volume availability strip (multi-volume only).
  const volumeStrip = multi ? `
    <div class="volume-strip">
      <div class="volume-strip-label">إتاحة الأجزاء</div>
      <div class="volume-chips">
        ${Array.from({ length: volCount }, (_, i) => i + 1).map((v) => {
          const va = RaffBook.availableOfVolume(book, v);
          const cls = va === 0 ? 'vc-none' : va < total ? 'vc-partial' : 'vc-full';
          return `<span class="volume-chip ${cls}" title="الجزء ${v}: ${va} متاح من ${total}">ج${v}<b>${va}/${total}</b></span>`;
        }).join('')}
      </div>
    </div>` : '';

  const html = `
    <div class="detail-header" style="border-top: 4px solid ${spine};">
      <div class="detail-title-wrap">
        <h3 class="detail-title">${escapeHtml(book.title) || 'بدون عنوان'}</h3>
        <p class="detail-author">${escapeHtml(book.author) || 'مؤلف غير محدد'}</p>
      </div>
      <button class="btn btn-ghost btn-icon" id="detailClose" aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal-body detail-body-2col">
      <div class="detail-col detail-col-info">
        <div class="detail-ref">
          <div class="detail-ref-main">
            <span class="detail-ref-label">الرقم المرجعي</span>
            <span class="detail-ref-value" id="detailRefValue">${escapeHtml(book.referenceNumber)}</span>
          </div>
          <button class="ref-inline-edit" id="detailRefEdit" title="تغيير الرقم المرجعي">${icon('edit', 13)}</button>
          <div class="ref-edit-row hidden" id="detailRefEditRow">
            <input type="text" id="detailRefInput" value="${escapeHtml(book.referenceNumber)}" />
            <button class="btn btn-primary btn-sm" id="detailRefSave">${icon('check', 13)}</button>
            <button class="btn btn-ghost btn-sm" id="detailRefCancel">${icon('x', 13)}</button>
          </div>
        </div>

        <div class="availability-card ${fullAvail === 0 ? 'is-none' : fullAvail < total ? 'is-partial' : 'is-full'}">
          <div class="availability-head">
            <span class="availability-count"><strong>${fullAvail}</strong> ${multi ? 'مجموعة كاملة' : 'نسخة'} من ${total}</span>
            ${statusBadgeHtml(book)}
          </div>
          <div class="copies-track"><div class="copies-fill" style="width:${total ? (fullAvail / total) * 100 : 0}%;"></div></div>
        </div>

        ${volumeStrip}

        <div class="meta-chips">
          ${metaChip('دار النشر', book.publisher, 'building')}
          ${metaChip('المجال', book.category, 'tag')}
          ${metaChip('الطبعة', book.edition, 'layers')}
          ${metaChip('سنة النشر', book.publishYear, 'calendar')}
          ${multi ? metaChip('الأجزاء', String(volCount), 'layers') : ''}
          ${priceStr ? metaChip('السعر', priceStr, 'tag') : ''}
        </div>

        ${book.notes ? `<div class="detail-notes"><p>${escapeHtml(book.notes)}</p></div>` : ''}

        <div class="form-actions detail-actions">
          <button class="btn btn-outline btn-sm" id="detailEdit">${icon('edit')} تعديل</button>
          <button class="btn btn-outline btn-sm" id="detailPrintLabel">${icon('printer')} طباعة الملصق</button>
          <button class="btn btn-outline btn-sm" id="detailPdfLabel">${icon('download')} حفظ PDF</button>
          <button class="btn btn-outline btn-sm" id="detailCopyRef">${icon('hash')} نسخ الرقم</button>
          <button class="btn btn-danger btn-sm" id="detailDelete">${icon('trash')} حذف</button>
        </div>
      </div>

      <div class="detail-col detail-col-loans">
        <div class="loans-head">
          <h4 class="loans-title">${icon('user')} سجل الإعارة</h4>
          <span class="loans-count">${openLoans.length} مفتوحة من ${loans.length}</span>
        </div>

        <div class="borrow-form ${canBorrowAny ? '' : 'disabled'}">
          <div class="ac-anchor borrow-name-wrap">
            <input type="text" id="borrowName" placeholder="اسم المستعير" ${canBorrowAny ? '' : 'disabled'} />
          </div>
          ${multi ? `
          <div class="borrow-scope-block">
            <span class="borrow-field-label borrow-scope-label">ما الذي سيستعيره؟</span>
            <div class="borrow-scope-row">
              <div class="chip-toggle borrow-scope" id="borrowScope">
                <button type="button" data-scope="full" class="${defaultBorrowScope === 'full' ? 'active' : ''}" ${canBorrowFull ? '' : 'disabled'}>المجموعة كاملة</button>
                <button type="button" data-scope="volume" class="${defaultBorrowScope === 'volume' ? 'active' : ''}" ${anyVolumeFree ? '' : 'disabled'}>جزء أو عدة أجزاء</button>
              </div>
            </div>
            <div id="borrowVolumes" class="borrow-volumes ${defaultBorrowScope === 'volume' ? '' : 'hidden'}">
              <div class="borrow-volumes-toolbar">
                <span id="borrowVolumeSummary" class="borrow-volumes-summary">اختر جزءًا واحدًا أو أكثر</span>
                <button type="button" class="btn btn-ghost btn-sm borrow-select-all" id="borrowSelectAll">تحديد كل المتاح</button>
              </div>
              <div class="borrow-volume-grid" role="group" aria-label="الأجزاء المستعارة">
                ${Array.from({ length: volCount }, (_, i) => i + 1).map((v) => {
                  const va = RaffBook.availableOfVolume(book, v);
                  const checked = defaultBorrowScope === 'volume' && v === firstAvailableVolume ? 'checked' : '';
                  return `<label class="borrow-volume-option ${va === 0 ? 'is-unavailable' : ''}">
                    <input type="checkbox" name="borrowVolume" value="${v}" ${va === 0 ? 'disabled' : ''} ${checked} />
                    <span class="borrow-volume-check" aria-hidden="true">${icon('check', 12)}</span>
                    <span class="borrow-volume-copy"><b>الجزء ${v}</b><small>${va === 0 ? 'غير متاح' : `${va} متاح`}</small></span>
                  </label>`;
                }).join('')}
              </div>
            </div>
            <span class="borrow-volume-hint">يمكن تحديد عدة أجزاء في إعارة واحدة، ويظل كل جزء غير محدد متاحًا بصورة مستقلة.</span>
          </div>` : ''}
          <div class="borrow-dates-row">
            <label class="borrow-field">
              <span class="borrow-field-label">تاريخ الإعارة</span>
              <input type="date" id="borrowDate" value="${today}" max="${today}" ${canBorrowAny ? '' : 'disabled'} />
            </label>
            <label class="borrow-field">
              <span class="borrow-field-label">تاريخ الإرجاع</span>
              <input type="date" id="borrowDue" value="${dueDefault}" ${canBorrowAny ? '' : 'disabled'} />
            </label>
          </div>
          <input type="text" id="borrowContact" class="borrow-extra" placeholder="وسيلة التواصل (هاتف/بريد) — اختياري" ${canBorrowAny ? '' : 'disabled'} />
          <input type="text" id="borrowNote" class="borrow-extra" placeholder="ملاحظة قصيرة عن الإعارة — اختياري" ${canBorrowAny ? '' : 'disabled'} />
          <div class="borrow-action-row">
            <button class="btn btn-primary btn-sm" id="borrowBtn" ${canBorrowAny ? '' : 'disabled'}>${icon('plus')} إعارة</button>
          </div>
        </div>
        ${canBorrowAny ? '' : '<p class="borrow-blocked">لا توجد نسخ متاحة. أرجِع نسخة أو زد عدد النسخ.</p>'}

        <div class="loans-list">
          ${loans.length ? loans.map(loanRow).join('') : '<p class="loans-empty">لم تُسجَّل أي إعارة بعد.</p>'}
        </div>
      </div>
    </div>`;

  openModal(html, {
    onMount: (overlay) => {
      overlay.querySelector('#detailClose').addEventListener('click', closeModal);

      // Inline reference-number editing.
      const refValue = overlay.querySelector('#detailRefValue');
      const refEditBtn = overlay.querySelector('#detailRefEdit');
      const refRow = overlay.querySelector('#detailRefEditRow');
      const refInput = overlay.querySelector('#detailRefInput');
      const openRefEdit = () => {
        refValue.classList.add('hidden');
        refEditBtn.classList.add('hidden');
        refRow.classList.remove('hidden');
        refInput.value = book.referenceNumber;
        refInput.focus(); refInput.select();
      };
      const closeRefEdit = () => {
        refRow.classList.add('hidden');
        refValue.classList.remove('hidden');
        refEditBtn.classList.remove('hidden');
      };
      const saveRefEdit = async () => {
        const next = refInput.value.trim();
        if (!next || next === book.referenceNumber) { closeRefEdit(); return; }
        const res = await window.raff.setReferenceNumber(book.id, next);
        if (!res.ok) { toast(res.error, 'error'); refInput.focus(); return; }
        await refreshState();
        renderNavCounts();
        refreshCurrentView();
        toast('تم تحديث الرقم المرجعي', 'success', 1800);
        showBookDetails(book.id);
      };
      refEditBtn.addEventListener('click', openRefEdit);
      overlay.querySelector('#detailRefSave').addEventListener('click', saveRefEdit);
      overlay.querySelector('#detailRefCancel').addEventListener('click', closeRefEdit);
      refInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveRefEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); closeRefEdit(); }
      });

      const nameInput = overlay.querySelector('#borrowName');
      if (nameInput && !nameInput.disabled) {
        // Suggest people who have borrowed before, so names stay consistent.
        createAutocomplete(nameInput, {
          getPool: () => RAFF_STATE.suggestions.filter((s) => s.type === 'borrower'),
          onSelect: () => {},
          typeLabels: SUGGESTION_TYPE_LABELS,
        });
        nameInput.focus();
      }

      // Scope toggle (multi-volume only): whole set or one/more selected parts.
      let borrowScope = defaultBorrowScope;
      const scopeToggle = overlay.querySelector('#borrowScope');
      const volumePicker = overlay.querySelector('#borrowVolumes');
      const volumeSummary = overlay.querySelector('#borrowVolumeSummary');
      const selectAllBtn = overlay.querySelector('#borrowSelectAll');
      const volumeInputs = [...overlay.querySelectorAll('input[name="borrowVolume"]')];
      const getSelectedVolumes = () => volumeInputs
        .filter((input) => input.checked && !input.disabled)
        .map((input) => Number(input.value))
        .sort((a, b) => a - b);
      const updateVolumeSelection = () => {
        const selected = getSelectedVolumes();
        const enabled = volumeInputs.filter((input) => !input.disabled);
        if (volumeSummary) {
          volumeSummary.textContent = selected.length === 0
            ? 'اختر جزءًا واحدًا أو أكثر'
            : RaffBook.loanScopeLabel({ type: RaffBook.LOAN_VOLUME, volumes: selected });
        }
        if (selectAllBtn) {
          const allSelected = enabled.length > 0 && enabled.every((input) => input.checked);
          selectAllBtn.textContent = allSelected ? 'إلغاء تحديد الكل' : 'تحديد كل المتاح';
        }
      };
      volumeInputs.forEach((input) => input.addEventListener('change', updateVolumeSelection));
      selectAllBtn?.addEventListener('click', () => {
        const enabled = volumeInputs.filter((input) => !input.disabled);
        const allSelected = enabled.length > 0 && enabled.every((input) => input.checked);
        enabled.forEach((input) => { input.checked = !allSelected; });
        updateVolumeSelection();
      });
      updateVolumeSelection();
      if (scopeToggle) {
        scopeToggle.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-scope]');
          if (!btn || btn.disabled) return;
          borrowScope = btn.dataset.scope;
          scopeToggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
          volumePicker.classList.toggle('hidden', borrowScope !== 'volume');
        });
      }

      const doBorrow = async () => {
        const name = nameInput.value.trim();
        const date = overlay.querySelector('#borrowDate').value;
        const dueVal = overlay.querySelector('#borrowDue')?.value;
        const contact = overlay.querySelector('#borrowContact')?.value.trim() || '';
        const note = overlay.querySelector('#borrowNote')?.value.trim() || '';
        if (!name) { toast('اسم المستعير مطلوب', 'error'); nameInput.focus(); return; }
        const payload = {
          borrowerName: name,
          borrowedAt: date ? new Date(date + 'T12:00:00').toISOString() : undefined,
          dueAt: dueVal ? new Date(dueVal + 'T12:00:00').toISOString() : undefined,
          contact,
          note,
          scope: borrowScope,
        };
        if (borrowScope === 'volume') {
          payload.volumes = getSelectedVolumes();
          if (payload.volumes.length === 0) {
            toast('اختر جزءًا واحدًا على الأقل', 'error');
            volumePicker?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
        }
        const res = await window.raff.borrowCopy(book.id, payload);
        if (!res.ok) { toast(res.error, 'error'); return; }
        await refreshState();
        renderNavCounts();
        refreshCurrentView();
        const what = borrowScope === 'volume'
          ? RaffBook.loanScopeLabel({ type: RaffBook.LOAN_VOLUME, volumes: payload.volumes })
          : 'مجموعة كاملة';
        toast(`تمت إعارة ${what} إلى ${name}`, 'success');
        showBookDetails(book.id);
      };

      overlay.querySelector('#borrowBtn')?.addEventListener('click', doBorrow);
      nameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doBorrow(); }
      });

      const closeReturnPickers = (exceptId = null) => {
        overlay.querySelectorAll('[data-return-picker]').forEach((picker) => {
          if (picker.dataset.returnPicker !== exceptId) picker.classList.add('hidden');
        });
      };

      overlay.querySelectorAll('[data-toggle-return-parts]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const loanId = btn.dataset.toggleReturnParts;
          const picker = overlay.querySelector(`[data-return-picker="${loanId}"]`);
          if (!picker) return;
          const willOpen = picker.classList.contains('hidden');
          closeReturnPickers(willOpen ? loanId : null);
          picker.classList.toggle('hidden', !willOpen);
          if (willOpen) picker.querySelector('input[type="checkbox"]')?.focus();
        });
      });

      overlay.querySelectorAll('[data-cancel-return-parts]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picker = overlay.querySelector(`[data-return-picker="${btn.dataset.cancelReturnParts}"]`);
          picker?.classList.add('hidden');
        });
      });

      overlay.querySelectorAll('[data-confirm-return-parts]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const loanId = btn.dataset.confirmReturnParts;
          const picker = overlay.querySelector(`[data-return-picker="${loanId}"]`);
          const selected = [...(picker?.querySelectorAll('input[type="checkbox"]:checked') || [])]
            .map((input) => Number(input.value))
            .sort((a, b) => a - b);
          if (!selected.length) {
            toast('حدد جزءًا واحدًا على الأقل لإرجاعه', 'error');
            picker?.querySelector('input[type="checkbox"]')?.focus();
            return;
          }
          btn.disabled = true;
          const res = await window.raff.returnLoanParts(book.id, loanId, selected);
          if (!res.ok) { btn.disabled = false; toast(res.error, 'error'); return; }
          await refreshState();
          renderNavCounts();
          refreshCurrentView();
          const returnedLabel = selected.length === 1
            ? `الجزء ${selected[0]}`
            : `الأجزاء ${RaffBook.formatVolumeNumbers(selected)}`;
          const message = res.completed
            ? `تم إرجاع ${returnedLabel} واكتمال الإعارة`
            : `تم إرجاع ${returnedLabel}، وبقي ${RaffBook.outstandingScopeLabel({ type: RaffBook.LOAN_VOLUME, volumes: res.remainingVolumes, returnedAt: null, volumeReturns: {} }, { volumes: volCount })}`;
          toast(message, 'success');
          showBookDetails(book.id);
        });
      });

      overlay.querySelectorAll('[data-return-loan]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const res = await window.raff.returnLoan(book.id, btn.dataset.returnLoan);
          if (!res.ok) { btn.disabled = false; toast(res.error, 'error'); return; }
          await refreshState();
          renderNavCounts();
          refreshCurrentView();
          toast(res.returnedVolumes?.length > 1 ? 'تم إرجاع جميع الأجزاء المتبقية' : 'تم تسجيل الإرجاع', 'success');
          showBookDetails(book.id);
        });
      });

      overlay.querySelector('#detailEdit').addEventListener('click', () => {
        closeModal();
        navigateTo('edit', { book });
      });
      overlay.querySelector('#detailPrintLabel').addEventListener('click', () => {
        // Uses the size/columns/branding configured in settings automatically.
        printBarcodeLabels([book], book.title);
      });
      overlay.querySelector('#detailPdfLabel').addEventListener('click', () => {
        saveBarcodeLabelsPdf([book], book.title);
      });
      overlay.querySelector('#detailCopyRef').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(book.referenceNumber);
          toast('تم نسخ الرقم المرجعي', 'success', 1800);
        } catch (_) { toast('تعذّر نسخ الرقم', 'error'); }
      });
      overlay.querySelector('#detailDelete').addEventListener('click', async () => {
        closeModal();
        await deleteBookWithUndo(book);
      });
    },
  });
}

function reportFormatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Formats a price with a thin-space thousands grouping; unit-agnostic. */
function formatPrice(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* =========================================================
   Dashboard
   ========================================================= */
/** A dismissable-feeling alert listing the most overdue loans, if any. */
function overdueBannerHtml() {
  const overdue = collectOverdue(RAFF_STATE.books, 30);
  if (!overdue.length) return '';
  const top = overdue.slice(0, 4);
  return `
    <div class="overdue-banner">
      <div class="overdue-head">
        <span class="overdue-title">${icon('alert', 16)} ${overdue.length} إعارة متأخرة (أكثر من 30 يوماً)</span>
        <button class="btn btn-outline btn-sm" data-nav="reports">عرض في الاستدعاء</button>
      </div>
      <div class="overdue-list">
        ${top.map((o) => `
          <button class="overdue-item" data-book="${o.book.id}">
            <span class="overdue-name">${escapeHtml(o.loan.borrowerName)}</span>
            <span class="overdue-book">${escapeHtml(o.book.title)}</span>
            <span class="overdue-days">${o.days} يوم</span>
          </button>`).join('')}
        ${overdue.length > top.length ? `<span class="overdue-more">و${overdue.length - top.length} أخرى…</span>` : ''}
      </div>
    </div>`;
}

function renderDashboard(root) {
  const { stats, books } = RAFF_STATE;
  const recent = sortBooks(books, 'newest').slice(0, 6);
  const topCategories = Object.entries(stats.byCategory || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(1, ...topCategories.map((c) => c[1]));
  const isEmpty = books.length === 0;

  const statCard = (value, label, iconName, variant = '') => `
    <div class="stat-card ${variant}">
      <div class="stat-icon">${icon(iconName, 18)}</div>
      <div>
        <div class="stat-value">${value ?? 0}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>`;

  if (isEmpty) {
    root.innerHTML = `
      <div class="welcome-panel">
        <div class="welcome-mark">${icon('stack', 44)}</div>
        <h2 class="welcome-title">أهلاً بك في رَفّ</h2>
        <p class="welcome-desc">
          مكتبتك فارغة حتى الآن. أضف أول كتاب وسيمنحه النظام رقماً مرجعياً تلقائياً
          لتدوّنه عليه، ثم يمكنك البحث في مكتبتك كاملة في أي وقت.
        </p>
        <div class="welcome-actions">
          <button class="btn btn-primary" data-nav="add">${icon('plus')} إضافة أول كتاب</button>
          <button class="btn btn-outline" data-nav="settings">${icon('upload')} استيراد نسخة احتياطية</button>
        </div>
        <div class="welcome-tips">
          <div class="welcome-tip">${icon('hash', 14)}<span>رقم مرجعي تلقائي لكل كتاب</span></div>
          <div class="welcome-tip">${icon('search', 14)}<span>بحث لا يتأثر باختلاف الهمزات</span></div>
          <div class="welcome-tip">${icon('download', 14)}<span>تصدير PDF وExcel وJSON</span></div>
        </div>
      </div>`;
    return;
  }

  const smartCard = (value, label, iconName, variant = '', nav = '') => `
    <div class="smart-card ${variant}" ${nav ? `data-nav="${nav}"` : ''}>
      <div class="smart-icon">${icon(iconName, 16)}</div>
      <div class="smart-body">
        <div class="smart-value">${value}</div>
        <div class="smart-label">${label}</div>
      </div>
    </div>`;

  const priceFmt = (n) => (typeof n === 'number' ? formatPrice(n) : '—');
  const topPricedLabel = stats.topPriced
    ? `${escapeHtml(stats.topPriced.title || '—')} · ${priceFmt(stats.topPriced.price)}`
    : 'لا يوجد';

  root.innerHTML = `
    <div class="stat-grid">
      ${statCard(stats.totalBooks, 'إجمالي العناوين', 'book')}
      ${statCard(stats.availableCopies, 'نسخ متاحة', 'check', 'stat-success')}
      ${statCard(stats.borrowedCopies, 'نسخ معارة', 'copies', 'stat-danger')}
      ${statCard(stats.activeBorrowers, 'مستعيرون حالياً', 'user')}
    </div>

    <div class="smart-grid">
      ${smartCard(stats.overdueLoans || 0, 'إعارات متأخرة', 'alert', (stats.overdueLoans ? 'danger' : ''), 'reports')}
      ${smartCard(stats.dueSoonLoans || 0, 'تستحق خلال 7 أيام', 'calendar', (stats.dueSoonLoans ? 'warn' : ''))}
      ${smartCard((stats.completeness ?? 100) + '%', 'اكتمال بيانات الجرد', 'check', '')}
      ${smartCard(priceFmt(stats.totalValue), 'قيمة الكتب المسعّرة', 'tag', '')}
      ${smartCard(stats.multiVolumeTitles || 0, 'عناوين متعددة الأجزاء', 'layers', '')}
      ${smartCard(topPricedLabel, 'أعلى كتاب سعراً', 'tag', 'wide', stats.topPriced ? '' : '')}
    </div>

    ${overdueBannerHtml()}

    <div class="dash-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">أحدث الإضافات</h2>
            <p class="panel-desc">اضغط على أي كتاب لعرض بياناته كاملة</p>
          </div>
          <button class="btn btn-outline btn-sm" data-nav="library">عرض الكل</button>
        </div>
        <div class="book-list">
          ${recent.map(renderBookRow).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">توزيع المجالات</h2>
            <p class="panel-desc">أكثر التصنيفات عدداً</p>
          </div>
        </div>
        ${topCategories.length ? `
        <div class="bar-chart">
          ${topCategories.map(([cat, count]) => `
            <div class="bar-row">
              <div class="bar-row-label" title="${escapeHtml(cat)}">${escapeHtml(cat)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(count / maxCat) * 100}%;"></div></div>
              <div class="bar-row-value">${count}</div>
            </div>`).join('')}
        </div>` : `<p class="text-muted" style="font-size:12.5px;">لم تُضف مجالات بعد.</p>`}
      </div>
    </div>
  `;
}

/* =========================================================
   Browse / Search
   ========================================================= */
let _browserFilters = { query: '', field: 'all', status: 'all', sort: 'newest' };

// Must match the CSS in .vlist-rows .book-row
const ROW_HEIGHT = 62;
const ROW_GAP = 8;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;

let _vlist = null;
let _queryDebounce = null;

/**
 * Rebuilding the whole panel on every keystroke destroyed the input element,
 * which is why focus was lost after each character. The shell is now rendered
 * once; typing only feeds new items into the virtual list.
 */
function renderBookBrowser(root, { presetQuery } = {}) {
  if (presetQuery !== undefined) _browserFilters.query = presetQuery;
  const f = _browserFilters;

  if (_vlist) { _vlist.destroy(); _vlist = null; }

  root.innerHTML = `
    <div class="panel browser-panel">
      <div class="filters-row">
        <select id="filterField">
          <option value="all">كل الحقول</option>
          <option value="title">العنوان</option>
          <option value="author">المؤلف</option>
          <option value="publisher">دار النشر</option>
          <option value="referenceNumber">الرقم المرجعي</option>
          <option value="category">المجال</option>
          <option value="series">السلسلة</option>
          <option value="shelf">الرف</option>
          <option value="keywords">الكلمات المفتاحية</option>
          <option value="borrowers">المستعير</option>
        </select>
        <div class="ac-anchor filter-query-wrap">
          <input type="text" id="filterQuery" placeholder="اكتب كلمة البحث..." autocomplete="off" />
        </div>
        <div class="chip-toggle" id="statusToggle">
          <button data-val="all">الكل</button>
          <button data-val="${RaffBook.STATUS_AVAILABLE}">متاح</button>
          <button data-val="${RaffBook.STATUS_PARTIAL}">معار جزئياً</button>
          <button data-val="${RaffBook.STATUS_FULL}">معار بالكامل</button>
        </div>
        <select id="filterSort">
          <option value="newest">الأحدث أولاً</option>
          <option value="oldest">الأقدم أولاً</option>
          <option value="title-asc">ترتيب حسب العنوان</option>
          <option value="author-asc">ترتيب حسب المؤلف</option>
        </select>
        <span class="result-count" id="resultCount"></span>
      </div>

      <div class="vlist-scroll" id="bookScroll"></div>
    </div>
  `;

  const fieldSel = root.querySelector('#filterField');
  const queryInput = root.querySelector('#filterQuery');
  const sortSel = root.querySelector('#filterSort');
  const statusToggle = root.querySelector('#statusToggle');
  const scrollEl = root.querySelector('#bookScroll');

  // Set values via properties, never by re-rendering markup.
  fieldSel.value = f.field;
  queryInput.value = f.query;
  sortSel.value = f.sort;
  syncStatusToggle(statusToggle, f.status);

  _vlist = createVirtualList(scrollEl, {
    rowStep: ROW_STEP,
    rowHeight: ROW_HEIGHT,
    renderRow: (book) => renderBookRow(book),
    emptyHtml: `
      <div class="empty-state">
        ${icon('book')}
        <h3>لا توجد نتائج مطابقة</h3>
        <p>جرّب كلمة بحث مختلفة أو غيّر الفلاتر المستخدمة.</p>
      </div>`,
  });

  fieldSel.addEventListener('change', () => {
    _browserFilters.field = fieldSel.value;
    updateBookResults({ resetScroll: true });
  });
  sortSel.addEventListener('change', () => {
    _browserFilters.sort = sortSel.value;
    updateBookResults({ resetScroll: true });
  });
  statusToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    _browserFilters.status = btn.dataset.val;
    syncStatusToggle(statusToggle, _browserFilters.status);
    updateBookResults({ resetScroll: true });
  });
  queryInput.addEventListener('input', () => {
    _browserFilters.query = queryInput.value;
    syncQuickSearchValue(queryInput.value);
    scheduleBookResults();
  });

  // Suggestions narrow to whichever field the user is filtering on.
  createAutocomplete(queryInput, {
    getPool: () => suggestionPoolForField(_browserFilters.field),
    onSelect: (label) => {
      _browserFilters.query = label;
      syncQuickSearchValue(label);
      updateBookResults({ resetScroll: true });
    },
    typeLabels: SUGGESTION_TYPE_LABELS,
  });

  updateBookResults({ resetScroll: true });
}

/** Maps a search field onto the suggestion types worth offering for it. */
function suggestionPoolForField(field) {
  const map = {
    all: null,
    title: 'title',
    author: 'author',
    publisher: 'publisher',
    referenceNumber: 'reference',
    category: 'category',
    borrowers: 'borrower',
  };
  const type = map[field];
  if (!type) return RAFF_STATE.suggestions;
  return RAFF_STATE.suggestions.filter((s) => s.type === type);
}

function syncStatusToggle(toggleEl, status) {
  toggleEl.querySelectorAll('button[data-val]').forEach((b) => {
    b.classList.toggle('active', b.dataset.val === status);
  });
}

/** Keeps the topbar field and the in-view field showing the same text
 *  without either one stealing focus from the other. */
function syncQuickSearchValue(value) {
  const quick = document.getElementById('quickSearchInput');
  if (quick && quick.value !== value && document.activeElement !== quick) quick.value = value;
}
function syncFilterInputValue(value) {
  const inView = document.getElementById('filterQuery');
  if (inView && inView.value !== value && document.activeElement !== inView) inView.value = value;
}

/** Coalesces bursts of keystrokes into a single filter pass per frame. */
function scheduleBookResults() {
  if (_queryDebounce) clearTimeout(_queryDebounce);
  _queryDebounce = setTimeout(() => {
    _queryDebounce = null;
    updateBookResults({ resetScroll: true });
  }, 50);
}

function updateBookResults({ resetScroll = false } = {}) {
  if (!_vlist) return;
  const results = queryBooks(RAFF_STATE.index, _browserFilters);
  _vlist.setItems(results, { resetScroll });
  const counter = document.getElementById('resultCount');
  if (counter) {
    counter.textContent = results.length === RAFF_STATE.books.length
      ? `${results.length} كتاب`
      : `${results.length} نتيجة من ${RAFF_STATE.books.length}`;
  }
}

function showSavedBookModal(record, { andNew = false } = {}) {
  let currentRef = record.referenceNumber;

  const html = `
    <div class="modal-body">
      <div class="ref-modal-icon">${icon('check')}</div>
      <p class="ref-book-title">${escapeHtml(record.title)}</p>
      <p class="ref-book-author">${escapeHtml(record.author) || 'بدون مؤلف محدد'}</p>

      <div class="ref-number-box">
        <div class="ref-number-label">الرقم المرجعي للكتاب</div>
        <div class="ref-number-value" id="refNumberValue">${escapeHtml(currentRef)}</div>
        <div class="ref-edit-row hidden" id="refEditRow">
          <input type="text" id="refEditInput" value="${escapeHtml(currentRef)}" />
          <button class="btn btn-primary btn-sm" id="refSaveBtn">${icon('check')}</button>
          <button class="btn btn-ghost btn-sm" id="refCancelBtn">${icon('x')}</button>
        </div>
        <button class="ref-edit-toggle" id="refEditToggle">${icon('edit', 12)} تغيير الرقم</button>
      </div>
      <p class="ref-hint">دوّن هذا الرقم على الكتاب لتحديد موقعه على الرف لاحقاً</p>

      <div class="ref-barcode-preview" id="refBarcodePreview"></div>

      <div class="form-actions" style="justify-content:center;">
        <button class="btn btn-outline" id="printLabelBtn">${icon('printer')} طباعة الملصق</button>
        <button class="btn btn-outline" id="pdfLabelBtn">${icon('download')} حفظ PDF</button>
        <button class="btn btn-outline" id="copyRefBtn">${icon('hash')} نسخ الرقم</button>
        <button class="btn btn-primary" id="closeRefModal">${icon('check')} تم</button>
      </div>
    </div>`;

  const renderBarcodePreview = () => {
    const el = document.getElementById('refBarcodePreview');
    if (!el) return;
    if (typeof RaffBarcode !== 'undefined' && RaffBarcode.canEncode(currentRef)) {
      el.innerHTML = RaffBarcode.toSVG(currentRef, { moduleWidth: 2, height: 50, textSize: 13, color: '#1a1a1a', background: '#ffffff' });
    } else {
      el.innerHTML = '';
    }
  };

  openModal(html, {
    onMount: (overlay) => {
      const valueEl = overlay.querySelector('#refNumberValue');
      const editRow = overlay.querySelector('#refEditRow');
      const editInput = overlay.querySelector('#refEditInput');
      const toggle = overlay.querySelector('#refEditToggle');

      const openEdit = () => {
        valueEl.classList.add('hidden');
        toggle.classList.add('hidden');
        editRow.classList.remove('hidden');
        editInput.value = currentRef;
        editInput.focus();
        editInput.select();
      };
      const closeEdit = () => {
        editRow.classList.add('hidden');
        valueEl.classList.remove('hidden');
        toggle.classList.remove('hidden');
      };
      const saveEdit = async () => {
        const next = editInput.value.trim();
        if (!next || next === currentRef) { closeEdit(); return; }
        const res = await window.raff.setReferenceNumber(record.id, next);
        if (!res.ok) { toast(res.error, 'error'); editInput.focus(); return; }
        currentRef = next;
        valueEl.textContent = next;
        closeEdit();
        renderBarcodePreview();
        await refreshState();
        refreshCurrentView();
        toast('تم تحديث الرقم المرجعي', 'success', 1800);
      };

      toggle.addEventListener('click', openEdit);
      overlay.querySelector('#refSaveBtn').addEventListener('click', saveEdit);
      overlay.querySelector('#refCancelBtn').addEventListener('click', closeEdit);
      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); closeEdit(); }
      });

      overlay.querySelector('#printLabelBtn').addEventListener('click', () => {
        const fresh = RAFF_STATE.books.find((b) => b.id === record.id) || record;
        printBarcodeLabels([fresh], fresh.title);
      });
      overlay.querySelector('#pdfLabelBtn').addEventListener('click', () => {
        const fresh = RAFF_STATE.books.find((b) => b.id === record.id) || record;
        saveBarcodeLabelsPdf([fresh], fresh.title);
      });

      overlay.querySelector('#copyRefBtn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(currentRef);
          toast('تم نسخ الرقم المرجعي', 'success', 1800);
        } catch (_) {
          toast('تعذّر نسخ الرقم', 'error');
        }
      });
      overlay.querySelector('#closeRefModal').addEventListener('click', closeModal);
      renderBarcodePreview();
    },
  });
}

/* =========================================================
   Add / Edit form
   ========================================================= */
function renderAddForm(root, editingBook) {
  const b = editingBook || {};
  const isEdit = !!editingBook;
  const meta = RAFF_STATE.meta;

  root.innerHTML = `
    <div class="panel form-panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${isEdit ? 'تعديل بيانات الكتاب' : 'إضافة كتاب جديد'}</h2>
          <p class="panel-desc">الحقول المميزة بعلامة <span class="required">*</span> إلزامية، وبقية الحقول اختيارية</p>
        </div>
      </div>

      <form id="bookForm" novalidate>
        <div class="form-grid">
          <div class="field span-2" id="field-title">
            <label>${icon('book')} اسم الكتاب <span class="required">*</span></label>
            <input type="text" name="title" value="${escapeHtml(b.title)}" placeholder="مثال: مقدمة ابن خلدون" autofocus />
            <span class="error-msg hidden">هذا الحقل مطلوب</span>
          </div>

          <div class="field" id="field-author">
            <label>${icon('user')} المؤلف <span class="required">*</span></label>
            <div class="ac-anchor"><input type="text" name="author" value="${escapeHtml(b.author)}" placeholder="اسم المؤلف" /></div>
            <span class="error-msg hidden">هذا الحقل مطلوب</span>
          </div>

          <div class="field">
            <label>${icon('building')} دار النشر</label>
            <div class="ac-anchor"><input type="text" name="publisher" value="${escapeHtml(b.publisher)}" placeholder="اسم دار النشر" /></div>
          </div>

          <div class="field">
            <label>${icon('tag')} المجال / التصنيف</label>
            <div class="ac-anchor"><input type="text" name="category" value="${escapeHtml(b.category)}" placeholder="مثال: أدب، تفسير، فقه" /></div>
          </div>

          ${isEdit ? `
          <div class="field">
            <label>${icon('hash')} الرقم المرجعي</label>
            <input type="text" name="referenceNumber" value="${escapeHtml(b.referenceNumber)}" />
          </div>` : `
          <div class="field" id="field-ref">
            <label>${icon('hash')} الرقم المرجعي</label>
            <input type="text" name="referenceNumber" id="refInput" value="" placeholder="يظهر تلقائياً عند كتابة اسم الكتاب" dir="ltr" autocomplete="off" />
            <span class="hint" id="refHint">يُقترح رقم تلقائي — يمكنك تعديله</span>
          </div>`}

          <div class="field">
            <label>${icon('layers')} الطبعة</label>
            <input type="text" name="edition" value="${escapeHtml(b.edition)}" placeholder="مثال: الطبعة الثالثة" />
          </div>

          <div class="field">
            <label>${icon('calendar')} سنة النشر</label>
            <input type="text" name="publishYear" value="${escapeHtml(b.publishYear)}" placeholder="مثال: 1432هـ" />
          </div>

          <div class="field field-volumes">
            <label>${icon('layers')} عدد الأجزاء / المجلدات</label>
            <input type="number" name="volumes" min="1" value="${b.volumes || 1}" />
            <span class="hint">عند إدخال أكثر من جزء يمكنك لاحقاً تحديد الجزء الذي استعاره كل مستعير بدقة.</span>
          </div>

          <div class="field">
            <label>${icon('tag')} السعر <span class="optional">(اختياري)</span></label>
            <input type="number" name="price" min="0" step="0.01" value="${b.price ?? ''}" placeholder="مثال: 150" />
          </div>

          <div class="field">
            <label>${icon('copies')} عدد النسخ</label>
            <input type="number" name="copiesTotal" min="${isEdit ? Math.max(1, RaffBook.borrowedCopies(b)) : 1}" value="${b.copiesTotal || 1}" />
            ${isEdit && RaffBook.borrowedCopies(b) > 0
              ? `<span class="hint">لا يمكن أن يقل عن ${RaffBook.borrowedCopies(b)} (نسخ معارة حالياً)</span>`
              : ''}
          </div>

          <div class="field">
            <label>${icon('layers')} السلسلة <span class="optional">(اختياري)</span></label>
            <div class="ac-anchor"><input type="text" name="series" value="${escapeHtml(b.series || '')}" placeholder="مثال: سلسلة أعلام" /></div>
          </div>

          <div class="field">
            <label>${icon('hash')} الترتيب في السلسلة</label>
            <input type="text" name="seriesOrder" value="${escapeHtml(b.seriesOrder || '')}" placeholder="مثال: 4" />
          </div>

          <div class="field">
            <label>${icon('book')} الرف</label>
            <div class="ac-anchor"><input type="text" name="shelf" value="${escapeHtml(b.shelf || '')}" placeholder="مثال: A-12" /></div>
          </div>

          <div class="field">
            <label>${icon('check')} حالة النسخة</label>
            <select name="condition">
              ${['جيدة', 'مقبولة', 'تالفة', 'مفقودة'].map((c) => `<option value="${c}" ${(b.condition || 'جيدة') === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>${icon('building')} جهة الاقتناء</label>
            <input type="text" name="acquisition" value="${escapeHtml(b.acquisition || '')}" placeholder="مثال: شراء، هدية، وقف" />
          </div>

          <div class="field span-3">
            <label>${icon('tag')} الكلمات المفتاحية <span class="optional">(افصل بينها بفاصلة)</span></label>
            <input type="text" name="keywords" value="${escapeHtml((b.keywords || []).join('، '))}" placeholder="مثال: عقيدة، توحيد، أسماء وصفات" />
          </div>

          <div class="field span-3">
            <label>${icon('note')} ملاحظات</label>
            <input type="text" name="notes" value="${escapeHtml(b.notes)}" placeholder="أي تفاصيل إضافية عن الكتاب أو نسخته..." />
          </div>
        </div>

        ${isEdit ? '' : `<p class="form-note">${icon('info', 13)} تُسجَّل الإعارات لاحقاً من نافذة تفاصيل الكتاب، وتُحتسب حالة الكتاب تلقائياً حسب النسخ المتاحة.</p>`}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${icon('check')} ${isEdit ? 'حفظ التعديلات' : 'حفظ الكتاب'}</button>
          ${!isEdit ? `<button type="button" class="btn btn-outline" id="saveAndNew">${icon('plus')} حفظ وإضافة آخر</button>` : ''}
          <button type="button" class="btn btn-ghost" id="cancelForm">إلغاء</button>
          <span class="form-hint-inline">${isEdit ? '' : 'سيظهر الرقم المرجعي في نافذة بعد الحفظ'}</span>
        </div>
      </form>
    </div>
  `;

  const form = root.querySelector('#bookForm');

  // Predictive suggestions on the fields where consistency matters most.
  [['author', 'author'], ['publisher', 'publisher'], ['category', 'category']].forEach(([name, type]) => {
    const input = form.querySelector(`[name=${name}]`);
    if (!input) return;
    createAutocomplete(input, {
      getPool: () => (type === 'category' ? categoryPool() : RAFF_STATE.suggestions.filter((s) => s.type === type)),
      onSelect: () => {},
      typeLabels: SUGGESTION_TYPE_LABELS,
    });
  });

  // Series and shelf suggest from what's already in use.
  [['series', 'series'], ['shelf', 'shelves']].forEach(([name, metaKey]) => {
    const input = form.querySelector(`[name=${name}]`);
    if (!input) return;
    createAutocomplete(input, {
      getPool: () => (RAFF_STATE.meta[metaKey] || []).map((v) => ({ label: v, type: name, norm: normalizeArabic(v) })),
      onSelect: () => {},
      typeLabels: SUGGESTION_TYPE_LABELS,
    });
  });

  function validate(data) {
    let valid = true;
    [['title', 'field-title'], ['author', 'field-author']].forEach(([key, id]) => {
      const fieldEl = root.querySelector('#' + id);
      const ok = (data[key] || '').trim().length > 0;
      fieldEl.classList.toggle('invalid', !ok);
      fieldEl.querySelector('.error-msg')?.classList.toggle('hidden', ok);
      if (!ok) valid = false;
    });
    return valid;
  }

  async function submitHandler(andNew) {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    if (!validate(data)) {
      toast('الرجاء إكمال الحقول الإلزامية', 'error');
      return;
    }
    try {
      if (isEdit) {
        const newRef = (data.referenceNumber || '').trim();
        if (newRef && newRef !== editingBook.referenceNumber) {
          const refRes = await window.raff.setReferenceNumber(editingBook.id, newRef);
          if (!refRes.ok) { toast(refRes.error, 'error'); return; }
        }
        await window.raff.updateBook(editingBook.id, data);
        toast('تم تحديث بيانات الكتاب بنجاح', 'success');
        await refreshState();
        renderNavCounts();
        navigateTo('library');
      } else {
        const record = await window.raff.addBook(data);
        if (record && record.ok === false) { toast(record.error || 'تعذّر إضافة الكتاب', 'error'); return; }
        await refreshState();
        renderNavCounts();
        navigateTo(andNew ? 'add' : 'library');
        showSavedBookModal(record, { andNew });
      }
    } catch (err) {
      toast('حدث خطأ أثناء الحفظ: ' + err.message, 'error');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submitHandler(false); });
  root.querySelector('#cancelForm').addEventListener('click', () => navigateTo(isEdit ? 'library' : 'dashboard'));
  root.querySelector('#saveAndNew')?.addEventListener('click', () => submitHandler(true));
}

/** Common categories, offered even before any book uses them. */
const DEFAULT_CATEGORIES = [
  'تفسير', 'حديث', 'فقه', 'أصول الفقه', 'عقيدة',
  'سيرة', 'تاريخ', 'أدب', 'لغة عربية', 'تزكية وأخلاق',
];

function categoryPool() {
  const used = RAFF_STATE.suggestions.filter((s) => s.type === 'category');
  const seen = new Set(used.map((s) => s.label));
  const defaults = DEFAULT_CATEGORIES
    .filter((c) => !seen.has(c))
    .map((c) => ({ label: c, type: 'category', norm: normalizeArabic(c) }));
  // Categories already in the library rank first; defaults fill the rest.
  return used.concat(defaults);
}

/* =========================================================
   Library table (distinct from search: columnar, sortable, dense)
   ========================================================= */
const LIBRARY_COLUMNS = [
  { key: 'title', label: 'العنوان', align: 'start', grow: 1.6, min: 150 },
  { key: 'author', label: 'المؤلف', align: 'start', grow: 1.1, min: 110 },
  { key: 'publisher', label: 'دار النشر', align: 'start', grow: 1.1, min: 110, hide: 'md' },
  { key: 'category', label: 'المجال', align: 'start', grow: 0.9, min: 90, hide: 'narrow' },
  { key: 'publishYear', label: 'السنة', align: 'center', grow: 0.6, min: 64, hide: 'narrow' },
  { key: 'createdAt', label: 'تاريخ الإضافة', align: 'center', grow: 0.9, min: 104, hide: 'md' },
  { key: 'volumes', label: 'أجزاء', align: 'center', grow: 0.5, min: 60, hide: 'md' },
  { key: 'price', label: 'السعر', align: 'center', grow: 0.7, min: 70, hide: 'narrow' },
  { key: 'availableCopies', label: 'متاح / الكل', align: 'center', grow: 0.8, min: 96 },
  { key: 'status', label: 'الحالة', align: 'center', grow: 0.9, min: 96 },
  { key: 'referenceNumber', label: 'الرقم المرجعي', align: 'center', grow: 1, min: 130, ltr: true },
];

// User-adjusted column widths (px), keyed by column key. Empty = use fr grow.
let _libColWidths = {};
let _libResizeHandler = null;
let _libVisibleCount = 0;

/** Columns visible at the current viewport width (mirrors the CSS breakpoints). */
function visibleLibColumns() {
  const w = window.innerWidth;
  return LIBRARY_COLUMNS.filter((c) => {
    if (c.hide === 'md' && w <= 1280) return false;
    if (c.hide === 'narrow' && w <= 1180) return false;
    return true;
  });
}

/** Builds the CSS grid template string from the currently visible columns. */
function libGridTemplate() {
  return visibleLibColumns().map((c) => {
    const wpx = _libColWidths[c.key];
    return wpx ? `${wpx}px` : `minmax(${c.min || 80}px, ${c.grow}fr)`;
  }).join(' ');
}

const LIB_ROW_HEIGHT = 44;
const LIB_ROW_GAP = 0;
const LIB_ROW_STEP = LIB_ROW_HEIGHT + LIB_ROW_GAP;

let _libSort = { key: 'title', dir: 'asc' };
let _libFilters = { query: '', status: 'all', priceMin: '', priceMax: '' };
let _libVlist = null;
let _libDebounce = null;

function libCellValue(book, key) {
  switch (key) {
    case 'availableCopies': return RaffBook.availableFullCopies(book);
    case 'status': return RaffBook.bookStatus(book);
    case 'price': return typeof book.price === 'number' ? book.price : -1;
    case 'volumes': return book.volumes || 1;
    case 'createdAt': return Date.parse(book.createdAt) || 0;
    default: return book[key];
  }
}

const LIB_COLLATOR = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

function sortLibrary(books, { key, dir }) {
  const d = dir === 'asc' ? 1 : -1;
  const numeric = new Set(['availableCopies', 'price', 'volumes', 'createdAt']);
  const arr = [...books];
  if (numeric.has(key)) {
    arr.sort((a, b) => ((libCellValue(a, key) ?? 0) - (libCellValue(b, key) ?? 0)) * d);
  } else {
    arr.sort((a, b) => LIB_COLLATOR.compare(
      (libCellValue(a, key) || '').toString(),
      (libCellValue(b, key) || '').toString()
    ) * d);
  }
  return arr;
}

function renderLibraryTable(root) {
  if (_libVlist) { _libVlist.destroy(); _libVlist = null; }

  const cols = visibleLibColumns();
  const gridTemplate = libGridTemplate();

  root.innerHTML = `
    <div class="panel library-panel">
      <div class="filters-row">
        <div class="ac-anchor lib-query-wrap">
          <input type="text" id="libQuery" placeholder="تصفية سريعة في الجدول..." autocomplete="off" />
        </div>
        <div class="chip-toggle" id="libStatusToggle">
          <button data-val="all">الكل</button>
          <button data-val="${RaffBook.STATUS_AVAILABLE}">متاح</button>
          <button data-val="${RaffBook.STATUS_PARTIAL}">جزئي</button>
          <button data-val="${RaffBook.STATUS_FULL}">معار</button>
          <button data-val="overdue">متأخر</button>
          <button data-val="duesoon">يستحق قريبًا</button>
        </div>
        <div class="price-range">
          <input type="number" id="libPriceMin" placeholder="سعر من" min="0" />
          <span class="price-range-sep">—</span>
          <input type="number" id="libPriceMax" placeholder="إلى" min="0" />
        </div>
        <span class="result-count" id="libCount"></span>
      </div>

      <div class="lib-table" style="--lib-cols:${gridTemplate};">
        <div class="lib-head" id="libHead">
          ${cols.map((c, i) => `
            <div class="lib-th-wrap">
              <button class="lib-th sortable ${c.key === _libSort.key ? 'sorted' : ''}"
                data-sort="${c.key}" style="text-align:${c.align === 'start' ? 'right' : 'center'};">
                <span class="lib-th-label">${escapeHtml(c.label)}</span><span class="sort-arrow">${c.key === _libSort.key ? (_libSort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </button>
              ${i < cols.length - 1 ? `<span class="lib-col-resize" data-resize="${c.key}" title="اسحب لتغيير عرض العمود"></span>` : ''}
            </div>`).join('')}
        </div>
        <div class="lib-scroll" id="libScroll"></div>
      </div>
    </div>`;

  const scrollEl = root.querySelector('#libScroll');
  const queryInput = root.querySelector('#libQuery');
  queryInput.value = _libFilters.query;
  root.querySelector('#libPriceMin').value = _libFilters.priceMin;
  root.querySelector('#libPriceMax').value = _libFilters.priceMax;
  syncStatusToggle(root.querySelector('#libStatusToggle'), _libFilters.status);

  _libVlist = createVirtualList(scrollEl, {
    rowStep: LIB_ROW_STEP,
    rowHeight: LIB_ROW_HEIGHT,
    renderRow: (book) => renderLibraryRow(book),
    emptyHtml: `<div class="empty-state">${icon('book')}<h3>لا توجد نتائج</h3><p>غيّر معايير التصفية.</p></div>`,
  });

  root.querySelector('#libHead').addEventListener('click', (e) => {
    if (e.target.closest('.lib-col-resize')) return; // ignore clicks on resizer
    const th = e.target.closest('.lib-th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    const descDefault = new Set(['price', 'availableCopies', 'volumes', 'createdAt']);
    if (_libSort.key === key) _libSort.dir = _libSort.dir === 'asc' ? 'desc' : 'asc';
    else { _libSort.key = key; _libSort.dir = descDefault.has(key) ? 'desc' : 'asc'; }
    renderLibraryTable(root);
  });

  // Column resizing: drag the divider between two headers to set an explicit
  // pixel width for the column on its right (in RTL, the start-side column).
  setupColumnResize(root);

  // Rebuild when the viewport crosses a breakpoint so the visible column set
  // (and the grid template) stays correct. Guarded so we only redraw on an
  // actual column-set change, not every resize pixel.
  if (_libResizeHandler) window.removeEventListener('resize', _libResizeHandler);
  _libVisibleCount = visibleLibColumns().length;
  _libResizeHandler = () => {
    if (currentRoute !== 'library') return;
    const n = visibleLibColumns().length;
    if (n !== _libVisibleCount) {
      _libVisibleCount = n;
      const host = document.querySelector('#viewRoot') || root;
      renderLibraryTable(host);
    }
  };
  window.addEventListener('resize', _libResizeHandler);

  const applyFilters = () => {
    if (_libDebounce) clearTimeout(_libDebounce);
    _libDebounce = setTimeout(() => { _libDebounce = null; updateLibraryResults(); }, 60);
  };
  queryInput.addEventListener('input', () => { _libFilters.query = queryInput.value; applyFilters(); });
  root.querySelector('#libPriceMin').addEventListener('input', (e) => { _libFilters.priceMin = e.target.value; applyFilters(); });
  root.querySelector('#libPriceMax').addEventListener('input', (e) => { _libFilters.priceMax = e.target.value; applyFilters(); });
  root.querySelector('#libStatusToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    _libFilters.status = btn.dataset.val;
    syncStatusToggle(root.querySelector('#libStatusToggle'), _libFilters.status);
    applyFilters();
  });

  createAutocomplete(queryInput, {
    getPool: () => RAFF_STATE.suggestions,
    onSelect: (label) => { _libFilters.query = label; updateLibraryResults(); },
    typeLabels: SUGGESTION_TYPE_LABELS,
  });

  updateLibraryResults();
}

/** True if the book has an open loan that is overdue / due within 7 days. */
function bookHasLoanState(book, state) {
  for (const l of book.loans || []) {
    if (l.returnedAt) continue;
    if (state === 'overdue' && RaffBook.isOverdue(l, 30)) return true;
    if (state === 'duesoon' && !RaffBook.isOverdue(l, 30) && RaffBook.isDueSoon(l, 7)) return true;
  }
  return false;
}

/**
 * Enables drag-to-resize on the column dividers. Dragging a divider sets an
 * explicit pixel width for the column it belongs to; the grid template then
 * uses that width instead of the flexible fr track. Double-click resets it.
 */
function setupColumnResize(root) {
  const head = root.querySelector('#libHead');
  if (!head) return;

  head.querySelectorAll('.lib-col-resize').forEach((handle) => {
    const key = handle.dataset.resize;
    const col = LIBRARY_COLUMNS.find((c) => c.key === key);
    const minW = (col && col.min) || 60;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = handle.closest('.lib-th-wrap');
      const startX = e.clientX;
      const startW = wrap.getBoundingClientRect().width;
      document.body.classList.add('col-resizing');

      const onMove = (ev) => {
        // RTL: dragging left grows the column, so invert the delta.
        const delta = startX - ev.clientX;
        const next = Math.max(minW, Math.round(startW + delta));
        _libColWidths[key] = next;
        applyLibGridTemplate(root);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('col-resizing');
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Double-click a divider to reset that column to automatic width.
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      delete _libColWidths[key];
      applyLibGridTemplate(root);
    });
  });
}

/** Recomputes the CSS grid template from current widths without a full re-render. */
function applyLibGridTemplate(root) {
  const table = root.querySelector('.lib-table');
  if (!table) return;
  table.style.setProperty('--lib-cols', libGridTemplate());
}

function updateLibraryResults() {
  if (!_libVlist) return;
  const q = normalizeArabic(_libFilters.query);
  const min = _libFilters.priceMin === '' ? null : Number(_libFilters.priceMin);
  const max = _libFilters.priceMax === '' ? null : Number(_libFilters.priceMax);

  const status = _libFilters.status;
  const loanFilter = status === 'overdue' || status === 'duesoon';
  let rows = RAFF_STATE.index;
  let filtered = [];
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    if (!loanFilter && status !== 'all' && entry.status !== status) continue;
    if (loanFilter && !bookHasLoanState(entry.book, status)) continue;
    if (q && entry.all.indexOf(q) === -1) continue;
    if (min !== null || max !== null) {
      const p = entry.book.price;
      if (typeof p !== 'number') continue;
      if (min !== null && p < min) continue;
      if (max !== null && p > max) continue;
    }
    filtered.push(entry.book);
  }

  const sorted = sortLibrary(filtered, _libSort);
  _libVlist.setItems(sorted, { resetScroll: true });

  const counter = document.getElementById('libCount');
  if (counter) {
    counter.textContent = sorted.length === RAFF_STATE.books.length
      ? `${sorted.length} كتاب`
      : `${sorted.length} من ${RAFF_STATE.books.length}`;
  }
}

function formatDateShort(iso) {
  const t = Date.parse(iso);
  if (!t) return '—';
  const d = new Date(t);
  // Compact Gregorian date, e.g. 2026/07/12
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function renderLibraryRow(book) {
  const status = RaffBook.bookStatus(book);
  const statusCls = status === RaffBook.STATUS_AVAILABLE ? 'st-avail'
    : status === RaffBook.STATUS_PARTIAL ? 'st-partial' : 'st-full';
  const avail = RaffBook.availableFullCopies(book);
  const total = RaffBook.totalCopies(book);
  const price = typeof book.price === 'number' ? formatPrice(book.price) : '—';
  const spine = spineColorFor(book.category || book.author);

  const content = {
    title: `<span class="lib-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title) || 'بدون عنوان'}</span>`,
    author: escapeHtml(book.author) || '—',
    publisher: escapeHtml(book.publisher) || '—',
    category: escapeHtml(book.category) || '—',
    publishYear: escapeHtml(book.publishYear) || '—',
    createdAt: `<span class="lib-date">${formatDateShort(book.createdAt)}</span>`,
    volumes: book.volumes || 1,
    price: price,
    availableCopies: `<span class="${avail === 0 ? 'num-warn' : 'num-ok'}">${avail}</span><span class="lib-total">/${total}</span>`,
    status: `<span class="lib-status ${statusCls}">${status}</span>`,
    referenceNumber: escapeHtml(book.referenceNumber),
  };

  const cells = visibleLibColumns().map((c) =>
    `<div class="lib-td ${c.ltr ? 'ltr' : ''}" style="text-align:${c.align === 'start' ? 'right' : 'center'};">${content[c.key]}</div>`
  ).join('');

  return `<div class="lib-row" data-id="${book.id}" role="button" tabindex="0" style="--spine:${spine};">${cells}</div>`;
}

/* =========================================================
   Reports / lookup console
   ========================================================= */
let _reportState = { dim: 'borrower', value: '', sortKey: null, sortDir: 'desc' };
let _reportAc = null;

/* =========================================================
   Barcode scan + label printing
   ========================================================= */
function renderScanView(root) {
  const book = _lastScannedId ? RAFF_STATE.books.find((b) => b.id === _lastScannedId) : null;

  root.innerHTML = `
    <div class="scan-layout">
      <div class="panel scan-input-panel">
        <div class="scan-hero">
          <div class="scan-hero-icon">${icon('scan', 34)}</div>
          <h2 class="scan-hero-title">امسح باركود الكتاب</h2>
          <p class="scan-hero-desc">وجّه قارئ الباركود نحو ملصق الكتاب، أو اكتب الرقم المرجعي يدوياً واضغط Enter.</p>
        </div>
        <div class="scan-box ac-anchor">
          ${icon('barcode', 18)}
          <input type="text" id="scanInput" placeholder="raf-0001" autocomplete="off" data-scan-target spellcheck="false" />
          <button class="btn btn-primary btn-sm" id="scanGoBtn">${icon('search', 15)} عرض</button>
        </div>
        <div class="scan-hints">
          <div class="scan-hint">${icon('info', 13)} قارئ الباركود يعمل تلقائياً من أي شاشة في البرنامج.</div>
          <div class="scan-hint">${icon('printer', 13)} يمكنك طباعة ملصقات الباركود من الأسفل.</div>
        </div>
        <div class="scan-print-row">
          <button class="btn btn-outline btn-sm" id="printAllLabelsBtn">${icon('printer', 15)} طباعة ملصقات كل الكتب</button>
          <button class="btn btn-outline btn-sm" id="pdfAllLabelsBtn">${icon('download', 15)} حفظ كل الملصقات PDF</button>
          <button class="btn btn-outline btn-sm" id="printFilteredBtn">${icon('printer', 15)} طباعة/حفظ حسب رف أو نطاق…</button>
        </div>
      </div>

      <div class="panel scan-result-panel" id="scanResult">
        ${book ? scannedBookSheetHtml(book) : scanEmptyHtml()}
      </div>
    </div>`;

  const input = root.querySelector('#scanInput');
  input.focus();

  const submit = () => {
    const val = input.value.trim();
    if (!val) return;
    handleScannedCode(val);
    input.value = '';
    input.focus();
  };
  root.querySelector('#scanGoBtn').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  root.querySelector('#printAllLabelsBtn').addEventListener('click', () => {
    printBarcodeLabels(RAFF_STATE.books, 'كل الكتب');
  });
  root.querySelector('#pdfAllLabelsBtn').addEventListener('click', () => {
    saveBarcodeLabelsPdf(RAFF_STATE.books, 'كل الكتب');
  });
  root.querySelector('#printFilteredBtn').addEventListener('click', showLabelFilterModal);

  if (book) wireScannedBookSheet(root, book);
}

function scanEmptyHtml() {
  return `
    <div class="scan-empty">
      ${icon('barcode', 48)}
      <h3>بانتظار المسح</h3>
      <p>ستظهر هنا صفحة بيانات الكتاب كاملة بمجرد مسح الباركود أو إدخال الرقم المرجعي.</p>
    </div>`;
}

/** The full data sheet shown after a successful scan. */
function scannedBookSheetHtml(book) {
  const spine = spineColorFor(book.category || book.author);
  const total = RaffBook.totalCopies(book);
  const availFull = RaffBook.availableFullCopies(book);
  const multi = RaffBook.isMultiVolume(book);
  const priceStr = typeof book.price === 'number' ? formatPrice(book.price) : null;
  const openLoans = (book.loans || []).filter((l) => !l.returnedAt);
  const canEncode = typeof RaffBarcode !== 'undefined' && RaffBarcode.canEncode(book.referenceNumber);
  const barcodeSvg = canEncode
    ? RaffBarcode.toSVG(book.referenceNumber, { moduleWidth: 2, height: 60, textSize: 14, color: '#1a1a1a', background: '#ffffff' })
    : '';

  const field = (label, value) => value
    ? `<div class="sheet-field"><span class="sheet-label">${label}</span><span class="sheet-value">${escapeHtml(value)}</span></div>`
    : '';

  return `
    <div class="sheet" style="--spine:${spine};">
      <div class="sheet-head">
        <div class="sheet-title-wrap">
          <div class="sheet-badge">${statusBadgeHtml(book)}</div>
          <h2 class="sheet-title">${escapeHtml(book.title) || 'بدون عنوان'}</h2>
          <p class="sheet-author">${escapeHtml(book.author) || 'مؤلف غير محدد'}</p>
        </div>
        <div class="sheet-barcode" id="sheetBarcode">${barcodeSvg || '<span class="sheet-nobarcode">تعذّر توليد الباركود لهذا الرقم</span>'}</div>
      </div>

      <div class="sheet-availability ${availFull === 0 ? 'is-none' : availFull < total ? 'is-partial' : 'is-full'}">
        <div>
          <span class="sheet-avail-num">${availFull}</span>
          <span class="sheet-avail-of">من ${total} ${multi ? 'مجموعة' : 'نسخة'} متاحة</span>
        </div>
        ${openLoans.length ? `<div class="sheet-loans-badge">${icon('user', 13)} ${openLoans.length} إعارة مفتوحة</div>` : ''}
      </div>

      <div class="sheet-grid">
        ${field('الرقم المرجعي', book.referenceNumber)}
        ${field('دار النشر', book.publisher)}
        ${field('المجال', book.category)}
        ${field('الطبعة', book.edition)}
        ${field('سنة النشر', book.publishYear)}
        ${multi ? field('عدد الأجزاء', String(RaffBook.totalVolumes(book))) : ''}
        ${priceStr ? field('السعر', priceStr) : ''}
        ${book.series ? field('السلسلة', book.series + (book.seriesOrder ? ` (${book.seriesOrder})` : '')) : ''}
        ${book.shelf ? field('الرف', book.shelf) : ''}
        ${book.condition ? field('حالة النسخة', book.condition) : ''}
        ${book.acquisition ? field('جهة الاقتناء', book.acquisition) : ''}
      </div>

      ${(book.keywords && book.keywords.length)
        ? `<div class="sheet-keywords">${book.keywords.map((k) => `<span class="sheet-kw">${escapeHtml(k)}</span>`).join('')}</div>`
        : ''}

      ${book.notes ? `<div class="sheet-notes"><span class="sheet-label">ملاحظات</span><p>${escapeHtml(book.notes)}</p></div>` : ''}

      <div class="sheet-actions">
        <button class="btn btn-primary btn-sm" id="sheetDetailsBtn">${icon('book', 15)} فتح التفاصيل والإعارة</button>
        <button class="btn btn-outline btn-sm" id="sheetPrintLabelBtn">${icon('printer', 15)} طباعة الملصق</button>
        <button class="btn btn-outline btn-sm" id="sheetPdfLabelBtn">${icon('download', 15)} حفظ PDF</button>
        <button class="btn btn-outline btn-sm" id="sheetCopyRefBtn">${icon('hash', 15)} نسخ الرقم</button>
      </div>
    </div>`;
}

function wireScannedBookSheet(root, book) {
  root.querySelector('#sheetDetailsBtn')?.addEventListener('click', () => showBookDetails(book.id));
  root.querySelector('#sheetPrintLabelBtn')?.addEventListener('click', () => printBarcodeLabels([book], book.title));
  root.querySelector('#sheetPdfLabelBtn')?.addEventListener('click', () => saveBarcodeLabelsPdf([book], book.title));
  root.querySelector('#sheetCopyRefBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(book.referenceNumber);
      toast('تم نسخ الرقم المرجعي', 'success', 1600);
    } catch (_) { toast('تعذّر النسخ', 'error'); }
  });
}

/** Called by app.js after a scan resolves to a book. */
function showScannedBook(bookId) {
  _lastScannedId = bookId;
  const panel = document.getElementById('scanResult');
  const book = RAFF_STATE.books.find((b) => b.id === bookId);
  if (!panel || !book) return;
  panel.innerHTML = scannedBookSheetHtml(book);
  wireScannedBookSheet(panel, book);
  const input = document.getElementById('scanInput');
  if (input) { input.value = ''; input.focus(); }
}

/**
 * Opens the OS print dialog with a clean sheet of barcode labels. We render an
 * isolated HTML document (no app chrome) so what prints is exactly the labels,
 * sized for standard adhesive label sheets.
 */
/**
 * Builds the standalone HTML document for a sheet of barcode labels, honoring
 * the institution branding and label options from settings. Shared by both the
 * print path and the save-as-PDF path so they always produce identical output.
 * Returns null (after a toast) if no book has an encodable reference.
 */
function buildLabelsHtml(books, titleLabel) {
  const printable = books.filter((b) => typeof RaffBarcode !== 'undefined' && RaffBarcode.canEncode(b.referenceNumber));
  if (!printable.length) {
    toast('لا توجد أرقام مرجعية صالحة للطباعة', 'error');
    return null;
  }

  const s = RAFF_STATE.settings || {};
  const columns = (s.labelColumns >= 1 && s.labelColumns <= 5) ? s.labelColumns : 4;
  const size = s.labelSize === 'medium' ? 'medium' : 'small';
  const showPrice = s.labelShowPrice !== false;
  const showShelf = s.labelShowShelf !== false;
  const showMicro = s.labelShowMicrotext !== false;
  const institution = (s.institutionName || '').trim();
  const logo = s.logo || '';

  // ---- Precise A4 geometry (mm) ----
  // A4 is 210mm wide. With an 8mm page margin each side, the usable width is
  // 194mm. Labels are laid out in a fixed grid with a small gutter, so each
  // label gets an exact millimetre width — essential for sheets that line up
  // with adhesive label stock and for a predictable, professional result.
  const PAGE_W = 210, MARGIN = 8, GUTTER = 3;
  const usable = PAGE_W - MARGIN * 2;
  const labelW = (usable - GUTTER * (columns - 1)) / columns;
  // Compact by default so the sticker sits on the spine/back cover without
  // covering the book's own printed data. "medium" is a touch taller.
  const labelH = size === 'medium' ? 34 : 27;

  // Barcode module width derives from the label width so the bars always fill
  // the label neatly regardless of column count, staying crisp and scannable.
  const innerW = labelW - 4;                    // minus label padding
  const moduleWidth = Math.max(0.34, Math.min(0.62, (innerW / 68)));
  const barHeight = size === 'medium' ? 12 : 9; // mm-ish; scaled by SVG

  const labels = printable.map((b) => {
    const svg = RaffBarcode.toSVG(b.referenceNumber, {
      moduleWidth: moduleWidth, height: barHeight * 3, textSize: 0, margin: 1,
      color: '#111111', background: '#ffffff', showText: false,
    });
    const title = escapeHtml((b.title || 'بدون عنوان').slice(0, 42));
    const priceStr = (showPrice && typeof b.price === 'number') ? formatPrice(b.price) : '';

    // Microtext: a faint, very small line carrying quick book facts. It is
    // deliberately low-contrast — legible up close, unobtrusive from afar.
    const micro = showMicro ? [
      b.author, b.publisher, b.publishYear,
      b.category, (b.volumes > 1 ? `${b.volumes} أجزاء` : ''),
    ].filter(Boolean).map(escapeHtml).join(' • ') : '';

    // Professional brand strip: logo + academy name, sized to sit cleanly at
    // the top of each label without crowding the barcode.
    const brand = (institution || logo) ? `
      <div class="l-brand">
        ${logo ? `<img src="${logo}" class="l-logo" alt="">` : ''}
        ${institution ? `<span class="l-inst">${escapeHtml(institution)}</span>` : ''}
      </div>` : '';

    return `
      <div class="label">
        ${brand}
        <div class="l-title">${title}</div>
        <div class="l-barcode">${svg}</div>
        <div class="l-ref">${escapeHtml(b.referenceNumber)}</div>
        ${(showShelf && b.shelf) || priceStr ? `<div class="l-meta">
          ${showShelf && b.shelf ? `<span>رف ${escapeHtml(b.shelf)}</span>` : ''}
          ${priceStr ? `<span class="l-price">${priceStr}</span>` : ''}
        </div>` : ''}
        ${micro ? `<div class="l-micro">${micro}</div>` : ''}
      </div>`;
  }).join('');

  const headBrand = logo ? `<img src="${logo}" class="head-logo" alt="">` : '';

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>ملصقات الباركود — ${escapeHtml(titleLabel || '')}</title>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
      @page { size: A4; margin: ${MARGIN}mm; }
      body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; }
      .sheet-head {
        display: flex; align-items: center; justify-content: center; gap: 4mm;
        text-align: center; margin-bottom: 5mm; padding-bottom: 3mm;
        border-bottom: 1.5pt solid #b0894b;
      }
      .head-logo { max-height: 12mm; max-width: 26mm; object-fit: contain; }
      .head-text h1 { font-size: 13pt; margin-bottom: 0.5mm; color: #3e2c1c; }
      .head-text p { font-size: 8pt; color: #888; }

      .labels {
        display: grid;
        grid-template-columns: repeat(${columns}, ${labelW.toFixed(2)}mm);
        gap: ${GUTTER}mm;
        justify-content: center;
      }
      .label {
        width: ${labelW.toFixed(2)}mm; height: ${labelH}mm;
        border: 0.8pt solid #b0894b; border-radius: 1.6mm;
        padding: 1.4mm 1.4mm 1.2mm;
        page-break-inside: avoid; break-inside: avoid;
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 0.7mm; text-align: center;
        background: #fff; position: relative; overflow: hidden;
      }
      /* Slim accent bar for a finished, professional look. */
      .label::before {
        content: ''; position: absolute; top: 0; inset-inline: 0; height: 1mm; background: #b0894b;
      }
      /* Every child sizes to its own content — nothing reserves space. The
         barcode is the one flexible element, so it absorbs whatever vertical
         room is freed when there's no logo, name, title, or meta line, and
         shrinks gracefully when all of them are present. */
      .label > * { flex: 0 0 auto; width: 100%; }
      .l-brand {
        display: flex; align-items: center; justify-content: center; gap: 1mm;
      }
      .l-logo { max-height: 5mm; max-width: 10mm; object-fit: contain; }
      .l-inst {
        font-size: 5.6pt; font-weight: 800; color: #6b5518; letter-spacing: 0.1pt;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      }
      .l-title {
        font-size: 6.2pt; font-weight: 700; line-height: 1.15; color: #222;
        overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .l-barcode {
        flex: 1 1 auto; min-height: 6mm;
        display: flex; align-items: center; justify-content: center;
      }
      .l-barcode svg { max-width: 100%; height: 100%; max-height: 14mm; width: auto; }
      .l-ref { font-size: 7pt; font-weight: 700; direction: ltr; font-family: monospace; letter-spacing: 0.3pt; }
      .l-meta { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1mm; }
      .l-meta span {
        font-size: 5.2pt; font-weight: 700; padding: 0.2mm 1mm; border-radius: 0.8mm;
        background: #f3ead5; color: #6b5518;
      }
      .l-price { direction: ltr; }
      /* Microtext: intentionally faint and tiny. */
      .l-micro {
        font-size: 3.9pt; line-height: 1.2; color: #cbc4b0; letter-spacing: 0.05pt;
        overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      }
    </style></head><body>
    <div class="sheet-head">
      ${headBrand}
      <div class="head-text">
        <h1>${institution ? escapeHtml(institution) : 'مكتبة رَفّ'}</h1>
        <p>ملصقات الباركود · ${escapeHtml(titleLabel || '')} · ${printable.length} كتاب</p>
      </div>
    </div>
    <div class="labels">${labels}</div>
    </body></html>`;

  return { html, count: printable.length };
}

function printBarcodeLabels(books, titleLabel) {
  const built = buildLabelsHtml(books, titleLabel);
  if (!built) return;

  // Render in a hidden iframe so the OS print dialog shows only the labels.
  // Printing is triggered from here (the parent), not an inline script, so it
  // works under the app's strict Content-Security-Policy.
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '-10000px';
  frame.style.width = '800px';
  frame.style.height = '600px';
  document.body.appendChild(frame);
  const fdoc = frame.contentWindow.document;
  fdoc.open();
  fdoc.write(built.html);
  fdoc.close();
  // Wait for the barcodes (inline SVG) and logo to lay out, then print.
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (_) { /* ignore */ }
  }, 400);
  // Clean up after printing.
  setTimeout(() => { try { document.body.removeChild(frame); } catch (_) {} }, 60000);
  toast(`جارٍ تجهيز ${built.count} ملصقاً للطباعة…`, 'success', 2000);
}

/**
 * Saves the same label sheet directly as a PDF file (no print dialog). The
 * HTML is rendered to a real PDF in the main process via printToPDF, then
 * written wherever the user chooses in the save dialog.
 */
async function saveBarcodeLabelsPdf(books, titleLabel) {
  const built = buildLabelsHtml(books, titleLabel);
  if (!built) return;
  toast(`جارٍ تجهيز ${built.count} ملصقاً كملف PDF…`, 'success', 2000);
  try {
    const res = await window.raff.saveLabelsPdf(built.html, titleLabel || 'ملصقات');
    if (res && res.ok) toast('تم حفظ ملف PDF بنجاح', 'success');
    else if (res && res.canceled) { /* user cancelled — say nothing */ }
    else toast((res && res.error) || 'تعذّر حفظ ملف PDF', 'error');
  } catch (_) {
    toast('تعذّر حفظ ملف PDF', 'error');
  }
}

/**
 * Builds a clean, branded HTML document for a data table (borrowers, overdue
 * loans, or a report category). columns = [{label, align}], rows = array of
 * arrays of cell strings. Shared so every PDF export looks consistent.
 */
function buildTablePdfHtml({ title, subtitle, columns, rows, groups }) {
  const s = RAFF_STATE.settings || {};
  const institution = (s.institutionName || '').trim();
  const logo = s.logo || '';
  const today = new Date().toLocaleDateString('ar-EG');

  const thead = columns.map((c) =>
    `<th style="text-align:${c.align === 'start' ? 'right' : 'center'};">${escapeHtml(c.label)}</th>`).join('');

  const renderRows = (rowList, startIndex) => rowList.map((r, i) => `<tr class="${r._overdue ? 'row-overdue' : ''}">
    <td class="rnum">${startIndex + i + 1}</td>
    ${r.cells.map((cell, ci) =>
      `<td style="text-align:${columns[ci].align === 'start' ? 'right' : 'center'};">${escapeHtml(String(cell == null ? '' : cell))}</td>`).join('')}
  </tr>`).join('');

  // Grouped mode: each group is a titled section (e.g. a borrower and their
  // books, or a publisher and its titles). Otherwise a single flat table.
  let anyOverdue = false;
  let bodyHtml;
  if (groups && groups.length) {
    bodyHtml = groups.map((g) => {
      if (g.rows.some((r) => r._overdue)) anyOverdue = true;
      return `
      <div class="group">
        <div class="group-head">
          <span class="group-title">${escapeHtml(g.title)}</span>
          ${g.meta ? `<span class="group-meta">${escapeHtml(g.meta)}</span>` : ''}
        </div>
        <table>
          <thead><tr><th class="rnum">#</th>${thead}</tr></thead>
          <tbody>${renderRows(g.rows, 0)}</tbody>
        </table>
      </div>`;
    }).join('');
  } else {
    anyOverdue = rows.some((r) => r._overdue);
    bodyHtml = `<table>
      <thead><tr><th class="rnum">#</th>${thead}</tr></thead>
      <tbody>${renderRows(rows, 0)}</tbody>
    </table>`;
  }

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: 'Cairo','Segoe UI',Tahoma,sans-serif; color: #1a1a1a; padding: 4mm; }
      .head { display: flex; align-items: center; gap: 5mm; border-bottom: 2pt solid #b0894b; padding-bottom: 4mm; margin-bottom: 5mm; }
      .head img { max-height: 14mm; max-width: 30mm; object-fit: contain; }
      .head .ht { flex: 1; }
      .head h1 { font-size: 15pt; color: #3e2c1c; margin-bottom: 1mm; }
      .head .sub { font-size: 9pt; color: #777; }
      .head .date { font-size: 8.5pt; color: #999; }
      table { width: 100%; border-collapse: collapse; font-size: 9pt; }
      thead th { background: #f3ead5; color: #6b5518; font-weight: 800; padding: 2.4mm 2mm; border: 0.5pt solid #e0d4b8; white-space: nowrap; }
      tbody td { padding: 2mm; border: 0.5pt solid #eadfc7; }
      tbody tr:nth-child(even) { background: #faf6ec; }
      .rnum { color: #b0894b; font-weight: 700; text-align: center; width: 8mm; }
      .row-overdue { background: #fbeaea !important; }
      .row-overdue td { color: #8a2f2f; font-weight: 600; }
      .group { margin-bottom: 6mm; page-break-inside: avoid; }
      .group-head {
        display: flex; align-items: baseline; gap: 3mm;
        background: #3e2c1c; color: #fff; padding: 2mm 3mm; border-radius: 1.5mm 1.5mm 0 0;
      }
      .group-title { font-size: 11pt; font-weight: 800; }
      .group-meta { font-size: 8.5pt; color: #d8c7a8; }
      .legend { margin-top: 4mm; font-size: 8pt; color: #999; }
      .legend .od { display: inline-block; width: 3mm; height: 3mm; background: #fbeaea; border: 0.5pt solid #d99; vertical-align: middle; margin-inline-start: 2mm; }
    </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="">` : ''}
      <div class="ht">
        <h1>${institution ? escapeHtml(institution) : 'مكتبة رَفّ'}</h1>
        <div class="sub">${escapeHtml(title)}${subtitle ? ' · ' + escapeHtml(subtitle) : ''}</div>
      </div>
      <div class="date">${escapeHtml(today)}</div>
    </div>
    ${bodyHtml}
    ${anyOverdue ? '<div class="legend"><span class="od"></span> صف مظلّل = إعارة متأخرة</div>' : ''}
    </body></html>`;
}

async function saveTablePdf(spec, fileHint) {
  const hasData = (spec.groups && spec.groups.length) || (spec.rows && spec.rows.length);
  if (!hasData) { toast('لا توجد بيانات للتصدير', 'error'); return; }
  toast('جارٍ تجهيز ملف PDF…', 'success', 1800);
  try {
    const html = buildTablePdfHtml(spec);
    const res = await window.raff.saveTablePdf(html, fileHint || spec.title);
    if (res && res.ok) toast('تم حفظ ملف PDF بنجاح', 'success');
    else if (res && res.canceled) { /* silent */ }
    else toast((res && res.error) || 'تعذّر حفظ ملف PDF', 'error');
  } catch (_) {
    toast('تعذّر حفظ ملف PDF', 'error');
  }
}

/** Formats an ISO date as a short Gregorian date, or a dash. */
function fmtLoanDate(iso) {
  const t = Date.parse(iso);
  return t ? new Date(t).toLocaleDateString('ar-EG') : '—';
}

/** Exports active borrowers grouped by borrower (name, then their books). */
async function exportBorrowersPdf({ overdueOnly = false } = {}) {
  const loans = await window.raff.getActiveLoans({ overdueOnly });
  if (!loans.length) {
    toast(overdueOnly ? 'لا يوجد مستعيرون متأخرون' : 'لا توجد إعارات مفتوحة', 'error');
    return;
  }
  const columns = [
    { label: 'الكتاب', align: 'start' },
    { label: 'الرقم المرجعي', align: 'center' },
    { label: 'النطاق', align: 'center' },
    { label: 'يوم الإعارة', align: 'center' },
    { label: 'تاريخ الاستحقاق', align: 'center' },
    { label: 'الحالة', align: 'center' },
  ];

  // Group loans by borrower. Preserve the overdue-first order of borrowers by
  // using the order in which each borrower first appears (loans are already
  // sorted overdue-first).
  const order = [];
  const byBorrower = new Map();
  for (const l of loans) {
    const name = l.borrowerName || 'غير مسمّى';
    if (!byBorrower.has(name)) { byBorrower.set(name, []); order.push(name); }
    byBorrower.get(name).push(l);
  }

  const groups = order.map((name) => {
    const items = byBorrower.get(name);
    const overdueCount = items.filter((l) => l.overdue).length;
    return {
      title: name,
      meta: `${items.length} كتاب${overdueCount ? ` · ${overdueCount} متأخر` : ''}`,
      rows: items.map((l) => ({
        _overdue: l.overdue,
        cells: [
          l.title || '—', l.referenceNumber || '—', l.scope,
          fmtLoanDate(l.borrowedAt), fmtLoanDate(l.dueAt),
          l.overdue ? `متأخر ${l.overdueDays} يوم` : 'ضمن المدة',
        ],
      })),
    };
  });

  await saveTablePdf({
    title: overdueOnly ? 'المستعيرون المتأخرون' : 'المستعيرون والإعارات المفتوحة',
    subtitle: `${order.length} مستعير · ${loans.length} ${overdueOnly ? 'متأخر' : 'إعارة'}`,
    columns, groups,
  }, overdueOnly ? 'المتأخرون' : 'المستعيرون');
}

/** Small modal: export a dimension as a ranking summary, or grouped with books. */
function showDimensionExportChoice(dim, dimDef, onSummary, onGrouped) {
  const html = `
    <div class="modal-header">
      <h3 class="modal-title">${icon('download')} تصدير ${escapeHtml(dimDef.label)}</h3>
      <button class="btn btn-ghost btn-icon" id="dxClose" aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <p class="form-note" style="display:flex;">${icon('info', 13)} اختر شكل ملف الـPDF.</p>
      <div class="export-choice">
        <button class="export-choice-btn" id="dxSummary">
          <span class="ec-icon">${icon('stack', 20)}</span>
          <span class="ec-title">جدول الترتيب فقط</span>
          <span class="ec-desc">صف واحد لكل ${escapeHtml(dimDef.singular)} مع أرقامه الإجمالية</span>
        </button>
        <button class="export-choice-btn" id="dxGrouped">
          <span class="ec-icon">${icon('book', 20)}</span>
          <span class="ec-title">مع الكتب</span>
          <span class="ec-desc">كل ${escapeHtml(dimDef.singular)} يليه قائمة كتبه</span>
        </button>
      </div>
    </div>`;
  openModal(html, {
    onMount: (overlay) => {
      overlay.querySelector('#dxClose').addEventListener('click', closeModal);
      overlay.querySelector('#dxSummary').addEventListener('click', () => { closeModal(); onSummary(); });
      overlay.querySelector('#dxGrouped').addEventListener('click', () => { closeModal(); onGrouped(); });
    },
  });
}

/** Exports a dimension grouped: each value as a header, its books beneath it. */
function exportDimensionGroupedPdf(dim, dimDef) {
  const index = RAFF_STATE.reportIndex;
  const map = index[dim];
  if (!map || !map.size) { toast('لا توجد بيانات للتصدير', 'error'); return; }

  const columns = [
    { label: 'العنوان', align: 'start' },
    { label: 'الرقم المرجعي', align: 'center' },
    { label: 'المؤلف', align: 'start' },
    { label: 'سنة النشر', align: 'center' },
    { label: 'النسخ', align: 'center' },
    { label: 'الحالة', align: 'center' },
  ];

  // Sort values by number of books (desc), then name.
  const entries = [...map.entries()]
    .map(([value, items]) => [value, dim === 'borrower' ? items.map((x) => x.book) : items])
    .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]), 'ar'));

  const groups = entries.map(([value, books]) => {
    // De-duplicate (a borrower may hold several loans of one book).
    const seen = new Set();
    const uniqueBooks = books.filter((bk) => { if (seen.has(bk.id)) return false; seen.add(bk.id); return true; });
    return {
      title: value || `— بدون ${dimDef.singular} —`,
      meta: `${uniqueBooks.length} كتاب`,
      rows: uniqueBooks.map((bk) => ({
        cells: [
          bk.title || 'بدون عنوان', bk.referenceNumber || '—', bk.author || '—',
          bk.publishYear || '—', RaffBook.totalCopies(bk),
          RaffBook.bookStatus(bk),
        ],
      })),
    };
  });

  saveTablePdf({
    title: `${dimDef.label} والكتب`,
    subtitle: `${entries.length} ${dimDef.singular}`,
    columns, groups,
  }, `${dimDef.label}-بالكتب`);
}

/** Lets the user print/save labels for a subset (by shelf, category, series, or range). */
function showLabelFilterModal() {
  const meta = RAFF_STATE.meta;
  const opt = (arr) => arr.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  const html = `
    <div class="modal-header">
      <h3 class="modal-title">${icon('printer')} طباعة / حفظ ملصقات محددة</h3>
      <button class="btn btn-ghost btn-icon" id="lblClose" aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="label-dest">
        <span class="label-dest-label">الوجهة:</span>
        <div class="chip-toggle" id="lblDest">
          <button data-dest="print" class="active">${icon('printer', 13)} طباعة</button>
          <button data-dest="pdf">${icon('download', 13)} حفظ PDF</button>
        </div>
      </div>

      <div class="label-range-box">
        <div class="label-range-title">${icon('hash', 14)} حسب نطاق الرقم المرجعي</div>
        <div class="label-range-row">
          <label class="label-range-field"><span>من</span><input type="text" id="lblFrom" placeholder="raf-0001" dir="ltr"></label>
          <label class="label-range-field"><span>إلى</span><input type="text" id="lblTo" placeholder="raf-0100" dir="ltr"></label>
          <button class="btn btn-primary btn-sm" id="lblDoRange">${icon('check', 15)} تنفيذ النطاق</button>
        </div>
        <span class="label-range-hint">مثال: من <b>raf-0001</b> إلى <b>raf-0100</b> يشمل أول مئة كتاب.</span>
      </div>

      <div class="label-or">أو حسب تصنيف</div>

      <div class="field">
        <label>${icon('book', 14)} حسب الرف</label>
        <select id="lblShelf"><option value="">— اختر رفاً —</option>${opt(meta.shelves || [])}</select>
      </div>
      <div class="field">
        <label>${icon('tag', 14)} حسب المجال</label>
        <select id="lblCategory"><option value="">— اختر مجالاً —</option>${opt(meta.categories || [])}</select>
      </div>
      <div class="field">
        <label>${icon('layers', 14)} حسب السلسلة</label>
        <select id="lblSeries"><option value="">— اختر سلسلة —</option>${opt(meta.series || [])}</select>
      </div>
      <div class="form-actions" style="position:static;margin:14px 0 0;padding:14px 0 0;border-top:1px solid var(--parchment-200);border-radius:0;">
        <button class="btn btn-primary btn-sm" id="lblDoFilter">${icon('check', 15)} تنفيذ حسب التصنيف</button>
      </div>
    </div>`;

  openModal(html, {
    onMount: (overlay) => {
      overlay.querySelector('#lblClose').addEventListener('click', closeModal);

      // Shared destination: print to the OS dialog, or save straight to PDF.
      let dest = 'print';
      overlay.querySelector('#lblDest').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-dest]');
        if (!btn) return;
        dest = btn.dataset.dest;
        overlay.querySelectorAll('#lblDest button').forEach((x) => x.classList.toggle('active', x === btn));
      });
      const emit = (books, label) => {
        closeModal();
        if (dest === 'pdf') saveBarcodeLabelsPdf(books, label);
        else printBarcodeLabels(books, label);
      };

      // By reference-number range.
      overlay.querySelector('#lblDoRange').addEventListener('click', () => {
        const from = overlay.querySelector('#lblFrom').value.trim();
        const to = overlay.querySelector('#lblTo').value.trim();
        if (!from || !to) { toast('أدخل بداية ونهاية النطاق', 'error'); return; }
        const num = (r) => { const m = /(\d+)\s*$/.exec(r); return m ? parseInt(m[1], 10) : null; };
        const a = num(from), b = num(to);
        if (a === null || b === null) { toast('صيغة الرقم غير صحيحة', 'error'); return; }
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const books = RAFF_STATE.books
          .filter((bk) => { const n = num(bk.referenceNumber); return n !== null && n >= lo && n <= hi; })
          .sort((x, y) => num(x.referenceNumber) - num(y.referenceNumber));
        if (!books.length) { toast('لا توجد كتب في هذا النطاق', 'error'); return; }
        emit(books, `النطاق ${lo}–${hi}`);
      });

      overlay.querySelector('#lblDoFilter').addEventListener('click', () => {
        const shelf = overlay.querySelector('#lblShelf').value;
        const cat = overlay.querySelector('#lblCategory').value;
        const series = overlay.querySelector('#lblSeries').value;
        let books = RAFF_STATE.books;
        let label = [];
        if (shelf) { books = books.filter((b) => b.shelf === shelf); label.push('الرف: ' + shelf); }
        if (cat) { books = books.filter((b) => b.category === cat); label.push('المجال: ' + cat); }
        if (series) { books = books.filter((b) => b.series === series); label.push('السلسلة: ' + series); }
        if (!label.length) { toast('اختر معياراً واحداً على الأقل', 'error'); return; }
        if (!books.length) { toast('لا توجد كتب مطابقة', 'error'); return; }
        emit(books, label.join(' · '));
      });
    },
  });
}

function renderReports(root) {
  const { dim, value } = _reportState;
  const dimDef = DIMENSIONS[dim];

  root.innerHTML = `
    <div class="panel reports-panel">
      <div class="reports-toolbar">
        <div class="dim-chips" id="dimChips">
          ${Object.values(DIMENSIONS).map((d) => `
            <button class="dim-chip ${d.key === dim ? 'active' : ''}" data-dim="${d.key}">
              ${icon(d.icon, 14)}<span>${d.label}</span>
            </button>`).join('')}
        </div>

        <div class="reports-lookup ac-anchor">
          ${icon('search', 15)}
          <input type="text" id="reportLookup" placeholder="اكتب ${escapeHtml(dimDef.singular)} للاستدعاء..." />
          ${value ? `<button class="lookup-clear" id="lookupClear" aria-label="مسح">${icon('x', 13)}</button>` : ''}
        </div>
      </div>

      <div class="reports-body" id="reportsBody"></div>
    </div>`;

  const chips = root.querySelector('#dimChips');
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dim]');
    if (!btn) return;
    _reportState = { dim: btn.dataset.dim, value: '', sortKey: null, sortDir: 'desc' };
    renderReports(root);
  });

  const lookup = root.querySelector('#reportLookup');
  lookup.value = value;

  if (_reportAc) { _reportAc.destroy(); _reportAc = null; }
  _reportAc = createAutocomplete(lookup, {
    getPool: () => reportPoolFor(dim),
    onSelect: (label) => {
      _reportState.value = label;
      renderReports(root);
    },
    typeLabels: SUGGESTION_TYPE_LABELS,
    minChars: 1,
  });

  lookup.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && lookup.value.trim()) {
      _reportState.value = lookup.value.trim();
      renderReports(root);
    }
  });

  root.querySelector('#lookupClear')?.addEventListener('click', () => {
    _reportState.value = '';
    renderReports(root);
  });

  renderReportsBody(root.querySelector('#reportsBody'), root);
}

/** The suggestion pool for the currently selected dimension. */
function reportPoolFor(dim) {
  const typeByDim = {
    borrower: 'borrower', publisher: 'publisher',
    author: 'author', category: 'category',
  };
  const metaByDim = {
    year: 'years', shelf: 'shelves', series: 'series',
  };
  if (metaByDim[dim]) {
    return (RAFF_STATE.meta[metaByDim[dim]] || []).map((v) => ({ label: v, type: dim, norm: normalizeArabic(v) }));
  }
  if (dim === 'condition') {
    return ['جيدة', 'مقبولة', 'تالفة', 'مفقودة'].map((v) => ({ label: v, type: 'condition', norm: normalizeArabic(v) }));
  }
  const type = typeByDim[dim];
  return RAFF_STATE.suggestions.filter((s) => s.type === type);
}

function renderReportsBody(body, root) {
  const { dim, value } = _reportState;
  const index = RAFF_STATE.reportIndex;
  const dimDef = DIMENSIONS[dim];

  if (!value) {
    // Clone the column set and relabel the first column with this dimension's
    // name so the header always matches the data beneath it.
    const baseCols = dim === 'borrower' ? RANK_COLUMNS.borrower : RANK_COLUMNS.other;
    const cols = baseCols.map((c) => (c.key === 'value' ? { ...c, label: dimDef.singular } : c));
    const sortKey = _reportState.sortKey || cols[1].key;
    const sortDir = _reportState.sortDir;
    const ranked = rankDimension(index, dim, { limit: 500, sortKey, sortDir });
    if (!ranked.length) {
      body.innerHTML = `<div class="empty-state">${icon('stack')}<h3>لا توجد بيانات</h3>
        <p>لم تُسجَّل بعد أي ${escapeHtml(dimDef.label)} في المكتبة.</p></div>`;
      return;
    }

    const isBorrower = dim === 'borrower';
    const fmt = (r, c) => {
      let v = r[c.key];
      if (c.key === 'worth') v = v ? formatPrice(v) : '—';
      const cls = c.key === 'available' ? 'num num-ok'
        : (c.key === 'borrowed' && r[c.key]) ? 'num num-warn'
        : (c.key === 'activeLoans' && r[c.key]) ? 'num num-warn' : '';
      const text = c.suffix && v ? `${v}${c.suffix}` : (v === 0 && c.key !== 'value' ? '0' : (v || (c.key === 'value' ? 'غير محدد' : '—')));
      return cls ? `<span class="${cls}">${escapeHtml(String(text))}</span>` : escapeHtml(String(text));
    };

    const arrow = (key) => key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    body.innerHTML = `
      <div class="report-summary">
        <span class="report-summary-title">${icon(dimDef.icon, 15)} ترتيب ${escapeHtml(dimDef.label)}</span>
        <div class="report-summary-right">
          <span class="report-summary-meta">${ranked.length} ${isBorrower ? 'مستعيراً' : 'قيمة'} · اضغط رأس أي عمود للترتيب</span>
          ${isBorrower ? `
            <button class="btn btn-outline btn-sm" id="expBorrowers">${icon('download', 14)} تصدير المستعيرين PDF</button>
            <button class="btn btn-outline btn-sm" id="expOverdue">${icon('download', 14)} المتأخرون فقط</button>
          ` : `<button class="btn btn-outline btn-sm" id="expRank">${icon('download', 14)} تصدير الترتيب PDF</button>`}
        </div>
      </div>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th style="width:36px;">#</th>
              ${cols.map((c) => `<th class="sortable ${c.key === sortKey ? 'sorted' : ''}" data-sort="${c.key}" style="text-align:${c.align === 'start' ? 'right' : 'center'};">${escapeHtml(c.label)}${arrow(c.key)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${ranked.map((r, i) => `
              <tr class="report-clickable" data-value="${escapeHtml(r.value)}">
                <td class="rank-num">${i + 1}</td>
                ${cols.map((c, ci) => `<td class="${ci === 0 ? 'rank-value' : ''}" style="text-align:${c.align === 'start' ? 'right' : 'center'};">${fmt(r, c)}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    if (isBorrower) {
      body.querySelector('#expBorrowers').addEventListener('click', () => exportBorrowersPdf({ overdueOnly: false }));
      body.querySelector('#expOverdue').addEventListener('click', () => exportBorrowersPdf({ overdueOnly: true }));
    } else {
      body.querySelector('#expRank').addEventListener('click', () => {
        showDimensionExportChoice(dim, dimDef, () => {
          // Choice 1: ranking summary only.
          const columns = [{ label: '#', align: 'center' }, ...cols.map((c) => ({ label: c.label, align: c.align }))];
          const strip = (html) => html.replace(/<[^>]+>/g, '');
          const rows = ranked.map((r, i) => ({
            cells: [String(i + 1), ...cols.map((c) => strip(fmt(r, c)))],
          }));
          saveTablePdf({
            title: `ترتيب ${dimDef.label}`,
            subtitle: `${ranked.length} قيمة`,
            columns, rows,
          }, `ترتيب-${dimDef.label}`);
        }, () => {
          // Choice 2: grouped — each value with its books beneath it.
          exportDimensionGroupedPdf(dim, dimDef);
        });
      });
    }

    body.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (_reportState.sortKey === key) {
          _reportState.sortDir = _reportState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          _reportState.sortKey = key;
          // Names default to A→Z; numeric columns default to highest-first.
          _reportState.sortDir = key === 'value' ? 'asc' : 'desc';
        }
        renderReportsBody(body, root);
      });
    });

    body.querySelectorAll('.report-clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        _reportState.value = tr.dataset.value;
        renderReports(root);
      });
    });
    return;
  }

  const report = reportFor(index, dim, value);
  if (!report) {
    body.innerHTML = `<div class="empty-state">${icon('search')}<h3>لا توجد نتائج</h3>
      <p>لم يُعثر على "${escapeHtml(value)}" ضمن ${escapeHtml(dimDef.label)}.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="report-header">
      <div>
        <span class="report-eyebrow">${icon(dimDef.icon, 13)} ${escapeHtml(dimDef.singular)}</span>
        <h3 class="report-value">${escapeHtml(report.value) || 'غير محدد'}</h3>
      </div>
      <div class="report-header-actions">
        <button class="btn btn-outline btn-sm" id="exportReportPdf">${icon('download', 14)} تصدير PDF</button>
        <button class="btn btn-ghost btn-sm" id="backToRank">${icon('refresh')} عرض الترتيب الكامل</button>
      </div>
    </div>

    <div class="kpi-grid">
      ${report.kpis.map((k) => `
        <div class="kpi-card ${k.tone ? 'kpi-' + k.tone : ''}">
          <div class="kpi-value">${k.value}${k.suffix ? `<span class="kpi-suffix">${k.suffix}</span>` : ''}</div>
          <div class="kpi-label">${k.label}</div>
        </div>`).join('')}
    </div>

    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr>${report.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${report.rows.map((r) => `
            <tr class="report-row-${r.state} report-book" data-book="${r.bookId}">
              ${r.cells.map((c, i) => `<td class="${i === 0 ? 'cell-title' : ''} ${i === 1 ? 'cell-ref' : ''}">${escapeHtml(String(c))}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  body.querySelector('#backToRank').addEventListener('click', () => {
    _reportState.value = '';
    renderReports(root);
  });
  body.querySelector('#exportReportPdf').addEventListener('click', () => {
    const columns = report.columns.map((label, i) => ({ label, align: i === 0 ? 'start' : 'center' }));
    const rows = report.rows.map((r) => ({
      _overdue: r.state === 'overdue',
      cells: r.cells.map((c) => String(c)),
    }));
    saveTablePdf({
      title: `${dimDef.singular}: ${report.value || 'غير محدد'}`,
      subtitle: `${report.rows.length} كتاب`,
      columns, rows,
    }, `${dimDef.singular}-${report.value || 'غير محدد'}`);
  });
  body.querySelectorAll('.report-book').forEach((tr) => {
    tr.addEventListener('click', () => showBookDetails(tr.dataset.book));
  });
}

/* =========================================================
   Statistics
   ========================================================= */
function renderStats(root) {
  const { stats } = RAFF_STATE;
  const cats = Object.entries(stats.byCategory || {}).sort((a, b) => b[1] - a[1]);
  const pubs = Object.entries(stats.byPublisher || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));
  const maxPub = Math.max(1, ...pubs.map((c) => c[1]));

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon">${icon('book', 18)}</div><div><div class="stat-value">${stats.totalBooks ?? 0}</div><div class="stat-label">إجمالي العناوين</div></div></div>
      <div class="stat-card"><div class="stat-icon">${icon('copies', 18)}</div><div><div class="stat-value">${stats.totalCopies ?? 0}</div><div class="stat-label">إجمالي النسخ</div></div></div>
      <div class="stat-card stat-success"><div class="stat-icon">${icon('check', 18)}</div><div><div class="stat-value">${stats.availableCopies ?? 0}</div><div class="stat-label">نسخ متاحة</div></div></div>
      <div class="stat-card stat-danger"><div class="stat-icon">${icon('user', 18)}</div><div><div class="stat-value">${stats.borrowedCopies ?? 0}</div><div class="stat-label">نسخ معارة</div></div></div>
    </div>

    <div class="settings-grid">
      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">حسب المجال</h2></div>
        ${cats.length ? `<div class="bar-chart">${cats.map(([k, v]) => `
          <div class="bar-row">
            <div class="bar-row-label">${escapeHtml(k)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(v / maxCat) * 100}%;"></div></div>
            <div class="bar-row-value">${v}</div>
          </div>`).join('')}</div>` : `<p class="text-muted">لا توجد بيانات كافية بعد.</p>`}
      </div>

      <div class="panel">
        <div class="panel-header"><h2 class="panel-title">أكثر دور النشر</h2></div>
        ${pubs.length ? `<div class="bar-chart">${pubs.map(([k, v]) => `
          <div class="bar-row">
            <div class="bar-row-label">${escapeHtml(k)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(v / maxPub) * 100}%;"></div></div>
            <div class="bar-row-value">${v}</div>
          </div>`).join('')}</div>` : `<p class="text-muted">لا توجد بيانات كافية بعد.</p>`}
      </div>
    </div>
  `;
}

/* =========================================================
   Settings / Backup
   ========================================================= */
/** Shows the result of a data integrity check in a modal. */
function showIntegrityReport(report) {
  const section = (title, items, render, tone) => `
    <div class="integrity-section">
      <div class="integrity-head ${items.length ? 'has-' + tone : 'ok'}">
        ${icon(items.length ? 'alert' : 'check', 14)}
        <span>${title}</span>
        <span class="integrity-count">${items.length}</span>
      </div>
      ${items.length ? `<div class="integrity-items">${items.slice(0, 12).map(render).join('')}${items.length > 12 ? `<div class="integrity-more">و${items.length - 12} أخرى…</div>` : ''}</div>` : ''}
    </div>`;

  const html = `
    <div class="modal-header">
      <h3 class="modal-title">${icon('check')} فحص سلامة البيانات</h3>
      <button class="btn btn-ghost btn-icon" id="integClose" aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="integrity-summary ${report.healthy ? 'is-healthy' : 'has-issues'}">
        ${report.healthy
          ? `${icon('check', 20)} <span>البيانات سليمة — لا مشاكل في ${report.totalBooks} كتاب</span>`
          : `${icon('alert', 20)} <span>تم رصد بعض النقاط في ${report.totalBooks} كتاب</span>`}
      </div>
      ${section('إعارات متأخرة', report.overdue, (o) => `<button class="integrity-item" data-book="${o.bookId}"><span>${escapeHtml(o.borrower)} — ${escapeHtml(o.title)}</span><span class="integrity-tag danger">${o.days} يوم</span></button>`, 'danger')}
      ${section('أرقام مرجعية مكررة', report.duplicateRefs, (d) => `<div class="integrity-item"><span>${escapeHtml(d.ref)}</span><span class="integrity-tag danger">${d.count} كتب</span></div>`, 'danger')}
      ${section('بيانات ناقصة', report.missing, (m) => `<button class="integrity-item" data-book="${m.bookId}"><span>${escapeHtml(m.title)}</span><span class="integrity-tag warn">${m.gaps.join('، ')}</span></button>`, 'warn')}
      ${section('عناوين مكررة محتملة', report.possibleDuplicates, (p) => `<div class="integrity-item"><span>${escapeHtml(p.title)} — ${escapeHtml(p.author || '؟')}</span><span class="integrity-tag warn">${p.count} نسخ</span></div>`, 'warn')}
    </div>`;

  openModal(html, {
    onMount: (overlay) => {
      overlay.querySelector('#integClose').addEventListener('click', closeModal);
      overlay.querySelectorAll('.integrity-item[data-book]').forEach((el) => {
        el.addEventListener('click', () => { closeModal(); showBookDetails(el.dataset.book); });
      });
    },
  });
}

function renderSettings(root) {
  const meta = RAFF_STATE.meta;
  const st = RAFF_STATE.settings || {};
  const cols = (st.labelColumns >= 1 && st.labelColumns <= 5) ? st.labelColumns : 4;
  const lblSize = st.labelSize === 'medium' ? 'medium' : 'small';
  const loanDays = st.loanDurationDays || 30;

  const tab = _settingsTab || 'brand';
  const exportRow = (title, desc, id) => `
    <div class="setting-action">
      <div>
        <div class="setting-action-title">${title}</div>
        <div class="setting-action-desc">${desc}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="${id}">${icon('download')} تصدير</button>
    </div>`;

  const TABS = [
    { key: 'brand', label: 'الهوية والملصقات', icon: 'printer' },
    { key: 'loan', label: 'الإعارة', icon: 'calendar' },
    { key: 'export', label: 'التصدير', icon: 'download' },
    { key: 'backup', label: 'النسخ والصيانة', icon: 'copies' },
    { key: 'system', label: 'النظام', icon: 'info' },
  ];

  const panelBrand = `
    <div class="settings-two-col">
      <div>
        <div class="field">
          <label>اسم المكتبة / المؤسسة</label>
          <input type="text" id="setInstName" value="${escapeHtml(st.institutionName || '')}" placeholder="مثال: مكتبة المسجد المركزي" maxlength="120" />
        </div>
        <div class="field">
          <label>شعار المؤسسة</label>
          <div class="logo-row">
            <div class="logo-preview" id="logoPreview">
              ${st.logo ? `<img src="${st.logo}" alt="الشعار">` : `<span class="logo-empty">${icon('barcode', 22)} لا يوجد شعار</span>`}
            </div>
            <div class="logo-actions">
              <button class="btn btn-outline btn-sm" id="logoPickBtn">${icon('upload', 14)} اختيار صورة</button>
              <button class="btn btn-ghost btn-sm ${st.logo ? '' : 'hidden'}" id="logoClearBtn">${icon('trash', 14)} إزالة</button>
              <input type="file" id="logoFile" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none">
            </div>
          </div>
          <span class="hint">PNG أو JPG أو SVG — يُحفظ محلياً داخل المكتبة فقط.</span>
        </div>
      </div>
      <div class="label-opts">
        <div class="label-opt-cols">
          <label>عدد الأعمدة (A4)</label>
          <div class="chip-toggle" id="setCols">
            ${[3, 4, 5].map((n) => `<button data-cols="${n}" class="${n === cols ? 'active' : ''}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="label-opt-cols">
          <label>حجم الملصق</label>
          <div class="chip-toggle" id="setSize">
            <button data-size="small" class="${lblSize === 'small' ? 'active' : ''}">صغير</button>
            <button data-size="medium" class="${lblSize === 'medium' ? 'active' : ''}">متوسط</button>
          </div>
        </div>
        <label class="toggle-row"><input type="checkbox" id="setPrice" ${st.labelShowPrice !== false ? 'checked' : ''}> إظهار السعر على الملصق</label>
        <label class="toggle-row"><input type="checkbox" id="setShelf" ${st.labelShowShelf !== false ? 'checked' : ''}> إظهار الرف على الملصق</label>
        <label class="toggle-row"><input type="checkbox" id="setMicro" ${st.labelShowMicrotext !== false ? 'checked' : ''}> معلومات دقيقة خفية</label>
        <button class="btn btn-outline btn-sm" id="previewLabelsBtn" style="margin-top:6px;justify-content:center;">${icon('printer', 14)} معاينة الملصقات</button>
      </div>
    </div>`;

  const panelLoan = `
    <div class="loan-setting">
      <div class="field">
        <label>${icon('calendar', 14)} مدة الإعارة الافتراضية (بالأيام)</label>
        <div class="loan-days-row">
          <div class="chip-toggle" id="setLoanChips">
            ${[7, 14, 30, 60, 90].map((n) => `<button data-days="${n}" class="${n === loanDays ? 'active' : ''}">${n}</button>`).join('')}
          </div>
          <div class="loan-days-custom">
            <span>أو مخصّص:</span>
            <input type="number" id="setLoanCustom" min="1" max="3650" value="${loanDays}" />
            <span>يوم</span>
          </div>
        </div>
        <span class="hint">عند إعارة كتاب دون تحديد تاريخ إرجاع، يُحسب الاستحقاق بعد هذه المدة. تجاوز هذا التاريخ يُعدّ تأخيراً.</span>
      </div>
      <div class="loan-current-note">
        ${icon('info', 14)} <span>مدة الإعارة الحالية: <b>${loanDays} يوماً</b>. يُطبَّق التغيير على <b>الإعارات الجديدة فقط</b> افتراضياً.</span>
      </div>
      <div class="loan-apply-existing">
        <div>
          <div class="setting-action-title">تطبيق على الإعارات القائمة</div>
          <div class="setting-action-desc">إعادة حساب تاريخ استحقاق كل الإعارات المفتوحة (الجديدة والقديمة) بناءً على المدة الحالية</div>
        </div>
        <button class="btn btn-outline btn-sm" id="applyLoanExisting">${icon('refresh', 14)} تطبيق على الكل</button>
      </div>
    </div>`;

  const panelExport = `
    ${exportRow('نسخة احتياطية كاملة (JSON)', 'قابلة للاستيراد لاحقاً على أي جهاز', 'exportJsonBtn')}
    ${exportRow('جدول بيانات (CSV)', 'لفتحه في Excel', 'exportCsvBtn')}
    ${exportRow('ملف نصي (TXT)', 'قائمة مقروءة بجميع الكتب', 'exportTxtBtn')}
    ${exportRow('تقرير المكتبة (PDF)', 'جدول منسّق جاهز للطباعة', 'exportPdfBtn')}
    ${exportRow('المستعيرون (PDF)', 'الأسماء والكتب ويوم الإعارة', 'exportBorrowersBtn')}
    ${exportRow('المتأخرون فقط (PDF)', 'المتأخرون مع أيام التأخير', 'exportOverduePdfBtn')}
    ${exportRow('الإعارات المتأخرة (CSV)', 'المتأخرة فقط مع وسيلة التواصل', 'exportOverdueBtn')}`;

  const panelBackup = `
    <div class="setting-action">
      <div><div class="setting-action-title">نسخة أمان فورية</div><div class="setting-action-desc">حفظ لقطة داخلية يمكن الرجوع إليها</div></div>
      <button class="btn btn-outline btn-sm" id="backupBtn">${icon('copies')} إنشاء نسخة</button>
    </div>
    <div class="setting-action">
      <div><div class="setting-action-title">فحص سلامة البيانات</div><div class="setting-action-desc">كشف المتأخرات والنواقص والتكرار المحتمل</div></div>
      <button class="btn btn-outline btn-sm" id="integrityBtn">${icon('check')} فحص الآن</button>
    </div>
    <div class="setting-action">
      <div><div class="setting-action-title">استيراد نسخة احتياطية</div><div class="setting-action-desc">تُنشأ نسخة أمان تلقائياً قبل الاستيراد</div></div>
      <button class="btn btn-outline btn-sm" id="importJsonBtn">${icon('upload')} استيراد</button>
    </div>
    <div class="setting-action">
      <div><div class="setting-action-title">مجلد بيانات البرنامج</div><div class="setting-action-desc">يحوي قاعدة البيانات والنسخ الاحتياطية</div></div>
      <button class="btn btn-outline btn-sm" id="openFolderBtn">${icon('building')} فتح المجلد</button>
    </div>
    <div class="danger-zone">
      <div><div class="setting-action-title" style="color:var(--danger);">حذف جميع بيانات المكتبة</div><div class="setting-action-desc">تُنشأ نسخة أمان تلقائياً قبل الحذف</div></div>
      <button class="btn btn-danger btn-sm" id="resetAllBtn">${icon('trash')} حذف الكل</button>
    </div>`;

  const panelSystem = `
    <div class="system-stats">
      <div class="system-stat"><span class="system-stat-value">${RAFF_STATE.books.length}</span><span class="system-stat-label">كتاب</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.authors.length}</span><span class="system-stat-label">مؤلف</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.publishers.length}</span><span class="system-stat-label">دار نشر</span></div>
      <div class="system-stat"><span class="system-stat-value">${meta.series.length}</span><span class="system-stat-label">سلسلة</span></div>
    </div>
    <div class="db-path">
      <span class="setting-action-desc">مسار ملف البيانات</span>
      <code title="${escapeHtml(meta.filePath)}">${escapeHtml(meta.filePath)}</code>
    </div>`;

  const panels = { brand: panelBrand, loan: panelLoan, export: panelExport, backup: panelBackup, system: panelSystem };

  root.innerHTML = `
    <div class="panel settings-tabbed">
      <div class="settings-tabs" id="settingsTabs">
        ${TABS.map((t) => `<button class="settings-tab ${t.key === tab ? 'active' : ''}" data-tab="${t.key}">${icon(t.icon, 15)}<span>${t.label}</span></button>`).join('')}
      </div>
      <div class="settings-tab-body" id="settingsTabBody">${panels[tab]}</div>
    </div>`;

  root.querySelector('#settingsTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    _settingsTab = btn.dataset.tab;
    renderSettings(root);
  });

  wireSettingsHandlers(root, tab);
}

// Declared at module scope so the tab selection persists across re-renders.
let _settingsTab = 'brand';

/**
 * Attaches handlers for whichever settings tab is currently rendered. Each
 * lookup is guarded (the element only exists on its tab), so one function
 * safely serves every tab.
 */
function wireSettingsHandlers(root, tab) {
  const $ = (sel) => root.querySelector(sel);
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

  const saveSetting = async (patch) => {
    const updated = await window.raff.updateSettings(patch);
    RAFF_STATE.settings = updated;
  };

  // ---- Brand / labels tab ----
  const instInput = $('#setInstName');
  if (instInput) {
    let instTimer = null;
    instInput.addEventListener('input', () => {
      if (instTimer) clearTimeout(instTimer);
      instTimer = setTimeout(() => saveSetting({ institutionName: instInput.value }), 400);
    });
  }
  on('#logoPickBtn', 'click', () => $('#logoFile').click());
  on('#logoFile', 'change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast('حجم الشعار كبير (الحد 500 كيلوبايت)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      await saveSetting({ logo: dataUrl });
      $('#logoPreview').innerHTML = `<img src="${dataUrl}" alt="الشعار">`;
      $('#logoClearBtn').classList.remove('hidden');
      toast('تم حفظ الشعار', 'success', 1600);
    };
    reader.readAsDataURL(file);
  });
  on('#logoClearBtn', 'click', async () => {
    await saveSetting({ logo: '' });
    $('#logoPreview').innerHTML = `<span class="logo-empty">${icon('barcode', 22)} لا يوجد شعار</span>`;
    $('#logoClearBtn').classList.add('hidden');
    toast('تم إزالة الشعار', 'success', 1600);
  });
  on('#setCols', 'click', (e) => {
    const btn = e.target.closest('button[data-cols]');
    if (!btn) return;
    root.querySelectorAll('#setCols button').forEach((b) => b.classList.toggle('active', b === btn));
    saveSetting({ labelColumns: Number(btn.dataset.cols) });
  });
  on('#setSize', 'click', (e) => {
    const btn = e.target.closest('button[data-size]');
    if (!btn) return;
    root.querySelectorAll('#setSize button').forEach((b) => b.classList.toggle('active', b === btn));
    saveSetting({ labelSize: btn.dataset.size });
  });
  on('#setPrice', 'change', (e) => saveSetting({ labelShowPrice: e.target.checked }));
  on('#setShelf', 'change', (e) => saveSetting({ labelShowShelf: e.target.checked }));
  on('#setMicro', 'change', (e) => saveSetting({ labelShowMicrotext: e.target.checked }));
  on('#previewLabelsBtn', 'click', () => {
    const sample = RAFF_STATE.books.slice(0, 6);
    if (!sample.length) { toast('لا توجد كتب للمعاينة', 'error'); return; }
    printBarcodeLabels(sample, 'معاينة');
  });

  // ---- Loan tab ----
  on('#setLoanChips', 'click', (e) => {
    const btn = e.target.closest('button[data-days]');
    if (!btn) return;
    const days = Number(btn.dataset.days);
    root.querySelectorAll('#setLoanChips button').forEach((b) => b.classList.toggle('active', b === btn));
    const custom = $('#setLoanCustom'); if (custom) custom.value = days;
    saveSetting({ loanDurationDays: days });
    const note = $('.loan-current-note b'); if (note) note.textContent = `${days} يوماً`;
  });
  const loanCustom = $('#setLoanCustom');
  if (loanCustom) {
    let lt = null;
    loanCustom.addEventListener('input', () => {
      if (lt) clearTimeout(lt);
      lt = setTimeout(() => {
        const days = Math.max(1, Math.min(3650, Math.floor(Number(loanCustom.value) || 30)));
        root.querySelectorAll('#setLoanChips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === days));
        saveSetting({ loanDurationDays: days });
        const note = $('.loan-current-note b'); if (note) note.textContent = `${days} يوماً`;
      }, 500);
    });
  }
  on('#applyLoanExisting', 'click', async () => {
    const days = (RAFF_STATE.settings || {}).loanDurationDays || 30;
    const ok = await confirmModal({
      title: 'تطبيق المدة على كل الإعارات القائمة؟',
      message: `سيُعاد حساب تاريخ الاستحقاق لكل الإعارات المفتوحة على أساس ${days} يوماً من تاريخ إعارة كل كتاب. قد يغيّر ذلك حالة بعض الإعارات (متأخر/ضمن المدة). هل تريد المتابعة؟`,
      confirmLabel: 'نعم، طبّق على الكل',
    });
    if (!ok) return;
    const res = await window.raff.applyLoanDuration(days);
    await refreshState();
    renderNavCounts();
    toast(`تم تحديث ${res.updated} إعارة`, 'success');
  });

  // ---- Export tab ----
  on('#exportJsonBtn', 'click', async () => { const r = await window.raff.exportJson(); if (r.ok) toast('تم حفظ النسخة الاحتياطية بنجاح', 'success'); });
  on('#exportCsvBtn', 'click', async () => { const r = await window.raff.exportCsv(); if (r.ok) toast('تم تصدير الملف بصيغة CSV', 'success'); });
  on('#exportTxtBtn', 'click', async () => { const r = await window.raff.exportTxt(); if (r.ok) toast('تم تصدير الملف النصي بنجاح', 'success'); });
  on('#exportPdfBtn', 'click', async (e) => {
    const btn = e.currentTarget; const original = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = 'جارٍ التصدير...';
    try {
      const res = await window.raff.exportPdf();
      if (res.ok) toast('تم تصدير ملف PDF بنجاح', 'success');
      else if (res.error) toast('فشل تصدير PDF: ' + res.error, 'error');
    } finally { btn.disabled = false; btn.innerHTML = original; }
  });
  on('#exportBorrowersBtn', 'click', () => exportBorrowersPdf({ overdueOnly: false }));
  on('#exportOverduePdfBtn', 'click', () => exportBorrowersPdf({ overdueOnly: true }));
  on('#exportOverdueBtn', 'click', async () => { const r = await window.raff.exportOverdueCsv(); if (r.ok) toast(`تم تصدير ${r.count} إعارة متأخرة`, 'success'); });

  // ---- Backup tab ----
  on('#backupBtn', 'click', async () => {
    const res = await window.raff.backup();
    toast(res.ok ? 'تم إنشاء نسخة أمان' : 'تعذّر إنشاء النسخة', res.ok ? 'success' : 'error');
  });
  on('#openFolderBtn', 'click', async () => { const r = await window.raff.openDataFolder(); if (!r.ok) toast('تعذّر فتح المجلد', 'error'); });
  on('#integrityBtn', 'click', async () => {
    const res = await window.raff.integrityCheck();
    if (res.ok) showIntegrityReport(res.report); else toast('تعذّر إجراء الفحص', 'error');
  });
  on('#importJsonBtn', 'click', async () => {
    const res = await window.raff.importJson();
    if (res.ok) {
      toast(`تم استيراد ${res.added} كتاب${res.skipped ? ` (تم تجاهل ${res.skipped} مكرر)` : ''}`, 'success');
      await refreshState(); renderNavCounts(); renderRoute();
    } else if (res.error) toast('فشل الاستيراد: ' + res.error, 'error');
  });
  on('#resetAllBtn', 'click', async () => {
    const ok = await confirmModal({
      title: 'حذف جميع بيانات المكتبة؟',
      message: 'ستُنشأ نسخة أمان تلقائياً قبل الحذف يمكن الرجوع إليها من مجلد البيانات. هل تريد المتابعة؟',
      confirmLabel: 'حذف كل شيء',
    });
    if (!ok) return;
    await window.raff.resetAll();
    await refreshState(); renderNavCounts();
    toast('تم حذف جميع البيانات (مع حفظ نسخة أمان)', 'success');
    navigateTo('dashboard');
  });
  void tab;
}
