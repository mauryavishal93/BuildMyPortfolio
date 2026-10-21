import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedProject } from '../frontend/src/project-storage.js';

const normalize = value => {
  if (!value || typeof value.name !== 'string') throw new Error('Invalid project');
  return value;
};

function storage(values) {
  return {
    getItem(key) {
      return Object.hasOwn(values, key) ? values[key] : null;
    }
  };
}

test('loads the current saved project without a recovery warning', () => {
  const project = { name: 'Current resume' };
  const result = readSavedProject(storage({ resumeStudioV2: JSON.stringify(project) }), normalize);
  assert.deepEqual(result.state, project);
  assert.equal(result.error, null);
  assert.equal(result.raw, null);
});

test('uses a valid legacy project but preserves unreadable current data for recovery', () => {
  const legacy = { name: 'Older resume' };
  const invalidCurrent = '{"name":';
  const result = readSavedProject(storage({
    resumeStudioV2: invalidCurrent,
    resumeStudioProject: JSON.stringify(legacy)
  }), normalize);
  assert.deepEqual(result.state, legacy);
  assert.equal(result.raw, invalidCurrent);
  assert.equal(result.failedKey, 'resumeStudioV2');
  assert.ok(result.error);
});

test('reports invalid saved data rather than silently treating it as a new project', () => {
  const raw = '{"unexpected":true}';
  const result = readSavedProject(storage({ resumeStudioV2: raw }), normalize);
  assert.equal(result.state, null);
  assert.equal(result.raw, raw);
  assert.ok(result.error);
});

test('reports browser storage access failures', () => {
  const result = readSavedProject({
    getItem() {
      throw new Error('Storage blocked');
    }
  }, normalize);
  assert.equal(result.state, null);
  assert.equal(result.storageUnavailable, true);
  assert.ok(result.error);
});
