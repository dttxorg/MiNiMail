import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      // Sidebar
      compose: '写邮件',
      settings: '设置',
      addAccount: '添加账号',
      inbox: '收件箱',
      sent: '已发送',
      drafts: '草稿箱',
      trash: '废纸篓',
      spam: '垃圾邮件',
      starred: '已加星标',
      calendar: '日历',
      searchEmails: '搜索邮件...',
      noEmails: '没有邮件',

      // Tabs
      primary: '主要',
      social: '社交',
      promotions: '推广',

      // Mail Detail
      reply: '回复',
      forward: '转发',
      delete: '删除',
      ai: 'AI',
      selectMailToRead: '选择一封邮件查看',
      chooseMailToView: '从列表中选择一封邮件以查看其内容',
      attachments: '个附件',

      // Actions
      copy: '复制',
      useThisReply: '使用此回复',

      // AI Panel
      aiAssistant: 'AI 助手',
      translate: '翻译',
      summarize: '总结',
      reply: '回复',
      aiProcessing: 'AI 处理中...',
      translationResult: '翻译结果',
      summary: '摘要',
      replySuggestion: '回复建议',

      // Compose
      newMail: '写邮件',
      from: '发件人',
      to: '收件人',
      cc: '抄送',
      subject: '主题',
      body: '内容',
      send: '发送',
      cancel: '取消',
      sending: '发送中...',
      saving: '保存中...',
      aiPolish: '润色',
      aiTranslate: '翻译',
      multipleRecipients: '多个收件人用逗号分隔',

      // Settings
      settingsTitle: '设置',
      general: '通用',
      account: '账号',
      appLanguage: '软件语言',
      appLanguageHint: '设置软件界面显示的语言',
      aiTargetLanguage: 'AI 目标语言',
      aiTargetLanguageHint: '翻译、总结、回复建议的输出语言',
      apiConfig: 'API 配置',
      apiUrl: 'API 地址',
      apiKey: 'API Key',
      model: '模型',
      saveSettings: '保存设置',
      settingsSaved: '✓ 设置已保存',

      // Account
      addEmailAccount: '添加邮箱账号',
      manageGoogleAccount: '管理 Google 账号',
      deleteAccount: '删除账号',
      default: '默认',

      // Time
      justNow: '刚刚',
      minutesAgo: '{{count}}分钟前',
      hoursAgo: '{{count}}小时前',
      daysAgo: '{{count}}天前',
      today: '今天',
      yesterday: '昨天',
      thisWeek: '本周',
      thisMonth: '本月',
      older: '更早',

      // Sidebar
      allAccounts: '所有账号',

      // Bulk actions
      selectAll: '全选',
      markAsRead: '标为已读',
      markAsUnread: '标为未读',
      delete: '删除',
      refresh: '刷新',
      selected: '已选中',

      // Common
      loading: '加载中...',

      // Validation
      validateRecipientRequired: '请输入收件人',
      validateSubjectRequired: '请输入主题',
      validateAccountRequired: '请选择发件账号',
      validateEmailRequired: '请输入邮箱地址',
      validateEmailInvalid: '请输入有效的邮箱地址',
      validateImapRequired: 'IMAP 服务器不能为空',
      validateSmtpRequired: 'SMTP 服务器不能为空',
      validatePortInvalid: '端口号必须在 1-65535 之间',
      validateDisplayNameTooShort: '显示名称至少需要 2 个字符',

      // Add Account Dialog
      emailProvider: '邮箱服务商',
      emailAddress: '邮箱地址',
      displayName: '显示名称',
      authMethod: '认证方式',
      imapSettings: 'IMAP 设置',
      smtpSettings: 'SMTP 设置',
      imapServer: 'IMAP 服务器',
      smtpServer: 'SMTP 服务器',
      port: '端口',
      username: '用户名',
      password: '密码',
      useTls: '使用 TLS/SSL',
      testConnection: '测试连接',
      testing: '测试中...',
      connectionSuccess: '连接成功',
      connectionFailed: '连接失败',
      enterPassword: '输入密码',
      passwordUnchanged: '（不更改）',
      usuallySameAsEmail: '通常与邮箱地址相同',
      googleOAuth: '谷歌登录 (OAuth)',
      gmailOAuthNote: 'Gmail OAuth 2.0 认证',
      gmailOAuthHint: '您将被重定向到 Google 登录。请在 AI 设置中配置 OAuth 凭据。',
    },
  },
  en: {
    translation: {
      // Sidebar
      compose: 'Compose',
      settings: 'Settings',
      addAccount: 'Add Account',
      inbox: 'Inbox',
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Trash',
      spam: 'Spam',
      starred: 'Starred',
      calendar: 'Calendar',
      searchEmails: 'Search emails...',
      noEmails: 'No emails',

      // Tabs
      primary: 'Primary',
      social: 'Social',
      promotions: 'Promotions',

      // Mail Detail
      reply: 'Reply',
      forward: 'Forward',
      delete: 'Delete',
      ai: 'AI',
      selectMailToRead: 'Select a message to read',
      chooseMailToView: 'Choose an email from the list to view its contents',
      attachments: 'attachments',

      // Actions
      copy: 'Copy',
      useThisReply: 'Use this reply',

      // AI Panel
      aiAssistant: 'AI Assistant',
      translate: 'Translate',
      summarize: 'Summarize',
      reply: 'Reply',
      aiProcessing: 'AI Processing...',
      translationResult: 'Translation Result',
      summary: 'Summary',
      replySuggestion: 'Reply Suggestion',

      // Compose
      newMail: 'New Mail',
      from: 'From',
      to: 'To',
      cc: 'CC',
      subject: 'Subject',
      body: 'Body',
      send: 'Send',
      cancel: 'Cancel',
      sending: 'Sending...',
      saving: 'Saving...',
      aiPolish: 'Polish',
      aiTranslate: 'Translate',
      multipleRecipients: 'Separate multiple recipients with commas',

      // Settings
      settingsTitle: 'Settings',
      general: 'General',
      account: 'Account',
      appLanguage: 'App Language',
      appLanguageHint: 'Set the display language for the app interface',
      aiTargetLanguage: 'AI Target Language',
      aiTargetLanguageHint: 'Output language for translation, summary, and reply',
      apiConfig: 'API Config',
      apiUrl: 'API URL',
      apiKey: 'API Key',
      model: 'Model',
      saveSettings: 'Save Settings',
      settingsSaved: '✓ Settings saved',

      // Account
      addEmailAccount: 'Add Email Account',
      manageGoogleAccount: 'Manage Google Account',
      deleteAccount: 'Delete Account',
      default: 'Default',

      // Time
      justNow: 'Just now',
      minutesAgo: '{{count}}m ago',
      hoursAgo: '{{count}}h ago',
      daysAgo: '{{count}}d ago',
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      older: 'Older',

      // Sidebar
      allAccounts: 'All Accounts',

      // Bulk actions
      selectAll: 'Select All',
      markAsRead: 'Mark as Read',
      markAsUnread: 'Mark as Unread',
      delete: 'Delete',
      refresh: 'Refresh',
      selected: 'selected',

      // Common
      loading: 'Loading...',

      // Validation
      validateRecipientRequired: 'Recipient is required',
      validateSubjectRequired: 'Subject is required',
      validateAccountRequired: 'Please select sender account',
      validateEmailRequired: 'Email address is required',
      validateEmailInvalid: 'Please enter a valid email address',
      validateImapRequired: 'IMAP server is required',
      validateSmtpRequired: 'SMTP server is required',
      validatePortInvalid: 'Port must be between 1 and 65535',
      validateDisplayNameTooShort: 'Display name must be at least 2 characters',

      // Add Account Dialog
      emailProvider: 'Email Provider',
      emailAddress: 'Email Address',
      displayName: 'Display Name',
      authMethod: 'Auth Method',
      imapSettings: 'IMAP Settings',
      smtpSettings: 'SMTP Settings',
      imapServer: 'IMAP Server',
      smtpServer: 'SMTP Server',
      port: 'Port',
      username: 'Username',
      password: 'Password',
      useTls: 'Use TLS/SSL',
      testConnection: 'Test Connection',
      testing: 'Testing...',
      connectionSuccess: 'Connection successful',
      connectionFailed: 'Connection failed',
      enterPassword: 'Enter password',
      passwordUnchanged: '(unchanged)',
      usuallySameAsEmail: 'Usually same as email',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Gmail OAuth 2.0 Authentication',
      gmailOAuthHint: 'You will be redirected to Google login. Configure OAuth credentials in AI settings.',
    },
  },
  ja: {
    translation: {
      // Sidebar
      compose: 'メール作成',
      settings: '設定',
      addAccount: 'アカウント追加',
      inbox: '受信トレイ',
      sent: '送信済み',
      drafts: '下書き',
      trash: 'ゴミ箱',
      spam: '迷惑メール',
      starred: 'スター付き',
      calendar: 'カレンダー',
      searchEmails: 'メールを検索...',
      noEmails: 'メールがありません',

      // Tabs
      primary: 'プライマリ',
      social: 'ソーシャル',
      promotions: 'プロモーショ',

      // Mail Detail
      reply: '返信',
      forward: '転送',
      delete: '削除',
      ai: 'AI',
      selectMailToRead: 'メールを選択してください',
      chooseMailToView: 'リストからメールを選択して内容を表示',
      attachments: '添付ファイル',

      // Actions
      copy: 'コピー',
      useThisReply: 'この返信を使用',

      // AI Panel
      aiAssistant: 'AIアシスタント',
      translate: '翻訳',
      summarize: '要約',
      reply: '返信',
      aiProcessing: 'AI処理中...',
      translationResult: '翻訳結果',
      summary: '要約',
      replySuggestion: '返信提案',

      // Compose
      newMail: '新しいメール',
      from: '差出人',
      to: '宛先',
      cc: 'CC',
      subject: '件名',
      body: '本文',
      send: '送信',
      cancel: 'キャンセル',
      sending: '送信中...',
      saving: '保存中...',
      aiPolish: '校正',
      aiTranslate: '翻訳',
      multipleRecipients: '複数の受信者はカンマで区切ってください',

      // Settings
      settingsTitle: '設定',
      general: '一般',
      account: 'アカウント',
      appLanguage: 'アプリ言語',
      appLanguageHint: 'アプリインターフェースの表示言語を設定',
      aiTargetLanguage: 'AI目標言語',
      aiTargetLanguageHint: '翻訳、要約、返信の出力言語',
      apiConfig: 'API設定',
      apiUrl: 'API URL',
      apiKey: 'APIキー',
      model: 'モデル',
      saveSettings: '設定を保存',
      settingsSaved: '✓ 設定が保存されました',

      // Account
      addEmailAccount: 'メールアカウントを追加',
      manageGoogleAccount: 'Googleアカウントを管理',
      deleteAccount: 'アカウントを削除',
      default: 'デフォルト',

      // Time
      justNow: 'たった今',
      minutesAgo: '{{count}}分前',
      hoursAgo: '{{count}}時間前',
      daysAgo: '{{count}}日前',
      today: '今日',
      yesterday: '昨日',
      thisWeek: '今週',
      thisMonth: '今月',
      older: '更早',

      // Sidebar
      allAccounts: 'すべてのアカウント',

      // Bulk actions
      selectAll: 'すべて選択',
      markAsRead: '既読にする',
      markAsUnread: '未読にする',
      delete: '削除',
      refresh: '更新',
      selected: '選択中',

      // Common
      loading: '読み込み中...',

      // Validation
      validateRecipientRequired: '宛先を入力してください',
      validateSubjectRequired: '件名を入力してください',
      validateAccountRequired: '送信アカウントを選択してください',
      validateEmailRequired: 'メールアドレスを入力してください',
      validateEmailInvalid: '有効なメールアドレスを入力してください',
      validateImapRequired: 'IMAPサーバーは必須です',
      validateSmtpRequired: 'SMTPサーバーは必須です',
      validatePortInvalid: 'ポートは1〜65535の間で入力してください',
      validateDisplayNameTooShort: '表示名は2文字以上で入力してください',

      // Add Account Dialog
      emailProvider: 'メールプロバイダー',
      emailAddress: 'メールアドレス',
      displayName: '表示名',
      authMethod: '認証方法',
      imapSettings: 'IMAP設定',
      smtpSettings: 'SMTP設定',
      imapServer: 'IMAPサーバー',
      smtpServer: 'SMTPサーバー',
      port: 'ポート',
      username: 'ユーザー名',
      password: 'パスワード',
      useTls: 'TLS/SSLを使用',
      testConnection: '接続テスト',
      testing: 'テスト中...',
      connectionSuccess: '接続成功',
      connectionFailed: '接続失敗',
      enterPassword: 'パスワードを入力',
      passwordUnchanged: '（変更なし）',
      usuallySameAsEmail: '通常メールアドレスと同じ',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Gmail OAuth 2.0認証',
      gmailOAuthHint: 'Googleログインにリダイレクトされます。AI設定でOAuth資格情報を構成してください。',
    },
  },
  ko: {
    translation: {
      // Sidebar
      compose: '메일 작성',
      settings: '설정',
      addAccount: '계정 추가',
      inbox: '받은편지함',
      sent: '보낸편지함',
      drafts: '임시보관함',
      trash: '휴지통',
      spam: '스팸',
      starred: '별표 있음',
      calendar: '캘린더',
      searchEmails: '메일 검색...',
      noEmails: '메일이 없습니다',

      // Tabs
      primary: '기본',
      social: '소셜',
      promotions: '프로모션',

      // Mail Detail
      reply: '답장',
      forward: '전달',
      delete: '삭제',
      ai: 'AI',
      selectMailToRead: '邮件을 선택하세요',
      chooseMailToView: '목록에서邮件을 선택하여 내용을 보기',
      attachments: '첨부파일',

      // Actions
      copy: '복사',
      useThisReply: '이 답장 사용',

      // AI Panel
      aiAssistant: 'AI 도우미',
      translate: '번역',
      summarize: '요약',
      reply: '답장',
      aiProcessing: 'AI 처리 중...',
      translationResult: '번역 결과',
      summary: '요약',
      replySuggestion: '답장 제안',

      // Compose
      newMail: '새邮件',
      from: '보낸 사람',
      to: '받는 사람',
      cc: '참조',
      subject: '제목',
      body: '본문',
      send: '보내기',
      cancel: '취소',
      sending: '보내는 중...',
      saving: '저장 중...',
      aiPolish: '윤문',
      aiTranslate: '번역',
      multipleRecipients: '여러 받는 사람은 쉼표로 구분',

      // Settings
      settingsTitle: '설정',
      general: '일반',
      account: '계정',
      appLanguage: '앱 언어',
      appLanguageHint: '앱 인터페이스 표시 언어 설정',
      aiTargetLanguage: 'AI 목표 언어',
      aiTargetLanguageHint: '번역, 요약, 답장의 출력 언어',
      apiConfig: 'API 설정',
      apiUrl: 'API URL',
      apiKey: 'API 키',
      model: '모델',
      saveSettings: '설정 저장',
      settingsSaved: '✓ 설정이 저장되었습니다',

      // Account
      addEmailAccount: '이메일 계정 추가',
      manageGoogleAccount: 'Google 계정 관리',
      deleteAccount: '계정 삭제',
      default: '기본',

      // Time
      justNow: '방금',
      minutesAgo: '{{count}}분 전',
      hoursAgo: '{{count}}시간 전',
      daysAgo: '{{count}}일 전',
      today: '오늘',
      yesterday: '어제',
      thisWeek: '이번 주',
      thisMonth: '이번 달',
      older: '이전',

      // Sidebar
      allAccounts: '모든 계정',

      // Bulk actions
      selectAll: '전체 선택',
      markAsRead: '읽음으로 표시',
      markAsUnread: '읽지 않음으로 표시',
      delete: '삭제',
      refresh: '새로고침',
      selected: '선택됨',

      // Common
      loading: '로딩 중...',

      // Validation
      validateRecipientRequired: '수신인을 입력하세요',
      validateSubjectRequired: '제목을 입력하세요',
      validateAccountRequired: '발신 계정을 선택하세요',
      validateEmailRequired: '이메일 주소를 입력하세요',
      validateEmailInvalid: '유효한 이메일 주소를 입력하세요',
      validateImapRequired: 'IMAP 서버는 필수입니다',
      validateSmtpRequired: 'SMTP 서버는 필수입니다',
      validatePortInvalid: '포트 번호는 1에서 65535 사이여야 합니다',
      validateDisplayNameTooShort: '표시 이름은 최소 2자 이상이어야 합니다',

      // Add Account Dialog
      emailProvider: '이메일 제공자',
      emailAddress: '이메일 주소',
      displayName: '표시 이름',
      authMethod: '인증 방법',
      imapSettings: 'IMAP 설정',
      smtpSettings: 'SMTP 설정',
      imapServer: 'IMAP 서버',
      smtpServer: 'SMTP 서버',
      port: '포트',
      username: '사용자 이름',
      password: '비밀번호',
      useTls: 'TLS/SSL 사용',
      testConnection: '연결 테스트',
      testing: '테스트 중...',
      connectionSuccess: '연결 성공',
      connectionFailed: '연결 실패',
      enterPassword: '비밀번호 입력',
      passwordUnchanged: '(변경 없음)',
      usuallySameAsEmail: '일반적으로 이메일과 동일',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Gmail OAuth 2.0 인증',
      gmailOAuthHint: 'Google 로그인으로 리디렉션됩니다. AI 설정에서 OAuth 자격 증명을 구성하세요.',
    },
  },
  es: {
    translation: {
      // Sidebar
      compose: 'Redactar',
      settings: 'Ajustes',
      addAccount: 'Añadir cuenta',
      inbox: 'Bandeja de entrada',
      sent: 'Enviados',
      drafts: 'Borradores',
      trash: 'Papelera',
      spam: 'Spam',
      starred: 'Destacados',
      calendar: 'Calendario',
      searchEmails: 'Buscar emails...',
      noEmails: 'No hay emails',

      // Tabs
      primary: 'Principal',
      social: 'Social',
      promotions: 'Promociones',

      // Mail Detail
      reply: 'Responder',
      forward: 'Reenviar',
      delete: 'Eliminar',
      ai: 'IA',
      selectMailToRead: 'Selecciona un email para leer',
      chooseMailToView: 'Elige un email de la lista para ver su contenido',
      attachments: 'archivos adjuntos',

      // Actions
      copy: 'Copiar',
      useThisReply: 'Usar esta respuesta',

      // AI Panel
      aiAssistant: 'Asistente IA',
      translate: 'Traducir',
      summarize: 'Resumir',
      reply: 'Responder',
      aiProcessing: 'Procesando IA...',
      translationResult: 'Resultado de traducción',
      summary: 'Resumen',
      replySuggestion: 'Sugerencia de respuesta',

      // Compose
      newMail: 'Nuevo email',
      from: 'De',
      to: 'Para',
      cc: 'CC',
      subject: 'Asunto',
      body: 'Cuerpo',
      send: 'Enviar',
      cancel: 'Cancelar',
      sending: 'Enviando...',
      saving: 'Guardando...',
      aiPolish: 'Pulir',
      aiTranslate: 'Traducir',
      multipleRecipients: 'Separa los destinatarios con comas',

      // Settings
      settingsTitle: 'Ajustes',
      general: 'General',
      account: 'Cuenta',
      appLanguage: 'Idioma de la app',
      appLanguageHint: 'Establecer el idioma de la interfaz de la app',
      aiTargetLanguage: 'Idioma objetivo de IA',
      aiTargetLanguageHint: 'Idioma de salida para traducción, resumen y respuesta',
      apiConfig: 'Configuración de API',
      apiUrl: 'URL de API',
      apiKey: 'Clave de API',
      model: 'Modelo',
      saveSettings: 'Guardar ajustes',
      settingsSaved: '✓ Ajustes guardados',

      // Account
      addEmailAccount: 'Añadir cuenta de email',
      manageGoogleAccount: 'Gestionar cuenta de Google',
      deleteAccount: 'Eliminar cuenta',
      default: 'Por defecto',

      // Time
      justNow: 'Ahora mismo',
      minutesAgo: 'hace {{count}}m',
      hoursAgo: 'hace {{count}}h',
      daysAgo: 'hace {{count}}d',
      today: 'Hoy',
      yesterday: 'Ayer',
      thisWeek: 'Esta semana',
      thisMonth: 'Este mes',
      older: 'Anterior',

      // Sidebar
      allAccounts: 'Todas las cuentas',

      // Bulk actions
      selectAll: 'Seleccionar todo',
      markAsRead: 'Marcar como leído',
      markAsUnread: 'Marcar como no leído',
      delete: 'Eliminar',
      refresh: 'Actualizar',
      selected: 'seleccionados',

      // Common
      loading: 'Cargando...',

      // Validation
      validateRecipientRequired: 'El destinatario es obligatorio',
      validateSubjectRequired: 'El asunto es obligatorio',
      validateAccountRequired: 'Seleccione cuenta de envío',
      validateEmailRequired: 'La dirección de email es obligatoria',
      validateEmailInvalid: 'Introduzca un email válido',
      validateImapRequired: 'El servidor IMAP es obligatorio',
      validateSmtpRequired: 'El servidor SMTP es obligatorio',
      validatePortInvalid: 'El puerto debe estar entre 1 y 65535',
      validateDisplayNameTooShort: 'El nombre debe tener al menos 2 caracteres',

      // Add Account Dialog
      emailProvider: 'Proveedor de email',
      emailAddress: 'Dirección de email',
      displayName: 'Nombre para mostrar',
      authMethod: 'Método de autenticación',
      imapSettings: 'Configuración IMAP',
      smtpSettings: 'Configuración SMTP',
      imapServer: 'Servidor IMAP',
      smtpServer: 'Servidor SMTP',
      port: 'Puerto',
      username: 'Usuario',
      password: 'Contraseña',
      useTls: 'Usar TLS/SSL',
      testConnection: 'Probar conexión',
      testing: 'Probando...',
      connectionSuccess: 'Conexión exitosa',
      connectionFailed: 'Conexión fallida',
      enterPassword: 'Introducir contraseña',
      passwordUnchanged: '(sin cambios)',
      usuallySameAsEmail: 'Normalmente igual al email',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Autenticación Gmail OAuth 2.0',
      gmailOAuthHint: 'Será redirigido a Google. Configure credenciales OAuth en ajustes de IA.',
    },
  },
  fr: {
    translation: {
      // Sidebar
      compose: 'Rédiger',
      settings: 'Paramètres',
      addAccount: 'Ajouter un compte',
      inbox: 'Boîte de réception',
      sent: 'Envoyés',
      drafts: 'Brouillons',
      trash: 'Corbeille',
      spam: 'Spam',
      starred: 'Favoris',
      calendar: 'Calendrier',
      searchEmails: 'Rechercher des emails...',
      noEmails: 'Aucun email',

      // Tabs
      primary: 'Principal',
      social: 'Social',
      promotions: 'Promotions',

      // Mail Detail
      reply: 'Répondre',
      forward: 'Transférer',
      delete: 'Supprimer',
      ai: 'IA',
      selectMailToRead: 'Sélectionnez un email à lire',
      chooseMailToView: 'Choisissez un email dans la liste pour voir son contenu',
      attachments: 'pieces jointes',

      // Actions
      copy: 'Copier',
      useThisReply: 'Utiliser cette réponse',

      // AI Panel
      aiAssistant: 'Assistant IA',
      translate: 'Traduire',
      summarize: 'Résumer',
      reply: 'Répondre',
      aiProcessing: 'Traitement IA...',
      translationResult: 'Résultat de traduction',
      summary: 'Résumé',
      replySuggestion: 'Suggestion de réponse',

      // Compose
      newMail: 'Nouvel email',
      from: 'De',
      to: 'À',
      cc: 'CC',
      subject: 'Objet',
      body: 'Corps',
      send: 'Envoyer',
      cancel: 'Annuler',
      sending: 'Envoi en cours...',
      saving: 'Enregistrement...',
      aiPolish: 'Polir',
      aiTranslate: 'Traduire',
      multipleRecipients: 'Séparez les destinataires par des virgules',

      // Settings
      settingsTitle: 'Paramètres',
      general: 'Général',
      account: 'Compte',
      appLanguage: 'Langue de l\'app',
      appLanguageHint: 'Définir la langue de l\'interface de l\'app',
      aiTargetLanguage: 'Langue cible de l\'IA',
      aiTargetLanguageHint: 'Langue de sortie pour traduction, résumé et réponse',
      apiConfig: 'Configuration API',
      apiUrl: 'URL de l\'API',
      apiKey: 'Clé API',
      model: 'Modèle',
      saveSettings: 'Enregistrer les paramètres',
      settingsSaved: '✓ Paramètres enregistrés',

      // Account
      addEmailAccount: 'Ajouter un compte email',
      manageGoogleAccount: 'Gérer le compte Google',
      deleteAccount: 'Supprimer le compte',
      default: 'Par défaut',

      // Time
      justNow: 'À l\'instant',
      minutesAgo: 'il y a {{count}}m',
      hoursAgo: 'il y a {{count}}h',
      daysAgo: 'il y a {{count}}j',
      today: 'Aujourd\'hui',
      yesterday: 'Hier',
      thisWeek: 'Cette semaine',
      thisMonth: 'Ce mois',
      older: 'Plus ancien',

      // Sidebar
      allAccounts: 'Tous les comptes',

      // Bulk actions
      selectAll: 'Tout sélectionner',
      markAsRead: 'Marquer comme lu',
      markAsUnread: 'Marquer comme non lu',
      delete: 'Supprimer',
      refresh: 'Actualiser',
      selected: 'sélectionnés',

      // Common
      loading: 'Chargement...',

      // Validation
      validateRecipientRequired: 'Le destinataire est requis',
      validateSubjectRequired: 'Le sujet est requis',
      validateAccountRequired: 'Sélectionnez le compte émetteur',
      validateEmailRequired: 'L\'adresse email est requise',
      validateEmailInvalid: 'Veuillez entrer une adresse email valide',
      validateImapRequired: 'Le serveur IMAP est requis',
      validateSmtpRequired: 'Le serveur SMTP est requis',
      validatePortInvalid: 'Le port doit être entre 1 et 65535',
      validateDisplayNameTooShort: 'Le nom doit contenir au moins 2 caractères',

      // Add Account Dialog
      emailProvider: 'Fournisseur email',
      emailAddress: 'Adresse email',
      displayName: 'Nom d\'affichage',
      authMethod: 'Méthode d\'authentification',
      imapSettings: 'Paramètres IMAP',
      smtpSettings: 'Paramètres SMTP',
      imapServer: 'Serveur IMAP',
      smtpServer: 'Serveur SMTP',
      port: 'Port',
      username: 'Nom d\'utilisateur',
      password: 'Mot de passe',
      useTls: 'Utiliser TLS/SSL',
      testConnection: 'Tester la connexion',
      testing: 'Test en cours...',
      connectionSuccess: 'Connexion réussie',
      connectionFailed: 'Connexion échouée',
      enterPassword: 'Entrer le mot de passe',
      passwordUnchanged: '(inchangé)',
      usuallySameAsEmail: 'Généralement identique à l\'email',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Authentification Gmail OAuth 2.0',
      gmailOAuthHint: 'Vous serez redirigé vers Google. Configurez les identifiants OAuth dans les paramètres IA.',
    },
  },
  de: {
    translation: {
      // Sidebar
      compose: 'Verfassen',
      settings: 'Einstellungen',
      addAccount: 'Konto hinzufügen',
      inbox: 'Posteingang',
      sent: 'Gesendet',
      drafts: 'Entwürfe',
      trash: 'Papierkorb',
      spam: 'Spam',
      starred: 'Markiert',
      calendar: 'Kalender',
      searchEmails: 'Emails suchen...',
      noEmails: 'Keine Emails',

      // Tabs
      primary: 'Primär',
      social: 'Sozial',
      promotions: 'Werbung',

      // Mail Detail
      reply: 'Antworten',
      forward: 'Weiterleiten',
      delete: 'Löschen',
      ai: 'KI',
      selectMailToRead: 'Wählen Sie eine Email zum Lesen',
      chooseMailToView: 'Wählen Sie eine Email aus der Liste, um deren Inhalt anzuzeigen',
      attachments: 'Anhänge',

      // Actions
      copy: 'Kopieren',
      useThisReply: 'Diese Antwort verwenden',

      // AI Panel
      aiAssistant: 'KI-Assistent',
      translate: 'Übersetzen',
      summarize: 'Zusammenfassen',
      reply: 'Antworten',
      aiProcessing: 'KI-Verarbeitung...',
      translationResult: 'Übersetzungsergebnis',
      summary: 'Zusammenfassung',
      replySuggestion: 'Antwortvorschlag',

      // Compose
      newMail: 'Neue Email',
      from: 'Von',
      to: 'An',
      cc: 'CC',
      subject: 'Betreff',
      body: 'Inhalt',
      send: 'Senden',
      cancel: 'Abbrechen',
      sending: 'Wird gesendet...',
      saving: 'Speichern...',
      aiPolish: 'Polieren',
      aiTranslate: 'Übersetzen',
      multipleRecipients: 'Empfänger mit Kommas trennen',

      // Settings
      settingsTitle: 'Einstellungen',
      general: 'Allgemein',
      account: 'Konto',
      appLanguage: 'App-Sprache',
      appLanguageHint: 'Anzeigesprache der App-Oberfläche festlegen',
      aiTargetLanguage: 'KI-Zielsprache',
      aiTargetLanguageHint: 'Ausgabesprache für Übersetzung, Zusammenfassung und Antwort',
      apiConfig: 'API-Konfiguration',
      apiUrl: 'API-URL',
      apiKey: 'API-Schlüssel',
      model: 'Modell',
      saveSettings: 'Einstellungen speichern',
      settingsSaved: '✓ Einstellungen gespeichert',

      // Account
      addEmailAccount: 'Email-Konto hinzufügen',
      manageGoogleAccount: 'Google-Konto verwalten',
      deleteAccount: 'Konto löschen',
      default: 'Standard',

      // Time
      justNow: 'Gerade eben',
      minutesAgo: 'vor {{count}}m',
      hoursAgo: 'vor {{count}}h',
      daysAgo: 'vor {{count}}d',
      today: 'Heute',
      yesterday: 'Gestern',
      thisWeek: 'Diese Woche',
      thisMonth: 'Dieser Monat',
      older: 'Älter',

      // Sidebar
      allAccounts: 'Alle Konten',

      // Bulk actions
      selectAll: 'Alle auswählen',
      markAsRead: 'Als gelesen markieren',
      markAsUnread: 'Als ungelesen markieren',
      delete: 'Löschen',
      refresh: 'Aktualisieren',
      selected: 'ausgewählt',

      // Common
      loading: 'Laden...',

      // Validation
      validateRecipientRequired: 'Empfänger ist erforderlich',
      validateSubjectRequired: 'Betreff ist erforderlich',
      validateAccountRequired: 'Senden-Konto auswählen',
      validateEmailRequired: 'E-Mail-Adresse ist erforderlich',
      validateEmailInvalid: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
      validateImapRequired: 'IMAP-Server ist erforderlich',
      validateSmtpRequired: 'SMTP-Server ist erforderlich',
      validatePortInvalid: 'Port muss zwischen 1 und 65535 liegen',
      validateDisplayNameTooShort: 'Name muss mindestens 2 Zeichen haben',

      // Add Account Dialog
      emailProvider: 'E-Mail-Anbieter',
      emailAddress: 'E-Mail-Adresse',
      displayName: 'Anzeigename',
      authMethod: 'Authentifizierungsmethode',
      imapSettings: 'IMAP-Einstellungen',
      smtpSettings: 'SMTP-Einstellungen',
      imapServer: 'IMAP-Server',
      smtpServer: 'SMTP-Server',
      port: 'Port',
      username: 'Benutzername',
      password: 'Passwort',
      useTls: 'TLS/SSL verwenden',
      testConnection: 'Verbindung testen',
      testing: 'Teste...',
      connectionSuccess: 'Verbindung erfolgreich',
      connectionFailed: 'Verbindung fehlgeschlagen',
      enterPassword: 'Passwort eingeben',
      passwordUnchanged: '(unverändert)',
      usuallySameAsEmail: 'Normalerweise wie E-Mail',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Gmail OAuth 2.0-Authentifizierung',
      gmailOAuthHint: 'Sie werden zu Google weitergeleitet. Konfigurieren Sie OAuth-Anmeldedaten in den KI-Einstellungen.',
    },
  },
  ru: {
    translation: {
      // Sidebar
      compose: 'Написать',
      settings: 'Настройки',
      addAccount: 'Добавить аккаунт',
      inbox: 'Входящие',
      sent: 'Отправленные',
      drafts: 'Черновики',
      trash: 'Корзина',
      spam: 'Спам',
      starred: 'Избранные',
      calendar: 'Календарь',
      searchEmails: 'Поиск писем...',
      noEmails: 'Нет писем',

      // Tabs
      primary: 'Основные',
      social: 'Социальные',
      promotions: 'Рекламные',

      // Mail Detail
      reply: 'Ответить',
      forward: 'Переслать',
      delete: 'Удалить',
      ai: 'ИИ',
      selectMailToRead: 'Выберите письмо для чтения',
      chooseMailToView: 'Выберите письмо из списка, чтобы просмотреть его содержимое',
      attachments: 'вложений',

      // Actions
      copy: 'Копировать',
      useThisReply: 'Использовать этот ответ',

      // AI Panel
      aiAssistant: 'ИИ-помощник',
      translate: 'Перевести',
      summarize: 'Резюме',
      reply: 'Ответить',
      aiProcessing: 'ИИ обрабатывает...',
      translationResult: 'Результат перевода',
      summary: 'Резюме',
      replySuggestion: 'Предложение ответа',

      // Compose
      newMail: 'Новое письмо',
      from: 'От',
      to: 'Кому',
      cc: 'Копия',
      subject: 'Тема',
      body: 'Содержание',
      send: 'Отправить',
      cancel: 'Отмена',
      sending: 'Отправка...',
      saving: 'Сохранение...',
      aiPolish: 'Улучшить',
      aiTranslate: 'Перевести',
      multipleRecipients: 'Получатели разделяются запятыми',

      // Settings
      settingsTitle: 'Настройки',
      general: 'Общие',
      account: 'Аккаунт',
      appLanguage: 'Язык приложения',
      appLanguageHint: 'Установить язык интерфейса приложения',
      aiTargetLanguage: 'Целевой язык ИИ',
      aiTargetLanguageHint: 'Язык вывода для перевода, резюме и ответа',
      apiConfig: 'Конфигурация API',
      apiUrl: 'URL API',
      apiKey: 'API-ключ',
      model: 'Модель',
      saveSettings: 'Сохранить настройки',
      settingsSaved: '✓ Настройки сохранены',

      // Account
      addEmailAccount: 'Добавить email-аккаунт',
      manageGoogleAccount: 'Управление аккаунтом Google',
      deleteAccount: 'Удалить аккаунт',
      default: 'По умолчанию',

      // Time
      justNow: 'Только что',
      minutesAgo: '{{count}}м назад',
      hoursAgo: '{{count}}ч назад',
      daysAgo: '{{count}}д назад',
      today: 'Сегодня',
      yesterday: 'Вчера',
      thisWeek: 'На этой неделе',
      thisMonth: 'В этом месяце',
      older: 'Ранее',

      // Sidebar
      allAccounts: 'Все аккаунты',

      // Bulk actions
      selectAll: 'Выбрать все',
      markAsRead: 'Отметить как прочитанное',
      markAsUnread: 'Отметить как непрочитанное',
      delete: 'Удалить',
      refresh: 'Обновить',
      selected: 'выбрано',

      // Common
      loading: 'Загрузка...',

      // Validation
      validateRecipientRequired: 'Укажите получателя',
      validateSubjectRequired: 'Укажите тему',
      validateAccountRequired: 'Выберите отправляющий аккаунт',
      validateEmailRequired: 'Введите адрес email',
      validateEmailInvalid: 'Введите корректный адрес email',
      validateImapRequired: 'Сервер IMAP обязателен',
      validateSmtpRequired: 'Сервер SMTP обязателен',
      validatePortInvalid: 'Порт должен быть от 1 до 65535',
      validateDisplayNameTooShort: 'Имя должно содержать минимум 2 символа',

      // Add Account Dialog
      emailProvider: 'Почтовый сервис',
      emailAddress: 'Адрес email',
      displayName: 'Отображаемое имя',
      authMethod: 'Способ аутентификации',
      imapSettings: 'Настройки IMAP',
      smtpSettings: 'Настройки SMTP',
      imapServer: 'Сервер IMAP',
      smtpServer: 'Сервер SMTP',
      port: 'Порт',
      username: 'Имя пользователя',
      password: 'Пароль',
      useTls: 'Использовать TLS/SSL',
      testConnection: 'Проверить подключение',
      testing: 'Проверка...',
      connectionSuccess: 'Подключение успешно',
      connectionFailed: 'Подключение не удалось',
      enterPassword: 'Введите пароль',
      passwordUnchanged: '(без изменений)',
      usuallySameAsEmail: 'Обычно совпадает с email',
      googleOAuth: 'Google OAuth',
      gmailOAuthNote: 'Аутентификация Gmail OAuth 2.0',
      gmailOAuthHint: 'Вы будете перенаправлены в Google. Настройте OAuth-учетные данные в настройках ИИ.',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'zh',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
