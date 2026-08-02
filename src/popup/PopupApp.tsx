import { useEffect, useState } from 'react';
import { ExternalLink, Edit2, Trash2, Clock, FileText, Inbox, Plus, X, Check, AlertTriangle, Link2, RefreshCw } from 'lucide-react';
import type { ShelfItem } from '../types';
import { getReminders, deleteReminder, saveReminder } from '../lib/storage';
import { formatRemindAt } from '../lib/date';

export default function PopupApp() {
  const [reminders, setReminders] = useState<ShelfItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);

  // View states: 'list' | 'edit'
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editingItem, setEditingItem] = useState<ShelfItem | null>(null);

  // Form states (Add / Edit)
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [preset, setPreset] = useState('30m');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [everyday, setEveryday] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Helper date formatting/utils
  const getTodayDateString = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTimeString = (d: Date = new Date()) => {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getHHMM = (timestamp: number): string => {
    const d = new Date(timestamp);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

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

  // Fetch active tab and reminders on load
  useEffect(() => {
    loadReminders();

    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.getAll((notifications) => {
        if (notifications) {
          for (const id of Object.keys(notifications)) {
            chrome.notifications.clear(id);
          }
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.storage.local.get(['editItemId'], (result) => {
        const itemId = result?.editItemId;
        if (itemId) {
          chrome.storage.local.remove('editItemId');
          getReminders().then((items) => {
            const item = items.find(i => i.id === itemId);
            if (item) {
              handleEditInit(item);
            }
          });
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            setActiveTab({
              title: tabs[0].title || 'Webpage',
              url: tabs[0].url || '',
            });
            // Only pre-populate title if we are not editing an item
            if (!itemId) {
              setTitle(tabs[0].title || 'Webpage');
            }
          }
        });
      });

      const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.reminders) {
          loadReminders();
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    } else {
      // Dev environment fallback
      setActiveTab({
        title: 'Mock active web page for styling test',
        url: 'https://example.com/some-cool-article',
      });
      setTitle('Mock active web page for styling test');
    }
  }, []);

  // Initialize custom date/time inputs to current time + 30 mins
  useEffect(() => {
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    setCustomDate(getTodayDateString(defaultTime));
    setCustomTime(getTimeString(defaultTime));
  }, []);

  const calculateRemindAt = (presetVal: string, dateVal: string, timeVal: string): number => {
    const now = Date.now();
    if (presetVal === '15m') return now + 15 * 60 * 1000;
    if (presetVal === '30m') return now + 30 * 60 * 1000;
    if (presetVal === '1h') return now + 60 * 60 * 1000;
    if (presetVal === '2h') return now + 120 * 60 * 1000;

    if (presetVal === 'tonight') {
      const d = new Date();
      if (d.getHours() >= 20) {
        d.setDate(d.getDate() + 1);
      }
      d.setHours(20, 0, 0, 0);
      return d.getTime();
    }

    if (presetVal === 'tomorrow-morning') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }

    if (presetVal === 'tomorrow-evening') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(19, 0, 0, 0);
      return d.getTime();
    }

    if (presetVal === 'custom') {
      if (!dateVal || !timeVal) return now + 30 * 60 * 1000;
      const [year, month, day] = dateVal.split('-').map(Number);
      const [hours, minutes] = timeVal.split(':').map(Number);
      const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
      return d.getTime();
    }

    return now + 30 * 60 * 1000;
  };

  const handleOpen = async (item: ShelfItem) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'OPEN_AND_REMOVE',
        id: item.id,
        url: item.url
      });
    } else {
      window.open(item.url, '_blank');
      await deleteReminder(item.id);
      loadReminders();
    }
  };

  const handleEditInit = (item: ShelfItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setNote(item.note || '');
    setPreset('custom');
    
    const remindDate = new Date(item.remindAt);
    setCustomDate(getTodayDateString(remindDate));
    setCustomTime(getTimeString(remindDate));
    setEveryday(item.everyday || false);
    setErrorMsg('');
    setSuccessMsg('');
    setView('edit');
  };

  const handleDelete = async (id: string) => {
    await deleteReminder(id);
    loadReminders();
    if (editingItem?.id === id) {
      handleCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setView('list');
    setEditingItem(null);
    setTitle(activeTab?.title || '');
    setNote('');
    setPreset('30m');
    setEveryday(false);
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    setCustomDate(getTodayDateString(defaultTime));
    setCustomTime(getTimeString(defaultTime));
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTab) return;
    setErrorMsg('');
    setSuccessMsg('');

    const remindAt = calculateRemindAt(preset, customDate, customTime);

    if (isNaN(remindAt) || remindAt <= Date.now()) {
      setErrorMsg('Please select a reminder time in the future.');
      return;
    }

    try {
      const newItem: ShelfItem = {
        id: crypto.randomUUID(),
        title: title.trim() || activeTab.title,
        url: activeTab.url,
        note: note.trim() || undefined,
        createdAt: Date.now(),
        remindAt,
        everyday,
        everydayTime: everyday ? getHHMM(remindAt) : undefined,
      };

      await saveReminder(newItem);
      setSuccessMsg('Added to Shelf!');
      setNote('');
      setEveryday(false);
      
      // Trigger Chrome system notification via background script to ensure it shows
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        let timeMsg = 'later';
        if (preset === '15m') timeMsg = 'in 15 mins';
        else if (preset === '30m') timeMsg = 'in 30 mins';
        else if (preset === '1h') timeMsg = 'in 1 hour';
        else if (preset === '2h') timeMsg = 'in 2 hours';
        else if (preset === 'tonight') timeMsg = 'tonight at 8 PM';
        else if (preset === 'tomorrow-morning') timeMsg = 'tomorrow morning at 9 AM';
        else if (preset === 'tomorrow-evening') timeMsg = 'tomorrow evening at 7 PM';
        else if (preset === 'custom') timeMsg = 'at your custom time';

        chrome.runtime.sendMessage({
          type: 'NOTIFY_SAVED',
          item: newItem,
          timeMsg
        });
      }

      setPreset('30m');
      
      // Auto-clear success message
      setTimeout(() => {
        setSuccessMsg('');
      }, 2000);

      loadReminders();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save reminder.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setErrorMsg('');
    setSuccessMsg('');

    const remindAt = calculateRemindAt(preset, customDate, customTime);

    if (isNaN(remindAt) || remindAt <= Date.now()) {
      setErrorMsg('Please select a reminder time in the future.');
      return;
    }

    try {
      const updatedItem: ShelfItem = {
        ...editingItem,
        title: title.trim() || editingItem.title,
        note: note.trim() || undefined,
        remindAt,
        delivered: false, // Reset delivered status on edit
        everyday,
        everydayTime: everyday ? getHHMM(remindAt) : undefined,
      };

      await saveReminder(updatedItem);
      setSuccessMsg('Reminder updated!');
      
      setTimeout(() => {
        setView('list');
        setEditingItem(null);
        setTitle(activeTab?.title || '');
        setNote('');
        setPreset('30m');
        setEveryday(false);
        setSuccessMsg('');
      }, 800);

      loadReminders();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to update reminder.');
    }
  };

  return (
    <div className="w-[420px] max-h-[600px] flex flex-col bg-zinc-950 text-zinc-100 font-sans p-4 border border-zinc-900 rounded-lg shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded flex items-center justify-center font-bold text-xs border border-zinc-700 text-zinc-200">
            S
          </div>
          <span className="font-semibold text-zinc-200 tracking-tight">Shelf</span>
        </div>
        <span className="text-xs text-zinc-500 font-medium">V1.1</span>
      </div>

      {/* Main Content Area */}
      {view === 'list' ? (
        <div className="flex flex-col gap-5 flex-1">
          {/* Add Current Page Section */}
          {activeTab && (
            <form onSubmit={handleAddSubmit} className="flex flex-col gap-3 bg-zinc-900/30 border border-zinc-900 p-3.5 rounded-xl">
              <div className="flex items-center gap-2 text-zinc-400">
                <Link2 className="w-3.5 h-3.5 stroke-[1.5] text-zinc-500" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Shelf Current Page</span>
              </div>

              {/* Title Input */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none transition-all duration-150"
              />

              {/* Note Input */}
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add optional note..."
                maxLength={150}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-xs placeholder-zinc-600 focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none transition-all duration-150"
              />

              {/* Time Presets Dropdown */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer hover:bg-zinc-900/80 transition-all duration-150"
                  >
                    <option value="15m">In 15 minutes</option>
                    <option value="30m">In 30 minutes</option>
                    <option value="1h">In 1 hour</option>
                    <option value="2h">In 2 hours</option>
                    <option value="tonight">Tonight (8 PM)</option>
                    <option value="tomorrow-morning">Tomorrow Morning (9 AM)</option>
                    <option value="tomorrow-evening">Tomorrow Evening (7 PM)</option>
                    <option value="custom">Custom Date & Time</option>
                  </select>

                  <button
                    type="submit"
                    className="px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 rounded-lg text-xs font-semibold shadow active:scale-[0.98] transition-all duration-150 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2]" />
                    Add
                  </button>
                </div>

                {/* Custom Date/Time pickers when "custom" is selected */}
                {preset === 'custom' && (
                  <div className="flex gap-2 mt-1 animate-fadeIn">
                    <div className="flex-1">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Everyday Checkbox */}
              <div className="flex items-center gap-2 px-1 py-0.5">
                <input
                  type="checkbox"
                  id="everyday"
                  checked={everyday}
                  onChange={(e) => setEveryday(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-800 bg-zinc-900 text-zinc-100 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-200"
                />
                <label htmlFor="everyday" className="text-xs text-zinc-400 font-medium cursor-pointer select-none">
                  Repeat everyday at this time
                </label>
              </div>

              {/* Status Messages */}
              {errorMsg && (
                <div className="text-red-400 text-xs flex items-center gap-1.5 mt-1 font-medium bg-red-950/20 border border-red-950 p-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="text-emerald-400 text-xs flex items-center gap-1.5 mt-1 font-medium bg-emerald-950/20 border border-emerald-950 p-2 rounded-lg">
                  <Check className="w-3.5 h-3.5 stroke-[2]" />
                  <span>{successMsg}</span>
                </div>
              )}
            </form>
          )}

          {/* List of Reminders */}
          <div className="flex flex-col gap-3 flex-1">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 px-1">Upcoming</h2>

            {isLoading ? (
              <div className="py-8 text-center text-sm text-zinc-500">Loading...</div>
            ) : reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-zinc-900 rounded-xl bg-zinc-950">
                <Inbox className="w-8 h-8 text-zinc-700 mb-2 stroke-[1.5]" />
                <p className="text-sm font-medium text-zinc-400">No upcoming shelf items</p>
                <p className="text-xs text-zinc-600 text-center mt-1 max-w-[220px]">
                  Right-click any page and select "Shelf This Page" or add via popup form.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {reminders.map((item) => (
                  <div
                    key={item.id}
                    className="group border border-zinc-900 hover:border-zinc-800 bg-zinc-950 p-3.5 rounded-xl flex flex-col gap-2 transition-all duration-200 shadow-sm"
                  >
                    {/* Title */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-sm text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition-colors">
                        {item.title}
                      </span>
                    </div>

                    {/* Note */}
                    {item.note && (
                      <div className="flex gap-1.5 items-start text-xs text-zinc-400 bg-zinc-900/40 p-2 rounded border border-zinc-900/60">
                        <FileText className="w-3.5 h-3.5 mt-0.5 text-zinc-500 shrink-0 stroke-[1.5]" />
                        <span className="line-clamp-2 leading-relaxed">{item.note}</span>
                      </div>
                    )}

                    {/* Footer Controls */}
                    <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-zinc-900/50">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                        {item.everyday ? (
                          <RefreshCw className="w-3 h-3 text-emerald-500 animate-[spin_4s_linear_infinite]" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                        )}
                        <span className={item.everyday ? "text-emerald-400 font-semibold" : ""}>
                          {formatRemindAt(item.remindAt, item.everyday)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpen(item)}
                          title="Open page"
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-all duration-150"
                        >
                          <ExternalLink className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <button
                          onClick={() => handleEditInit(item)}
                          title="Edit reminder"
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-all duration-150"
                        >
                          <Edit2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          title="Delete permanently"
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-150"
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
      ) : (
        /* Edit Mode Form */
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4 flex-1">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Edit Reminder</span>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-900 transition-all duration-150"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
              />
            </div>

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional reminder note..."
                maxLength={150}
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg p-3 text-xs placeholder-zinc-600 focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none resize-none"
              />
            </div>

            {/* Date/Time preset & inputs */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Reminder Time</label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer"
              >
                <option value="15m">In 15 minutes</option>
                <option value="30m">In 30 minutes</option>
                <option value="1h">In 1 hour</option>
                <option value="2h">In 2 hours</option>
                <option value="tonight">Tonight (8 PM)</option>
                <option value="tomorrow-morning">Tomorrow Morning (9 AM)</option>
                <option value="tomorrow-evening">Tomorrow Evening (7 PM)</option>
                <option value="custom">Custom Date & Time</option>
              </select>

              {preset === 'custom' && (
                <div className="flex gap-2 mt-1 animate-fadeIn">
                  <div className="flex-1">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Everyday Checkbox */}
            <div className="flex items-center gap-2 px-1 py-0.5">
              <input
                type="checkbox"
                id="edit-everyday"
                checked={everyday}
                onChange={(e) => setEveryday(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-800 bg-zinc-900 text-zinc-100 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-200"
              />
              <label htmlFor="edit-everyday" className="text-xs text-zinc-400 font-medium cursor-pointer select-none">
                Repeat everyday at this time
              </label>
            </div>

            {/* Error / Success */}
            {errorMsg && (
              <div className="text-red-400 text-xs flex items-center gap-1.5 mt-1 font-medium bg-red-950/20 border border-red-950 p-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="text-emerald-400 text-xs flex items-center gap-1.5 mt-1 font-medium bg-emerald-950/20 border border-emerald-950 p-2 rounded-lg">
                <Check className="w-3.5 h-3.5 stroke-[2]" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Edit Actions */}
          <div className="flex gap-2 mt-auto pt-4 border-t border-zinc-900">
            <button
              type="button"
              onClick={() => handleDelete(editingItem!.id)}
              className="px-3 py-2 border border-red-950 bg-red-950/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-950/50 hover:border-red-900 flex items-center gap-1.5 transition-all duration-150"
            >
              <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
              Delete
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-900 text-zinc-400 rounded-lg text-xs font-medium hover:bg-zinc-900 hover:text-zinc-300 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-zinc-100 text-zinc-950 hover:bg-white rounded-lg text-xs font-semibold shadow active:scale-[0.98] transition-all duration-150"
            >
              Save Changes
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
