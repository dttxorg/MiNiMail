import assert from 'node:assert/strict';
import {
  cancelScheduledSendJob,
  closeScheduledSendDb,
  configureScheduledSendDbForTests,
  createScheduledSendJob,
  getScheduledSendJob,
  initScheduledSendSchema,
  listScheduledSendJobs,
  markMissedScheduledJobs,
  markScheduledJobFailed,
  markScheduledJobSent,
  restoreScheduledSendJobs,
  sanitizeScheduledFailureReason,
  tryMarkJobSending,
} from '../src/main/services/scheduledSendService';

type Row = {
  id: string;
  local_send_id: string;
  account_id: number;
  from_email: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  editable_body: string;
  outgoing_attachments_json: string;
  draft_payload_json: string | null;
  sent_folder_path: string | null;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'missed';
  created_at: string;
  updated_at: string;
  failure_reason: string | null;
  last_attempt_at: string | null;
  sent_message_id: string | null;
};

function createFakeScheduledDb() {
  const rows: Row[] = [];
  const executedSql: string[] = [];

  return {
    rows,
    executedSql,
    exec(sql: string) {
      executedSql.push(sql);
    },
    pragma() {
      return undefined;
    },
    close() {
      return undefined;
    },
    prepare(sql: string) {
      return {
        run(params: Record<string, unknown> = {}) {
          if (sql.includes('INSERT INTO scheduled_send_jobs')) {
            rows.push({
              id: String(params.id),
              local_send_id: String(params.localSendId),
              account_id: Number(params.accountId),
              from_email: String(params.fromEmail || ''),
              to_json: String(params.toJson || '[]'),
              cc_json: String(params.ccJson || '[]'),
              bcc_json: String(params.bccJson || '[]'),
              subject: String(params.subject || ''),
              body_text: String(params.bodyText || ''),
              body_html: params.bodyHtml == null ? null : String(params.bodyHtml),
              editable_body: String(params.editableBody || ''),
              outgoing_attachments_json: String(params.outgoingAttachmentsJson || '[]'),
              draft_payload_json: params.draftPayloadJson == null ? null : String(params.draftPayloadJson),
              sent_folder_path: params.sentFolderPath == null ? null : String(params.sentFolderPath),
              scheduled_at: String(params.scheduledAt),
              status: 'scheduled',
              created_at: String(params.createdAt),
              updated_at: String(params.createdAt),
              failure_reason: null,
              last_attempt_at: null,
              sent_message_id: null,
            });
            return { changes: 1 };
          }

          if (sql.includes("SET status = 'cancelled'")) {
            const row = rows.find((item) => item.id === params.id);
            if (!row || !['scheduled', 'missed', 'failed'].includes(row.status)) return { changes: 0 };
            row.status = 'cancelled';
            row.updated_at = String(params.updatedAt);
            return { changes: 1 };
          }

          if (sql.includes("SET status = 'missed'")) {
            let changes = 0;
            for (const row of rows) {
              if (row.status === 'scheduled' && row.scheduled_at <= String(params.nowValue)) {
                row.status = 'missed';
                row.updated_at = String(params.updatedAt);
                changes += 1;
              }
            }
            return { changes };
          }

          if (sql.includes("SET status = 'sending'")) {
            const row = rows.find((item) => item.id === params.id);
            if (!row || !['scheduled', 'missed', 'failed'].includes(row.status)) return { changes: 0 };
            row.status = 'sending';
            row.updated_at = String(params.now);
            row.last_attempt_at = String(params.now);
            return { changes: 1 };
          }

          if (sql.includes("SET status = 'failed'")) {
            const row = rows.find((item) => item.id === params.id);
            if (!row) return { changes: 0 };
            row.status = 'failed';
            row.failure_reason = String(params.failureReason || '');
            row.updated_at = String(params.now);
            row.last_attempt_at ||= String(params.now);
            return { changes: 1 };
          }

          if (sql.includes("SET status = 'sent'")) {
            const row = rows.find((item) => item.id === params.id);
            if (!row) return { changes: 0 };
            row.status = 'sent';
            row.sent_message_id = params.sentMessageId == null ? null : String(params.sentMessageId);
            row.updated_at = String(params.now);
            return { changes: 1 };
          }

          throw new Error('Unsupported fake scheduled send run statement');
        },
        get(param?: unknown) {
          if (!sql.includes('SELECT * FROM scheduled_send_jobs WHERE id = ?')) {
            throw new Error('Unsupported fake scheduled send get statement');
          }
          return rows.find((item) => item.id === String(param));
        },
        all(params: Record<string, unknown> = {}) {
          if (!sql.includes('SELECT * FROM scheduled_send_jobs')) {
            throw new Error('Unsupported fake scheduled send all statement');
          }
          return rows
            .filter((row) => params.accountId == null || row.account_id === Number(params.accountId))
            .filter((row) => {
              const statusFilters = Object.entries(params)
                .filter(([key]) => key.startsWith('status'))
                .map(([, value]) => value);
              return statusFilters.length === 0 || statusFilters.includes(row.status);
            })
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.created_at.localeCompare(b.created_at));
        },
      };
    },
  };
}

