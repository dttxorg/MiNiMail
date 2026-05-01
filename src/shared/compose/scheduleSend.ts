export type ComposeSchedulePreset = '10m' | 'this_evening' | 'tomorrow_morning';

export interface ScheduleValidationResult {
  ok: boolean;
  scheduledAt?: Date;
  error?: 'past' | 'invalid';
}

export type ScheduledSendCountdownStatus = 'future' | 'due' | 'missed' | 'cancelled' | 'failed' | 'sent';

export interface ScheduledSendCountdown {
  status: ScheduledSendCountdownStatus;
  label: string;
  minutesRemaining: number;
}

export function getSchedulePresetTime(
  preset: ComposeSchedulePreset,
  now: Date = new Date(),
): Date {
  const base = new Date(now);
  if (preset === '10m') {
    return new Date(base.getTime() + 10 * 60 * 1000);
  }

  if (preset === 'this_evening') {
    const evening = new Date(base);
    evening.setHours(18, 0, 0, 0);
    if (evening.getTime() <= base.getTime()) {
      evening.setDate(evening.getDate() + 1);
    }
    return evening;
  }

  const tomorrowMorning = new Date(base);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);
  return tomorrowMorning;
}

export function validateScheduledAt(
  value: Date | string,
  now: Date = new Date(),
): ScheduleValidationResult {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return { ok: false, error: 'invalid' };
  }
  if (date.getTime() <= now.getTime()) {
    return { ok: false, error: 'past' };
  }
  return { ok: true, scheduledAt: date };
}

export function formatScheduledSendCountdown(
  scheduledAt: Date | string,
  status: string = 'scheduled',
  now: Date = new Date(),
  language: 'zh' | 'en' | string = 'en',
): ScheduledSendCountdown {
  const date = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  const zh = language === 'zh';

  if (!Number.isFinite(date.getTime())) {
    return { status: 'due', label: zh ? '等待处理' : 'Due', minutesRemaining: 0 };
  }

  if (status === 'cancelled') {
    return { status: 'cancelled', label: zh ? '已取消' : 'Cancelled', minutesRemaining: 0 };
  }
  if (status === 'failed') {
    return { status: 'failed', label: zh ? '发送失败' : 'Failed', minutesRemaining: 0 };
  }
  if (status === 'sent') {
    return { status: 'sent', label: zh ? '已发送' : 'Sent', minutesRemaining: 0 };
  }
  if (status === 'missed') {
    return { status: 'missed', label: zh ? '已错过' : 'Missed', minutesRemaining: 0 };
  }

  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { status: 'due', label: zh ? '等待处理' : 'Due', minutesRemaining: 0 };
  }

  const minutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (minutes < 60) {
    return {
      status: 'future',
      label: zh ? `${minutes} 分钟后发送` : `Sends in ${minutes} min`,
      minutesRemaining: minutes,
    };
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return {
    status: 'future',
    label: zh
      ? remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分钟后发送` : `${hours} 小时后发送`
      : remainingMinutes > 0 ? `Sends in ${hours}h ${remainingMinutes}m` : `Sends in ${hours}h`,
    minutesRemaining: minutes,
  };
}
