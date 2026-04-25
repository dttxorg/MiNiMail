import { buildDeepScanPreview } from '../src/shared/email-ai/deepScanPreview';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testDeepScanPreviewIncludesActionDeadlineAndReplyHints() {
  const preview = buildDeepScanPreview({
    subject: '请明天下午 3 点前确认并回复合同审批',
    from: 'legal@example.com',
    fromName: '法务团队',
    snippet: '请在 2026-04-21 前确认是否批准该合同。',
    bodyText: [
      '你好，',
      '请在 2026-04-21 15:00 前确认是否批准该合同。',
      '请回复你的审批意见，我们需要在今天完成签署流程。',
      '',
      '谢谢，',
      '法务团队',
    ].join('\n'),
  });

  assert(preview.includes('Actions:'), '预期 deep scan 预览包含 Actions 段落');
  assert(preview.includes('Deadlines:'), '预期 deep scan 预览包含 Deadlines 段落');
  assert(preview.includes('Reply suggestion:'), '预期 deep scan 预览包含回复建议段落');
  assert(preview.includes('2026-04-21'), '预期 deep scan 预览包含截止日期');
}

testDeepScanPreviewIncludesActionDeadlineAndReplyHints();

console.log('deep-scan-preview tests passed');