const fakeDb = createFakeScheduledDb();
configureScheduledSendDbForTests(fakeDb);

try {
  initScheduledSendSchema();
  initScheduledSendSchema();
  assert(
    fakeDb.executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS scheduled_send_jobs')),
    'schema initialization should create the scheduled send table idempotently',
  );

  const job = createScheduledSendJob({
    localSendId: 'local-send-one',
    accountId: 1,
    fromEmail: 'sender-fixture',
    to: ['recipient-fixture'],
    cc: ['cc-fixture'],
    bcc: [],
    subject: 'fixture-subject-redacted',
    bodyText: 'fixture-body-redacted',
    bodyHtml: '<p>fixture-body-redacted</p>',
    editableBody: 'fixture-editable-redacted',
    outgoingAttachments: [{ kind: 'fixture', id: 'attachment-fixture' }],
    draftPayload: { draftKey: 'draft-fixture' },
    sentFolderPath: '[Fixture]/Sent',
    scheduledAt: '2030-01-01T10:00:00.000Z',
  });

  assert.equal(job.status, 'scheduled', 'new job should start as scheduled');
  assert.equal(job.localSendId, 'local-send-one');
  assert.deepEqual(job.to, ['recipient-fixture']);
  assert.equal(job.subject, 'fixture-subject-redacted');
  assert.equal(job.bodyText, 'fixture-body-redacted');
  assert.equal(listScheduledSendJobs({ status: 'scheduled' }).length, 1, 'list should return scheduled jobs');

  assert.equal(cancelScheduledSendJob(job.id)?.status, 'cancelled', 'cancel should update status');
  assert.equal(tryMarkJobSending(job.id), false, 'cancelled job should not be lockable for sending');

  const pastJob = createScheduledSendJob({
    accountId: 1,
    scheduledAt: '2020-01-01T00:00:00.000Z',
    subject: 'past-fixture-subject',
    bodyText: 'past-fixture-body',
  });
  const futureJob = createScheduledSendJob({
    accountId: 1,
    scheduledAt: '2030-01-01T00:00:00.000Z',
    subject: 'future-fixture-subject',
    bodyText: 'future-fixture-body',
  });

  const restored = restoreScheduledSendJobs('2026-04-30T00:00:00.000Z');
  assert.equal(restored.missedCount, 1, 'restore should mark past scheduled jobs missed');
  assert.equal(getScheduledSendJob(pastJob.id)?.status, 'missed', 'past job should become missed');
  assert.equal(getScheduledSendJob(futureJob.id)?.status, 'scheduled', 'future job should remain scheduled');
  assert.equal(markMissedScheduledJobs('2026-04-30T00:00:00.000Z'), 0, 'mark missed should be idempotent');

  assert.equal(tryMarkJobSending(pastJob.id), true, 'missed job should be lockable for explicit retry');
  assert.equal(tryMarkJobSending(pastJob.id), false, 'same job should not be lockable twice');
  const failed = markScheduledJobFailed(
    pastJob.id,
    new Error(`fixture-secret-subject\n${'x'.repeat(400)}`),
  );
  assert.equal(failed?.status, 'failed', 'mark failed should set failed status');
  assert.equal(failed?.failureReason?.includes('\n'), false, 'failure reason should be single-line');
  assert((failed?.failureReason?.length || 0) <= 240, 'failure reason should be truncated');
  assert.equal(tryMarkJobSending(pastJob.id), true, 'failed job should be lockable for retry');

  const sent = markScheduledJobSent(pastJob.id, 'message-fixture');
  assert.equal(sent?.status, 'sent', 'mark sent should set sent status');
  assert.equal(sent?.sentMessageId, 'message-fixture', 'mark sent should persist sent message id');
  assert.equal(tryMarkJobSending(pastJob.id), false, 'sent job should not be lockable');

  const secondJob = createScheduledSendJob({
    accountId: 1,
    scheduledAt: '2030-02-01T00:00:00.000Z',
    subject: 'second-fixture-subject',
    bodyText: 'second-fixture-body',
  });
  assert.equal(tryMarkJobSending(secondJob.id), true, 'scheduled job should be lockable once');
  assert.equal(tryMarkJobSending(secondJob.id), false, 'status lock should prevent duplicate sends');

  assert.equal(
    sanitizeScheduledFailureReason('line one\r\nline two\tline three'),
    'line one line two line three',
    'sanitizer should collapse whitespace',
  );
} finally {
  closeScheduledSendDb();
}
