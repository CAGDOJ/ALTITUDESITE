(() => {
  'use strict';

  let overlay = null;
  let resolver = null;

  function esc(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'alt-dialog-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="alt-dialog-card" role="dialog" aria-modal="true" aria-labelledby="altDialogTitle">
        <button type="button" class="alt-dialog-close" aria-label="Fechar">×</button>
        <div class="alt-dialog-icon" aria-hidden="true">i</div>
        <div class="alt-dialog-copy">
          <span class="alt-dialog-kicker">INSTITUIÇÃO ALTITUDE</span>
          <h2 id="altDialogTitle"></h2>
          <p id="altDialogMessage"></p>
          <div id="altDialogOptions" class="alt-dialog-options"></div>
          <label id="altDialogInputWrap" class="alt-dialog-input-wrap" hidden>
            <span id="altDialogInputLabel">Informação</span>
            <textarea id="altDialogInput" rows="4"></textarea>
          </label>
          <div class="alt-dialog-actions">
            <button type="button" class="alt-dialog-cancel">Cancelar</button>
            <button type="button" class="alt-dialog-confirm">Confirmar</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const close = (value = null) => {
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('alt-dialog-open');
      const done = resolver;
      resolver = null;
      if (done) done(value);
    };

    overlay.querySelector('.alt-dialog-close').addEventListener('click', () => close(null));
    overlay.querySelector('.alt-dialog-cancel').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') close(null);
    });
    overlay._close = close;
    return overlay;
  }

  function open(config = {}) {
    const node = ensure();
    const title = node.querySelector('#altDialogTitle');
    const message = node.querySelector('#altDialogMessage');
    const optionsBox = node.querySelector('#altDialogOptions');
    const inputWrap = node.querySelector('#altDialogInputWrap');
    const input = node.querySelector('#altDialogInput');
    const inputLabel = node.querySelector('#altDialogInputLabel');
    const confirm = node.querySelector('.alt-dialog-confirm');
    const cancel = node.querySelector('.alt-dialog-cancel');
    const icon = node.querySelector('.alt-dialog-icon');

    title.textContent = config.title || 'Confirmação';
    message.textContent = config.message || '';
    confirm.textContent = config.confirmText || 'Confirmar';
    cancel.textContent = config.cancelText || 'Cancelar';
    cancel.hidden = config.hideCancel === true;
    confirm.className = `alt-dialog-confirm${config.danger ? ' danger' : ''}`;
    icon.textContent = config.icon || (config.danger ? '!' : '✓');
    icon.className = `alt-dialog-icon ${config.type || (config.danger ? 'danger' : 'info')}`;

    optionsBox.innerHTML = '';
    optionsBox.hidden = !Array.isArray(config.options) || !config.options.length;
    let selected = config.defaultValue ?? null;
    if (!optionsBox.hidden) {
      config.options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'alt-dialog-option';
        button.dataset.value = option.value;
        button.innerHTML = `<strong>${esc(option.label)}</strong>${option.description ? `<span>${esc(option.description)}</span>` : ''}`;
        if (option.value === selected) button.classList.add('selected');
        button.addEventListener('click', () => {
          selected = option.value;
          optionsBox.querySelectorAll('.alt-dialog-option').forEach((item) => item.classList.toggle('selected', item === button));
        });
        optionsBox.appendChild(button);
      });
    }

    inputWrap.hidden = !config.input;
    input.value = config.input?.value || '';
    input.placeholder = config.input?.placeholder || '';
    inputLabel.textContent = config.input?.label || 'Informação';

    node.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('alt-dialog-open');
    window.setTimeout(() => {
      if (!inputWrap.hidden) input.focus();
      else if (!optionsBox.hidden) optionsBox.querySelector('.alt-dialog-option')?.focus();
      else confirm.focus();
    }, 40);

    return new Promise((resolve) => {
      resolver = resolve;
      confirm.onclick = () => {
        if (!optionsBox.hidden && !selected) {
          optionsBox.classList.add('shake');
          setTimeout(() => optionsBox.classList.remove('shake'), 350);
          return;
        }
        if (!inputWrap.hidden && config.input?.required && !input.value.trim()) {
          input.classList.add('invalid');
          input.focus();
          return;
        }
        node._close(!optionsBox.hidden
          ? { value: selected, text: inputWrap.hidden ? '' : input.value.trim() }
          : inputWrap.hidden ? true : input.value.trim());
      };
    });
  }

  window.AltitudeDialog = {
    alert({ title = 'Aviso', message = '', type = 'info' } = {}) {
      return open({ title, message, type, hideCancel: true, confirmText: 'Entendi' });
    },
    confirm({ title = 'Confirmação', message = '', confirmText = 'Confirmar', danger = false } = {}) {
      return open({ title, message, confirmText, danger });
    },
    prompt({ title = 'Informação necessária', message = '', label = 'Observação', value = '', placeholder = '', required = true, confirmText = 'Continuar', danger = false } = {}) {
      return open({ title, message, confirmText, danger, input: { label, value, placeholder, required } });
    },
    choice({ title = 'Escolha uma opção', message = '', options = [], defaultValue = null, input = null, confirmText = 'Continuar' } = {}) {
      return open({ title, message, options, defaultValue, input, confirmText });
    }
  };

  // Padroniza avisos informativos antigos sem interromper o fluxo do sistema.
  window.__altitudeNativeAlert = window.alert.bind(window);
  window.alert = (message) => {
    window.AltitudeDialog.alert({ title: 'Aviso', message: String(message || '') });
  };
})();
