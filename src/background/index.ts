import { getReminder, deleteReminder, getReminders, saveReminder } from '../lib/storage';
import type { ShelfItem } from '../types';

// Context menu item IDs
const SHELF_PAGE_ID = 'shelf-page';
const SHELF_LINK_ID = 'shelf-link';

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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url = '';
  let title = '';

  if (info.menuItemId === SHELF_PAGE_ID) {
    url = info.pageUrl || '';
    title = tab?.title || 'Webpage';
  } else if (info.menuItemId === SHELF_LINK_ID) {
    url = info.linkUrl || '';
    title = info.selectionText || '';
    if (!title) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = 'Shared Link';
      }
    }
  }

  if (url) {
    const remindAt = Date.now() + 30 * 60 * 1000; // Default 30 minutes
    const newItem: ShelfItem = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Webpage',
      url,
      createdAt: Date.now(),
      remindAt,
      delivered: false
    };

    try {
      await saveReminder(newItem);
      
      // Show confirmation notification
      chrome.notifications.create(newItem.id + '-save', {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Saved to Shelf',
        message: `"${newItem.title}" will remind you in 30 mins.`,
        buttons: [
          { title: 'Snooze 1 Hour' },
          { title: 'Open Page' }
        ],
        requireInteraction: false
      });
    } catch (err) {
      console.error('Failed to save context menu item:', err);
    }
  }
});

// Helper to check and notify overdue reminders
async function checkOverdueReminders() {
  try {
    const reminders = await getReminders();
    const now = Date.now();
    const overdue = reminders.filter(item => item.remindAt <= now && !item.delivered);
    
    for (const item of overdue) {
      chrome.notifications.create(item.id, {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Shelf Reminder (Overdue)',
        message: item.title,
        contextMessage: item.note || undefined,
        buttons: [
          { title: 'Open Page' },
          { title: 'Postpone 15m' }
        ],
        requireInteraction: true
      });
      
      // Mark as delivered
      await saveReminder({ ...item, delivered: true });
    }
  } catch (err) {
    console.error('Error checking overdue reminders:', err);
  }
}

// Handle alarms (reminder time arrived)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const item = await getReminder(alarm.name);
  if (!item) return;

  // If already delivered, don't show notification
  if (item.delivered) return;

  chrome.notifications.create(item.id, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Shelf Reminder',
    message: item.title,
    contextMessage: item.note || undefined,
    buttons: [
      { title: 'Open Page' },
      { title: 'Postpone 15m' }
    ],
    requireInteraction: true
  });

  // Mark as delivered
  await saveReminder({ ...item, delivered: true });
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  // 1. Handle clicks on save-confirmations
  if (notificationId.endsWith('-save')) {
    const originalId = notificationId.replace('-save', '');
    const item = await getReminder(originalId);
    if (!item) {
      chrome.notifications.clear(notificationId);
      return;
    }

    if (buttonIndex === 0) {
      // Snooze 1 Hour
      const newRemindAt = Date.now() + 60 * 60 * 1000;
      await saveReminder({ ...item, remindAt: newRemindAt, delivered: false });
      chrome.notifications.clear(notificationId);

      chrome.notifications.create(originalId + '-snoozed', {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Snoozed',
        message: 'Reminder postponed for 1 hour.',
        requireInteraction: false
      });
    } else if (buttonIndex === 1) {
      // Open Page
      chrome.tabs.create({ url: item.url });
      await deleteReminder(originalId);
      chrome.notifications.clear(notificationId);
    }
    return;
  }

  // 2. Handle normal reminder notifications
  const item = await getReminder(notificationId);
  if (!item) {
    chrome.notifications.clear(notificationId);
    return;
  }

  if (buttonIndex === 0) {
    // Open Page
    chrome.tabs.create({ url: item.url });
    await deleteReminder(notificationId);
    chrome.notifications.clear(notificationId);
  } else if (buttonIndex === 1) {
    // Postpone 15 minutes
    const newRemindAt = Date.now() + 15 * 60 * 1000;
    await saveReminder({ ...item, remindAt: newRemindAt, delivered: false });
    chrome.notifications.clear(notificationId);

    chrome.notifications.create(item.id + '-snoozed', {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Snoozed',
      message: 'Reminder postponed for 15 minutes.',
      requireInteraction: false
    });
  }
});

// Handle notification body clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.endsWith('-save') || notificationId.endsWith('-snoozed')) {
    chrome.notifications.clear(notificationId);
    return;
  }

  const item = await getReminder(notificationId);
  if (item) {
    chrome.tabs.create({ url: item.url });
    await deleteReminder(notificationId);
  }
  chrome.notifications.clear(notificationId);
});

// Run overdue check whenever background service worker starts up
checkOverdueReminders();

// Also register startup listener as a fallback
chrome.runtime.onStartup.addListener(checkOverdueReminders);
