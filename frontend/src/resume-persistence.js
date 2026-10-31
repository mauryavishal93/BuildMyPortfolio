import { readSavedProject } from './project-storage.js';

export const GUEST_RESUME_PREFERENCE_KEY = 'resumeBrowserSavingV1';
export const GUEST_RESUME_KEYS = ['resumeStudioV2', 'resumeStudioProject'];
const ACCOUNT_RESUME_KEY_PREFIX = 'resumeAccountV1:';

function accountResumeKey(uid) {
  if (typeof uid !== 'string' || !uid) {
    throw new Error('A valid account ID is required for local resume storage.');
  }
  return `${ACCOUNT_RESUME_KEY_PREFIX}${encodeURIComponent(uid)}`;
}

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

export function createAccountResumeStorage(storage, normalize) {
  return {
    load(uid) {
      const key = accountResumeKey(uid);
      let raw;
      try {
        raw = storage.getItem(key);
        if (raw === null) return { state: null, error: null, raw: null };
        const saved = JSON.parse(raw);
        if (saved?.version !== 1) throw new Error('The saved account resume version is invalid.');
        return { state: normalize(saved.state), error: null, raw: null };
      } catch (error) {
        return { state: null, error, raw: raw ?? null };
      }
    },
    save(uid, state) {
      storage.setItem(accountResumeKey(uid), JSON.stringify({ version: 1, state }));
    },
    clear(uid) {
      storage.removeItem(accountResumeKey(uid));
    }
  };
}

function normalizedResumeName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
}

export function findResumeByName(resumes, name) {
  const normalizedName = normalizedResumeName(name);
  if (!normalizedName) return null;
  return resumes.find(resume => normalizedResumeName(resume.name) === normalizedName) ?? null;
}

export function chooseAuthenticatedResume({ hasGuestDraft, guestDraftName, resumes, lastWorkedResumeId }) {
  const sameNameResume = hasGuestDraft ? findResumeByName(resumes, guestDraftName) : null;
  if (sameNameResume) return { type: 'sync-guest-copy', resumeId: sameNameResume.id };
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
