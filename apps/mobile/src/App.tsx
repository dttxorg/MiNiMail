import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from 'react-native';
import type { MiNiMailPlatformServices } from '@minimail/core';
import {
  demoAccounts,
  demoFolders,
  demoMails,
  demoMemorySnapshot,
  demoScheduledJobs,
  type DemoFolderId,
  type DemoMail,
  type DemoScheduledJob,
} from './data/mobileDemoData';
import { createMobilePlatformServices } from './platform/services/mobilePlatformServices';

type DemoTab = 'mail' | 'ai' | 'schedule' | 'memory';
type MailState = DemoMail & { localUnread: boolean; localStarred: boolean; archived: boolean };
type ScheduleState = Omit<DemoScheduledJob, 'status'> & {
  status: DemoScheduledJob['status'] | 'sent' | 'cancelled';
};

export default function App() {
  const services = useMemo<MiNiMailPlatformServices>(() => createMobilePlatformServices(), []);
  const [activeTab, setActiveTab] = useState<DemoTab>('mail');
  const [activeFolder, setActiveFolder] = useState<DemoFolderId>('inbox');
  const [query, setQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState('就绪');
  const [memoryStatus, setMemoryStatus] = useState<'missing' | 'importing' | 'ready'>('missing');
  const [composeMode, setComposeMode] = useState<'closed' | 'new' | 'reply'>('closed');
  const [composeText, setComposeText] = useState('收到。我会先验证这版移动端体验，再继续推进下一版。');
  const [mails, setMails] = useState<MailState[]>(
    demoMails.map((mail) => ({
      ...mail,
      localUnread: mail.unread,
      localStarred: mail.starred,
      archived: false,
    }))
  );
  const [jobs, setJobs] = useState<ScheduleState[]>(demoScheduledJobs);
  const [selectedMailId, setSelectedMailId] = useState(demoMails[0]?.id ?? '');
  const selectedMail = mails.find((mail) => mail.id === selectedMailId) ?? mails[0];
  const visibleMails = mails.filter((mail) => {
    const matchesFolder = activeFolder === 'all'
      ? !mail.archived
      : activeFolder === 'starred'
        ? mail.localStarred && !mail.archived
        : activeFolder === 'sent'
          ? mail.folder === 'sent'
          : mail.folder === activeFolder && !mail.archived;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery
      || mail.sender.toLowerCase().includes(normalizedQuery)
      || mail.subject.toLowerCase().includes(normalizedQuery)
      || mail.preview.toLowerCase().includes(normalizedQuery);
    return matchesFolder && matchesQuery;
  });
  const unreadCount = mails.filter((mail) => mail.localUnread && !mail.archived).length;
  const activeAccount = demoAccounts[0];

  function updateMail(id: string, patch: Partial<MailState>) {
    setMails((current) => current.map((mail) => (mail.id === id ? { ...mail, ...patch } : mail)));
  }

  function runSync() {
    setSyncStatus('刚刚同步');
    if (visibleMails[0]) {
      setSelectedMailId(visibleMails[0].id);
    }
  }

  function importMemorySnapshot() {
    setMemoryStatus('importing');
    setTimeout(() => setMemoryStatus('ready'), 700);
  }

  function updateJob(id: string, status: ScheduleState['status']) {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, status } : job)));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.kicker}>MiNiMail</Text>
              <Text style={styles.title}>移动邮件工作台</Text>
            </View>
            <PressableButton label="写信" tone="primary" onPress={() => setComposeMode('new')} />
          </View>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{activeAccount.initials}</Text>
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountName}>{activeAccount.name}</Text>
              <Text style={styles.subtleText}>{activeAccount.email}</Text>
            </View>
            <Text style={styles.statusPill}>{syncStatus}</Text>
          </View>
          <View style={styles.heroMetrics}>
            <Metric label="未读" value={String(unreadCount)} />
            <Metric label="AI 路由" value="6" />
            <Metric label="服务" value={String(Object.keys(services).length)} />
          </View>
        </View>

        <View style={styles.tabs}>
          <TabButton label="邮件" active={activeTab === 'mail'} onPress={() => setActiveTab('mail')} />
          <TabButton label="AI" active={activeTab === 'ai'} onPress={() => setActiveTab('ai')} />
          <TabButton label="定时" active={activeTab === 'schedule'} onPress={() => setActiveTab('schedule')} />
          <TabButton label="记忆" active={activeTab === 'memory'} onPress={() => setActiveTab('memory')} />
        </View>

        {composeMode !== 'closed' && selectedMail && (
          <ComposePanel
            mode={composeMode}
            mail={selectedMail}
            value={composeText}
            onChange={setComposeText}
            onClose={() => setComposeMode('closed')}
          />
        )}

        {activeTab === 'mail' && (
          <>
            <View style={styles.toolbar}>
              <TextInput
                accessibilityLabel="搜索邮件"
                value={query}
                onChangeText={setQuery}
                placeholder="搜索发件人、主题或摘要"
                style={styles.searchInput}
              />
              <PressableButton label="同步" tone="secondary" onPress={runSync} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderStrip}>
              {demoFolders.map((folder) => (
                <FolderChip
                  key={folder.id}
                  folder={folder}
                  active={activeFolder === folder.id}
                  count={folder.id === 'inbox' ? unreadCount : mails.filter((mail) => mail.folder === folder.id).length}
                  onPress={() => setActiveFolder(folder.id)}
                />
              ))}
            </ScrollView>

            <View style={styles.mailLayout}>
              <View style={styles.panel}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.panelTitle}>{demoFolders.find((folder) => folder.id === activeFolder)?.label}</Text>
                  <Text style={styles.subtleText}>显示 {visibleMails.length} 封</Text>
                </View>
                {visibleMails.map((mail) => (
                  <MailRow
                    key={mail.id}
                    mail={mail}
                    selected={mail.id === selectedMail?.id}
                    onPress={() => {
                      setSelectedMailId(mail.id);
                      updateMail(mail.id, { localUnread: false });
                    }}
                  />
                ))}
                {visibleMails.length === 0 && <EmptyState label="没有符合条件的邮件" />}
              </View>

              {selectedMail && (
                <MailDetail
                  mail={selectedMail}
                  onToggleRead={() => updateMail(selectedMail.id, { localUnread: !selectedMail.localUnread })}
                  onToggleStar={() => updateMail(selectedMail.id, { localStarred: !selectedMail.localStarred })}
                  onArchive={() => updateMail(selectedMail.id, { archived: true })}
                  onReply={() => setComposeMode('reply')}
                  onOpenAI={() => setActiveTab('ai')}
                />
              )}
            </View>
          </>
        )}

        {activeTab === 'ai' && selectedMail && (
          <AIWorkspace
            mail={selectedMail}
            memoryReady={memoryStatus === 'ready'}
            onUseReply={() => {
              setComposeText(selectedMail.suggestedReply);
              setComposeMode('reply');
            }}
            onOpenMemory={() => setActiveTab('memory')}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleWorkspace jobs={jobs} onUpdateJob={updateJob} onCompose={() => setComposeMode('new')} />
        )}

        {activeTab === 'memory' && (
          <MemoryWorkspace status={memoryStatus} onImport={importMemorySnapshot} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PressableButton({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'primary' | 'secondary' | 'quiet';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.button,
        tone === 'primary' && styles.primaryButton,
        tone === 'secondary' && styles.secondaryButton,
        tone === 'quiet' && styles.quietButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'primary' && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开${label}`}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FolderChip({
  folder,
  active,
  count,
  onPress,
}: {
  folder: { id: DemoFolderId; label: string };
  active: boolean;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开${folder.label}`}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.folderChip,
        active && styles.folderChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.folderLabel, active && styles.folderLabelActive]}>{folder.label}</Text>
      <Text style={[styles.folderCount, active && styles.folderCountActive]}>{count}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MailRow({ mail, selected, onPress }: { mail: MailState; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开邮件：${mail.subject}`}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.mailRow,
        selected && styles.mailRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.unreadDot, !mail.localUnread && styles.readDot]} />
      <View style={styles.mailCopy}>
        <View style={styles.mailTopLine}>
          <Text style={styles.sender} numberOfLines={1}>{mail.sender}</Text>
          <Text style={styles.time}>{mail.time}</Text>
        </View>
        <Text style={styles.subject} numberOfLines={1}>{mail.subject}</Text>
        <Text style={styles.preview} numberOfLines={2}>{mail.preview}</Text>
        <View style={styles.mailMetaRow}>
          <Text style={styles.category}>{mail.category}</Text>
          {mail.localStarred && <Text style={styles.metaFlag}>星标</Text>}
          {mail.hasAttachment && <Text style={styles.metaFlag}>附件</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function MailDetail({
  mail,
  onToggleRead,
  onToggleStar,
  onArchive,
  onReply,
  onOpenAI,
}: {
  mail: MailState;
  onToggleRead: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onReply: () => void;
  onOpenAI: () => void;
}) {
  return (
    <View style={styles.detailPanel}>
      <View style={styles.sectionHeader}>
        <Text style={styles.detailKicker}>{mail.senderDetail}</Text>
        <Text style={styles.categoryDark}>{mail.category}</Text>
      </View>
      <Text style={styles.detailSubject}>{mail.subject}</Text>
      <Text style={styles.detailBody}>{mail.body}</Text>
      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>AI 摘要</Text>
        <Text style={styles.summaryText}>{mail.aiSummary}</Text>
      </View>
      <View style={styles.actionGrid}>
        <PressableButton label="回复" tone="primary" onPress={onReply} />
        <PressableButton label={mail.localStarred ? '取消星标' : '星标'} tone="secondary" onPress={onToggleStar} />
        <PressableButton label={mail.localUnread ? '标为已读' : '标为未读'} tone="secondary" onPress={onToggleRead} />
        <PressableButton label="归档" tone="quiet" onPress={onArchive} />
      </View>
      <PressableButton label="打开 AI 工具" tone="secondary" onPress={onOpenAI} />
    </View>
  );
}

function ComposePanel({
  mode,
  mail,
  value,
  onChange,
  onClose,
}: {
  mode: 'new' | 'reply';
  mail: MailState;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.composePanel}>
      <View style={styles.sectionHeader}>
        <Text style={styles.panelTitle}>{mode === 'reply' ? '回复草稿' : '新邮件'}</Text>
        <PressableButton label="关闭" tone="quiet" onPress={onClose} />
      </View>
      <Text style={styles.inputLabel}>收件人</Text>
      <Text style={styles.inputShell}>{mode === 'reply' ? mail.senderDetail : 'teammate@example.com'}</Text>
      <Text style={styles.inputLabel}>主题</Text>
      <Text style={styles.inputShell}>{mode === 'reply' ? `Re: ${mail.subject}` : '移动端体验反馈'}</Text>
      <Text style={styles.inputLabel}>正文</Text>
      <TextInput
        accessibilityLabel="编辑邮件正文"
        multiline
        value={value}
        onChangeText={onChange}
        style={styles.textInput}
      />
      <View style={styles.composeFooter}>
        <Text style={styles.subtleText}>演示模式下草稿会保存在本地状态中</Text>
        <Text style={styles.draftBadge}>定时发送</Text>
      </View>
    </View>
  );
}

function AIWorkspace({
  mail,
  memoryReady,
  onUseReply,
  onOpenMemory,
}: {
  mail: MailState;
  memoryReady: boolean;
  onUseReply: () => void;
  onOpenMemory: () => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>AI 工作区</Text>
      <View style={styles.aiCard}>
        <Text style={styles.aiLabel}>摘要</Text>
        <Text style={styles.body}>{mail.aiSummary}</Text>
      </View>
      <View style={styles.aiCard}>
        <Text style={styles.aiLabel}>关键信息</Text>
        {mail.keyInfo.map((item) => (
          <Text key={item} style={styles.bulletText}>• {item}</Text>
        ))}
      </View>
      <View style={styles.aiCard}>
        <Text style={styles.aiLabel}>建议回复</Text>
        <Text style={styles.body}>{mail.suggestedReply}</Text>
      </View>
      <View style={styles.actionGrid}>
        <PressableButton label="套用回复" tone="primary" onPress={onUseReply} />
        <PressableButton label={memoryReady ? '搜索记忆' : '导入记忆'} tone="secondary" onPress={onOpenMemory} />
      </View>
    </View>
  );
}

function ScheduleWorkspace({
  jobs,
  onUpdateJob,
  onCompose,
}: {
  jobs: ScheduleState[];
  onUpdateJob: (id: string, status: ScheduleState['status']) => void;
  onCompose: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <Text style={styles.panelTitle}>定时发送</Text>
        <PressableButton label="新建" tone="secondary" onPress={onCompose} />
      </View>
      {jobs.map((job) => (
        <View key={job.id} style={styles.jobCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.jobSubject}>{job.subject}</Text>
            <Text style={styles.statusPill}>{formatJobStatus(job.status)}</Text>
          </View>
          <Text style={styles.subtleText}>{job.to} · {job.scheduledFor}</Text>
          <View style={styles.actionGrid}>
            <PressableButton label="立即发送" tone="primary" onPress={() => onUpdateJob(job.id, 'sent')} />
            <PressableButton label="取消" tone="quiet" onPress={() => onUpdateJob(job.id, 'cancelled')} />
          </View>
        </View>
      ))}
    </View>
  );
}

function formatJobStatus(status: ScheduleState['status']): string {
  switch (status) {
    case 'scheduled':
      return '已预约';
    case 'failed':
      return '失败';
    case 'missed':
      return '已错过';
    case 'sent':
      return '已发送';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function MemoryWorkspace({ status, onImport }: { status: 'missing' | 'importing' | 'ready'; onImport: () => void }) {
  const statusText = status === 'ready' ? '已就绪' : status === 'importing' ? '导入中' : '未导入';
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>向量记忆同步</Text>
      <Text style={styles.body}>
        桌面端负责构建重索引，手机通过局域网导入加密快照，用更低的耗电完成语义检索。
      </Text>
      <View style={styles.memoryCard}>
        <Text style={styles.aiLabel}>{demoMemorySnapshot.name}</Text>
        <Text style={styles.body}>{demoMemorySnapshot.documents} 篇文档 · {demoMemorySnapshot.model} · {demoMemorySnapshot.size}</Text>
        <Text style={styles.subtleText}>校验值 {demoMemorySnapshot.checksum}</Text>
      </View>
      <View style={styles.snapshotRow}>
        <Text style={styles.snapshotLabel}>快照状态</Text>
        <Text style={styles.snapshotValue}>{statusText}</Text>
      </View>
      <PressableButton label={status === 'ready' ? '刷新快照' : '导入快照'} tone="primary" onPress={onImport} />
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.subtleText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#e9eef2',
  },
  content: {
    padding: 14,
    gap: 12,
  },
  hero: {
    backgroundColor: '#10242f',
    borderRadius: 8,
    padding: 16,
    gap: 14,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  kicker: {
    color: '#93b8c5',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  accountRow: {
    alignItems: 'center',
    backgroundColor: '#183440',
    borderColor: '#2c5261',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#d6edf4',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarText: {
    color: '#10242f',
    fontSize: 14,
    fontWeight: '900',
  },
  accountCopy: {
    flex: 1,
  },
  accountName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flex: 1,
    padding: 10,
  },
  metricValue: {
    color: '#10242f',
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#61737c',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  tabs: {
    backgroundColor: '#d7e0e5',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    paddingVertical: 9,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    color: '#596d77',
    fontSize: 13,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#10242f',
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd7de',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17242c',
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  folderStrip: {
    gap: 8,
    paddingRight: 14,
  },
  folderChip: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d3dde3',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  folderChipActive: {
    backgroundColor: '#10242f',
    borderColor: '#10242f',
  },
  folderLabel: {
    color: '#41535d',
    fontSize: 14,
    fontWeight: '800',
  },
  folderLabelActive: {
    color: '#ffffff',
  },
  folderCount: {
    color: '#72838b',
    fontSize: 12,
    fontWeight: '900',
  },
  folderCountActive: {
    color: '#a8d1df',
  },
  mailLayout: {
    gap: 12,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#d7e0e5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitle: {
    color: '#10242f',
    fontSize: 18,
    fontWeight: '900',
  },
  subtleText: {
    color: '#61737c',
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    color: '#31454f',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  primaryButton: {
    backgroundColor: '#0f6b87',
  },
  secondaryButton: {
    backgroundColor: '#e4eef2',
  },
  quietButton: {
    backgroundColor: '#edf2f5',
  },
  buttonText: {
    color: '#17303b',
    fontSize: 13,
    fontWeight: '900',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.72,
  },
  mailRow: {
    borderColor: '#edf1f4',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  mailRowSelected: {
    backgroundColor: '#eef7fa',
    borderColor: '#91c4d3',
  },
  unreadDot: {
    backgroundColor: '#0f6b87',
    borderRadius: 5,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  readDot: {
    backgroundColor: '#c8d1d6',
  },
  mailCopy: {
    flex: 1,
    gap: 3,
  },
  mailTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  sender: {
    color: '#17242c',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  time: {
    color: '#657681',
    fontSize: 12,
    fontWeight: '800',
  },
  subject: {
    color: '#22343d',
    fontSize: 14,
    fontWeight: '800',
  },
  preview: {
    color: '#536873',
    fontSize: 13,
    lineHeight: 18,
  },
  mailMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  category: {
    backgroundColor: '#eff3f5',
    borderRadius: 6,
    color: '#41545e',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'capitalize',
  },
  metaFlag: {
    color: '#0f6b87',
    fontSize: 12,
    fontWeight: '900',
    paddingVertical: 3,
  },
  detailPanel: {
    backgroundColor: '#10242f',
    borderRadius: 8,
    gap: 12,
    padding: 16,
  },
  detailKicker: {
    color: '#b8cbd2',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  detailSubject: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  detailBody: {
    color: '#eef5f7',
    fontSize: 15,
    lineHeight: 22,
  },
  categoryDark: {
    backgroundColor: '#244552',
    borderRadius: 6,
    color: '#a9d7e4',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'capitalize',
  },
  summaryBox: {
    backgroundColor: '#1b3845',
    borderColor: '#315867',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  summaryLabel: {
    color: '#9dc8d6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  composePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#99bfcb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  inputLabel: {
    color: '#536873',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  inputShell: {
    backgroundColor: '#f4f7f9',
    borderColor: '#d9e2e7',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17242c',
    fontSize: 14,
    padding: 10,
  },
  textInput: {
    backgroundColor: '#f4f7f9',
    borderColor: '#d9e2e7',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17242c',
    fontSize: 15,
    minHeight: 120,
    padding: 10,
    textAlignVertical: 'top',
  },
  composeFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  draftBadge: {
    backgroundColor: '#f2ece5',
    borderRadius: 8,
    color: '#8a4b1f',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiCard: {
    backgroundColor: '#f3f7f9',
    borderColor: '#dce7ec',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  aiLabel: {
    color: '#0f6b87',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  bulletText: {
    color: '#31454f',
    fontSize: 14,
    lineHeight: 20,
  },
  jobCard: {
    borderColor: '#e0e8ec',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  jobSubject: {
    color: '#17242c',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  statusPill: {
    backgroundColor: '#e4eef2',
    borderRadius: 8,
    color: '#0f6b87',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 5,
    textTransform: 'capitalize',
  },
  memoryCard: {
    backgroundColor: '#10242f',
    borderRadius: 8,
    gap: 5,
    padding: 12,
  },
  snapshotRow: {
    alignItems: 'center',
    borderTopColor: '#edf1f4',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  snapshotLabel: {
    color: '#536873',
    fontSize: 14,
    fontWeight: '800',
  },
  snapshotValue: {
    color: '#8a4b1f',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    borderColor: '#e0e8ec',
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
});
