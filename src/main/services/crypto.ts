// src/main/services/crypto.ts
import { safeStorage } from 'electron';
import log from 'electron-log';

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function encryptCredential(plain: string): Buffer {
  if (!isEncryptionAvailable()) {
    log.error('safeStorage encryption is not available on this system');
    throw new Error('Encryption not available: safeStorage is not supported or not accessible');
  }
  const encrypted = safeStorage.encryptString(plain);
  log.info('Credential encrypted successfully');
  return encrypted;
}

export function decryptCredential(encrypted: Buffer): string {
  if (!isEncryptionAvailable()) {
    log.error('safeStorage encryption is not available on this system');
    throw new Error('Encryption not available: safeStorage is not supported or not accessible');
  }
  const decrypted = safeStorage.decryptString(encrypted);
  return decrypted;
}
