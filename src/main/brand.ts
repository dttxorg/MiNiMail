import { app } from 'electron';
import path from 'path';

export const APP_NAME = 'MiNiMail';
export const APP_USER_MODEL_ID = 'com.minimail.email';

export function getAppIconPath(format: 'png' | 'ico' = 'png'): string {
  return path.join(app.getAppPath(), 'build', 'icons', format === 'ico' ? 'icon.ico' : 'app-icon.png');
}

export function getMailNotificationIconPath(): string {
  return getAppIconPath('png');
}
