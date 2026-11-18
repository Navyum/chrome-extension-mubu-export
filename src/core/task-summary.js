export function summarizeTask(task) {
  const counts = { success: 0, failed: 0, in_progress: 0, pending: 0 };
  for (const file of task.fileList) {
    if (Object.hasOwn(counts, file.status)) counts[file.status]++;
  }
  return {
    totalFiles: task.fileList.length, exportedFiles: counts.success,
    successCount: counts.success, failedCount: counts.failed,
    inProgressCount: counts.in_progress, pendingCount: counts.pending,
    processedFiles: counts.success + counts.failed
  };
}
