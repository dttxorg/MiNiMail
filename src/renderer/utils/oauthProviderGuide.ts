import type { AppLanguage } from './aiLanguages';

export type OAuthProvider = 'gmail' | 'outlook' | 'yahoo';

type GuideLink = {
  label: string;
  url: string;
};

type GuideCopy = {
  panelTitle: string;
  guideShow: string;
  guideHide: string;
  guideTitle: string;
  guideIntro: string;
  linksTitle: string;
  stepsTitle: string;
  redirectHint: string;
  clientIdLabel: string;
  clientSecretLabel: string;
  clientSecretOptional: string;
  clientIdRequired: string;
  waitingBrowser: string;
  authorize: string;
  authorizeAgain: string;
  authorizedAs: string;
  oauthFailed: string;
};

type ProviderDefinition = {
  providerLabel: string;
  secretOptional: boolean;
  links: GuideLink[];
  steps: string[];
};

export type OAuthProviderGuide = GuideCopy & ProviderDefinition;

export function resolveOauthClientConfig(data?: { clientId?: string; clientSecret?: string } | null) {
  return {
    clientId: data?.clientId?.trim() ?? '',
    clientSecret: data?.clientSecret?.trim() ?? '',
  };
}

const COMMON_COPY: Record<AppLanguage, GuideCopy> = {
  zh: {
    panelTitle: 'OAuth 连接',
    guideShow: '查看配置教程',
    guideHide: '收起配置教程',
    guideTitle: 'OAuth 配置教程',
    guideIntro: '下面是适合 minimail 的最短配置路径。完成后把 Client ID 和 Client Secret 填回当前窗口。',
    linksTitle: '官方入口',
    stepsTitle: '操作步骤',
    redirectHint: 'minimail 使用系统浏览器 + 本机回环地址完成授权。请选择桌面应用 / 原生应用；如果平台要求回调地址，请允许 127.0.0.1 本地回调。',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: '可留空',
    clientIdRequired: '请先输入 Client ID',
    waitingBrowser: '系统浏览器已打开，请完成授权后回到 minimail。',
    authorize: '使用 {provider} 账号授权',
    authorizeAgain: '重新授权',
    authorizedAs: '已授权：{email}',
    oauthFailed: 'OAuth 授权失败，请重试。',
  },
  en: {
    panelTitle: 'OAuth Connection',
    guideShow: 'Show setup guide',
    guideHide: 'Hide setup guide',
    guideTitle: 'OAuth setup guide',
    guideIntro: 'This is the shortest setup path that works with minimail. Paste the Client ID and Client Secret back into this dialog when finished.',
    linksTitle: 'Official links',
    stepsTitle: 'Steps',
    redirectHint: 'minimail uses the system browser with a local loopback callback. Choose Desktop / Native app. If the provider asks for a redirect URI, allow a 127.0.0.1 local callback.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: 'optional',
    clientIdRequired: 'Enter Client ID first',
    waitingBrowser: 'Your system browser is open. Finish authorization there, then return to minimail.',
    authorize: 'Authorize with {provider}',
    authorizeAgain: 'Authorize again',
    authorizedAs: 'Authorized: {email}',
    oauthFailed: 'OAuth authorization failed. Please try again.',
  },
  ja: {
    panelTitle: 'OAuth 接続',
    guideShow: '設定ガイドを表示',
    guideHide: '設定ガイドを閉じる',
    guideTitle: 'OAuth 設定ガイド',
    guideIntro: 'minimail で使える最短の設定手順です。完了したら Client ID と Client Secret をこの画面に戻して貼り付けてください。',
    linksTitle: '公式リンク',
    stepsTitle: '手順',
    redirectHint: 'minimail はシステムブラウザとローカル loopback コールバックで認証します。Desktop / Native app を選んでください。リダイレクト URI が必要な場合は 127.0.0.1 のローカルコールバックを許可してください。',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: '省略可',
    clientIdRequired: '先に Client ID を入力してください',
    waitingBrowser: 'システムブラウザが開いています。認証後に minimail へ戻ってください。',
    authorize: '{provider} で認証',
    authorizeAgain: '再認証',
    authorizedAs: '認証済み: {email}',
    oauthFailed: 'OAuth 認証に失敗しました。もう一度お試しください。',
  },
  ko: {
    panelTitle: 'OAuth 연결',
    guideShow: '설정 안내 보기',
    guideHide: '설정 안내 접기',
    guideTitle: 'OAuth 설정 안내',
    guideIntro: 'minimail에서 바로 쓸 수 있는 가장 짧은 설정 순서입니다. 완료 후 Client ID와 Client Secret을 이 창에 붙여 넣으세요.',
    linksTitle: '공식 링크',
    stepsTitle: '설정 단계',
    redirectHint: 'minimail은 시스템 브라우저와 로컬 loopback 콜백을 사용합니다. Desktop / Native app 유형을 선택하세요. 리디렉션 URI를 요구하면 127.0.0.1 로컬 콜백을 허용하세요.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: '선택 사항',
    clientIdRequired: '먼저 Client ID를 입력하세요',
    waitingBrowser: '시스템 브라우저가 열렸습니다. 인증을 마친 뒤 minimail로 돌아오세요.',
    authorize: '{provider} 계정으로 인증',
    authorizeAgain: '다시 인증',
    authorizedAs: '인증됨: {email}',
    oauthFailed: 'OAuth 인증에 실패했습니다. 다시 시도하세요.',
  },
  es: {
    panelTitle: 'Conexión OAuth',
    guideShow: 'Mostrar guía',
    guideHide: 'Ocultar guía',
    guideTitle: 'Guía de configuración OAuth',
    guideIntro: 'Esta es la ruta más corta para configurar minimail. Cuando termines, pega el Client ID y el Client Secret en esta ventana.',
    linksTitle: 'Enlaces oficiales',
    stepsTitle: 'Pasos',
    redirectHint: 'minimail usa el navegador del sistema con una devolución local loopback. Elige Desktop / Native app. Si el proveedor pide una URI de redirección, permite una devolución local en 127.0.0.1.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: 'opcional',
    clientIdRequired: 'Primero ingresa el Client ID',
    waitingBrowser: 'El navegador del sistema ya está abierto. Completa la autorización y vuelve a minimail.',
    authorize: 'Autorizar con {provider}',
    authorizeAgain: 'Autorizar de nuevo',
    authorizedAs: 'Autorizado: {email}',
    oauthFailed: 'La autorización OAuth falló. Inténtalo de nuevo.',
  },
  fr: {
    panelTitle: 'Connexion OAuth',
    guideShow: 'Afficher le guide',
    guideHide: 'Masquer le guide',
    guideTitle: 'Guide de configuration OAuth',
    guideIntro: 'Voici le chemin le plus court pour configurer minimail. Quand c’est prêt, recolle le Client ID et le Client Secret dans cette fenêtre.',
    linksTitle: 'Liens officiels',
    stepsTitle: 'Étapes',
    redirectHint: 'minimail utilise le navigateur système avec un retour loopback local. Choisissez Desktop / Native app. Si un URI de redirection est demandé, autorisez un callback local en 127.0.0.1.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: 'facultatif',
    clientIdRequired: 'Saisissez d’abord le Client ID',
    waitingBrowser: 'Le navigateur système est ouvert. Terminez l’autorisation puis revenez dans minimail.',
    authorize: 'Autoriser avec {provider}',
    authorizeAgain: 'Réautoriser',
    authorizedAs: 'Autorisé : {email}',
    oauthFailed: 'L’autorisation OAuth a échoué. Réessayez.',
  },
  de: {
    panelTitle: 'OAuth-Verbindung',
    guideShow: 'Anleitung anzeigen',
    guideHide: 'Anleitung ausblenden',
    guideTitle: 'OAuth-Einrichtung',
    guideIntro: 'Das ist der kürzeste Weg, um minimail einzurichten. Füge danach Client ID und Client Secret wieder in dieses Fenster ein.',
    linksTitle: 'Offizielle Links',
    stepsTitle: 'Schritte',
    redirectHint: 'minimail verwendet den Systembrowser mit lokalem Loopback-Callback. Wähle Desktop / Native app. Wenn ein Redirect URI verlangt wird, erlaube einen lokalen 127.0.0.1-Callback.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: 'optional',
    clientIdRequired: 'Bitte zuerst die Client ID eingeben',
    waitingBrowser: 'Der Systembrowser ist geöffnet. Schließe die Autorisierung dort ab und kehre dann zu minimail zurück.',
    authorize: 'Mit {provider} autorisieren',
    authorizeAgain: 'Erneut autorisieren',
    authorizedAs: 'Autorisiert: {email}',
    oauthFailed: 'OAuth-Autorisierung fehlgeschlagen. Bitte erneut versuchen.',
  },
  ru: {
    panelTitle: 'Подключение OAuth',
    guideShow: 'Показать инструкцию',
    guideHide: 'Скрыть инструкцию',
    guideTitle: 'Инструкция по OAuth',
    guideIntro: 'Это самый короткий путь настройки для minimail. После этого вставьте Client ID и Client Secret обратно в это окно.',
    linksTitle: 'Официальные ссылки',
    stepsTitle: 'Шаги',
    redirectHint: 'minimail использует системный браузер и локальный loopback callback. Выберите Desktop / Native app. Если сервис просит redirect URI, разрешите локальный callback на 127.0.0.1.',
    clientIdLabel: 'Client ID *',
    clientSecretLabel: 'Client Secret',
    clientSecretOptional: 'необязательно',
    clientIdRequired: 'Сначала введите Client ID',
    waitingBrowser: 'Системный браузер уже открыт. Завершите авторизацию и вернитесь в minimail.',
    authorize: 'Авторизоваться через {provider}',
    authorizeAgain: 'Авторизоваться снова',
    authorizedAs: 'Авторизовано: {email}',
    oauthFailed: 'Ошибка OAuth-авторизации. Попробуйте снова.',
  },
};

