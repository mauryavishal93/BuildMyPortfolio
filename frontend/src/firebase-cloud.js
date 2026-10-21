const firebaseConfig = {
  apiKey: 'AIzaSyCxl9HVMLrWJg-H9RxaEAVJJJk6iiWlIVU',
  authDomain: 'buildmyportfolio-5b714.firebaseapp.com',
  projectId: 'buildmyportfolio-5b714',
  appId: '1:1044468425413:web:b7bd4d482eb7d9b67146ac'
};

export const cloudConfigured = Object.values(firebaseConfig).every(value => typeof value === 'string' && value.length > 0);

let servicesPromise;

async function getServices() {
  if (!cloudConfigured) throw new Error('Cloud saving is not configured yet.');
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore')
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
      return {
        auth: authSdk.getAuth(app),
        authSdk,
        db: firestoreSdk.getFirestore(app),
        firestoreSdk
      };
    });
  }
  return servicesPromise;
}

function resumeCollection(firestoreSdk, db, uid) {
  return firestoreSdk.collection(db, 'users', uid, 'resumes');
}

export function observeAuth(callback) {
  if (!cloudConfigured) {
    callback(null, new Error('Cloud saving is not configured yet.'));
    return () => {};
  }
  let cancelled = false;
  let unsubscribe = () => {};
  getServices().then(({ auth, authSdk }) => {
    if (cancelled) return;
    unsubscribe = authSdk.onAuthStateChanged(auth, user => callback(user, null), error => callback(null, error));
  }).catch(error => {
    if (!cancelled) callback(null, error);
  });
  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function signInWithGoogle() {
  const { auth, authSdk } = await getServices();
  await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
}

export async function signOutUser() {
  const { auth, authSdk } = await getServices();
  await authSdk.signOut(auth);
}

export async function getFirebaseIdToken(user) {
  const { auth } = await getServices();
  const signedInUser = auth.currentUser;
  if (!user || !signedInUser || signedInUser.uid !== user.uid) {
    throw new Error('Sign in before accessing paid plans.');
  }
  return signedInUser.getIdToken();
}

export async function listResumes(uid) {
  const { db, firestoreSdk } = await getServices();
  const result = await firestoreSdk.getDocs(firestoreSdk.query(
    resumeCollection(firestoreSdk, db, uid),
    firestoreSdk.orderBy('updatedAt', 'desc')
  ));
  return result.docs.map(snapshot => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      name: data.name,
      state: data.state,
      revision: data.revision,
      updatedAt: data.updatedAt?.toMillis?.() ?? 0
    };
  });
}

export async function saveResume(uid, id, name, state, expectedRevision = null) {
  const stateJson = JSON.stringify(state);
  const encoder = new TextEncoder();
  const documentSize = encoder.encode(stateJson).byteLength + encoder.encode(name).byteLength;
  if (documentSize > 800 * 1024) {
    throw new Error('This resume is too large to sync safely. Remove large images or content, then try again.');
  }

  const { db, firestoreSdk } = await getServices();
  const collectionRef = resumeCollection(firestoreSdk, db, uid);
  const ref = id ? firestoreSdk.doc(collectionRef, id) : firestoreSdk.doc(collectionRef);
  const revision = await firestoreSdk.runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) {
      const currentRevision = snapshot.data().revision;
      if (expectedRevision === null || currentRevision !== expectedRevision) {
        throw new Error('This resume was changed elsewhere. Reload it from your cloud resume list before continuing.');
      }
      const nextRevision = currentRevision + 1;
      transaction.set(ref, {
        name: name.slice(0, 120),
        state,
        revision: nextRevision,
        createdAt: snapshot.data().createdAt,
        updatedAt: firestoreSdk.serverTimestamp()
      });
      return nextRevision;
    }
    if (expectedRevision !== null) {
      throw new Error('This cloud resume no longer exists. Refresh your cloud resume list before continuing.');
    }
    transaction.set(ref, {
      name: name.slice(0, 120),
      state,
      revision: 1,
      createdAt: firestoreSdk.serverTimestamp(),
      updatedAt: firestoreSdk.serverTimestamp()
    });
    return 1;
  });
  return { id: ref.id, revision };
}

export async function deleteResume(uid, id) {
  const { db, firestoreSdk } = await getServices();
  await firestoreSdk.deleteDoc(firestoreSdk.doc(resumeCollection(firestoreSdk, db, uid), id));
}
