export function showModernDialog({
  title = 'Notice',
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  type = 'confirm',
  defaultValue = '',
  placeholder = ''
} = {}) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modern-modal-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'modern-modal-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'modern-modal-title');

    const heading = document.createElement('h2');
    heading.id = 'modern-modal-title';
    heading.textContent = title;

    const body = document.createElement('p');
    body.textContent = message;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.className = 'modern-modal-input';
    input.setAttribute('aria-label', title);

    const actions = document.createElement('div');
    actions.className = 'modern-modal-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'modern-modal-button modern-modal-button-secondary';
    cancelButton.textContent = cancelText;

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'modern-modal-button modern-modal-button-primary';
    confirmButton.textContent = confirmText;

    const cleanup = (result) => {
      backdrop.remove();
      resolve(result);
    };

    cancelButton.addEventListener('click', () => cleanup(type === 'prompt' ? null : false));
    confirmButton.addEventListener('click', () => {
      if (type === 'prompt') {
        cleanup(input.value.trim());
        return;
      }
      cleanup(true);
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) cleanup(type === 'alert' || type === 'prompt' ? (type === 'alert' ? true : null) : false);
    });

    if (type === 'alert') {
      cancelButton.hidden = true;
      actions.append(confirmButton);
      confirmButton.focus();
    } else {
      actions.append(cancelButton, confirmButton);
      if (type === 'prompt') {
        input.focus();
        input.select();
      } else {
        cancelButton.focus();
      }
    }

    const content = document.createElement('div');
    content.className = 'modern-modal-content';
    content.append(body);
    if (type === 'prompt') content.append(input);

    dialog.append(heading, content, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
  });
}

export function confirmModern(options) {
  return showModernDialog({ ...options, type: 'confirm' });
}

export function alertModern(options) {
  return showModernDialog({ ...options, type: 'alert', cancelText: '' });
}

export function promptModern(options) {
  return showModernDialog({ ...options, type: 'prompt' });
}
