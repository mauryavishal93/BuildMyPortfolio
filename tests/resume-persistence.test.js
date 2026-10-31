import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAuthenticatedResume,
  createGuestResumeStorage,
  GUEST_RESUME_KEYS,
  GUEST_RESUME_PREFERENCE_KEY,
  resolveAuthTransition,
  resumeStorageMode,
  shouldShowBrowserSaveToggle
} from '../frontend/src/resume-persistence.js';

const normalize = value => {
  if (!value || typeof value.name !== 'string') throw new Error('Invalid project');
  return value;
};

function createStorage(values = {}) {
  const records = new Map(Object.entries(values));
  return {
    records,
    getItem(key) {
      return records.get(key) ?? null;
    },
    setItem(key, value) {
      records.set(key, String(value));
    },
    removeItem(key) {
      records.delete(key);
    }
  };
}

test('guest saving defaults on and restores saved resumes after a new session', () => {
  const storage = createStorage();
  const firstSession = createGuestResumeStorage(storage, normalize);
  const project = { name: 'Browser draft' };

  assert.equal(firstSession.enabled, true);
  assert.equal(firstSession.save(project), true);

  const nextSession = createGuestResumeStorage(storage, normalize);
  assert.equal(nextSession.enabled, true);
  assert.deepEqual(nextSession.load().state, project);
});

test('guest saving off never restores resume data and clears existing browser copies', () => {
  const storage = createStorage({
    resumeStudioV2: JSON.stringify({ name: 'Old draft' }),
    resumeStudioProject: JSON.stringify({ name: 'Legacy draft' })
  });
  const persistence = createGuestResumeStorage(storage, normalize);

  persistence.setEnabled(false);

  assert.equal(persistence.enabled, false);
  assert.equal(persistence.load().state, null);
  assert.equal(persistence.save({ name: 'In-memory only' }), false);
  for (const key of GUEST_RESUME_KEYS) assert.equal(storage.records.has(key), false);
  assert.equal(storage.records.get(GUEST_RESUME_PREFERENCE_KEY), '{"version":1,"enabled":false}');
  assert.equal([...storage.records.keys()].some(key => key.includes('session')), false);
});

test('guest toggle transitions retain preference and save the current resume when enabled', () => {
  const storage = createStorage();
  const persistence = createGuestResumeStorage(storage, normalize);
  const project = { name: 'Current in-memory draft' };

  persistence.setEnabled(false);
  assert.equal(persistence.save(project), false);
  persistence.setEnabled(true);
  assert.equal(persistence.save(project), true);

  const refreshed = createGuestResumeStorage(storage, normalize);
  assert.equal(refreshed.enabled, true);
  assert.deepEqual(refreshed.load().state, project);
});

test('corrupted saved resumes are reported for recovery without silently replacing data', () => {
  const raw = '{"name":';
  const storage = createStorage({ resumeStudioV2: raw });
  const persistence = createGuestResumeStorage(storage, normalize);
  const result = persistence.load();

  assert.equal(result.state, null);
  assert.equal(result.raw, raw);
  assert.ok(result.error);
  assert.equal(storage.records.get('resumeStudioV2'), raw);
});

test('storage quota and preference write failures are surfaced', () => {
  const storage = createStorage();
  const persistence = createGuestResumeStorage(storage, normalize);
  storage.setItem = () => { throw new Error('Storage quota exceeded'); };

  assert.throws(() => persistence.save({ name: 'Draft' }), /Storage quota exceeded/);
  assert.throws(() => persistence.setEnabled(false), /Storage quota exceeded/);
  assert.equal(persistence.enabled, false);
});

test('authenticated session reopens the last-worked resume before considering a guest draft', () => {
  assert.deepEqual(chooseAuthenticatedResume({
    hasGuestDraft: true,
    resumes: [{ id: 'latest-cloud-resume' }, { id: 'last-worked-resume' }],
    lastWorkedResumeId: 'last-worked-resume'
  }), { type: 'open-cloud-resume', resumeId: 'last-worked-resume' });
  assert.deepEqual(chooseAuthenticatedResume({
    hasGuestDraft: true,
    resumes: []
  }), { type: 'migrate-guest-copy' });
  assert.deepEqual(chooseAuthenticatedResume({
    hasGuestDraft: false,
    resumes: []
  }), { type: 'create-cloud-resume' });
});

test('authenticated persistence stays in cloud with browser saving either on or off', () => {
  const user = { uid: 'account-1' };

  assert.equal(resumeStorageMode(user, true), 'cloud');
  assert.equal(resumeStorageMode(user, false), 'cloud');
  assert.equal(resumeStorageMode(null, true), 'browser');
  assert.equal(resumeStorageMode(null, false), 'memory');
});

test('browser save toggle is shown only after auth resolves to a guest session', () => {
  assert.equal(shouldShowBrowserSaveToggle(null, false), false);
  assert.equal(shouldShowBrowserSaveToggle({ uid: 'account-1' }, true), false);
  assert.equal(shouldShowBrowserSaveToggle(null, true), true);
});

test('login, logout, and account switching are distinct session transitions', () => {
  assert.equal(resolveAuthTransition(null, 'account-1'), 'guest-login');
  assert.equal(resolveAuthTransition('account-1', null), 'logout');
  assert.equal(resolveAuthTransition('account-1', 'account-2'), 'account-switch');
  assert.equal(resolveAuthTransition('account-1', 'account-1'), 'unchanged');
});
