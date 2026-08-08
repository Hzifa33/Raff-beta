'use strict';

let RAFF_AUTH = {
  configured: false,
  mode: 'admin',
  recoveryQuestion: '',
  startInPublicMode: true,
  lockedForMs: 0,
  maxAttempts: 5,
  failedAttempts: 0,
  attemptsRemaining: 5,
};

function accessEscape(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isAdminMode() { return RAFF_AUTH.mode === 'admin'; }

function allowedPublicRoute(route) {
  return route === 'search' || route === 'scan';
}

function applyAccessMode({ rerender = true } = {}) {
  const admin = isAdminMode();
  document.body.classList.toggle('mode-admin', admin);
  document.body.classList.toggle('mode-public', !admin);

  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.hidden = !admin;
    el.setAttribute('aria-hidden', String(!admin));
  });
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    const route = el.dataset.route;
    const visible = admin || allowedPublicRoute(route);
    el.hidden = !visible;
    el.setAttribute('aria-hidden', String(!visible));
  });

  const switchBtn = document.getElementById('accessModeSwitch');
  if (switchBtn) {
    switchBtn.classList.toggle('is-admin', admin);
    switchBtn.classList.toggle('is-public', !admin);
    const title = admin
      ? (RAFF_AUTH.configured ? 'قفل الإدارة والانتقال إلى البحث العام' : 'الإدارة مفتوحة — اضغط للانتقال إلى البحث العام')
      : 'فتح وضع الإدارة';
    switchBtn.dataset.tooltip = title;
    switchBtn.setAttribute('aria-label', title);
    switchBtn.removeAttribute('title');
    switchBtn.innerHTML = `
      <span class="access-mode-icon">${icon(admin ? 'lock' : 'search', 14)}</span>
      <span class="access-mode-copy"><small>الوضع الحالي</small><b>${admin ? 'الإدارة' : 'البحث العام'}</b></span>
      <span class="access-mode-dot" aria-hidden="true"></span>`;
  }

  const topBadge = document.getElementById('accessModeBadge');
  if (topBadge) {
    topBadge.textContent = admin ? 'إدارة' : 'بحث عام';
    topBadge.classList.toggle('is-public', !admin);
    topBadge.title = admin ? 'كل أدوات الإدارة متاحة' : 'الوضع للبحث فقط — لا يمكن تعديل البيانات';
  }

  if (!admin && typeof currentRoute !== 'undefined' && !allowedPublicRoute(currentRoute)) {
    currentRoute = 'search';
    currentCtx = {};
  }
  if (rerender && typeof renderRoute === 'function' && document.getElementById('viewRoot')) {
    renderNavCounts?.();
    renderRoute();
  }
}

async function refreshAfterAuthChange(state) {
  if (state) RAFF_AUTH = { ...RAFF_AUTH, ...state };
  await refreshState();
  applyAccessMode({ rerender: true });
}

