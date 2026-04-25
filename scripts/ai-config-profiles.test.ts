import fs from 'fs';
import path from 'path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function testAIServiceSupportsTwoProfiles() {
  const service = read('src/main/services/ai.ts');
  assert(service.includes("export type AIConfigProfileId = 'primary' | 'secondary'"), 'Expected stable AI profile ids');
  assert(service.includes("getSetting('ai_active_profile')"), 'Expected active AI profile setting');
  assert(service.includes("'ai_secondary_base_url'"), 'Expected secondary API base URL setting');
  assert(service.includes("'ai_secondary_api_key'"), 'Expected secondary API key setting');
  assert(service.includes("'ai_secondary_model'"), 'Expected secondary model setting');
  assert(service.includes('getSecureSetting(key)'), 'Expected AI config reads to prefer secure API key storage');
  assert(service.includes('setSecureSetting(apiKeyKey, trimmedApiKey)'), 'Expected AI config saves to use secure API key storage');
  assert(service.includes('migrateLegacyAIApiKey(profileId)'), 'Expected legacy plaintext AI keys to migrate on read/init');
  assert(service.includes('const activeProfile = snapshot.profiles[snapshot.activeProfileId]'), 'Expected AI calls to resolve config from active profile');
}

function testAIIPCExposesProfilesWithoutBreakingOldShape() {
  const ipc = read('src/main/ipc/ai.ts');
  assert(ipc.includes('baseUrl: config.baseUrl'), 'Expected legacy baseUrl in ai:getConfig');
  assert(ipc.includes('model: config.model'), 'Expected legacy model in ai:getConfig');
  assert(ipc.includes('hasApiKey: !!config.apiKey'), 'Expected legacy hasApiKey in ai:getConfig');
  assert(ipc.includes('activeProfileId: snapshot.activeProfileId'), 'Expected active profile in ai:getConfig');
  assert(ipc.includes("profileId?: 'primary' | 'secondary'"), 'Expected ai:saveConfig to accept profile id');
  assert(ipc.includes("activeProfileId?: 'primary' | 'secondary'"), 'Expected ai:saveConfig to switch active profile');
}

function testSettingsModalProvidesFastProfileSwitch() {
  const settings = read('src/renderer/components/SettingsModal.tsx');
  assert(settings.includes("type AIConfigProfileId = 'primary' | 'secondary'"), 'Expected renderer AI profile ids');
  assert(settings.includes('selectedApiProfile'), 'Expected selected API profile state');
  assert(settings.includes('activeApiProfile'), 'Expected active API profile state');
  assert(settings.includes('handleActivateApiProfile'), 'Expected fast active-profile switch action');
  assert(settings.includes('profileId: selectedApiProfile'), 'Expected API save to target selected profile');
  assert(settings.includes('apiSaveError'), 'Expected settings modal to surface AI API key save errors');
  assert(settings.includes("response.error || 'Failed to save AI config'"), 'Expected explicit AI config save failure path');
}

function run() {
  testAIServiceSupportsTwoProfiles();
  testAIIPCExposesProfilesWithoutBreakingOldShape();
  testSettingsModalProvidesFastProfileSwitch();
  console.log('ai config profile tests passed');
}

run();
