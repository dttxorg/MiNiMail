export type DemoMailCategory = '重要' | '更新' | '通知' | '待回复';
export type DemoFolderId = 'inbox' | 'priority' | 'starred' | 'sent' | 'all';

export interface DemoAccount {
  name: string;
  email: string;
  initials: string;
}

export interface DemoFolder {
  id: DemoFolderId;
  label: string;
}

export interface DemoMail {
  id: string;
  folder: DemoFolderId;
  sender: string;
  senderDetail: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  category: DemoMailCategory;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  aiSummary: string;
  keyInfo: string[];
  suggestedReply: string;
}

export interface DemoScheduledJob {
  id: string;
  subject: string;
  to: string;
  scheduledFor: string;
  status: 'scheduled' | 'failed' | 'missed';
}

export const demoAccounts: DemoAccount[] = [
  {
    name: '主邮箱',
    email: 'demo@minimail.local',
    initials: 'MM',
  },
];

export const demoFolders: DemoFolder[] = [
  { id: 'inbox', label: '收件箱' },
  { id: 'priority', label: '重要' },
  { id: 'starred', label: '星标' },
  { id: 'sent', label: '已发送' },
  { id: 'all', label: '全部' },
];

export const demoMails: DemoMail[] = [
  {
    id: 'mail-1',
    folder: 'priority',
    sender: '产品发布小组',
    senderDetail: 'release@minimail.example',
    subject: 'Android 测试版体验清单',
    preview: '这版移动端先聚焦账号入口、收件箱处理、写信草稿和 AI 操作，不假装邮件协议已经完成。',
    body: 'Android 测试版需要先把迁移方向变得可触摸：收件箱要有密度，邮件详情要能看到 AI 摘要，写信入口要明确，向量记忆要展示未来从桌面端同步索引的位置。',
    time: '09:24',
    category: '重要',
    unread: true,
    starred: true,
    hasAttachment: false,
    aiSummary: '优先检查移动端主流程：收件箱、邮件详情、AI 摘要、写信入口和向量记忆占位。',
    keyInfo: ['测试版只使用本地演示数据', '真实 IMAP/SMTP 会接在平台服务层后面', '向量记忆建议由桌面端生成后局域网同步'],
    suggestedReply: '收到。我会先验证 Android 测试版的主流程，并把真实邮件收发放在下一阶段接入。',
  },
  {
    id: 'mail-2',
    folder: 'inbox',
    sender: '设计记录',
    senderDetail: 'ux@minimail.example',
    subject: '移动端收件箱密度调整',
    preview: '界面应该像一个真正的邮件工具：安静、清晰、可扫描，而不是展示页。',
    body: '移动端不应该只是平铺卡片。它需要有清楚的账号区域、文件夹切换、搜索、邮件状态、阅读操作和 AI 工作区。按钮和信息密度要适合反复使用。',
    time: '昨天',
    category: '更新',
    unread: false,
    starred: false,
    hasAttachment: true,
    aiSummary: '移动 UI 要更接近桌面 MiNiMail 的工具感：信息密度、稳定操作和清晰状态优先。',
    keyInfo: ['增加文件夹切换和搜索', '邮件可以标记已读、星标、归档', '写信面板要能编辑内容'],
    suggestedReply: '同意。我会把 demo 从静态页面调整为可交互的移动邮件工作台。',
  },
  {
    id: 'mail-3',
    folder: 'inbox',
    sender: '向量记忆同步',
    senderDetail: 'local-sync@minimail.example',
    subject: '局域网同步向量快照方案',
    preview: '桌面端负责构建加密向量快照，移动端导入后做低功耗语义检索。',
    body: '移动端默认不重新索引整个邮箱。桌面端可以导出包含模型、维度、分块版本、校验值和加密信息的快照，手机只导入兼容索引。',
    time: '周一',
    category: '通知',
    unread: false,
    starred: false,
    hasAttachment: false,
    aiSummary: '移动端不放弃深度 AI，但重计算交给桌面端，手机通过局域网导入向量快照。',
    keyInfo: ['桌面端生成索引', '手机端导入快照', '版本、维度、校验值必须匹配'],
    suggestedReply: '这个方向可行。移动端先保留导入入口，等桌面端索引稳定后再接真实同步。',
  },
  {
    id: 'mail-4',
    folder: 'sent',
    sender: '我',
    senderDetail: 'demo@minimail.local',
    subject: 'Re: Android 测试版体验清单',
    preview: '我会先交付一个可安装、可点击、中文界面的 Android demo。',
    body: '我会先把 demo 做成中文移动邮件工作台，覆盖收件箱、详情、写信、AI、定时发送和向量同步占位。',
    time: '08:58',
    category: '待回复',
    unread: false,
    starred: false,
    hasAttachment: false,
    aiSummary: '已发送一封关于 Android demo 下一步的回复。',
    keyInfo: ['中文界面', '可交互 demo', '后续接入真实服务'],
    suggestedReply: '好的，我会继续推进下一版。',
  },
];

export const demoScheduledJobs: DemoScheduledJob[] = [
  {
    id: 'job-1',
    subject: '明早发送 Android 体验反馈',
    to: 'release@minimail.example',
    scheduledFor: '明天 09:00',
    status: 'scheduled',
  },
  {
    id: 'job-2',
    subject: '补发移动端 UI 修改说明',
    to: 'ux@minimail.example',
    scheduledFor: '今天 18:00',
    status: 'failed',
  },
];

export const demoMemorySnapshot = {
  name: '桌面端向量快照',
  documents: 1284,
  model: 'text-embedding-3-small',
  size: '42 MB',
  checksum: 'a8f3...91c2',
};
