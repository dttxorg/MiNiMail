const cancelledTaskIds = new Set<string>();

export function cancelMailBackupTask(taskId: string): boolean {
  if (!taskId) return false;
  cancelledTaskIds.add(taskId);
  return true;
}

export function isMailBackupTaskCancelled(taskId: string): boolean {
  return Boolean(taskId) && cancelledTaskIds.has(taskId);
}

export async function runMailBackupTaskWithCleanup<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
  // Clear any stale cancel flag before starting, so a reused taskId from a
  // previous task that was cancelled but whose finally() hasn't run yet
  // cannot poison the new task. The set only ever holds IDs the user
  // explicitly cancelled in the current "live" window.
  if (taskId) cancelledTaskIds.delete(taskId);
  try {
    return await operation();
  } finally {
    if (taskId) {
      cancelledTaskIds.delete(taskId);
    }
  }
}
