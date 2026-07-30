import { getReminder, deleteReminder, getReminders, saveReminder } from '../lib/storage';
import type { ShelfItem } from '../types';

// Context menu item IDs
const SHELF_PAGE_ID = 'shelf-page';
const SHELF_LINK_ID = 'shelf-link';

// Helper to get extension icon URL
function getIconUrl() {
  return chrome.runtime.getURL('icon.png');
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

  // Check for overdue reminders when the extension is installed/reloaded
  checkOverdueReminders();
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
        iconUrl: getIconUrl(),
        title: 'Saved to Shelf',
        message: `"${newItem.title}" will remind you in 30 mins.`,
        buttons: [
          { title: 'Okay' },
          { title: 'Edit Time' }
        ],
        requireInteraction: false
      });
    } catch (err) {
      console.error('Failed to save context menu item:', err);
    }
  }
});

// Helper to log debug messages to chrome.storage.local
async function logDebug(message: string) {
  try {
    const data = await chrome.storage.local.get('debug_logs');
    const logs = (data.debug_logs || []) as any[];
    logs.push({
      timestamp: new Date().toLocaleTimeString(),
      message
    });
    // Keep only last 50 logs
    if (logs.length > 50) {
      logs.shift();
    }
    await chrome.storage.local.set({ debug_logs: logs });
    console.log('[DEBUG LOG]:', message);
  } catch (err) {
    console.error('Failed to log debug message:', err);
  }
}

// Helper to check and notify overdue reminders
async function checkOverdueReminders() {
  try {
    const reminders = await getReminders();
    const now = Date.now();
    const overdue = reminders.filter(item => item.remindAt <= now && !item.delivered);
    await logDebug(`checkOverdueReminders: found ${overdue.length} overdue items`);
    
    for (const item of overdue) {
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
      
      // Mark as delivered
      await saveReminder({ ...item, delivered: true });
    }
  } catch (err) {
    await logDebug(`Error checking overdue reminders: ${err}`);
    console.error('Error checking overdue reminders:', err);
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

    // Mark as delivered
    await saveReminder({ ...item, delivered: true });
  } catch (err) {
    await logDebug(`Error in onAlarm listener: ${err}`);
    console.error('Error in onAlarm listener:', err);
  }
});

// Helper to ensure URL is fully qualified for chrome.tabs.create
function formatUrlForTabs(url: string): string {
  if (!/^(https?|chrome-extension):\/\//i.test(url)) {
    return 'https://' + url;
  }
  return url;
}

// Helper to open a URL in a tab or window, handling cases where no windows are open
async function openUrl(url: string): Promise<boolean> {
  const finalUrl = formatUrlForTabs(url);
  try {
    // Try opening the tab directly. Chrome handles opening a new window if none exists.
    await chrome.tabs.create({ url: finalUrl });
    return true;
  } catch (err) {
    await logDebug(`chrome.tabs.create failed: ${err}. Trying window.create fallback...`);
    try {
      await chrome.windows.create({ url: finalUrl });
      return true;
    } catch (winErr) {
      await logDebug(`openUrl fallback failed: ${winErr}`);
      console.error('Failed to open URL:', winErr);
      return false;
    }
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
        await chrome.storage.local.set({ editItemId: originalId });
        try {
          let windowId: number | undefined;
          try {
            const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
            if (lastFocused && lastFocused.id) {
              windowId = lastFocused.id;
            }
          } catch (e) {
            await logDebug(`onButtonClicked get last focused window failed: ${e}`);
          }

          if (!windowId) {
            const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
            const normalWindow = windows.find(w => w.focused) || windows[0];
            if (normalWindow && normalWindow.id) {
              windowId = normalWindow.id;
            }
          }

          if (windowId) {
            await chrome.windows.update(windowId, { focused: true });
            if (chrome.action && chrome.action.openPopup) {
              await chrome.action.openPopup({ windowId });
              await logDebug('onButtonClicked: openPopup succeeded');
            } else {
              throw new Error('chrome.action.openPopup not available');
            }
          } else {
            throw new Error('No active browser window found');
          }
        } catch (err) {
          await logDebug(`onButtonClicked popup open failed: ${err}`);
          const optionsUrl = chrome.runtime.getURL(`options.html?action=edit&id=${originalId}`);
          await openUrl(optionsUrl);
        }
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
        await deleteReminder(notificationId);
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
        await deleteReminder(notificationId);
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

// Helper to clear all active notifications
function clearAllNotifications() {
  chrome.notifications.getAll((notifications) => {
    if (notifications) {
      for (const id of Object.keys(notifications)) {
        chrome.notifications.clear(id);
      }
    }
  });
}

// Register startup listener to check for overdue reminders when Chrome starts
chrome.runtime.onStartup.addListener(async () => {
  clearAllNotifications();
  await checkOverdueReminders();
});



// Handle messages from popup (e.g. to trigger a save notification)
chrome.runtime.onMessage.addListener((message) => {
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
  }
});
