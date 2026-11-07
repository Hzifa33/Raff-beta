import { Book, Loan } from '../types';

export function cleanReferenceText(value: string): string {
  if (!value) return '';
  let s = '';
  for (const ch of String(value)) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x2069) ||
      code === 0xfeff
    ) {
      continue;
    }
    if (
      (code >= 0x2010 && code <= 0x2015) ||
      code === 0x2212 ||
      code === 0xfe58 ||
      code === 0xfe63 ||
      code === 0xff0d
    ) {
      s += '-';
      continue;
    }
    if (code >= 0x0660 && code <= 0x0669) {
      s += String(code - 0x0660);
      continue;
    }
    if (code >= 0x06f0 && code <= 0x06f9) {
      s += String(code - 0x06f0);
      continue;
    }
    s += ch;
  }
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split('-')
    .map((p) => p.trim())
    .join('-');
}

export function normalizeReferenceForStorage(value: string): string {
  const cleaned = cleanReferenceText(value);
  const m = /^raf-(\d+)$/i.exec(cleaned);
  if (m) {
    const stripped = m[1].replace(/^0+/, '') || '0';
    return `raf-${stripped.padStart(4, '0')}`;
  }
  return cleaned;
}

export function referenceIdentity(value: string): string {
  const cleaned = cleanReferenceText(value);
  if (!cleaned) return '';
  const m = /^raf-(\d+)$/i.exec(cleaned);
  if (m) {
    const stripped = m[1].replace(/^0+/, '') || '0';
    return `raff:${stripped}`;
  }
  return `custom:${cleaned.toLowerCase()}`;
}

export function normalizeArabic(value: string): string {
  if (!value) return '';
  return String(value)
    .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLoanVolumes(loan: Loan): number[] {
  if (loan.type === 'full') return [];
  const raw = Array.isArray(loan.volumes) && loan.volumes.length > 0
    ? loan.volumes
    : loan.volume
    ? [loan.volume]
    : [];
  return Array.from(new Set(raw.filter((v) => Number.isFinite(v) && v >= 1))).sort((a, b) => a - b);
}

export function getLoanReturnedVolumes(loan: Loan): number[] {
  const all = getLoanVolumes(loan);
  if (all.length === 0) return [];
  if (loan.returnedAt && (!loan.volumeReturns || Object.keys(loan.volumeReturns).length === 0)) {
    return all;
  }
  const map = loan.volumeReturns || {};
  return all.filter((v) => Boolean(map[String(v)]));
}

export function getLoanOutstandingVolumes(loan: Loan): number[] {
  if (loan.returnedAt) return [];
  const returned = new Set(getLoanReturnedVolumes(loan));
  return getLoanVolumes(loan).filter((v) => !returned.has(v));
}

export function isLoanActive(loan: Loan): boolean {
  if (loan.returnedAt) return false;
  if (loan.type === 'partial') {
    return getLoanOutstandingVolumes(loan).length > 0;
  }
  return true;
}

export function isLoanOverdue(loan: Loan, nowMs = Date.now()): boolean {
  if (!isLoanActive(loan) || !loan.dueAt) return false;
  const due = Date.parse(loan.dueAt);
  return Number.isFinite(due) && due < nowMs;
}

export function loanScopeLabel(loan: Loan, outstandingOnly = false): string {
  if (loan.type !== 'partial') return '';
  const vols = outstandingOnly ? getLoanOutstandingVolumes(loan) : getLoanVolumes(loan);
  if (vols.length === 0) return '';
  if (vols.length === 1) return `الجزء ${vols[0]}`;
  return `الأجزاء ${vols.join('، ')}`;
}

export interface BookAvailability {
  state: 'available' | 'partial' | 'borrowed';
  copiesTotal: number;
  availableCopies: number;
  borrowedCopies: number;
  availableVolumes: number[];
  borrowedVolumes: number[];
  hasPartialLoan: boolean;
  activeLoans: Loan[];
  hasOverdue: boolean;
}

export function computeBookAvailability(book: Book, nowMs = Date.now()): BookAvailability {
  const copiesTotal = Math.max(1, Number(book.copiesTotal) || 1);
  const totalVols = Math.max(1, Number(book.volumes) || 1);
  const loans = Array.isArray(book.loans) ? book.loans : [];
  const activeLoans = loans.filter(isLoanActive);

  let fullCopyLoans = 0;
  const borrowedVolumeSet = new Set<number>();

  for (const l of activeLoans) {
    if (l.type === 'partial' && totalVols > 1) {
      for (const v of getLoanOutstandingVolumes(l)) {
        if (v >= 1 && v <= totalVols) borrowedVolumeSet.add(v);
      }
    } else {
      fullCopyLoans += 1;
    }
  }

  const borrowedVolumes = Array.from(borrowedVolumeSet).sort((a, b) => a - b);
  const hasPartialLoan = borrowedVolumes.length > 0;
  const partialBusyCopies = hasPartialLoan ? 1 : 0;
  const borrowedCopies = Math.min(copiesTotal, fullCopyLoans + partialBusyCopies);
  const availableFullCopies = Math.max(0, copiesTotal - borrowedCopies);

  const availableVolumes: number[] = [];
  for (let v = 1; v <= totalVols; v++) {
    if (availableFullCopies > 0 || !borrowedVolumeSet.has(v)) {
      availableVolumes.push(v);
    }
  }

  let state: 'available' | 'partial' | 'borrowed' = 'available';
  if (fullCopyLoans >= copiesTotal || (hasPartialLoan && availableVolumes.length === 0 && availableFullCopies === 0)) {
    state = 'borrowed';
  } else if (activeLoans.length > 0) {
    state = 'partial';
  }

  const availableCopies =
    state === 'borrowed'
      ? 0
      : state === 'available'
      ? copiesTotal
      : Math.max(availableFullCopies, availableVolumes.length > 0 ? 1 : 0);

  const hasOverdue = activeLoans.some((l) => isLoanOverdue(l, nowMs));

  return {
    state,
    copiesTotal,
    availableCopies,
    borrowedCopies,
    availableVolumes,
    borrowedVolumes,
    hasPartialLoan,
    activeLoans,
    hasOverdue,
  };
}

// Pure Code 128B SVG renderer for instant client-side rendering
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213',
  '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231',
  '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123',
  '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121',
  '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121',
  '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214',
  '211232', '2331112',
];