function showSecuritySetupModal({ firstSetup = false } = {}) {
  const titleId = `securitySetupTitle-${Date.now()}`;
  openModal(`
    <div class="modal-body security-modal-body">
      <div class="security-modal-head">
        <div class="security-modal-icon">${icon('lock', 20)}</div>
        <div><h3 class="modal-title" id="${titleId}">${firstSetup ? 'حماية وضع الإدارة' : 'تحديث بيانات الحماية'}</h3>
        <p class="text-muted">تُحفظ كلمة المرور وإجابة الاسترداد محلياً كقيم مشتقة لا يمكن قراءتها كنص.</p></div>
      </div>
      <div class="security-form-grid">
        <label class="field"><span>كلمة المرور الجديدة</span><input type="password" id="securityPassword" minlength="6" maxlength="256" autocomplete="new-password" autofocus placeholder="6 أحرف على الأقل" /></label>
        <label class="field"><span>تأكيد كلمة المرور</span><input type="password" id="securityPasswordConfirm" minlength="6" maxlength="256" autocomplete="new-password" /></label>
        <label class="field span-2"><span>سؤال الاسترداد</span><input type="text" id="securityQuestion" maxlength="180" value="${accessEscape(RAFF_AUTH.recoveryQuestion || '')}" placeholder="مثال: ما اسم أول كتاب أضفته؟" /></label>
        <label class="field span-2"><span>إجابة الاسترداد</span><input type="text" id="securityAnswer" maxlength="180" autocomplete="off" placeholder="اكتب إجابة تتذكرها" /></label>
        <label class="security-check span-2"><input type="checkbox" id="securityStartPublic" ${RAFF_AUTH.startInPublicMode !== false ? 'checked' : ''}/><span>ابدأ البرنامج مستقبلاً في وضع البحث العام</span></label>
      </div>
      <p class="form-error hidden" id="securityError"></p>
      <div class="form-actions">
        <button class="btn btn-primary" id="securitySave">${icon('check', 14)} حفظ الحماية</button>
        <button class="btn btn-ghost" id="securityCancel">إلغاء</button>
      </div>
    </div>`, {
    labelledBy: titleId,
    modalClass: 'modal-medium',
    onMount: (overlay) => {
      const error = overlay.querySelector('#securityError');
      const showError = (message) => { error.textContent = message; error.classList.remove('hidden'); };
      overlay.querySelector('#securityCancel').addEventListener('click', closeModal);
      overlay.querySelector('#securitySave').addEventListener('click', async (event) => {
        const btn = event.currentTarget;
        const password = overlay.querySelector('#securityPassword').value;
        const confirm = overlay.querySelector('#securityPasswordConfirm').value;
        const question = overlay.querySelector('#securityQuestion').value;
        const answer = overlay.querySelector('#securityAnswer').value;
        const startInPublicMode = overlay.querySelector('#securityStartPublic').checked;
        if (password !== confirm) { showError('كلمتا المرور غير متطابقتين'); return; }
        if (!password && !firstSetup && question === RAFF_AUTH.recoveryQuestion && !answer) {
          const pref = await window.raff.authUpdatePreferences({ startInPublicMode });
          if (!pref.ok) { showError(pref.error); return; }
          closeModal();
          await refreshAfterAuthChange(pref.state);
          toast('تم تحديث تفضيلات الدخول', 'success');
          return;
        }
        btn.disabled = true;
        const payload = { password, question, answer, startInPublicMode };
        const result = firstSetup
          ? await window.raff.authConfigure(payload)
          : await window.raff.authChangeCredentials({ password, question, answer });
        if (!result.ok) { btn.disabled = false; showError(result.error || 'تعذر حفظ الحماية'); return; }
        let finalState = result.state;
        if (!firstSetup) {
          const pref = await window.raff.authUpdatePreferences({ startInPublicMode });
          if (!pref.ok) { btn.disabled = false; showError(pref.error || 'تعذر حفظ تفضيل بدء التشغيل'); return; }
          finalState = pref.state;
        }
        closeModal();
        await refreshAfterAuthChange(finalState);
        toast('تم حفظ حماية وضع الإدارة', 'success');
      });
    },
  });
}

