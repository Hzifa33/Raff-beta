'use strict';

/** Every currently-open dropdown's hide() function. */
const _openAutocompletes = new Set();

function closeAllAutocompletes(except) {
  for (const hide of [..._openAutocompletes]) {
    if (hide !== except) hide();
  }
}

/**
 * Predictive dropdown for text inputs.
 *
 * Suggestions come from a precomputed, normalized pool (see buildSuggestionPool),
 * so filtering is a substring scan over short strings rather than a rescan of
 * the library. Matches that *start* with the query rank above matches that
 * merely contain it, which is what makes the first suggestion usually right.
 */
function createAutocomplete(inputEl, options) {
  const {
    getPool,             // () => [{ label, type, norm }]
    onSelect,            // (label, item) => void
    maxItems = 8,
    minChars = 1,
    typeLabels = {},
  } = options;

  const box = document.createElement('div');
  box.className = 'ac-dropdown hidden';
  box.setAttribute('role', 'listbox');

  // The input sits inside a positioned wrapper so the dropdown can anchor to it.
  const wrapper = inputEl.closest('.ac-anchor') || inputEl.parentElement;
  wrapper.classList.add('ac-anchor');
  wrapper.appendChild(box);

  let items = [];
  let activeIndex = -1;
  let open = false;

  function compute(query) {
    const q = normalizeArabic(query);
    if (q.length < minChars) return [];

    const pool = getPool();
    const starts = [];
    const contains = [];

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const pos = item.norm.indexOf(q);
      if (pos === 0) {
        starts.push(item);
        if (starts.length >= maxItems) break;
      } else if (pos > 0 && contains.length < maxItems) {
        contains.push(item);
      }
    }
    return starts.concat(contains).slice(0, maxItems);
  }

  function highlight(label, query) {
    const q = normalizeArabic(query);
    if (!q) return escapeHtml(label);
    const nLabel = normalizeArabic(label);
    const at = nLabel.indexOf(q);
    if (at === -1) return escapeHtml(label);
    // Normalization can shorten the string (diacritics are removed), which
    // would make the match offset point at the wrong characters. Only slice
    // the original when the lengths still line up; otherwise skip highlighting.
    if (nLabel.length !== label.length) return escapeHtml(label);
    return escapeHtml(label.slice(0, at))
      + '<mark>' + escapeHtml(label.slice(at, at + q.length)) + '</mark>'
      + escapeHtml(label.slice(at + q.length));
  }

  function render(query) {
    if (!items.length) { hide(); return; }
    box.innerHTML = items.map((it, i) => `
      <div class="ac-item ${i === activeIndex ? 'active' : ''}" role="option" data-i="${i}">
        <span class="ac-label">${highlight(it.label, query)}</span>
        <span class="ac-type">${typeLabels[it.type] || it.type || ''}</span>
      </div>`).join('');
    show();
  }

  function show() {
    if (open) return;
    // Only one dropdown may be open at a time; focusing another field closes this.
    closeAllAutocompletes(hide);
    box.classList.remove('hidden');
    open = true;
    _openAutocompletes.add(hide);
  }

  function hide() {
    if (open) {
      box.classList.add('hidden');
      // Clear the contents too, so stale suggestions can never be read back
      // out of the DOM or flash on the next open.
      box.innerHTML = '';
      open = false;
    }
    _openAutocompletes.delete(hide);
    activeIndex = -1;
  }

  function choose(i) {
    const item = items[i];
    if (!item) return;
    inputEl.value = item.label;
    hide();
    onSelect(item.label, item);
  }

  function refresh() {
    const q = inputEl.value;
    items = compute(q);
    activeIndex = -1;
    render(q);
  }

  inputEl.setAttribute('autocomplete', 'off');
  inputEl.addEventListener('input', refresh);
  inputEl.addEventListener('focus', () => { if (inputEl.value) refresh(); });

  inputEl.addEventListener('keydown', (e) => {
    if (!open || !items.length) {
      if (e.key === 'ArrowDown' && inputEl.value) refresh();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      render(inputEl.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      render(inputEl.value);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) { e.preventDefault(); choose(activeIndex); }
      else hide();
    } else if (e.key === 'Escape') {
      // Close the dropdown first; only a second Escape should clear the field.
      if (open) { e.stopPropagation(); hide(); }
    }
  });

  box.addEventListener('mousedown', (e) => {
    // mousedown, not click: blur would close the box before click fires.
    const el = e.target.closest('.ac-item');
    if (!el) return;
    e.preventDefault();
    choose(Number(el.dataset.i));
  });

  inputEl.addEventListener('blur', () => setTimeout(hide, 80));

  return {
    hide,
    destroy() {
      _openAutocompletes.delete(hide);
      box.remove();
    },
  };
}

/**
 * Flattens the library into a deduplicated pool of things worth suggesting.
 * Rebuilt only when the data changes, never per keystroke.
 */
function buildSuggestionPool(books) {
  const seen = new Set();
  const pool = [];

  const add = (label, type) => {
    const clean = (label || '').trim();
    if (!clean) return;
    const key = type + '\u0000' + clean;
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ label: clean, type, norm: normalizeArabic(clean) });
  };

  for (const b of books) {
    add(b.title, 'title');
    add(b.author, 'author');
    add(b.publisher, 'publisher');
    add(b.category, 'category');
    add(b.referenceNumber, 'reference');
    for (const loan of b.loans || []) add(loan.borrowerName, 'borrower');
  }
  return pool;
}

const SUGGESTION_TYPE_LABELS = {
  title: 'كتاب',
  author: 'مؤلف',
  publisher: 'دار نشر',
  category: 'مجال',
  reference: 'رقم مرجعي',
  borrower: 'مستعير',
};
