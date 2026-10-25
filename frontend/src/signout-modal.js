let dialog;

export function confirmSignOut() {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'signout-dialog';
    dialog.setAttribute('aria-labelledby', 'signout-dialog-title');
    dialog.setAttribute('aria-describedby', 'signout-dialog-description');
    dialog.innerHTML = `
      <h2 id="signout-dialog-title">Sign out?</h2>
      <p id="signout-dialog-description">You'll need to sign in again to access cloud resumes. Your local browser copy will remain available.</p>
      <form method="dialog" class="signout-dialog-actions">
        <button class="btn outline" value="cancel">Stay signed in</button>
        <button class="btn danger" value="signout">Sign out</button>
      </form>`;
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close('cancel');
    });
    document.body.append(dialog);
  }

  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'signout'), { once: true });
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  });
}