'use strict';

/**
 * A minimal fixed-height virtual list.
 *
 * Rendering every book as a DOM node is what makes a 1000-book library crawl:
 * the browser has to lay out, style and paint a thousand rows even though ~10
 * are visible. This keeps the node count proportional to the viewport instead
 * of to the library, so scrolling and filtering stay flat as the library grows.
 *
 * Rows must all share the same height (ROW_STEP), which is enforced in CSS.
 */
function createVirtualList(scrollEl, options) {
  const {
    rowStep,          // full vertical advance per row, including gap
    rowHeight,        // painted height of a row
    renderRow,        // (item, index) -> html string
    overscan = 6,     // extra rows rendered above/below the viewport
    emptyHtml = '',
  } = options;

  const sizer = document.createElement('div');
  sizer.className = 'vlist-sizer';
  const rowsEl = document.createElement('div');
  rowsEl.className = 'vlist-rows';
  sizer.appendChild(rowsEl);
  scrollEl.appendChild(sizer);

  let items = [];
  let lastStart = -1;
  let lastEnd = -1;
  let ticking = false;

  function paint(force) {
    if (!items.length) {
      if (force || lastStart !== -1) {
        rowsEl.innerHTML = emptyHtml;
        rowsEl.style.transform = '';
        sizer.style.height = '0px';
        lastStart = -1;
        lastEnd = -1;
      }
      return;
    }

    const viewportH = scrollEl.clientHeight;
    const scrollTop = scrollEl.scrollTop;

    let start = Math.floor(scrollTop / rowStep) - overscan;
    if (start < 0) start = 0;
    let end = Math.ceil((scrollTop + viewportH) / rowStep) + overscan;
    if (end > items.length) end = items.length;

    if (!force && start === lastStart && end === lastEnd) return;
    lastStart = start;
    lastEnd = end;

    let html = '';
    for (let i = start; i < end; i++) html += renderRow(items[i], i);

    rowsEl.innerHTML = html;
    // Offset the rendered slice instead of positioning each row individually.
    rowsEl.style.transform = `translateY(${start * rowStep}px)`;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      paint(false);
    });
  }

  scrollEl.addEventListener('scroll', onScroll, { passive: true });

  const resizeObserver = new ResizeObserver(() => paint(true));
  resizeObserver.observe(scrollEl);

  return {
    setItems(next, { resetScroll = false } = {}) {
      items = next;
      sizer.style.height = items.length
        ? (items.length * rowStep - (rowStep - rowHeight)) + 'px'
        : '0px';
      if (resetScroll) scrollEl.scrollTop = 0;
      paint(true);
    },
    getItems() { return items; },
    refresh() { paint(true); },
    destroy() {
      scrollEl.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      sizer.remove();
    },
  };
}
