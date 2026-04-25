const assert = require('node:assert/strict');

async function run() {
  const {
    cancelMailBackupTask,
    isMailBackupTaskCancelled,
    runMailBackupTaskWithCleanup,
  } = await import('../src/main/services/mailBackupTasks.ts');

  await runMailBackupTaskWithCleanup('backup-cleanup-success', async () => {
    assert.equal(cancelMailBackupTask('backup-cleanup-success'), true);
    assert.equal(isMailBackupTaskCancelled('backup-cleanup-success'), true);
    return null;
  });
  assert.equal(isMailBackupTaskCancelled('backup-cleanup-success'), false);

  await assert.rejects(
    runMailBackupTaskWithCleanup('backup-cleanup-error', async () => {
      assert.equal(cancelMailBackupTask('backup-cleanup-error'), true);
      assert.equal(isMailBackupTaskCancelled('backup-cleanup-error'), true);
      throw new Error('simulated backup failure');
    }),
    /simulated backup failure/,
  );
  assert.equal(isMailBackupTaskCancelled('backup-cleanup-error'), false);

  await runMailBackupTaskWithCleanup('backup-cleanup-cancelled', async () => {
    assert.equal(cancelMailBackupTask('backup-cleanup-cancelled'), true);
    assert.equal(isMailBackupTaskCancelled('backup-cleanup-cancelled'), true);
    return {
      taskId: 'backup-cleanup-cancelled',
      success: false,
      cancelled: true,
    };
  });
  assert.equal(isMailBackupTaskCancelled('backup-cleanup-cancelled'), false);

  assert.equal(cancelMailBackupTask(''), false);

  console.log('mail backup task cleanup regression tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
