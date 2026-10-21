const PROJECT_KEYS = ['resumeStudioV2', 'resumeStudioProject'];

export function readSavedProject(storage, normalize) {
  let firstFailure = null;

  for (const key of PROJECT_KEYS) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      return { state: null, key, raw: null, error, storageUnavailable: true };
    }
    if (raw === null) continue;

    try {
      const state = normalize(JSON.parse(raw));
      return {
        state,
        key,
        raw: firstFailure?.raw ?? null,
        error: firstFailure?.error ?? null,
        failedKey: firstFailure?.key ?? null
      };
    } catch (error) {
      firstFailure ??= { key, raw, error };
    }
  }

  if (firstFailure) return { state: null, ...firstFailure };
  return { state: null, key: null, raw: null, error: null, failedKey: null };
}
