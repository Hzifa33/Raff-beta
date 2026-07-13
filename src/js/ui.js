'use strict';

function toast(message, type = 'info', timeout = 3200, action = null) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  const iconName = type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info';
  el.innerHTML = `${icon(iconName)}<span class="toast-msg">${message}</span>`;

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

function openModal(innerHtml, { onMount } = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'activeModalOverlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById('modalRoot').appendChild(overlay);
  document.addEventListener('keydown', _modalEscHandler);
  if (onMount) onMount(overlay);
  return overlay;
}

function _modalEscHandler(e) {
  if (e.key === 'Escape') closeModal();
}

function closeModal() {
  const existing = document.getElementById('activeModalOverlay');
  if (existing) existing.remove();
  document.removeEventListener('keydown', _modalEscHandler);
}

function confirmModal({ title, message, confirmLabel = 'تأكيد', danger = true }) {
  return new Promise((resolve) => {
    const html = `
      <div class="modal-body">
        <div class="modal-danger-icon">${icon('alert')}</div>
        <h3 class="modal-title" style="margin-bottom:8px;">${title}</h3>
        <p class="text-muted" style="font-size:13.5px; line-height:1.7;">${message}</p>
        <div class="form-actions">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmYes">${confirmLabel}</button>
          <button class="btn btn-ghost" id="confirmNo">إلغاء</button>
        </div>
      </div>`;
    openModal(html, {
      onMount: (overlay) => {
        overlay.querySelector('#confirmYes').addEventListener('click', () => {
          closeModal();
          resolve(true);
        });
        overlay.querySelector('#confirmNo').addEventListener('click', () => {
          closeModal();
          resolve(false);
        });
      },
    });
  });
}