const PROVIDER_DEFINITIONS: Record<OAuthProvider, ProviderDefinition> = {
  gmail: {
    providerLabel: 'Google',
    secretOptional: false,
    links: [
      { label: 'Google Cloud Console', url: 'https://console.cloud.google.com/apis/credentials' },
      { label: 'OAuth consent screen', url: 'https://console.cloud.google.com/apis/credentials/consent' },
      { label: 'Gmail API', url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com' },
    ],
    steps: [
      'Create or select a Google Cloud project.',
      'Enable the Gmail API for that project.',
      'Open Credentials and create an OAuth client.',
      'Choose Desktop app for the application type.',
      'Copy the Client ID and Client Secret back into minimail.',
    ],
  },
  outlook: {
    providerLabel: 'Microsoft',
    secretOptional: true,
    links: [
      { label: 'Azure App registrations', url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' },
      { label: 'Microsoft Entra overview', url: 'https://entra.microsoft.com/' },
      { label: 'Microsoft Graph permissions', url: 'https://learn.microsoft.com/graph/permissions-reference' },
    ],
    steps: [
      'Open App registrations and create a new app.',
      'Add Mobile and desktop applications as the platform.',
      'Allow public client flows if Microsoft asks for it.',
      'Grant the mail permissions your tenant requires.',
      'Copy the Client ID and, if you created one, the Client Secret back into minimail.',
    ],
  },
  yahoo: {
    providerLabel: 'Yahoo',
    secretOptional: false,
    links: [
      { label: 'Yahoo Developer Apps', url: 'https://developer.yahoo.com/apps/' },
      { label: 'Yahoo OAuth docs', url: 'https://developer.yahoo.com/oauth2/guide/' },
    ],
    steps: [
      'Create a Yahoo developer app.',
      'Choose Installed Application / Native app if available.',
      'Enable the mail-related permissions the app needs.',
      'Save the app, then copy the Client ID and Client Secret.',
      'Paste both values into minimail and start authorization.',
    ],
  },
};

export function getOauthProviderGuide(provider: OAuthProvider, language: AppLanguage): OAuthProviderGuide {
  const copy = COMMON_COPY[language] ?? COMMON_COPY.en;
  const providerDef = PROVIDER_DEFINITIONS[provider];

  return {
    ...copy,
    ...providerDef,
    steps: localizeSteps(provider, language, providerDef.steps),
  };
}

function localizeSteps(provider: OAuthProvider, language: AppLanguage, fallback: string[]) {
  const localized: Record<AppLanguage, Record<OAuthProvider, string[]>> = {
    zh: {
      gmail: [
        '先创建或选择一个 Google Cloud 项目。',
        '在项目里启用 Gmail API。',
        '进入 Credentials，创建 OAuth client。',
        '应用类型选择 Desktop app。',
        '把生成的 Client ID 和 Client Secret 复制回 minimail。',
      ],
      outlook: [
        '进入 Azure / Entra 的 App registrations，新建应用。',
        '平台类型选择 Mobile and desktop applications。',
        '如果页面要求，开启 public client flow。',
        '给应用补齐邮件读取与发送所需权限。',
        '把 Client ID 与可选的 Client Secret 复制回 minimail。',
      ],
      yahoo: [
        '进入 Yahoo Developer，创建新的应用。',
        '优先选择 Installed Application / Native app 类型。',
        '开启邮件相关权限。',
        '保存应用后复制 Client ID 和 Client Secret。',
        '回到 minimail 粘贴后再开始授权。',
      ],
    },
    en: { gmail: fallback, outlook: fallback, yahoo: fallback },
    ja: {
      gmail: [
        'Google Cloud プロジェクトを作成または選択します。',
        'そのプロジェクトで Gmail API を有効にします。',
        'Credentials から OAuth client を作成します。',
        'アプリ種別は Desktop app を選びます。',
        'Client ID と Client Secret を minimail に貼り戻します。',
      ],
      outlook: [
        'Azure / Entra の App registrations で新しいアプリを作成します。',
        'プラットフォームは Mobile and desktop applications を選びます。',
        '必要なら public client flow を有効にします。',
        'メール送受信に必要な権限を追加します。',
        'Client ID と必要に応じて Client Secret を minimail に戻します。',
      ],
      yahoo: [
        'Yahoo Developer で新しいアプリを作成します。',
        'Installed Application / Native app を優先して選びます。',
        'メール関連の権限を有効にします。',
        '保存後に Client ID と Client Secret をコピーします。',
        'minimail に貼り付けてから認証を開始します。',
      ],
    },
    ko: {
      gmail: [
        'Google Cloud 프로젝트를 새로 만들거나 기존 프로젝트를 선택합니다.',
        '해당 프로젝트에서 Gmail API를 활성화합니다.',
        'Credentials에서 OAuth client를 생성합니다.',
        '앱 유형은 Desktop app을 선택합니다.',
        '발급된 Client ID와 Client Secret을 minimail에 붙여 넣습니다.',
      ],
      outlook: [
        'Azure / Entra의 App registrations에서 새 앱을 만듭니다.',
        '플랫폼은 Mobile and desktop applications를 선택합니다.',
        '필요하면 public client flow를 허용합니다.',
        '메일 읽기/보내기에 필요한 권한을 추가합니다.',
        'Client ID와 선택적 Client Secret을 minimail에 붙여 넣습니다.',
      ],
      yahoo: [
        'Yahoo Developer에서 새 앱을 만듭니다.',
        '가능하면 Installed Application / Native app 유형을 선택합니다.',
        '메일 관련 권한을 켭니다.',
        '저장 후 Client ID와 Client Secret을 복사합니다.',
        'minimail에 붙여 넣은 뒤 인증을 시작합니다.',
      ],
    },
    es: {
      gmail: [
        'Crea o elige un proyecto de Google Cloud.',
        'Activa Gmail API dentro del proyecto.',
        'Abre Credentials y crea un cliente OAuth.',
        'Elige Desktop app como tipo de aplicación.',
        'Copia el Client ID y el Client Secret de vuelta a minimail.',
      ],
      outlook: [
        'Crea una aplicación nueva en Azure / Entra App registrations.',
        'Selecciona Mobile and desktop applications como plataforma.',
        'Activa public client flow si Microsoft lo pide.',
        'Añade los permisos de correo que necesites.',
        'Pega el Client ID y, si existe, el Client Secret en minimail.',
      ],
      yahoo: [
        'Crea una app nueva en Yahoo Developer.',
        'Elige Installed Application / Native app si aparece.',
        'Activa los permisos relacionados con correo.',
        'Guarda la app y copia el Client ID y el Client Secret.',
        'Vuelve a minimail y comienza la autorización.',
      ],
    },
    fr: {
      gmail: [
        'Créez ou choisissez un projet Google Cloud.',
        'Activez Gmail API dans ce projet.',
        'Ouvrez Credentials puis créez un client OAuth.',
        'Choisissez Desktop app comme type d’application.',
        'Recopiez le Client ID et le Client Secret dans minimail.',
      ],
      outlook: [
        'Créez une application dans Azure / Entra App registrations.',
        'Choisissez Mobile and desktop applications comme plateforme.',
        'Activez public client flow si Microsoft le demande.',
        'Ajoutez les permissions mail nécessaires.',
        'Collez le Client ID et le Client Secret éventuel dans minimail.',
      ],
      yahoo: [
        'Créez une application dans Yahoo Developer.',
        'Choisissez de préférence Installed Application / Native app.',
        'Activez les permissions liées au mail.',
        'Enregistrez puis copiez le Client ID et le Client Secret.',
        'Revenez dans minimail et lancez l’autorisation.',
      ],
    },
    de: {
      gmail: [
        'Erstelle oder wähle ein Google-Cloud-Projekt.',
        'Aktiviere die Gmail API in diesem Projekt.',
        'Öffne Credentials und erstelle einen OAuth-Client.',
        'Wähle Desktop app als Anwendungstyp.',
        'Füge Client ID und Client Secret zurück in minimail ein.',
      ],
      outlook: [
        'Erstelle eine neue App in Azure / Entra App registrations.',
        'Wähle Mobile and desktop applications als Plattform.',
        'Erlaube public client flow, falls Microsoft es verlangt.',
        'Füge die benötigten Mail-Berechtigungen hinzu.',
        'Trage Client ID und optional Client Secret in minimail ein.',
      ],
      yahoo: [
        'Erstelle eine neue App bei Yahoo Developer.',
        'Wähle möglichst Installed Application / Native app.',
        'Aktiviere die benötigten Mail-Berechtigungen.',
        'Speichere die App und kopiere Client ID sowie Client Secret.',
        'Wechsle zurück zu minimail und starte die Autorisierung.',
      ],
    },
    ru: {
      gmail: [
        'Создайте или выберите проект Google Cloud.',
        'Включите Gmail API внутри проекта.',
        'Откройте Credentials и создайте OAuth client.',
        'В типе приложения выберите Desktop app.',
        'Скопируйте Client ID и Client Secret обратно в minimail.',
      ],
      outlook: [
        'Создайте приложение в Azure / Entra App registrations.',
        'Выберите платформу Mobile and desktop applications.',
        'При необходимости включите public client flow.',
        'Добавьте нужные почтовые разрешения.',
        'Вставьте Client ID и, если есть, Client Secret в minimail.',
      ],
      yahoo: [
        'Создайте новое приложение в Yahoo Developer.',
        'Если доступно, выберите Installed Application / Native app.',
        'Включите разрешения, связанные с почтой.',
        'Сохраните приложение и скопируйте Client ID и Client Secret.',
        'Вернитесь в minimail и запустите авторизацию.',
      ],
    },
  };

  return localized[language]?.[provider] ?? fallback;
}
