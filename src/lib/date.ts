export function formatRemindAt(time: number, everyday?: boolean): string {
  const date = new Date(time);
  const now = new Date();
  
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const timeStr = date.toLocaleTimeString(undefined, options);

  if (everyday) {
    return `Everyday at ${timeStr}`;
  }
  
  const isToday = date.toDateString() === now.toDateString();
  
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  } else {
    const sameYear = date.getFullYear() === now.getFullYear();
    const dateStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric'
    });
    return `${dateStr} at ${timeStr}`;
  }
}
