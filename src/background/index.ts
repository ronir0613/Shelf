import { getReminder, deleteReminder, getReminders, saveReminder } from '../lib/storage';
import type { ShelfItem } from '../types';

// Context menu item IDs
const SHELF_PAGE_ID = 'shelf-page';
const SHELF_LINK_ID = 'shelf-link';

// Helper to get extension icon URL
function getIconUrl() {
  return chrome.runtime.getURL('icon.png');
}

// Recreate context menus on install/update so existing IDs cannot block setup.
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: SHELF_PAGE_ID,
    title: 'Shelf This Page',
    contexts: ['page']
  });

  await chrome.contextMenus.create({
    id: SHELF_LINK_ID,
    title: 'Shelf This Link',
    contexts: ['link']
  });

  await synchronizeReminderAlarms();
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

  if (isWebUrl(url)) {
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
    } catch (err) {
      console.error('Failed to save context menu item:', err);
      return;
    }

    try {
      await chrome.storage.local.set({ editItemId: newItem.id });

      // Open the existing toolbar popup and focus the item that was just saved.
      // This API is available in Chrome 127 and newer.
      if (typeof chrome.action.openPopup !== 'function') {
        throw new Error('Opening the action popup requires Chrome 127 or newer.');
      }
      await chrome.action.openPopup();
    } catch (err) {
      console.error('Saved item, but could not open the Shelf popup:', err);
      // Keep the pending item ID so the next toolbar click opens its edit form.
      chrome.notifications.create(newItem.id + '-save', {
        type: 'basic',
        iconUrl: getIconUrl(),
        title: 'Saved to Shelf',
        message: 'Click the Shelf toolbar icon to adjust its reminder settings.',
        requireInteraction: false
      });
    }
  }
});

// Helper to log debug messages (disabled)
async function logDebug(_message: string) {
  // Debug logging disabled
}

function getHHMM(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getNextOccurrence(everydayTime: string): number {
  const [hours, minutes] = everydayTime.split(':').map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}


let isCheckingOverdue = false;

// Helper to check and notify overdue reminders
async function checkOverdueReminders(delayMs = 0) {
  if (isCheckingOverdue) return;
  isCheckingOverdue = true;
  try {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    const reminders = await getReminders();
    const now = Date.now();
    const overdue = reminders.filter(item => item.remindAt <= now && !item.delivered);
    await logDebug(`checkOverdueReminders: found ${overdue.length} overdue items`);
    
    for (const item of overdue) {
      // Mark as delivered or reschedule first to avoid duplicate notifications on concurrent calls
      if (item.everyday) {
        const nextRemindAt = getNextOccurrence(item.everydayTime || getHHMM(item.remindAt));
        await saveReminder({ ...item, remindAt: nextRemindAt, delivered: false });
      } else {
        await saveReminder({ ...item, delivered: true });
      }

      await logDebug(`Creating overdue notification for: ${item.title} (ID: ${item.id})`);
      chrome.notifications.create(item.id, {
        type: 'basic',
        iconUrl: getIconUrl(),
        title: 'Shelf Reminder (Overdue)',
        message: item.title,
        contextMessage: item.note || undefined,
        buttons: [
          { title: 'Open Page' },
          { title: 'Postpone 15m' }
        ],
        requireInteraction: true
      });
    }
  } catch (err) {
    await logDebug(`Error checking overdue reminders: ${err}`);
    console.error('Error checking overdue reminders:', err);
  } finally {
    isCheckingOverdue = false;
  }
}

// Handle alarms (reminder time arrived)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    await logDebug(`onAlarm triggered: name=${alarm.name}`);
    const item = await getReminder(alarm.name);
    if (!item) {
      await logDebug(`onAlarm: item not found for alarm ${alarm.name}`);
      return;
    }

    // If already delivered, don't show notification
    if (item.delivered) {
      await logDebug(`onAlarm: item "${item.title}" already delivered`);
      return;
    }

    await logDebug(`onAlarm: creating notification for "${item.title}"`);
    chrome.notifications.create(item.id, {
      type: 'basic',
      iconUrl: getIconUrl(),
      title: 'Shelf Reminder',
      message: item.title,
      contextMessage: item.note || undefined,
      buttons: [
        { title: 'Open Page' },
        { title: 'Postpone 15m' }
      ],
      requireInteraction: true
    });

    // Mark as delivered or reschedule if recurring everyday
    if (item.everyday) {
      const nextRemindAt = getNextOccurrence(item.everydayTime || getHHMM(item.remindAt));
      await saveReminder({ ...item, remindAt: nextRemindAt, delivered: false });
    } else {
      await saveReminder({ ...item, delivered: true });
    }
  } catch (err) {
    await logDebug(`Error in onAlarm listener: ${err}`);
    console.error('Error in onAlarm listener:', err);
  }
});

function isWebUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// Open only saved web URLs. This also prevents malformed stored data from
// navigating to browser-internal or executable URL schemes.
async function openUrl(url: string): Promise<boolean> {
  if (!isWebUrl(url)) return false;

  try {
    await chrome.tabs.create({ url });
    return true;
  } catch (err) {
    await logDebug(`chrome.tabs.create failed: ${err}`);
    console.error('Failed to open URL:', err);
    return false;
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  try {
    await logDebug(`onButtonClicked: id=${notificationId}, buttonIndex=${buttonIndex}`);
    // 1. Handle clicks on save-confirmations
    if (notificationId.endsWith('-save')) {
      const originalId = notificationId.replace('-save', '');
      const item = await getReminder(originalId);
      if (!item) {
        await logDebug(`onButtonClicked save-confirm: item not found for originalId=${originalId}`);
        chrome.notifications.clear(notificationId);
        return;
      }

      if (buttonIndex === 0) {
        // Okay
        await logDebug('onButtonClicked save-confirm: clicked Okay');
        chrome.notifications.clear(notificationId);
      } else if (buttonIndex === 1) {
        // Edit Time
        await logDebug('onButtonClicked save-confirm: clicked Edit Time');
        // Open options page directly — chrome.action.openPopup requires a direct
        // user gesture (toolbar click) which is not available in notification callbacks.
        const optionsUrl = chrome.runtime.getURL(`options.html?action=edit&id=${originalId}`);
        await openUrl(optionsUrl);
        chrome.notifications.clear(notificationId);
      }
      return;
    }

    // 2. Handle normal reminder notifications
    const item = await getReminder(notificationId);
    if (!item) {
      await logDebug(`onButtonClicked normal: item not found for id=${notificationId}`);
      chrome.notifications.clear(notificationId);
      return;
    }

    if (buttonIndex === 0) {
      // Open Page
      await logDebug(`onButtonClicked normal: Open Page clicked for "${item.title}"`);
      const success = await openUrl(item.url);
      await logDebug(`onButtonClicked normal: openUrl success: ${success}`);
      if (success) {
        if (!item.everyday) {
          await deleteReminder(notificationId);
        }
      }
      chrome.notifications.clear(notificationId);
    } else if (buttonIndex === 1) {
      // Postpone 15 minutes
      await logDebug(`onButtonClicked normal: Postpone clicked for "${item.title}"`);
      const newRemindAt = Date.now() + 15 * 60 * 1000;
      await saveReminder({ ...item, remindAt: newRemindAt, delivered: false });
      await logDebug(`onButtonClicked normal: Postpone saved newRemindAt=${new Date(newRemindAt).toLocaleTimeString()}`);
      chrome.notifications.clear(notificationId);

      chrome.notifications.create(item.id + '-snoozed', {
        type: 'basic',
        iconUrl: getIconUrl(),
        title: 'Snoozed',
        message: 'Reminder postponed for 15 minutes.',
        requireInteraction: false
      });
    }
  } catch (err) {
    await logDebug(`Error in onButtonClicked: ${err}`);
    console.error('Error in onButtonClicked listener:', err);
  }
});

// Handle notification body clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    await logDebug(`onClicked (body click): id=${notificationId}`);
    if (notificationId.endsWith('-save') || notificationId.endsWith('-snoozed')) {
      chrome.notifications.clear(notificationId);
      return;
    }

    const item = await getReminder(notificationId);
    if (item) {
      await logDebug(`onClicked (body click): opening "${item.title}"`);
      const success = await openUrl(item.url);
      if (success) {
        if (!item.everyday) {
          await deleteReminder(notificationId);
        }
      }
    } else {
      await logDebug(`onClicked (body click): item not found for id=${notificationId}`);
    }
    chrome.notifications.clear(notificationId);
  } catch (err) {
    await logDebug(`Error in onClicked listener: ${err}`);
    console.error('Error in onClicked listener:', err);
  }
});

// Rebuild pending alarms from durable storage in case Chrome cleared an alarm
// after an extension update or browser restart.
async function synchronizeReminderAlarms() {
  const reminders = await getReminders();
  const now = Date.now();

  for (const item of reminders) {
    if (!item.delivered && item.remindAt > now) {
      await chrome.alarms.create(item.id, { when: item.remindAt });
    }
  }

  await checkOverdueReminders();
}

// Restore pending alarms and surface reminders missed while Chrome was closed.
chrome.runtime.onStartup.addListener(async () => {
  await synchronizeReminderAlarms();
});

// Also reconcile when the service worker starts.
void synchronizeReminderAlarms();



// Handle messages from popup (e.g. to trigger a save notification or open/remove items)
chrome.runtime.onMessage.addListener((message): true | void => {
  if (message.type === 'NOTIFY_SAVED') {
    try {
      const { item, timeMsg } = message;
      chrome.notifications.create(item.id + '-save', {
        type: 'basic',
        iconUrl: getIconUrl(),
        title: 'Saved to Shelf',
        message: `"${item.title}" will remind you ${timeMsg}.`,
        buttons: [
          { title: 'Okay' },
          { title: 'Edit Time' }
        ],
        requireInteraction: false
      });
    } catch (err) {
      console.error('Error creating saved notification in response to message:', err);
    }
    return;
  } else if (message.type === 'OPEN_AND_REMOVE') {
    const { id } = message;
    (async () => {
      try {
        const item = await getReminder(id);
        const success = item ? await openUrl(item.url) : false;
        if (success && item) {
          if (item.everyday) {
            const nextRemindAt = getNextOccurrence(item.everydayTime || getHHMM(item.remindAt));
            await saveReminder({ ...item, remindAt: nextRemindAt, delivered: false });
          } else {
            await deleteReminder(id);
          }
        }
      } catch (err) {
        console.error('Error opening and removing item in response to message:', err);
      }
    })();
    return true; // Signal async work is in progress — keep message channel alive
  }
});
