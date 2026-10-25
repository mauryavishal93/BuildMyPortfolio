import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseCloudClient } from '../frontend/src/firebase-cloud.js';

function createFakeFirebase() {
  const records = new Map();
  let generatedId = 0;
  const auth = {
    currentUser: {
      uid: 'user-1',
      getIdToken: async () => 'firebase-token'
    }
  };
  let authObserver;
  let signedInWith;
  let signedOut = false;
  const appSdk = {
    getApps: () => [],
    initializeApp: config => ({ config }),
    getApp: () => ({})
  };
  class GoogleAuthProvider {}
  const authSdk = {
    getAuth: () => auth,
    GoogleAuthProvider,
    signInWithPopup: async (_auth, provider) => { signedInWith = provider; },
    signOut: async () => { signedOut = true; },
    onAuthStateChanged: (_auth, next) => {
      authObserver = next;
      return () => { authObserver = null; };
    }
  };
  const firestoreSdk = {
    getFirestore: () => ({}),
    collection: (_db, ...segments) => ({ path: segments.join('/') }),
    doc: (parent, id) => {
      const key = `${parent.path}/${id || `resume-${++generatedId}`}`;
      return { key, id: key.split('/').at(-1) };
    },
    orderBy: (field, direction) => ({ field, direction }),
    query: collection => collection,
    getDocs: async collection => ({
      docs: [...records.entries()]
        .filter(([key]) => key.startsWith(`${collection.path}/`))
        .map(([key, data]) => ({
          id: key.split('/').at(-1),
          data: () => data
        }))
    }),
    runTransaction: async (_db, callback) => callback({
      get: async ref => ({
        exists: () => records.has(ref.key),
        data: () => records.get(ref.key)
      }),
      set: (ref, value, options = {}) => {
        records.set(ref.key, options.merge ? { ...records.get(ref.key), ...value } : value);
      }
    }),
    serverTimestamp: () => ({ toMillis: () => 1_700_000_000_000 }),
    deleteDoc: async ref => { records.delete(ref.key); }
  };
  const client = createFirebaseCloudClient({
    config: { projectId: 'test-project' },
    loadSdk: async () => [appSdk, authSdk, firestoreSdk]
  });
  return {
    client,
    auth,
    records,
    GoogleAuthProvider,
    get signedInWith() { return signedInWith; },
    get signedOut() { return signedOut; },
    emitAuth(user) { authObserver?.(user); }
  };
}

test('Google auth, token ownership, and auth observer lifecycle use the signed-in account', async () => {
  const firebase = createFakeFirebase();
  let observedUser;
  const stopObserving = firebase.client.observeAuth(user => { observedUser = user; });
  await new Promise(resolve => setImmediate(resolve));
  firebase.emitAuth(firebase.auth.currentUser);
  assert.equal(observedUser.uid, 'user-1');

  await firebase.client.signInWithGoogle();
  assert.ok(firebase.signedInWith instanceof firebase.GoogleAuthProvider);
  assert.equal(await firebase.client.getFirebaseIdToken(firebase.auth.currentUser), 'firebase-token');
  await assert.rejects(firebase.client.getFirebaseIdToken({ uid: 'someone-else' }), /Sign in/);
  await firebase.client.signOutUser();
  assert.equal(firebase.signedOut, true);
  stopObserving();
});

test('cloud resume create, list, revision update, conflict detection, and delete are scoped per user', async () => {
  const firebase = createFakeFirebase();
  const firstState = { profile: { name: 'Alex' } };
  const created = await firebase.client.saveResume('user-1', null, 'First resume', firstState);
  assert.deepEqual(created, { id: 'resume-1', revision: 1 });
  assert.ok(firebase.records.has('users/user-1/resumes/resume-1'));

  const listed = await firebase.client.listResumes('user-1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'First resume');
  assert.deepEqual(listed[0].state, firstState);

  const updated = await firebase.client.saveResume(
    'user-1', created.id, 'Updated resume', { profile: { name: 'Alex M.' } }, 1
  );
  assert.equal(updated.revision, 2);
  await assert.rejects(
    firebase.client.saveResume('user-1', created.id, 'Stale edit', firstState, 1),
    /changed elsewhere/
  );
  assert.equal((await firebase.client.listResumes('user-2')).length, 0);

  await firebase.client.deleteResume('user-1', created.id);
  assert.equal((await firebase.client.listResumes('user-1')).length, 0);
});
