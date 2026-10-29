// Authentication and billing are intentionally unavailable in the static website.
document.querySelectorAll('[data-auth-sign-in], [data-auth-sign-out], [data-auth-status]').forEach(element => {
  element.hidden = true;
});
const cloudConfigured=false;
const FEATURE_IDS={ALL_TEMPLATES:'all_templates'};
const canUseFeature=()=>true;
const loadBillingConfig=async()=>({entitlementEnabled:false});
const loadBillingEntitlement=async()=>null;
const confirmSignOut=async()=>true;
const observeAuth=()=>()=>{};
const signInWithGoogle=async()=>{};
const signOutUser=async()=>{};

const signInButton = document.querySelector('[data-auth-sign-in]');
const signOutButton = document.querySelector('[data-auth-sign-out]');
const status = document.querySelector('[data-auth-status]');
const brand = document.querySelector('.about-brand');
const originalTitle = document.title;
const proBadge = brand ? document.createElement('span') : null;
let currentUser = null;
let entitlementRequest = 0;

if (proBadge) {
  proBadge.className = 'about-pro-brand-badge';
  proBadge.textContent = 'Pro';
  proBadge.hidden = true;
  brand.append(proBadge);
}

function updateProBadge(entitlement) {
  const hasPro = canUseFeature(FEATURE_IDS.ALL_TEMPLATES, entitlement);
  if (proBadge) proBadge.hidden = !hasPro;
  document.title = hasPro ? `${originalTitle} | Pro` : originalTitle;
}

async function refreshProBadge(user) {
  const requestId = ++entitlementRequest;
  currentUser = user;
  if (!user) {
    updateProBadge(null);
    return;
  }

  try {
    const config = await loadBillingConfig();
    const entitlement = config.entitlementEnabled ? await loadBillingEntitlement(user) : null;
    if (requestId === entitlementRequest) updateProBadge(entitlement);
  } catch (error) {
    if (requestId === entitlementRequest) updateProBadge(null);
    console.error('Could not load the account Pro status.', error);
  }
}

if (signInButton && signOutButton && status) {
  function updateAuthControls(user, error) {
    if (error) {
      void refreshProBadge(null);
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
  void refreshProBadge(user);
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
    if (!await confirmSignOut()) return;
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

window.addEventListener('focus', () => {
  if (currentUser) void refreshProBadge(currentUser);
});
