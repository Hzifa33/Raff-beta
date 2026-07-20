'use strict';

/* ======================================================================
   رَفّ — accessible local custom select
   Keeps the original <select> as the source of truth so forms, FormData,
   validation and existing change listeners continue to work unchanged.
   The option popup is portalled to <body>, therefore it is never clipped by
   cards, tables, modals or panels that use overflow:hidden.
   ====================================================================== */

(() => {
  const ENHANCED = 'data-raff-select-enhanced';
  const wrappers = new WeakMap();
  let openState = null;
  let serial = 0;
  let typeBuffer = '';
  let typeTimer = null;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const chevronSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const searchSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

  function optionsOf(select) {
    return Array.from(select.options).map((option, index) => ({
      index,
      value: option.value,
      label: option.textContent.trim(),
      disabled: option.disabled || option.parentElement?.disabled === true,
      selected: option.selected,
    }));
  }

  function selectedLabel(select) {
    const option = select.selectedOptions?.[0] || select.options[select.selectedIndex];
    return option?.textContent?.trim() || select.getAttribute('placeholder') || 'اختر من القائمة';
  }

  function closeSelect({ restoreFocus = false } = {}) {
    if (!openState) return;
    const { wrapper, trigger, menu } = openState;
    wrapper.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    menu.remove();
    openState = null;
    typeBuffer = '';
    clearTimeout(typeTimer);
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function setActive(menu, optionButton, { scroll = true } = {}) {
    menu.querySelectorAll('.raff-select-option.is-active').forEach((node) => node.classList.remove('is-active'));
    if (!optionButton || optionButton.getAttribute('aria-disabled') === 'true' || optionButton.hidden) return;
    optionButton.classList.add('is-active');
    if (scroll) optionButton.scrollIntoView({ block: 'nearest' });
  }

  function enabledOptions(menu) {
    return Array.from(menu.querySelectorAll('.raff-select-option:not([aria-disabled="true"])')).filter((node) => !node.hidden);
  }

  function moveActive(menu, delta) {
    const items = enabledOptions(menu);
    if (!items.length) return;
    const current = menu.querySelector('.raff-select-option.is-active');
    let index = items.indexOf(current);
    if (index < 0) index = Math.max(0, items.findIndex((node) => node.getAttribute('aria-selected') === 'true'));
    index = (index + delta + items.length) % items.length;
    setActive(menu, items[index]);
  }

  function positionMenu(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const viewportGap = 8;
    const desired = Math.max(rect.width, 190);
    const width = Math.min(desired, window.innerWidth - viewportGap * 2);
    const below = window.innerHeight - rect.bottom - viewportGap;
    const above = rect.top - viewportGap;
    const placeTop = below < 190 && above > below;
    const maxHeight = Math.max(140, Math.min(340, (placeTop ? above : below) - 6));

    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    const options = menu.querySelector('.raff-select-options');
    const search = menu.querySelector('.raff-select-search');
    if (options) options.style.maxHeight = `${Math.max(90, maxHeight - (search ? 47 : 0) - 12)}px`;

    let left;
    const isRtl = getComputedStyle(trigger).direction === 'rtl';
    if (isRtl) left = rect.right - width;
    else left = rect.left;
    left = Math.max(viewportGap, Math.min(left, window.innerWidth - width - viewportGap));
    menu.style.left = `${Math.round(left)}px`;

    menu.dataset.placement = placeTop ? 'top' : 'bottom';
    if (placeTop) {
      menu.style.top = 'auto';
      menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 5)}px`;
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = `${Math.round(rect.bottom + 5)}px`;
    }
  }

  function chooseOption(select, index) {
    const option = select.options[index];
    if (!option || option.disabled || select.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    select.value = option.value;
    syncSelect(select);
    closeSelect({ restoreFocus: true });
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function buildMenu(select, wrapper, trigger) {
    closeSelect();
    const items = optionsOf(select);
    const menu = document.createElement('div');
    const listId = `${wrapper.dataset.raffSelectId}-listbox`;
    menu.className = 'raff-select-popover';
    menu.id = listId;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.name || 'قائمة اختيار');
    menu.dir = select.closest('[dir]')?.getAttribute('dir') || document.documentElement.dir || 'rtl';

    const searchable = select.dataset.searchable === 'true' || items.length >= 12;
    if (searchable) {
      const search = document.createElement('label');
      search.className = 'raff-select-search';
      search.innerHTML = `${searchSvg}<input type="search" autocomplete="off" spellcheck="false" placeholder="ابحث داخل الخيارات..." aria-label="بحث داخل الخيارات">`;
      menu.appendChild(search);
      const input = search.querySelector('input');
      input.addEventListener('input', () => {
        const query = input.value.trim().toLocaleLowerCase('ar');
        let visible = 0;
        menu.querySelectorAll('.raff-select-option').forEach((button) => {
          const matches = !query || button.dataset.searchText.includes(query);
          button.hidden = !matches;
          if (matches) visible += 1;
        });
        menu.querySelector('.raff-select-empty')?.remove();
        if (!visible) {
          const empty = document.createElement('div');
          empty.className = 'raff-select-empty';
          empty.textContent = 'لا توجد خيارات مطابقة';
          menu.querySelector('.raff-select-options').appendChild(empty);
        }
        setActive(menu, enabledOptions(menu)[0], { scroll: false });
      });
    }

    const optionsHost = document.createElement('div');
    optionsHost.className = 'raff-select-options';
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'raff-select-option';
      button.dataset.optionIndex = String(item.index);
      button.dataset.searchText = `${item.label} ${item.value}`.toLocaleLowerCase('ar');
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', item.selected ? 'true' : 'false');
      if (item.disabled) button.setAttribute('aria-disabled', 'true');
      button.innerHTML = `<span>${escapeHtml(item.label || '—')}</span><span class="raff-select-option-check">${checkSvg}</span>`;
      button.addEventListener('mouseenter', () => setActive(menu, button, { scroll: false }));
      button.addEventListener('click', () => chooseOption(select, item.index));
      optionsHost.appendChild(button);
    });
    menu.appendChild(optionsHost);
    document.body.appendChild(menu);

    wrapper.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', listId);
    openState = { select, wrapper, trigger, menu };
    positionMenu(trigger, menu);

    const selected = menu.querySelector('.raff-select-option[aria-selected="true"]');
    setActive(menu, selected || enabledOptions(menu)[0], { scroll: false });
    requestAnimationFrame(() => selected?.scrollIntoView({ block: 'nearest' }));

    menu.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(menu, 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(menu, -1); }
      else if (event.key === 'Home') { event.preventDefault(); setActive(menu, enabledOptions(menu)[0]); }
      else if (event.key === 'End') { event.preventDefault(); setActive(menu, enabledOptions(menu).at(-1)); }
      else if (event.key === 'Enter') {
        const active = menu.querySelector('.raff-select-option.is-active');
        if (active) { event.preventDefault(); chooseOption(select, Number(active.dataset.optionIndex)); }
      } else if (event.key === 'Escape') { event.preventDefault(); closeSelect({ restoreFocus: true }); }
      else if (event.key === 'Tab') closeSelect();
    });

    if (searchable) requestAnimationFrame(() => menu.querySelector('.raff-select-search input')?.focus());
    else menu.tabIndex = -1;
  }

  function syncSelect(select) {
    const state = wrappers.get(select);
    if (!state) return;
    state.value.textContent = selectedLabel(select);
    state.trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
    state.trigger.disabled = select.disabled;
    if (select.required) state.trigger.setAttribute('aria-required', 'true');
    else state.trigger.removeAttribute('aria-required');

    if (openState?.select === select) {
      const items = optionsOf(select);
      const buttons = openState.menu.querySelectorAll('.raff-select-option');
      if (buttons.length !== items.length) {
        buildMenu(select, state.wrapper, state.trigger);
      } else {
        buttons.forEach((button, index) => {
          button.setAttribute('aria-selected', items[index]?.selected ? 'true' : 'false');
          if (items[index]?.disabled) button.setAttribute('aria-disabled', 'true');
          else button.removeAttribute('aria-disabled');
        });
      }
    }
  }

  function typeSelect(select, character) {
    typeBuffer += character.toLocaleLowerCase('ar');
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => { typeBuffer = ''; }, 650);
    const options = optionsOf(select).filter((item) => !item.disabled);
    const match = options.find((item) => item.label.toLocaleLowerCase('ar').startsWith(typeBuffer));
    if (match) chooseOption(select, match.index);
  }

  function enhanceSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.multiple || Number(select.size) > 1 || select.dataset.nativeSelect === 'true') return;

    const existing = wrappers.get(select);
    if (existing?.wrapper?.isConnected) { syncSelect(select); return; }
    if (select.hasAttribute(ENHANCED)) return;

    const wrapper = document.createElement('div');
    wrapper.className = ['raff-select', ...Array.from(select.classList)].join(' ');
    wrapper.dataset.raffSelectId = `raff-select-${++serial}`;
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'raff-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.name || 'اختيار');
    trigger.innerHTML = `<span class="raff-select-value"></span><span class="raff-select-chevron">${chevronSvg}</span>`;
    wrapper.appendChild(trigger);

    const value = trigger.querySelector('.raff-select-value');
    select.classList.add('raff-native-select');
    select.setAttribute(ENHANCED, 'true');
    select.tabIndex = -1;
    wrappers.set(select, { wrapper, trigger, value });
    syncSelect(select);

    trigger.addEventListener('click', () => {
      if (select.disabled) return;
      if (openState?.select === select) closeSelect({ restoreFocus: true });
      else buildMenu(select, wrapper, trigger);
    });

    trigger.addEventListener('keydown', (event) => {
      if (select.disabled) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!openState || openState.select !== select) buildMenu(select, wrapper, trigger);
        if (event.key === 'ArrowUp') moveActive(openState.menu, -1);
      } else if (event.key === 'Escape') closeSelect({ restoreFocus: true });
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeSelect(select, event.key);
    });

    select.addEventListener('change', () => syncSelect(select));
    select.addEventListener('input', () => syncSelect(select));
    select.addEventListener('focus', () => trigger.focus());
    select.addEventListener('invalid', (event) => {
      event.preventDefault();
      trigger.focus();
      buildMenu(select, wrapper, trigger);
    });
  }

  function enhanceWithin(root = document) {
    if (root instanceof HTMLSelectElement) enhanceSelect(root);
    root.querySelectorAll?.('select').forEach(enhanceSelect);
  }

  document.addEventListener('pointerdown', (event) => {
    if (!openState) return;
    if (openState.menu.contains(event.target) || openState.wrapper.contains(event.target)) return;
    closeSelect();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openState) closeSelect({ restoreFocus: true });
  }, true);

  window.addEventListener('resize', () => {
    if (openState) positionMenu(openState.trigger, openState.menu);
  });

  document.addEventListener('scroll', (event) => {
    if (!openState || openState.menu.contains(event.target)) return;
    closeSelect();
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          enhanceWithin(node);
          const parentSelect = node.closest?.('select');
          if (parentSelect) syncSelect(parentSelect);
        });
        const targetSelect = mutation.target instanceof HTMLSelectElement
          ? mutation.target
          : mutation.target.closest?.('select');
        if (targetSelect) syncSelect(targetSelect);
      } else if (mutation.type === 'attributes' && mutation.target instanceof HTMLSelectElement) {
        syncSelect(mutation.target);
      }
    }
    if (openState && !openState.wrapper.isConnected) closeSelect();
  });

  const start = () => {
    enhanceWithin(document);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled', 'required', 'aria-label'],
    });
    window.RaffSelect = { enhanceWithin, sync: syncSelect, close: closeSelect };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
