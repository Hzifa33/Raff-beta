'use strict';

function raffFileEscape(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function raffFileDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function raffFormatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} م.ب`;
}

function raffEnsureFileExtension(name, extensions) {
  const value = (name || '').trim();
  if (!value || !extensions?.length) return value;
  const lower = value.toLowerCase();
  if (extensions.some((ext) => lower.endsWith(`.${String(ext).replace(/^\./, '').toLowerCase()}`))) return value;
  return `${value}.${String(extensions[0]).replace(/^\./, '')}`;
}

/**
 * Fully in-app file browser used for every import/export operation. It avoids
 * Windows-native dialogs so screen recordings capture the complete workflow.
 */
function showRaffFileDialog({
  mode = 'save',
  title = mode === 'save' ? 'حفظ الملف' : mode === 'browse' ? 'استعراض الملفات' : 'اختيار ملف',
  description = '',
  defaultName = '',
  extensions = [],
  startKind = '',
  confirmLabel = mode === 'save' ? 'حفظ هنا' : mode === 'browse' ? 'إغلاق' : 'اختيار الملف',
} = {}) {
  return new Promise(async (resolve) => {
    let settled = false;
    let currentPath = '';
    let selectedPath = '';
    let selectedName = '';
    let listing = [];
    let locations = [];
    let busy = false;
    let overwriteArmedPath = '';

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let locationResult;
    try { locationResult = await window.raff.getFileLocations(); }
    catch (_) { finish(null); toast('تعذّر فتح متصفح الملفات الداخلي', 'error'); return; }
    if (!locationResult?.ok || !locationResult.locations?.length) {
      finish(null);
      toast(locationResult?.error || 'تعذّر الوصول إلى مجلدات الجهاز', 'error');
      return;
    }
    locations = locationResult.locations;
    const stored = localStorage.getItem(`raff-file-dialog-${mode}`);
    currentPath = locations.find((x) => x.kind === startKind)?.path || stored || locations.find((x) => x.kind === 'documents')?.path || locations[0].path;

    const titleId = `raffFileDialogTitle-${Date.now()}`;
    openModal(`
      <div class="raff-file-dialog">
        <div class="raff-dialog-header">
          <div class="raff-dialog-symbol">${icon(mode === 'save' ? 'download' : mode === 'browse' ? 'folder' : 'upload', 21)}</div>
          <div class="raff-dialog-heading">
            <h3 class="modal-title" id="${titleId}">${raffFileEscape(title)}</h3>
            <p class="text-muted">${raffFileEscape(description || (mode === 'save' ? 'اختر المجلد واسم الملف داخل رَفّ.' : mode === 'browse' ? 'استعرض المجلدات والملفات من داخل رَفّ.' : 'اختر الملف المطلوب من جهازك.'))}</p>
          </div>
          <button class="raff-dialog-close" id="raffFileClose" type="button" aria-label="إغلاق">${icon('x', 16)}</button>
        </div>

        <div class="raff-file-layout">
          <aside class="raff-file-places" aria-label="المواقع السريعة">
            <span class="raff-file-section-title">المواقع</span>
            <div id="raffFileLocations"></div>
          </aside>

          <section class="raff-file-main">
            <div class="raff-file-toolbar">
              <button class="raff-file-tool" id="raffFileUp" type="button" title="المجلد الأعلى">${icon('arrowUp', 15)}</button>
              <div class="raff-path-shell">${icon('folder', 14)}<input id="raffFilePath" type="text" dir="ltr" spellcheck="false" aria-label="مسار المجلد" /></div>
              <button class="raff-file-tool wide" id="raffNewFolderToggle" type="button">${icon('plus', 14)} مجلد جديد</button>
            </div>

            <div class="raff-new-folder hidden" id="raffNewFolderBox">
              <input id="raffNewFolderName" type="text" maxlength="120" placeholder="اسم المجلد الجديد" />
              <button class="btn btn-primary btn-sm" id="raffCreateFolder" type="button">إنشاء</button>
              <button class="btn btn-ghost btn-sm" id="raffCancelFolder" type="button">إلغاء</button>
            </div>

            <div class="raff-file-status hidden" id="raffFileStatus" role="status"></div>
            <div class="raff-file-list" id="raffFileList" role="listbox" aria-label="محتويات المجلد"></div>
          </section>
        </div>

        <div class="raff-file-footer">
          ${mode === 'save' ? `<label class="raff-file-name"><span>اسم الملف</span><input id="raffFileName" type="text" dir="auto" value="${raffFileEscape(defaultName)}" /></label>` : mode === 'browse' ? `<div class="raff-selected-file" id="raffSelectedFile"><small>المجلد الحالي</small><b dir="ltr"></b></div>` : `<div class="raff-selected-file" id="raffSelectedFile"><small>الملف المحدد</small><b>لم يُحدد ملف بعد</b></div>`}
          <div class="raff-file-type"><small>النوع</small><b>${extensions.length ? extensions.map((x) => `.${String(x).replace(/^\./, '')}`).join('، ') : 'جميع الملفات'}</b></div>
          <div class="raff-file-footer-actions">
            <button class="btn btn-primary" id="raffFileConfirm" type="button" ${mode === 'open' ? 'disabled' : ''}>${icon(mode === 'save' ? 'download' : mode === 'browse' ? 'check' : 'check', 14)} ${raffFileEscape(confirmLabel)}</button>
            ${mode === 'browse' ? '' : '<button class="btn btn-ghost" id="raffFileCancel" type="button">إلغاء</button>'}
          </div>
        </div>

        <div class="raff-overwrite-bar hidden" id="raffOverwriteBar">
          <span>${icon('alert', 15)} يوجد ملف بهذا الاسم. هل تريد استبداله؟</span>
          <div><button class="btn btn-danger btn-sm" id="raffOverwriteConfirm" type="button">استبدال الملف</button><button class="btn btn-ghost btn-sm" id="raffOverwriteCancel" type="button">تراجع</button></div>
        </div>
      </div>`, {
      labelledBy: titleId,
      modalClass: 'modal-file-browser',
      onClose: () => finish(null),
      onMount: (overlay) => {
        const listEl = overlay.querySelector('#raffFileList');
        const pathInput = overlay.querySelector('#raffFilePath');
        const statusEl = overlay.querySelector('#raffFileStatus');
        const confirmBtn = overlay.querySelector('#raffFileConfirm');
        const fileNameInput = overlay.querySelector('#raffFileName');
        const selectedFileEl = overlay.querySelector('#raffSelectedFile');
        const newFolderBox = overlay.querySelector('#raffNewFolderBox');
        const newFolderInput = overlay.querySelector('#raffNewFolderName');
        const overwriteBar = overlay.querySelector('#raffOverwriteBar');

        const showStatus = (text, kind = 'error') => {
          statusEl.textContent = text;
          statusEl.classList.remove('hidden', 'is-error', 'is-info');
          statusEl.classList.add(kind === 'error' ? 'is-error' : 'is-info');
        };
        const clearStatus = () => statusEl.classList.add('hidden');

        const renderLocations = () => {
          overlay.querySelector('#raffFileLocations').innerHTML = locations.map((location, index) => `
            <button class="raff-file-place ${location.path === currentPath ? 'active' : ''}" type="button" data-location-index="${index}">
              <span>${icon(location.kind === 'drive' ? 'hardDrive' : location.kind === 'desktop' ? 'monitor' : 'folder', 15)}</span>
              <b>${raffFileEscape(location.label)}</b>
            </button>`).join('');
          overlay.querySelectorAll('[data-location-index]').forEach((button) => button.addEventListener('click', () => loadDirectory(locations[Number(button.dataset.locationIndex)].path)));
        };

        const renderList = () => {
          if (!listing.length) {
            listEl.innerHTML = `<div class="raff-file-empty">${icon('folder', 28)}<b>هذا المجلد فارغ</b><span>${mode === 'open' ? 'لا توجد ملفات مطابقة هنا.' : mode === 'browse' ? 'لا توجد ملفات في هذا المجلد.' : 'يمكنك حفظ الملف في هذا المجلد.'}</span></div>`;
            return;
          }
          listEl.innerHTML = listing.map((item, index) => `
            <button class="raff-file-row ${item.path === selectedPath ? 'selected' : ''}" type="button" data-file-index="${index}" role="option" aria-selected="${item.path === selectedPath}">
              <span class="raff-file-row-icon">${icon(item.isDirectory ? 'folder' : 'file', 17)}</span>
              <span class="raff-file-row-copy"><b>${raffFileEscape(item.name)}</b><small>${item.isDirectory ? 'مجلد' : raffFormatBytes(item.size)}</small></span>
              <span class="raff-file-row-date">${item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString('ar-EG') : ''}</span>
            </button>`).join('');

          overlay.querySelectorAll('[data-file-index]').forEach((row) => {
            const choose = () => {
              const item = listing[Number(row.dataset.fileIndex)];
              if (item.isDirectory) { loadDirectory(item.path); return; }
              selectedPath = item.path;
              selectedName = item.name;
              if (fileNameInput) fileNameInput.value = item.name;
              if (selectedFileEl && mode !== 'browse') selectedFileEl.querySelector('b').textContent = item.name;
              if (mode === 'open') confirmBtn.disabled = false;
              overwriteArmedPath = '';
              overwriteBar.classList.add('hidden');
              renderList();
            };
            row.addEventListener('click', choose);
            row.addEventListener('dblclick', async () => {
              choose();
              const item = listing[Number(row.dataset.fileIndex)];
              if (!item.isDirectory && mode === 'open') await commitSelection();
            });
          });
        };

        const loadDirectory = async (targetPath) => {
          if (busy) return;
          busy = true;
          listEl.classList.add('is-loading');
          clearStatus();
          overwriteBar.classList.add('hidden');
          try {
            const result = await window.raff.listDirectory(targetPath, extensions);
            if (!result?.ok) throw new Error(result?.error || 'تعذّر فتح المجلد');
            currentPath = result.currentPath;
            listing = result.items || [];
            selectedPath = '';
            selectedName = '';
            pathInput.value = currentPath;
            pathInput.dataset.parentPath = result.parentPath || '';
            localStorage.setItem(`raff-file-dialog-${mode}`, currentPath);
            if (mode === 'open') confirmBtn.disabled = true;
            if (selectedFileEl) selectedFileEl.querySelector('b').textContent = mode === 'browse' ? currentPath : 'لم يُحدد ملف بعد';
            renderLocations();
            renderList();
          } catch (error) {
            showStatus(error.message || 'تعذّر فتح المجلد');
          } finally {
            busy = false;
            listEl.classList.remove('is-loading');
          }
        };

        const buildSavePath = async () => {
          const rawName = raffEnsureFileExtension(fileNameInput?.value, extensions);
          if (!rawName) throw new Error('اكتب اسم الملف');
          if (/[\\/:*?"<>|]/.test(rawName)) throw new Error('اسم الملف يحتوي على رمز غير مسموح');
          const joined = await window.raff.joinPath(currentPath, rawName);
          if (!joined?.ok) throw new Error(joined?.error || 'تعذّر تكوين مسار الملف');
          return joined.path;
        };

        const finishWithPath = (targetPath) => {
          finish(targetPath);
          closeModal('file-selected');
        };

        const commitSelection = async () => {
          clearStatus();
          try {
            if (mode === 'browse') {
              finishWithPath(currentPath);
              return;
            }
            if (mode === 'open') {
              if (!selectedPath) throw new Error('اختر ملفًا أولًا');
              finishWithPath(selectedPath);
              return;
            }
            const targetPath = await buildSavePath();
            const info = await window.raff.pathInfo(targetPath);
            if (!info?.ok) throw new Error(info?.error || 'تعذّر فحص مسار الملف');
            if (info.exists && overwriteArmedPath !== targetPath) {
              overwriteArmedPath = targetPath;
              overwriteBar.classList.remove('hidden');
              return;
            }
            finishWithPath(targetPath);
          } catch (error) { showStatus(error.message || 'تعذّر اختيار الملف'); }
        };

        overlay.querySelector('#raffFileClose').addEventListener('click', closeModal);
        overlay.querySelector('#raffFileCancel')?.addEventListener('click', closeModal);
        overlay.querySelector('#raffFileConfirm').addEventListener('click', commitSelection);
        overlay.querySelector('#raffFileUp').addEventListener('click', () => {
          const parent = pathInput.dataset.parentPath;
          if (parent) loadDirectory(parent);
        });
        pathInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); loadDirectory(pathInput.value); }
        });
        fileNameInput?.addEventListener('keydown', (event) => {
          overwriteArmedPath = '';
          overwriteBar.classList.add('hidden');
          if (event.key === 'Enter') { event.preventDefault(); commitSelection(); }
        });
        fileNameInput?.addEventListener('input', () => {
          overwriteArmedPath = '';
          overwriteBar.classList.add('hidden');
        });

        overlay.querySelector('#raffNewFolderToggle').addEventListener('click', () => {
          newFolderBox.classList.toggle('hidden');
          if (!newFolderBox.classList.contains('hidden')) newFolderInput.focus();
        });
        overlay.querySelector('#raffCancelFolder').addEventListener('click', () => {
          newFolderBox.classList.add('hidden');
          newFolderInput.value = '';
        });
        const createFolder = async () => {
          clearStatus();
          const result = await window.raff.createDirectory(currentPath, newFolderInput.value);
          if (!result?.ok) { showStatus(result?.error || 'تعذّر إنشاء المجلد'); return; }
          newFolderBox.classList.add('hidden');
          newFolderInput.value = '';
          await loadDirectory(result.path);
        };
        overlay.querySelector('#raffCreateFolder').addEventListener('click', createFolder);
        newFolderInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); createFolder(); } });
        overlay.querySelector('#raffOverwriteConfirm').addEventListener('click', () => {
          if (overwriteArmedPath) finishWithPath(overwriteArmedPath);
        });
        overlay.querySelector('#raffOverwriteCancel').addEventListener('click', () => {
          overwriteArmedPath = '';
          overwriteBar.classList.add('hidden');
          fileNameInput?.focus();
        });

        loadDirectory(currentPath);
      },
    });
  });
}

function raffSaveFile(options) {
  return showRaffFileDialog({ ...options, mode: 'save' });
}

function raffOpenFile(options) {
  return showRaffFileDialog({ ...options, mode: 'open' });
}

function raffBrowseFolder(options) {
  return showRaffFileDialog({ ...options, mode: 'browse' });
}

function raffBrowseDataFolder() {
  return raffBrowseFolder({
    title: 'ملفات رَفّ المحلية',
    description: 'استعرض قاعدة البيانات والنسخ الاحتياطية من داخل البرنامج دون فتح نافذة Windows.',
    startKind: 'raff',
    confirmLabel: 'إغلاق',
  });
}

/** Custom printer chooser; printing is silent after the user chooses here. */
async function showRaffPrintDialog({ html, title = 'طباعة', count = 0, fitLabels = false, landscape = false } = {}) {
  let printersResult;
  try { printersResult = await window.raff.getPrinters(); }
  catch (_) { toast('تعذّر قراءة الطابعات المثبتة', 'error'); return { ok: false }; }
  if (!printersResult?.ok) { toast(printersResult?.error || 'تعذّر قراءة الطابعات المثبتة', 'error'); return printersResult; }
  const printers = printersResult.printers || [];
  const titleId = `raffPrintTitle-${Date.now()}`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    openModal(`
      <div class="raff-print-dialog">
        <div class="raff-dialog-header">
          <div class="raff-dialog-symbol">${icon('printer', 21)}</div>
          <div class="raff-dialog-heading"><h3 class="modal-title" id="${titleId}">${raffFileEscape(title)}</h3><p class="text-muted">اختر الطابعة وعدد النسخ؛ لن يظهر مربع طباعة Windows.</p></div>
          <button class="raff-dialog-close" id="raffPrintClose" type="button" aria-label="إغلاق">${icon('x', 16)}</button>
        </div>
        <div class="raff-print-content">
          <div class="raff-print-preview">
            <div class="raff-print-paper"><span></span><span></span><span></span><span></span><span></span><span></span></div>
            <b>${Number(count) || 1} ${Number(count) === 1 ? 'عنصر' : 'عنصرًا'}</b>
            <small>مقاس A4 · ${landscape ? 'أفقي' : 'رأسي'}</small>
          </div>
          <div class="raff-print-options">
            <label class="field"><span>الطابعة</span><select id="raffPrinterSelect" ${printers.length ? '' : 'disabled'}>
              ${printers.length ? printers.map((p) => `<option value="${raffFileEscape(p.name)}" ${p.isDefault ? 'selected' : ''}>${raffFileEscape(p.displayName)}${p.isDefault ? ' — الافتراضية' : ''}</option>`).join('') : '<option>لا توجد طابعة مثبتة</option>'}
            </select></label>
            <label class="field"><span>عدد النسخ</span><input id="raffPrintCopies" type="number" min="1" max="99" value="1" /></label>
            <div class="raff-printer-note">${icon('info', 14)} تتم الطباعة مباشرة إلى الطابعة المحددة بعد الضغط على «طباعة الآن».</div>
            <div class="raff-file-status hidden" id="raffPrintStatus" role="status"></div>
          </div>
        </div>
        <div class="form-actions raff-print-actions"><button class="btn btn-primary" id="raffPrintNow" ${printers.length ? '' : 'disabled'}>${icon('printer', 14)} طباعة الآن</button><button class="btn btn-ghost" id="raffPrintCancel">إلغاء</button></div>
      </div>`, {
      labelledBy: titleId,
      modalClass: 'modal-print-center',
      onClose: () => finish({ ok: false, canceled: true }),
      onMount: (overlay) => {
        const status = overlay.querySelector('#raffPrintStatus');
        const printBtn = overlay.querySelector('#raffPrintNow');
        const close = () => closeModal('print-cancelled');
        overlay.querySelector('#raffPrintClose').addEventListener('click', close);
        overlay.querySelector('#raffPrintCancel').addEventListener('click', close);
        printBtn.addEventListener('click', async () => {
          printBtn.disabled = true;
          printBtn.classList.add('is-loading');
          status.classList.remove('hidden', 'is-error');
          status.classList.add('is-info');
          status.textContent = 'جارٍ إرسال الصفحات إلى الطابعة…';
          const result = await window.raff.printHtml(html, {
            deviceName: overlay.querySelector('#raffPrinterSelect').value,
            copies: Number(overlay.querySelector('#raffPrintCopies').value) || 1,
            landscape,
            fitLabels,
          });
          printBtn.classList.remove('is-loading');
          if (!result?.ok) {
            printBtn.disabled = false;
            status.classList.remove('is-info');
            status.classList.add('is-error');
            status.textContent = result?.error || 'تعذّرت الطباعة';
            return;
          }
          finish(result);
          closeModal('printed');
          toast('تم إرسال المهمة إلى الطابعة', 'success');
        });
      },
    });
  });
}
