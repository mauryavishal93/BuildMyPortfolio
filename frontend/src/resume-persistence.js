import { readSavedProject } from './project-storage.js';

export const GUEST_RESUME_PREFERENCE_KEY = 'resumeBrowserSavingV1';
export const GUEST_RESUME_KEYS = ['resumeStudioV2', 'resumeStudioProject'];

export function createGuestResumeStorage(storage, normalize) {
  let enabled = true;
  let preferenceError = null;

  try {
    const rawPreference = storage.getItem(GUEST_RESUME_PREFERENCE_KEY);
    if (rawPreference !== null) {
      const preference = JSON.parse(rawPreference);
      if (preference?.version === 1 && typeof preference.enabled === 'boolean') {
        enabled = preference.enabled;
      }
    }
  } catch (error) {
    preferenceError = error;
  }

  function clear() {
    for (const key of GUEST_RESUME_KEYS) storage.removeItem(key);
  }

  return {
    get enabled() {
      return enabled;
    },
    get preferenceError() {
      return preferenceError;
    },
    load() {
      if (!enabled) {
        clear();
        return { state: null, key: null, raw: null, error: null, failedKey: null };
      }
      return readSavedProject(storage, normalize);
    },
    setEnabled(value) {
      enabled = Boolean(value);
      preferenceError = null;
      let writeError = null;
      try {
        storage.setItem(GUEST_RESUME_PREFERENCE_KEY, JSON.stringify({
          version: 1,
          enabled
        }));
      } catch (error) {
        preferenceError = error;
        writeError = error;
      }
      if (!enabled) {
        try {
          clear();
        } catch (error) {
          throw new AggregateError([writeError, error].filter(Boolean), 'Could not clear the saved browser resume.');
        }
      }
      if (writeError) throw writeError;
    },
    save(state) {
      if (!enabled) return false;
      storage.setItem(GUEST_RESUME_KEYS[0], JSON.stringify(state));
      return true;
    },
    clear
  };
}

export function chooseAuthenticatedResume({ hasGuestDraft, resumes, lastWorkedResumeId }) {
  if (resumes.length) {
    const lastWorkedResume = resumes.find(resume => resume.id === lastWorkedResumeId);
    return { type: 'open-cloud-resume', resumeId: lastWorkedResume?.id ?? resumes[0].id };
  }
  if (hasGuestDraft) return { type: 'migrate-guest-copy' };
  return { type: 'create-cloud-resume' };
}

export function resolveAuthTransition(previousUid, nextUid) {
  if (!previousUid && nextUid) return 'guest-login';
  if (previousUid && !nextUid) return 'logout';
  if (previousUid && nextUid && previousUid !== nextUid) return 'account-switch';
  return 'unchanged';
}

export function resumeStorageMode(user, browserSavingEnabled) {
  if (user) return 'cloud';
  return browserSavingEnabled ? 'browser' : 'memory';
}

export function shouldShowBrowserSaveToggle(user, authStateResolved) {
  return authStateResolved && !user;
}
