export function formatMailListDate(date: Date, locale: string | undefined, now: Date = new Date()): string {
  if (date.getFullYear() !== now.getFullYear()) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return date.toLocaleDateString(locale || undefined, { month: 'numeric', day: 'numeric' });
}
