import type { ShelfItem } from '../types';

export async function getReminders(): Promise<ShelfItem[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    const items = localStorage.getItem('shelf_reminders');
    return items ? JSON.parse(items) : [];
  }
  const data = await chrome.storage.local.get('reminders');
  const reminders = (data.reminders || {}) as Record<string, ShelfItem>;
  return Object.values(reminders).sort((a, b) => a.remindAt - b.remindAt);
}

export async function getReminder(id: string): Promise<ShelfItem | undefined> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    const items = await getReminders();
    return items.find(i => i.id === id);
  }
  const data = await chrome.storage.local.get('reminders');
  const reminders = (data.reminders || {}) as Record<string, ShelfItem>;
  return reminders[id];
}

export async function saveReminder(item: ShelfItem): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    const items = await getReminders();
    const index = items.findIndex(i => i.id === item.id);
    if (index > -1) {
      items[index] = item;
    } else {
      items.push(item);
    }
    localStorage.setItem('shelf_reminders', JSON.stringify(items));
    return;
  }
  
  const data = await chrome.storage.local.get('reminders');
  const reminders = (data.reminders || {}) as Record<string, ShelfItem>;
  reminders[item.id] = item;
  await chrome.storage.local.set({ reminders });

  await chrome.alarms.create(item.id, { when: item.remindAt });
}

export async function deleteReminder(id: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    const items = await getReminders();
    const filtered = items.filter(i => i.id !== id);
    localStorage.setItem('shelf_reminders', JSON.stringify(filtered));
    return;
  }

  const data = await chrome.storage.local.get('reminders');
  const reminders = (data.reminders || {}) as Record<string, ShelfItem>;
  delete reminders[id];
  await chrome.storage.local.set({ reminders });
  await chrome.alarms.clear(id);
}

export async function postponeReminder(id: string, minutes: number): Promise<void> {
  const item = await getReminder(id);
  if (!item) return;

  const newRemindAt = Date.now() + minutes * 60 * 1000;
  const updatedItem: ShelfItem = {
    ...item,
    remindAt: newRemindAt,
  };
  await saveReminder(updatedItem);
}

export async function postponeToDate(id: string, targetTime: number): Promise<void> {
  const item = await getReminder(id);
  if (!item) return;

  const updatedItem: ShelfItem = {
    ...item,
    remindAt: targetTime,
  };
  await saveReminder(updatedItem);
}
