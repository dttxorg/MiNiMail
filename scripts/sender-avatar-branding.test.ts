import { getSenderAvatarBranding } from '../src/renderer/utils/senderAvatarBranding';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function testWhitelistedBrandLogo() {
  const branding = getSenderAvatarBranding('news@insideapple.apple.com', 'Good Morning From Apple News');
  assert(branding.kind === 'logo', 'Expected Apple sender to use a whitelisted logo');
  assert(branding.logoUrl.includes('apple.com'), 'Expected Apple logo URL to point to apple.com');
}

function testFreeMailboxFallsBackToInitials() {
  const branding = getSenderAvatarBranding('someone@gmail.com', '朱立');
  assert(branding.kind === 'initials', 'Expected free mailbox provider to fall back to initials');
  assert(branding.initials === '朱立', `Expected initials to keep first two characters, got ${branding.initials}`);
}

function testUnknownEnterpriseDomainFallsBackToInitials() {
  const branding = getSenderAvatarBranding('alerts@unknown-example.invalid', 'Unknown Example');
  assert(branding.kind === 'initials', 'Expected unknown enterprise domain to fall back to initials');
}

function run() {
  testWhitelistedBrandLogo();
  testFreeMailboxFallsBackToInitials();
  testUnknownEnterpriseDomainFallsBackToInitials();
  console.log('sender-avatar-branding tests passed');
}

run();
