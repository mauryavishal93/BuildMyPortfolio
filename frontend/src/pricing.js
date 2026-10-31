const supportDialog = document.querySelector('#supportDialog');

document.querySelector('#supportLink')?.addEventListener('click', event => {
  event.preventDefault();
  if (typeof supportDialog?.showModal === 'function') supportDialog.showModal();
  else window.location.href = 'mailto:buildymyportfolio@gmail.com';
});

document.querySelector('#closeSupportDialog')?.addEventListener('click', () => supportDialog?.close());
supportDialog?.addEventListener('click', event => {
  if (event.target === supportDialog) supportDialog.close();
});
