export interface CachedMailListQueryInput {
  accountId: number;
  folder: string;
  historyCutoffIso?: string | null;
  limit?: number;
  offset?: number;
}

export interface CachedMailListQuery {
  sql: string;
  params: Array<number | string>;
}

export function buildCachedMailListQuery(input: CachedMailListQueryInput): CachedMailListQuery {
  const where = ['account_id = ?', 'folder = ?'];
  const params: Array<number | string> = [input.accountId, input.folder];

  if (input.historyCutoffIso) {
    where.push('datetime(date) >= datetime(?)');
    params.push(input.historyCutoffIso);
  }

  let windowSql = '';
  const limit = Number.isFinite(input.limit) && input.limit != null && input.limit > 0
    ? Math.floor(input.limit)
    : null;
  const offset = Number.isFinite(input.offset) && input.offset != null && input.offset > 0
    ? Math.floor(input.offset)
    : 0;

  if (limit != null) {
    windowSql += ' LIMIT ?';
    params.push(limit);
    if (offset > 0) {
      windowSql += ' OFFSET ?';
      params.push(offset);
    }
  } else if (offset > 0) {
    windowSql += ' LIMIT -1 OFFSET ?';
    params.push(offset);
  }

  return {
    sql: `
      SELECT id, uid, "from", from_name, "to", subject, date, snippet,
             has_attachments, is_read, is_starred, folder, account_id, cached_at,
             message_id, in_reply_to, references_header, draft_payload, local_draft_id, local_send_id, delivery_state, delivery_error, category, is_scanned, scan_result
      FROM mail_cache
      WHERE ${where.join(' AND ')}
      ORDER BY uid DESC
      ${windowSql}
    `,
    params,
  };
}