function showPasswordRecoveryModal() {
  const titleId = `recoverTitle-${Date.now()}`;
  openModal(`
    <div class="modal-body security-modal-body">
      <div class="security-modal-head">
        <div class="security-modal-icon">${icon('refresh', 20)}</div>
        <div><h3 class="modal-title" id="${titleId}">استعادة الوصول للإدارة</h3><p class="text-muted">لن تظهر كلمة المرور القديمة؛ ستُستبدل بكلمة جديدة بعد الإجابة الصحيحة.</p></div>
      </div>
      <div class="recovery-question"><small>سؤال الاسترداد</small><b>${accessEscape(RAFF_AUTH.recoveryQuestion || 'لم يُضبط سؤال استرداد')}</b></div>
      <label class="field"><span>الإجابة</span><input type="text" id="recoveryAnswer" autocomplete="off" autofocus /></label>
      <label class="field"><span>كلمة المرور الجديدة</span><input type="password" id="recoveryPassword" minlength="6" autocomplete="new-password" /></label>
      <label class="field"><span>تأكيد كلمة المرور</span><input type="password" id="recoveryPasswordConfirm" minlength="6" autocomplete="new-password" /></label>
      <p class="form-error hidden" id="recoveryError"></p>
      <div class="form-actions"><button class="btn btn-primary" id="recoverySave">تعيين كلمة جديدة</button><button class="btn btn-ghost" id="recoveryCancel">إلغاء</button></div>
    </div>`, {
    labelledBy: titleId,
    modalClass: 'modal-small',
    onMount: (overlay) => {
      const error = overlay.querySelector('#recoveryError');
      overlay.querySelector('#recoveryCancel').addEventListener('click', closeModal);
      overlay.querySelector('#recoverySave').addEventListener('click', async (event) => {
        const password = overlay.querySelector('#recoveryPassword').value;
        const confirm = overlay.querySelector('#recoveryPasswordConfirm').value;
        if (password !== confirm) { error.textContent = 'كلمتا المرور غير متطابقتين'; error.classList.remove('hidden'); return; }
        event.currentTarget.disabled = true;
        const result = await window.raff.authResetPassword({
          answer: overlay.querySelector('#recoveryAnswer').value,
          newPassword: password,
        });
        if (!result.ok) {
          event.currentTarget.disabled = false;
          error.textContent = result.error || 'تعذر الاسترداد';
          error.classList.remove('hidden');
          return;
        }
        closeModal();
        await refreshAfterAuthChange(result.state);
        toast('تم تعيين كلمة مرور جديدة وفتح وضع الإدارة', 'success');
      });
    },
  });
}

