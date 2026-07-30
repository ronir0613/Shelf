import { useEffect, useState } from 'react';
import { ExternalLink, Edit2, Trash2, Clock, FileText, Inbox } from 'lucide-react';
import type { ShelfItem } from '../types';
import { getReminders, deleteReminder } from '../lib/storage';
import { formatRemindAt } from '../lib/date';

export default function PopupApp() {
  const [reminders, setReminders] = useState<ShelfItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadReminders = async () => {
    try {
      const items = await getReminders();
      setReminders(items);
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.reminders) {
          loadReminders();
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  }, []);

  const handleOpen = async (item: ShelfItem) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: item.url });
    } else {
      window.open(item.url, '_blank');
    }
    await deleteReminder(item.id);
    loadReminders();
  };

  const handleEdit = (item: ShelfItem) => {
    const width = 450;
    const height = 550;
    const url = `options.html?action=edit&id=${item.id}`;
    
    if (typeof chrome !== 'undefined' && chrome.windows) {
      chrome.windows.create({
        url: chrome.runtime.getURL(url),
        type: 'popup',
        width,
        height,
        focused: true
      });
    } else {
      window.open(url, 'shelf-edit', `width=${width},height=${height}`);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteReminder(id);
    loadReminders();
  };

  return (
    <div className="w-[420px] max-h-[600px] flex flex-col bg-zinc-950 text-zinc-100 font-sans p-4 border border-zinc-900 rounded-lg shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-zinc-800 rounded flex items-center justify-center font-bold text-xs border border-zinc-700">
            S
          </div>
          <span className="font-semibold text-zinc-200 tracking-tight">Shelf</span>
        </div>
        <span className="text-xs text-zinc-500 font-medium">V1.0</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Upcoming</h2>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-zinc-900 rounded-lg bg-zinc-950">
            <Inbox className="w-8 h-8 text-zinc-700 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-zinc-400">No upcoming shelf items</p>
            <p className="text-xs text-zinc-600 text-center mt-1 max-w-[200px]">
              Right-click any page or link and select "Shelf This" to save it for later.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reminders.map((item) => (
              <div 
                key={item.id} 
                className="group border border-zinc-900 hover:border-zinc-800 bg-zinc-950 p-3 rounded-lg flex flex-col gap-2 transition-all duration-200"
              >
                {/* Title */}
                <div className="flex justify-between items-start gap-2">
                  <span className="font-medium text-sm text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition-colors">
                    {item.title}
                  </span>
                </div>

                {/* Optional Note */}
                {item.note && (
                  <div className="flex gap-1.5 items-start text-xs text-zinc-400 bg-zinc-900/40 p-2 rounded border border-zinc-900/60">
                    <FileText className="w-3.5 h-3.5 mt-0.5 text-zinc-500 shrink-0 stroke-[1.5]" />
                    <span className="line-clamp-2 leading-relaxed">{item.note}</span>
                  </div>
                )}

                {/* Footer Controls */}
                <div className="flex justify-between items-center mt-1 pt-1 border-t border-zinc-900/50">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>{formatRemindAt(item.remindAt)}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpen(item)}
                      title="Open page"
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition-all duration-150"
                    >
                      <ExternalLink className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      title="Edit reminder"
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition-all duration-150"
                    >
                      <Edit2 className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      title="Delete permanently"
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
