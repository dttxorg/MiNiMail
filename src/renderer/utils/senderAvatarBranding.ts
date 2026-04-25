const FREE_MAILBOX_PROVIDER_BLACKLIST = new Set([
  'gmail.com', 'qq.com', '163.com', 'outlook.com',
  'hotmail.com', 'yahoo.com', 'foxmail.com', 'icloud.com',
  '126.com', 'sina.com', 'sohu.com', 'tom.com',
  'proton.me', 'protonmail.com', 'aol.com', 'live.com',
  'msn.com', 'ymail.com',
]);

type BrandRule = {
  domains: string[];
  logoUrl: string;
};

const BRAND_RULES: BrandRule[] = [
  { domains: ['apple.com'], logoUrl: 'https://www.apple.com/favicon.ico' },
  { domains: ['github.com', 'githubusercontent.com'], logoUrl: 'https://github.com/favicon.ico' },
  { domains: ['slack.com'], logoUrl: 'https://slack.com/favicon.ico' },
  { domains: ['kraken.com'], logoUrl: 'https://www.kraken.com/favicon.ico' },
  { domains: ['trip.com'], logoUrl: 'https://www.trip.com/favicon.ico' },
  { domains: ['ifttt.com'], logoUrl: 'https://ifttt.com/favicon.ico' },
  { domains: ['google.com'], logoUrl: 'https://www.google.com/favicon.ico' },
  { domains: ['openai.com'], logoUrl: 'https://openai.com/favicon.ico' },
  { domains: ['anthropic.com'], logoUrl: 'https://www.anthropic.com/favicon.ico' },
  { domains: ['notion.so', 'notion.site'], logoUrl: 'https://www.notion.so/front-static/favicon.ico' },
  { domains: ['zoom.us'], logoUrl: 'https://st1.zoom.us/zoom.ico' },
  { domains: ['dropbox.com'], logoUrl: 'https://www.dropbox.com/favicon.ico' },
  { domains: ['figma.com'], logoUrl: 'https://static.figma.com/app/icon/1/favicon.ico' },
  { domains: ['stripe.com'], logoUrl: 'https://stripe.com/favicon.ico' },
  { domains: ['paypal.com'], logoUrl: 'https://www.paypalobjects.com/webstatic/icon/favicon.ico' },
  { domains: ['airbnb.com'], logoUrl: 'https://www.airbnb.com/favicon.ico' },
  { domains: ['amazon.com', 'amazonaws.com'], logoUrl: 'https://www.amazon.com/favicon.ico' },
  { domains: ['linkedin.com'], logoUrl: 'https://www.linkedin.com/favicon.ico' },
  { domains: ['microsoft.com', 'office.com'], logoUrl: 'https://www.microsoft.com/favicon.ico' },
  { domains: ['discord.com'], logoUrl: 'https://discord.com/assets/847541504914fd33810e70a0ea73177e.ico' },
  { domains: ['reddit.com'], logoUrl: 'https://www.redditstatic.com/shreddit/assets/favicon/64x64.png' },
  { domains: ['substack.com'], logoUrl: 'https://substack.com/img/substack.png' },
  { domains: ['medium.com'], logoUrl: 'https://medium.com/favicon.ico' },
  { domains: ['shopify.com'], logoUrl: 'https://cdn.shopify.com/shopifycloud/web/assets/v1/favicon.ico' },
  { domains: ['cloudflare.com'], logoUrl: 'https://www.cloudflare.com/favicon.ico' },
  { domains: ['atlassian.com'], logoUrl: 'https://www.atlassian.com/favicon.ico' },
  { domains: ['jira.com'], logoUrl: 'https://www.atlassian.com/favicon.ico' },
  { domains: ['trello.com'], logoUrl: 'https://trello.com/favicon.ico' },
  { domains: ['asana.com'], logoUrl: 'https://asana.com/favicon.ico' },
  { domains: ['mailchimp.com'], logoUrl: 'https://mailchimp.com/favicon.ico' },
  { domains: ['hubspot.com'], logoUrl: 'https://www.hubspot.com/favicon.ico' },
  { domains: ['zoho.com'], logoUrl: 'https://www.zoho.com/favicon.ico' },
  { domains: ['oracle.com'], logoUrl: 'https://www.oracle.com/favicon.ico' },
  { domains: ['salesforce.com'], logoUrl: 'https://www.salesforce.com/favicon.ico' },
  { domains: ['ibm.com'], logoUrl: 'https://www.ibm.com/favicon.ico' },
  { domains: ['netflix.com'], logoUrl: 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2023.ico' },
  { domains: ['spotify.com'], logoUrl: 'https://open.spotifycdn.com/cdn/images/favicon32.b64ecc03.png' },
  { domains: ['uber.com'], logoUrl: 'https://www.uber.com/favicon.ico' },
  { domains: ['booking.com'], logoUrl: 'https://cf.bstatic.com/static/img/favicon/favicon.ico' },
  { domains: ['expedia.com'], logoUrl: 'https://www.expedia.com/favicon.ico' },
  { domains: ['canva.com'], logoUrl: 'https://static.canva.com/static/images/favicon.ico' },
  { domains: ['telegram.org'], logoUrl: 'https://telegram.org/favicon.ico' },
  { domains: ['whatsapp.com'], logoUrl: 'https://static.whatsapp.net/rsrc.php/yl/r/0Z0Y4GkF8qC.ico' },
  { domains: ['facebook.com', 'meta.com'], logoUrl: 'https://static.xx.fbcdn.net/rsrc.php/yD/r/d4ZIVX-5C-b.ico' },
  { domains: ['instagram.com'], logoUrl: 'https://static.cdninstagram.com/rsrc.php/v4/yI/r/VsNE-OHk_8a.png' },
  { domains: ['x.com', 'twitter.com'], logoUrl: 'https://abs.twimg.com/favicons/twitter.3.ico' },
  { domains: ['binance.com'], logoUrl: 'https://www.binance.com/favicon.ico' },
  { domains: ['coinbase.com'], logoUrl: 'https://www.coinbase.com/favicon.ico' },
  { domains: ['benzinga.com'], logoUrl: 'https://www.benzinga.com/favicon.ico' },
  { domains: ['chinadigitaltimes.net'], logoUrl: 'https://chinadigitaltimes.net/favicon.ico' },
  { domains: ['mistral.ai'], logoUrl: 'https://mistral.ai/favicon.ico' },
];

export type SenderAvatarBranding =
  | { kind: 'logo'; logoUrl: string; initials: string }
  | { kind: 'initials'; initials: string };

function extractDomain(email?: string): string {
  if (!email || !email.includes('@')) return '';
  return email.split('@')[1].trim().toLowerCase();
}

function matchesDomain(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

function findBrandLogoUrl(domain: string): string | null {
  if (!domain || FREE_MAILBOX_PROVIDER_BLACKLIST.has(domain)) return null;
  for (const rule of BRAND_RULES) {
    if (rule.domains.some((candidate) => matchesDomain(domain, candidate))) {
      return rule.logoUrl;
    }
  }
  return null;
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const compact = trimmed.replace(/\s+/g, '');
  return compact.slice(0, 2).toUpperCase();
}

export function getSenderAvatarBranding(email?: string, name?: string): SenderAvatarBranding {
  const displayName = name || email || '';
  const initials = getInitials(displayName);
  const logoUrl = findBrandLogoUrl(extractDomain(email));

  if (logoUrl) {
    return { kind: 'logo', logoUrl, initials };
  }

  return { kind: 'initials', initials };
}