function showAdminLoginModal() {
  if (!RAFF_AUTH.configured) {
    window.raff.authEnterAdmin().then((result) => {
      if (result.ok) refreshAfterAuthChange(result.state);
    });
    return;
  }

  const titleId = `adminLoginTitle-${Date.now()}`;
  openModal(`
    <div class="modal-body admin-login-body admin-login-card">
      <div class="admin-login-symbol">${icon('lock', 24)}</div>
      <h3 class="modal-title" id="${titleId}">فتح وضع الإدارة</h3>
      <p class="text-muted admin-login-intro">أدخل كلمة المرور لإتاحة الإضافة والتعديل والإعارة والإعدادات.</p>

      <label class="field password-field" id="adminPasswordField">
        <span>كلمة المرور</span>
        <span class="password-input-shell">
          <input type="password" id="adminPassword" maxlength="256" autocomplete="current-password" autofocus aria-describedby="adminLoginFeedback adminCapsHint" />
          <button class="password-visibility" id="adminPasswordVisibility" type="button" title="إظهار كلمة المرور" aria-label="إظهار كلمة المرور">${icon('eye', 16)}</button>
        </span>
      </label>

      <div class="caps-lock-hint hidden" id="adminCapsHint">${icon('info', 13)} مفتاح الأحرف الكبيرة Caps Lock مفعّل</div>
      <div class="login-feedback" id="adminLoginFeedback" role="status" aria-live="polite">
        <span class="login-feedback-icon">${icon('info', 15)}</span>
        <div><b id="adminLoginMessage">لديك ${Number(RAFF_AUTH.maxAttempts) || 5} محاولات قبل القفل المؤقت.</b><small id="adminLoginAttempts"></small></div>
      </div>
      <div class="attempt-meter" id="adminAttemptMeter" aria-hidden="true"></div>

      <div class="form-actions admin-login-actions">
        <button class="btn btn-primary" id="adminLoginBtn">${icon('lock', 14)} فتح الإدارة</button>
        <button class="btn btn-ghost" id="adminLoginCancel">إلغاء</button>
      </div>
      <button class="link-button recovery-link" id="forgotPasswordBtn">نسيت كلمة المرور؟</button>
    </div>`, {
    labelledBy: titleId,
    modalClass: 'modal-small admin-login-modal',
    onMount: (overlay) => {
      const card = overlay.querySelector('.admin-login-card');
      const password = overlay.querySelector('#adminPassword');
      const passwordField = overlay.querySelector('#adminPasswordField');
      const feedback = overlay.querySelector('#adminLoginFeedback');
      const message = overlay.querySelector('#adminLoginMessage');
      const attemptsText = overlay.querySelector('#adminLoginAttempts');
      const attemptMeter = overlay.querySelector('#adminAttemptMeter');
      const submitButton = overlay.querySelector('#adminLoginBtn');
      const capsHint = overlay.querySelector('#adminCapsHint');
      const visibility = overlay.querySelector('#adminPasswordVisibility');
      let lastWrongValue = null;
      let repeatedWrongCount = 0;
      let submitting = false;
      let lockTimer = null;

      const renderAttemptMeter = (state = RAFF_AUTH) => {
        const max = Math.max(1, Number(state.maxAttempts) || 5);
        const failed = Math.min(max, Math.max(0, Number(state.failedAttempts) || 0));
        attemptMeter.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < failed ? 'is-used' : ''}"></span>`).join('');
      };

      const restartShake = () => {
        card.classList.remove('is-rejected');
        passwordField.classList.remove('is-invalid');
        void card.offsetWidth;
        card.classList.add('is-rejected');
        passwordField.classList.add('is-invalid');
        window.setTimeout(() => card.classList.remove('is-rejected'), 560);
      };

      const setFeedback = ({ text, detail = '', kind = 'info' }) => {
        feedback.classList.remove('is-error', 'is-locked', 'is-info');
        feedback.classList.add(kind === 'error' ? 'is-error' : kind === 'locked' ? 'is-locked' : 'is-info');
        feedback.querySelector('.login-feedback-icon').innerHTML = icon(kind === 'error' || kind === 'locked' ? 'alert' : 'info', 15);
        message.textContent = text;
        attemptsText.textContent = detail;
      };

      const stopLockCountdown = () => {
        if (lockTimer) window.clearInterval(lockTimer);
        lockTimer = null;
      };

      const startLockCountdown = (lockedForMs) => {
        stopLockCountdown();
        const endsAt = Date.now() + Math.max(0, Number(lockedForMs) || 0);
        const tick = async () => {
          const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
          if (seconds > 0) {
            password.disabled = true;
            submitButton.disabled = true;
            setFeedback({ text: 'تم إيقاف المحاولات مؤقتًا', detail: `يمكنك المحاولة من جديد بعد ${seconds} ثانية.`, kind: 'locked' });
            return;
          }
          stopLockCountdown();
          password.disabled = false;
          submitButton.disabled = false;
          const fresh = await window.raff.authGetState();
          RAFF_AUTH = { ...RAFF_AUTH, ...fresh };
          renderAttemptMeter(RAFF_AUTH);
          setFeedback({ text: 'يمكنك المحاولة الآن', detail: `لديك ${RAFF_AUTH.attemptsRemaining || RAFF_AUTH.maxAttempts || 5} محاولات.`, kind: 'info' });
          password.focus();
        };
        tick();
        lockTimer = window.setInterval(tick, 1000);
      };

      const funnyRepeatMessage = (count) => {
        if (count === 2) return 'قلت لك إنها خطأ… صدّقني، لن تتغيّر النتيجة بنفس الكلمة.';
        if (count === 3) return 'ما زالت الكلمة نفسها؛ كلمة المرور لا تتأثر بالإصرار.';
        if (count > 3) return 'هذه الكلمة حفظناها الآن… لكنها ما زالت ليست كلمة المرور.';
        return 'كلمة المرور غير صحيحة.';
      };

      const submit = async () => {
        if (submitting || password.disabled) return;
        const value = password.value;
        if (!value) {
          setFeedback({ text: 'اكتب كلمة المرور أولًا', detail: 'الحقل فارغ، لذلك لم تُحسب محاولة.', kind: 'error' });
          restartShake();
          password.focus();
          return;
        }

        submitting = true;
        submitButton.disabled = true;
        submitButton.classList.add('is-loading');
        const result = await window.raff.authLogin(value);
        submitting = false;
        submitButton.classList.remove('is-loading');

        if (!result.ok) {
          RAFF_AUTH = { ...RAFF_AUTH, ...(result.state || {}) };
          if (value === lastWrongValue) repeatedWrongCount += 1;
          else { lastWrongValue = value; repeatedWrongCount = 1; }

          renderAttemptMeter(RAFF_AUTH);
          restartShake();
          password.select();

          if (result.code === 'LOCKED' || Number(RAFF_AUTH.lockedForMs) > 0) {
            startLockCountdown(RAFF_AUTH.lockedForMs || 30000);
          } else {
            const remaining = Math.max(0, Number(RAFF_AUTH.attemptsRemaining));
            setFeedback({
              text: funnyRepeatMessage(repeatedWrongCount),
              detail: `تبقّت لك ${remaining} ${remaining === 1 ? 'محاولة' : 'محاولات'} قبل القفل المؤقت.`,
              kind: 'error',
            });
            submitButton.disabled = false;
          }
          return;
        }

        stopLockCountdown();
        closeModal();
        await refreshAfterAuthChange(result.state);
        toast('تم فتح وضع الإدارة', 'success', 1800);
      };

      renderAttemptMeter(RAFF_AUTH);
      if (Number(RAFF_AUTH.lockedForMs) > 0) startLockCountdown(RAFF_AUTH.lockedForMs);

      overlay.querySelector('#adminLoginBtn').addEventListener('click', submit);
      overlay.querySelector('#adminLoginCancel').addEventListener('click', closeModal);
      password.addEventListener('keydown', (event) => {
        capsHint.classList.toggle('hidden', !event.getModifierState?.('CapsLock'));
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
      });
      password.addEventListener('keyup', (event) => capsHint.classList.toggle('hidden', !event.getModifierState?.('CapsLock')));
      password.addEventListener('input', () => {
        passwordField.classList.remove('is-invalid');
        if (!feedback.classList.contains('is-locked')) setFeedback({ text: 'أدخل كلمة المرور ثم اضغط Enter', detail: '', kind: 'info' });
      });
      visibility.addEventListener('click', () => {
        const reveal = password.type === 'password';
        password.type = reveal ? 'text' : 'password';
        visibility.innerHTML = icon(reveal ? 'eyeOff' : 'eye', 16);
        visibility.title = reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
        visibility.setAttribute('aria-label', visibility.title);
        password.focus();
      });
      overlay.querySelector('#forgotPasswordBtn').addEventListener('click', () => {
        stopLockCountdown();
        closeModal();
        showPasswordRecoveryModal();
      });
    },
    onClose: () => {},
  });
}

async function toggleAccessMode() {
  if (isAdminMode()) {
    const result = await window.raff.authLogout();
    if (result.ok) {
      await refreshAfterAuthChange(result.state);
      toast('تم تفعيل وضع البحث العام', 'success', 1800);
    }
  } else {
    showAdminLoginModal();
  }
}

async function initAccessControl() {
  RAFF_AUTH = { ...RAFF_AUTH, ...(await window.raff.authGetState()) };
  document.getElementById('accessModeSwitch')?.addEventListener('click', toggleAccessMode);
  document.getElementById('accessModeBadge')?.addEventListener('click', toggleAccessMode);
  window.raff.onAuthStateChange((state) => {
    RAFF_AUTH = { ...RAFF_AUTH, ...state };
    applyAccessMode({ rerender: false });
  });
  applyAccessMode({ rerender: false });
}

async function requireAdminMode() {
  if (isAdminMode()) return true;
  showAdminLoginModal();
  return false;
}
