'use strict';

let _activeModalClose = null;
let _modalPreviousFocus = null;

function toast(message, type = 'info', timeout = 3200, action = null) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  const iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'toast-icon';
  iconWrap.innerHTML = icon(iconName);
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = (message ?? '').toString();
  el.append(iconWrap, msg);

  const dismiss = () => {
    if (!el.isConnected) return;
    el.style.transition = 'opacity .25s ease, transform .25s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 250);
  };

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    el.appendChild(btn);
  }

  stack.appendChild(el);
  setTimeout(dismiss, timeout);
}

function _focusableIn(modal) {
  return [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hidden && el.getClientRects().length > 0);
}

function openModal(innerHtml, { onMount, onClose, modalClass = '', labelledBy = '' } = {}) {
  closeModal('replace');
  _modalPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'activeModalOverlay';
  const classAttr = ['modal', modalClass].filter(Boolean).join(' ');
  const labelAttr = labelledBy ? ` aria-labelledby="${labelledBy}"` : '';
  overlay.innerHTML = `<div class="${classAttr}" role="dialog" aria-modal="true"${labelAttr}>${innerHtml}</div>`;
  const modal = overlay.firstElementChild;

  let closed = false;
  _activeModalClose = (reason = 'programmatic') => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', keyHandler, true);
    _activeModalClose = null;
    try { onClose?.(reason); } catch (_) {}
    if (_modalPreviousFocus?.isConnected) _modalPreviousFocus.focus();
    _modalPreviousFocus = null;
  };

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) _activeModalClose?.('backdrop');
  });

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      _activeModalClose?.('escape');
      return;
    }
    if (e.key !== 'Tab') return;
    const items = _focusableIn(modal);
    if (!items.length) { e.preventDefault(); modal.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  document.getElementById('modalRoot').appendChild(overlay);
  document.addEventListener('keydown', keyHandler, true);
  if (onMount) onMount(overlay);
  requestAnimationFrame(() => {
    const autofocus = modal.querySelector('[autofocus]');
    const first = autofocus || _focusableIn(modal)[0] || modal;
    if (first === modal) modal.setAttribute('tabindex', '-1');
    first.focus();
  });
  return overlay;
}

function closeModal(reason = 'programmatic') {
  if (_activeModalClose) _activeModalClose(reason);
  else document.getElementById('activeModalOverlay')?.remove();
}

function confirmModal({ title, message, confirmLabel = 'تأكيد', danger = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const titleId = `confirmTitle-${Date.now()}`;
    const html = `
      <div class="modal-body">
        <div class="modal-danger-icon">${icon(danger ? 'alert' : 'info')}</div>
        <h3 class="modal-title" id="${titleId}" style="margin-bottom:8px;">${title}</h3>
        <p class="text-muted" style="font-size:13.5px; line-height:1.7;">${message}</p>
        <div class="form-actions">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmYes">${confirmLabel}</button>
          <button class="btn btn-ghost" id="confirmNo">إلغاء</button>
        </div>
      </div>`;
    openModal(html, {
      labelledBy: titleId,
      onClose: () => finish(false),
      onMount: (overlay) => {
        overlay.querySelector('#confirmYes').addEventListener('click', () => {
          finish(true);
          closeModal('confirmed');
        });
        overlay.querySelector('#confirmNo').addEventListener('click', () => {
          finish(false);
          closeModal('cancelled');
        });
      },
    });
  });
}
