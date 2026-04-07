export interface MockEmail {
  id: string;
  from: {
    name: string;
    email: string;
    avatar?: string;
  };
  to: string[];
  subject: string;
  snippet: string;
  body: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: {
    name: string;
    size: string;
    type: string;
  }[];
  folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam';
  category?: 'primary' | 'social' | 'promotions';
  accountId: number;
}

export const mockEmails: MockEmail[] = [
  {
    id: '1',
    from: {
      name: '张三',
      email: 'zhangsan@example.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhangsan',
    },
    to: ['me@example.com'],
    subject: '项目进度汇报 - 第三阶段完成',
    snippet: '李工你好，关于XX项目的第三阶段开发工作已经全部完成，代码已经提交到GitLab仓库...',
    body: `李工你好，

关于XX项目的第三阶段开发工作已经全部完成，代码已经提交到GitLab仓库。

本次完成的主要功能：
1. 用户权限管理模块
2. 数据导出功能
3. 报表生成器优化

请查看附件中的详细文档，并在本周五之前完成代码审核。

如有疑问，请随时联系我。

Best regards,
张三`,
    date: new Date('2024-01-15T09:30:00'),
    isRead: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      { name: '项目进度报告.pdf', size: '2.3 MB', type: 'PDF' },
      { name: '代码提交记录.xlsx', size: '156 KB', type: 'Excel' },
    ],
    folder: 'inbox',
    category: 'primary',
    accountId: 1,
  },
  {
    id: '2',
    from: {
      name: 'Sarah Chen',
      email: 'sarah.chen@techcorp.io',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    },
    to: ['me@example.com'],
    subject: 'Re: Product Demo Scheduling',
    snippet: 'Hi, I would like to schedule a product demo for next Tuesday at 2 PM. Would that work for your team?',
    body: `Hi there,

I hope this email finds you well. I wanted to follow up on our previous conversation about the product demo.

I would like to schedule a product demo for next Tuesday at 2 PM (PST). Would that work for your team?

Our product team will be presenting the following:
- New AI-powered features
- Enhanced dashboard analytics
- Mobile app integration

Please let me know if this time works, and I'll send a calendar invite.

Best,
Sarah Chen
Product Manager
TechCorp Inc.`,
    date: new Date('2024-01-14T14:22:00'),
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'social',
    accountId: 1,
  },
  {
    id: '3',
    from: {
      name: '系统通知',
      email: 'noreply@github.com',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=github',
    },
    to: ['me@example.com'],
    subject: '[GitHub] 您的仓库有新的问题反馈',
    snippet: '用户在 your-project 仓库中提交了一个新issue：关于登录页面在Safari浏览器中显示异常的问题...',
    body: `GitHub

用户 @developer123 在您的仓库中提交了一个新issue：

**Title:** 登录页面在Safari浏览器中显示异常

**Description:**
在Safari 17.2版本下，登录页面的验证码图片无法正常显示，同时提交按钮有1秒的延迟。

**Steps to reproduce:**
1. 打开Safari浏览器
2. 访问登录页面
3. 尝试刷新验证码

请查看完整issue内容并尽快修复。

---
You are receiving this because you are subscribed to this repository.
Unsubscribe from emails for this issue.`,
    date: new Date('2024-01-14T11:05:00'),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'primary',
    accountId: 1,
  },
  {
    id: '4',
    from: {
      name: '王五',
      email: 'wangwu@startup.cn',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wangwu',
    },
    to: ['me@example.com'],
    subject: '周末聚餐安排',
    snippet: '兄弟们，这周末我们团队聚餐，地点定在国贸大厦的粤菜馆，大家周六晚上6点集合...',
    body: `各位同事，

好消息！经过大家的投票，周末聚餐地点已经确定啦！

**时间：** 本周六（1月20日）晚上6点
**地点：** 国贸大厦3楼 粤菜馆
**人均：** 约200元

请大家准时到达，有事请提前请假。

另外，记得报名的时候告诉我你的忌口，我好提前跟餐厅打招呼。

See you Saturday!
王五`,
    date: new Date('2024-01-13T16:45:00'),
    isRead: true,
    isStarred: true,
    hasAttachments: false,
    folder: 'inbox',
    category: 'social',
    accountId: 1,
  },
  {
    id: '5',
    from: {
      name: 'AWS Notifications',
      email: 'aws-noreply@amazon.com',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=aws',
    },
    to: ['me@example.com'],
    subject: '🎉 限时促销 - AWS服务折扣优惠',
    snippet: 'Your AWS account (Account ID: 1234-5678-9012) has exceeded 80% of your monthly budget...',
    body: `AWS 促销优惠

Hello,

现在注册 AWS 新用户享受 3 个月免费使用！

**优惠详情：**
- EC2 免费套餐：750小时/月
- S3 存储：5GB免费
- RDS 数据库：750小时免费

立即注册，享受优惠！

Thank you for using AWS.

Sincerely,
Amazon Web Services`,
    date: new Date('2024-01-12T08:00:00'),
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    folder: 'inbox',
    category: 'promotions',
    accountId: 1,
  },
  {
    id: '6',
    from: {
      name: '赵六',
      email: 'zhaoliu@design.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhaoliu',
    },
    to: ['me@example.com'],
    subject: 'App Store 审核状态更新',
    snippet: '您的应用 "minimail" 已经通过审核，现已上架到App Store，供用户下载使用...',
    body: `尊敬的用户，

您的应用 "minimail" 已经通过App Store审核，现已上架！

**应用信息：**
- App Name: minimail
- Bundle ID: com.minimail.app
- Version: 1.0.0
- Category: Productivity

**审核结果：**
- 状态：通过 ✓
- 审核时间：2024-01-11
- 上架时间：2024-01-12

用户现在可以在App Store中搜索 "minimail" 并下载使用。

感谢您选择我们的开发者服务！

Best regards,
App Store Review Team`,
    date: new Date('2024-01-12T10:30:00'),
    isRead: true,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      { name: '审核报告.pdf', size: '890 KB', type: 'PDF' },
    ],
    folder: 'inbox',
    category: 'primary',
    accountId: 2,
  },
  {
    id: '7',
    from: {
      name: '李明',
      email: 'liming@company.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=liming',
    },
    to: ['team@company.com'],
    subject: '会议纪要：Q1产品规划讨论',
    snippet: '以下是今天下午产品规划会议的讨论要点，请各位确认并补充...',
    body: `各位同事，

以下是今天下午产品规划会议的讨论要点，请各位确认并补充：

**参会人员：** 李明、王芳、张强、刘洋

**议程：**
1. Q1产品 roadmap 回顾
2. 新功能优先级讨论
3. 技术债务清理计划

**决议事项：**
1. 确认Q1主推功能：AI助手集成、批量操作优化
2. 下周三前完成技术方案设计
3. 每两周举行一次产品同步会

**待决事项：**
- 营销素材准备（需与市场部对接）
- 客服培训计划（待HR确认时间）

下次会议时间：1月25日（周四）下午2点

---
会议室已预约，请各位准时参加。

李明
产品部`,
    date: new Date('2024-01-11T18:20:00'),
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    folder: 'sent',
    category: 'primary',
    accountId: 2,
  },
  {
    id: '8',
    from: {
      name: '马小红',
      email: 'maxiaohong@mail.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maxiaohong',
    },
    to: ['me@example.com'],
    subject: '关于简历投递的咨询',
    snippet: '您好，我看到贵公司招聘前端开发工程师，我对这个职位非常感兴趣...',
    body: `您好，

我看到贵公司在招聘前端开发工程师，我对这个职位非常感兴趣。

我叫马小红，目前有3年前端开发经验，熟悉React、Vue等主流框架。

**个人优势：**
1. 精通React生态系统
2. 有大型项目管理经验
3. 良好的团队协作能力

附件是我的简历，请查收。

如果贵公司有任何面试安排，我愿意随时参加。

期待您的回复！

马小红
电话：138-xxxx-xxxx`,
    date: new Date('2024-01-10T09:15:00'),
    isRead: false,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      { name: '马小红_简历.pdf', size: '1.2 MB', type: 'PDF' },
    ],
    folder: 'inbox',
    category: 'social',
    accountId: 1,
  },
];

export const mockFolders = [
  { id: 'inbox', name: 'inbox', icon: 'inbox', count: 5 },
  { id: 'sent', name: 'sent', icon: 'send', count: 1 },
  { id: 'drafts', name: 'drafts', icon: 'file', count: 0 },
  { id: 'trash', name: 'trash', icon: 'trash', count: 0 },
  { id: 'spam', name: 'spam', icon: 'spam', count: 0 },
];
