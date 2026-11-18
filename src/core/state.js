import { createEmptyCatalog, MODEL_VERSION } from './catalog.js';
import { createSelectionDraft } from './selection.js';
import { createInitialTask } from './task-builder.js';
import { migrateStoredState } from './state-model.js';

export let catalog = createEmptyCatalog();
export let selectionDraft = createSelectionDraft(catalog);
export const exportTask = createInitialTask();
// The old UI, runner and download APIs continue to use this task-only alias.
export const exportState = exportTask;

function overwriteTask(next) {
  Object.keys(exportTask).forEach(key => delete exportTask[key]);
  Object.assign(exportTask, next);
}

export function replaceCatalog(nextCatalog) {
  catalog = structuredClone(nextCatalog);
  selectionDraft = createSelectionDraft(catalog, selectionDraft.selectedDocumentIds);
}

export function setSelectionDraft(selectedIds) {
  selectionDraft = createSelectionDraft(catalog, selectedIds);
  return structuredClone(selectionDraft);
}

export function resetExportState() {
  overwriteTask(createInitialTask());
  catalog = createEmptyCatalog();
  selectionDraft = createSelectionDraft(catalog);
  return exportState;
}

export async function saveState() {
  // The marker makes these keys authoritative, even for an empty/reset task.
  // Legacy keys can remain on disk but cannot resurrect a cleared task.
  await chrome.storage.local.set(structuredClone({
    stateVersion: MODEL_VERSION, catalog, selectionDraft, exportTask
  }));
}

export async function loadState() {
  try {
    const stored = await chrome.storage.local.get([
      'stateVersion', 'catalog', 'selectionDraft', 'exportTask', 'exportState', 'fileInfo'
    ]);
    const next = migrateStoredState(stored);
    // Commit migration first: a storage error must not activate a half-migrated task.
    if (next.migrated) {
      await chrome.storage.local.set(structuredClone({ stateVersion: MODEL_VERSION,
        catalog: next.catalog, selectionDraft: next.selectionDraft, exportTask: next.exportTask }));
    }
    catalog = next.catalog;
    selectionDraft = next.selectionDraft;
    overwriteTask(next.exportTask);
    return { restored: stored.exportState !== undefined || stored.stateVersion === MODEL_VERSION,
      migrated: next.migrated };
  } catch (error) {
    return { restored: false, error };
  }
}

