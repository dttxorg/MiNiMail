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
  try {
    return await operation();
  } finally {
    if (taskId) {
      cancelledTaskIds.delete(taskId);
    }
  }
}