export function renderBarcodeSVG(
  rawText: string,
  options: {
    moduleWidth?: number;
    height?: number;
    margin?: number;
    showText?: boolean;
    textSize?: number;
    color?: string;
    background?: string;
  } = {}
): string {
  const text = cleanReferenceText(rawText) || 'raf-0000';
  const moduleWidth = options.moduleWidth ?? 1.8;
  const height = options.height ?? 50;
  const margin = options.margin ?? 8;
  const showText = options.showText ?? true;
  const textSize = options.textSize ?? 12;
  const color = options.color ?? '#2b211b';
  const background = options.background ?? '#ffffff';

  const values: number[] = [104];
  let sum = 104;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    const safe = code >= 0 && code <= 94 ? code : 13; // fallback '-'
    values.push(safe);
    sum += safe * (i + 1);
  }
  values.push(sum % 103);
  values.push(106);

  const modules: number[] = [];
  for (const v of values) {
    const pat = CODE128_PATTERNS[v];
    for (let i = 0; i < pat.length; i++) {
      modules.push(Number(pat[i]));
    }
  }

  const totalModules = modules.reduce((a, b) => a + b, 0);
  const barsWidth = totalModules * moduleWidth;
  const textGap = showText ? textSize + 6 : 0;
  const width = barsWidth + margin * 2;
  const totalHeight = height + margin * 2 + textGap;

  let rects = '';
  let x = margin;
  let isBar = true;
  for (const m of modules) {
    const w = m * moduleWidth;
    if (isBar) {
      rects += `<rect x="${x.toFixed(2)}" y="${margin}" width="${w.toFixed(2)}" height="${height}" fill="${color}"/>`;
    }
    x += w;
    isBar = !isBar;
  }

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const textEl = showText
    ? `<text x="${(width / 2).toFixed(2)}" y="${(margin + height + textGap - 2).toFixed(2)}" text-anchor="middle" font-family="monospace" font-size="${textSize}" font-weight="600" letter-spacing="1" fill="${color}">${escaped}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(totalHeight)}" viewBox="0 0 ${Math.round(width)} ${Math.round(totalHeight)}"><rect width="100%" height="100%" fill="${background}" rx="6"/>${rects}${textEl}</svg>`;
}

/**
 * Self-contained label-fitting script that runs inside the print document so
 * every title, subtitle, and institution header scales down to fit its box
 * without clipping or ellipsis (`LABEL_FIT_SCRIPT`).
 */
export const LABEL_FIT_SCRIPT = `<script>
(function () {
  function fitAll() {
    var nodes = document.querySelectorAll('[data-fit]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var maxPt = parseFloat(el.getAttribute('data-max-pt')) || 9;
      var minPt = parseFloat(el.getAttribute('data-min-pt')) || 5.2;
      var maxLines = parseInt(el.getAttribute('data-max-lines') || '3', 10);
      var lineHeight = parseFloat(el.getAttribute('data-lh')) || 1.24;
      el.style.lineHeight = String(lineHeight);
      var low = minPt, high = maxPt, best = minPt;
      for (var step = 0; step < 9; step++) {
        var mid = (low + high) / 2;
        el.style.fontSize = mid.toFixed(2) + 'pt';
        var linePx = mid * 1.3333 * lineHeight;
        var allowedHeight = linePx * maxLines + 2;
        var fitsHeight = el.scrollHeight <= allowedHeight;
        var fitsWidth = el.scrollWidth <= el.clientWidth + 2;
        if (fitsHeight && fitsWidth) { best = mid; low = mid; }
        else { high = mid; }
      }
      el.style.fontSize = best.toFixed(2) + 'pt';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fitAll);
  } else {
    fitAll();
  }
  window.addEventListener('load', fitAll);
  window.addEventListener('beforeprint', fitAll);
})();
</script>`;
