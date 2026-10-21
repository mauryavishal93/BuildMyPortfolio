import { cloudConfigured, observeAuth, signInWithGoogle, signOutUser } from './firebase-cloud.js';

const signInButton = document.querySelector('[data-auth-sign-in]');
const signOutButton = document.querySelector('[data-auth-sign-out]');
const status = document.querySelector('[data-auth-status]');

if (signInButton && signOutButton && status) {
  function updateAuthControls(user, error) {
    if (error) {
      console.error('Could not initialize account controls.', error);
      signInButton.disabled = true;
      signInButton.querySelector('[data-auth-sign-in-label]').textContent = 'Cloud setup needed';
      signInButton.title = error.message;
      signOutButton.hidden = true;
      status.textContent = error.message;
      status.classList.add('auth-error');
      return;
    }

    status.classList.remove('auth-error');
    signInButton.hidden = Boolean(user);
    signOutButton.hidden = !user;
    signInButton.disabled = false;
    signInButton.querySelector('[data-auth-sign-in-label]').textContent = 'Sign in with Google';
    signInButton.title = '';
    signOutButton.title = user?.email || user?.displayName || 'Signed-in account';
    status.textContent = user
      ? `Signed in as ${user.email || user.displayName || 'Google user'}.`
      : 'You are signed out.';
  }

  signInButton.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google sign-in failed.', error);
      status.textContent = error.message || 'Could not sign in with Google.';
      status.classList.add('auth-error');
    }
  });

  signOutButton.addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Could not sign out.', error);
      status.textContent = error.message || 'Could not sign out.';
      status.classList.add('auth-error');
    }
  });

  if (cloudConfigured) observeAuth(updateAuthControls);
  else updateAuthControls(null, new Error('Google sign-in is not configured on this site.'));
}
