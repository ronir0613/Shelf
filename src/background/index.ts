import { getReminder, deleteReminder, getReminders } from '../lib/storage';
import type { ShelfItem } from '../types';

// Context menu item IDs
const SHELF_PAGE_ID = 'shelf-page';
const SHELF_LINK_ID = 'shelf-link';

// Helper to open popup window centered or in standard size
function openPopup(url: string) {
  const width = 450;
  const height = 550;
  
  chrome.windows.create({
    url: chrome.runtime.getURL(url),
    type: 'popup',
    width: width,
    height: height,
    focused: true
  });
}

// Set up context menus on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: SHELF_PAGE_ID,
    title: 'Shelf This Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: SHELF_LINK_ID,
    title: 'Shelf This Link',
    contexts: ['link']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SHELF_PAGE_ID) {
    const url = info.pageUrl || '';
    const title = tab?.title || 'Webpage';
    openPopup(`options.html?action=add&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
  } else if (info.menuItemId === SHELF_LINK_ID) {
    const url = info.linkUrl || '';
    // Use selection text if available, otherwise use hostname or "Link"
    let title = info.selectionText || '';
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = 'Shared Link';
      }
    }
    openPopup(`options.html?action=add&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`);
  }
});

// Queue management for overdue notifications
async function getNotificationQueue(): Promise<ShelfItem[]> {
  const data = await chrome.storage.local.get('notificationQueue');
  return (data.notificationQueue || []) as ShelfItem[];
}

async function saveNotificationQueue(queue: ShelfItem[]): Promise<void> {
  await chrome.storage.local.set({ notificationQueue: queue });
}

async function triggerNextNotification(): Promise<void> {
  const queue = await getNotificationQueue();
  if (queue.length === 0) return;

  const nextItem = queue[0];
  
  chrome.notifications.create(nextItem.id, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Shelf Reminder',
    message: nextItem.title,
    contextMessage: nextItem.note || undefined,
    buttons: [
      { title: 'Open' },
      { title: 'Postpone / Options' }
    ],
    requireInteraction: true
  });
}

async function handleNotificationClosedOrActioned(notificationId: string): Promise<void> {
  const queue = await getNotificationQueue();
  const updatedQueue = queue.filter(item => item.id !== notificationId);
  await saveNotificationQueue(updatedQueue);

  if (updatedQueue.length > 0) {
    setTimeout(async () => {
      await triggerNextNotification();
    }, 500);
  }
}

// Handle alarms (reminder time arrived)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const item = await getReminder(alarm.name);
  if (!item) return;

  const queue = await getNotificationQueue();
  if (!queue.some(q => q.id === item.id)) {
    queue.push(item);
    await saveNotificationQueue(queue);
  }

  if (queue.length === 1) {
    await triggerNextNotification();
  }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const item = await getReminder(notificationId);
  if (!item) {
    await handleNotificationClosedOrActioned(notificationId);
    return;
  }

  if (buttonIndex === 0) {
    chrome.tabs.create({ url: item.url });
    await deleteReminder(notificationId);
    chrome.notifications.clear(notificationId);
  } else if (buttonIndex === 1) {
    openPopup(`options.html?action=postpone&id=${notificationId}`);
    chrome.notifications.clear(notificationId);
  }
});

// Handle notification body clicks (behaves as Open)
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const item = await getReminder(notificationId);
  if (item) {
    chrome.tabs.create({ url: item.url });
    await deleteReminder(notificationId);
  }
  chrome.notifications.clear(notificationId);
});

// Handle notification closed
chrome.notifications.onClosed.addListener(async (notificationId) => {
  await handleNotificationClosedOrActioned(notificationId);
});

// Handle startup overdue checks
chrome.runtime.onStartup.addListener(async () => {
  const reminders = await getReminders();
  const now = Date.now();
  
  const overdue = reminders.filter(item => item.remindAt <= now);
  if (overdue.length === 0) return;

  await saveNotificationQueue(overdue);
  await triggerNextNotification();
});
