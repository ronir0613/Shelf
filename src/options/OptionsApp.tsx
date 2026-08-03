import React, { useEffect, useState } from 'react';
import { Calendar, Clock, AlertTriangle, Check, Trash2, X } from 'lucide-react';
import type { ShelfItem } from '../types';
import { getReminder, saveReminder, deleteReminder } from '../lib/storage';

// Helpers for simple date and time dropdown selectors
const getDateOptions = () => {
  const options = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(now.getDate() + i);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;
    
    let label = '';
    if (i === 0) {
      label = `Today (${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()})`;
    } else if (i === 1) {
      label = `Tomorrow (${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()})`;
    } else {
      label = `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
    }
    
    options.push({ value, label });
  }
  return options;
};

const getTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      const value = `${hh}:${mm}`;
      
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const displayMinute = String(minute).padStart(2, '0');
      const label = `${displayHour}:${displayMinute} ${ampm}`;
      
      options.push({ value, label });
    }
  }
  return options;
};

const getRoundedDateTime = (d: Date = new Date()) => {
  const rounded = new Date(d);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / 30) * 30;
  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
};

export default function OptionsApp() {
  const [action, setAction] = useState<'add' | 'edit' | 'postpone' | null>(null);
  
  // Form states
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [createdAt, setCreatedAt] = useState(0);
  
  // Reminder time states
  const [preset, setPreset] = useState<'30m' | 'tonight' | 'tomorrow-morning' | 'tomorrow-evening' | 'custom'>('30m');
  const [postponePreset, setPostponePreset] = useState<'15m' | '1h' | 'tomorrow' | 'custom' | string>('15m');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [everyday, setEveryday] = useState(false);
  const [everydayTime, setEverydayTime] = useState('');
  const [isCustomDateNative, setIsCustomDateNative] = useState(false);
  const [isCustomTimeNative, setIsCustomTimeNative] = useState(false);

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
  
  // Loading & error
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  // Helper: Get tonight 8 PM
  const getTonightTime = (): number => {
    const d = new Date();
    if (d.getHours() >= 20) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(20, 0, 0, 0);
    return d.getTime();
  };

  // Helper: Get tomorrow 9 AM
  const getTomorrowMorningTime = (): number => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  // Helper: Get tomorrow 7 PM (19:00)
  const getTomorrowEveningTime = (): number => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return d.getTime();
  };



  useEffect(() => {
    // Clear all desktop notifications when opening options/postpone page
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.getAll((notifications) => {
        if (notifications) {
          for (const id of Object.keys(notifications)) {
            chrome.notifications.clear(id);
          }
        }
      });
    }

    const parseParams = async () => {
      setIsLoading(true);
      setErrorMsg('');
      
      const params = new URLSearchParams(window.location.search);
      const act = params.get('action') as 'add' | 'edit' | 'postpone';
      setAction(act || 'add');

      // Default custom time to +30 mins
      const defaultCustom = getRoundedDateTime(new Date(Date.now() + 30 * 60 * 1000));
      setCustomDate(getTodayDateString(defaultCustom));
      setCustomTime(getTimeString(defaultCustom));

      if (act === 'add') {
        setTitle(params.get('title') || 'Webpage');
        setUrl(params.get('url') || '');
        setPreset('30m');
        setEveryday(false);
        setIsLoading(false);
      } else if (act === 'edit' || act === 'postpone') {
        const itemId = params.get('id') || '';
        setId(itemId);
        
        if (!itemId) {
          setErrorMsg('Missing item identifier.');
          setIsLoading(false);
          return;
        }

        const item = await getReminder(itemId);
        if (!item) {
          setErrorMsg('Reminder not found. It may have already expired or been deleted.');
          setIsLoading(false);
          return;
        }

        setTitle(item.title);
        setUrl(item.url);
        setNote(item.note || '');
        setCreatedAt(item.createdAt);
        setEveryday(item.everyday || false);
        setEverydayTime(item.everydayTime || '');
        
        if (act === 'edit') {
          setPreset('custom');
          const remindDate = new Date(item.remindAt);
          const dateStr = getTodayDateString(remindDate);
          const timeStr = getTimeString(remindDate);
          setCustomDate(dateStr);
          setCustomTime(timeStr);
          
          // Check if date is in the dropdown
          const dateOptions = getDateOptions();
          const isDateInDropdown = dateOptions.some(opt => opt.value === dateStr);
          setIsCustomDateNative(!isDateInDropdown);
          
          // Check if time is on a 30-min mark
          const timeOptions = getTimeOptions();
          const isTimeInDropdown = timeOptions.some(opt => opt.value === timeStr);
          setIsCustomTimeNative(!isTimeInDropdown);
          
          setEveryday(item.everyday || false);
        } else {
          setPostponePreset('15m');
        }
        setIsLoading(false);
      } else {
        setErrorMsg('Invalid action parameters.');
        setIsLoading(false);
      }
    };

    parseParams();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (success) return;

    try {
      let remindAt = 0;
      
      if (action === 'add' || action === 'edit') {
        if (preset === '30m') {
          remindAt = Date.now() + 30 * 60 * 1000;
        } else if (preset === 'tonight') {
          remindAt = getTonightTime();
        } else if (preset === 'tomorrow-morning') {
          remindAt = getTomorrowMorningTime();
        } else if (preset === 'tomorrow-evening') {
          remindAt = getTomorrowEveningTime();
        } else {
          const [year, month, day] = customDate.split('-').map(Number);
          const [hours, minutes] = customTime.split(':').map(Number);
          remindAt = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
        }
      } else if (action === 'postpone') {
        if (postponePreset === '15m') {
          remindAt = Date.now() + 15 * 60 * 1000;
        } else if (postponePreset === '1h') {
          remindAt = Date.now() + 60 * 60 * 1000;
        } else if (postponePreset === 'tomorrow') {
          // Snooze to tomorrow morning 9 AM
          remindAt = getTomorrowMorningTime();
        } else {
          const [year, month, day] = customDate.split('-').map(Number);
          const [hours, minutes] = customTime.split(':').map(Number);
          remindAt = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
        }
      }

      if (isNaN(remindAt) || remindAt <= Date.now()) {
        setErrorMsg('Please select a reminder time in the future.');
        return;
      }

      const getHHMM = (timestamp: number): string => {
        const d = new Date(timestamp);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
      };

      const item: ShelfItem = {
        id: action === 'add' ? crypto.randomUUID() : id,
        title,
        url,
        note: note.trim() || undefined,
        createdAt: action === 'add' ? Date.now() : createdAt,
        remindAt,
        everyday: action === 'postpone' ? everyday : (action === 'add' || action === 'edit' ? everyday : undefined),
        everydayTime: action === 'postpone'
          ? (everyday ? (everydayTime || getHHMM(remindAt)) : undefined)
          : (everyday ? getHHMM(remindAt) : undefined),
      };

      await saveReminder(item);
      setSuccess(true);
      
      // Close window after a short delay
      setTimeout(() => {
        window.close();
      }, 800);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save reminder.');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteReminder(id);
      setSuccess(true);
      setTimeout(() => {
        window.close();
      }, 600);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to delete reminder.');
    }
  };

  const handleClose = () => {
    window.close();
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 font-sans">
        <div className="text-sm">Loading options...</div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="w-full h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-sans gap-4">
        <AlertTriangle className="w-10 h-10 text-zinc-500 stroke-[1.5]" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Unable to Proceed</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-[280px]">{errorMsg}</p>
        </div>
        <button
          onClick={handleClose}
          className="px-4 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded text-xs hover:bg-zinc-800 transition-colors"
        >
          Close Panel
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col justify-between p-5 border border-zinc-900 select-none overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-zinc-900 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {action === 'add' ? 'Shelf This Page' : action === 'edit' ? 'Edit Shelf Item' : 'Postpone Reminder'}
        </span>
        <button 
          onClick={handleClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-900 transition-all duration-150"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {success ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-emerald-400">
            <Check className="w-5 h-5 stroke-[2]" />
          </div>
          <span className="text-sm font-medium text-zinc-300">
            {action === 'postpone' ? 'Postponed' : action === 'edit' ? 'Changes saved' : 'Added to Shelf'}
          </span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex-1 flex flex-col gap-4">
          
          {/* Metadata Display (Title & URL) */}
          <div className="flex flex-col gap-1.5 bg-zinc-900/20 border border-zinc-900/60 p-3 rounded-lg">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Page Title</label>
            <div className="text-sm text-zinc-300 line-clamp-2 select-text font-medium leading-normal">
              {title}
            </div>
            <div className="text-xs text-zinc-600 line-clamp-1 select-text break-all mt-0.5">
              {url}
            </div>
          </div>

          {/* Form Controls for Add & Edit */}
          {(action === 'add' || action === 'edit') && (
            <>
              {/* Presets Grid */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Remind Me</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreset('30m')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      preset === '30m'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>In 30 minutes</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('tonight')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      preset === 'tonight'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>Tonight (8 PM)</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('tomorrow-morning')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      preset === 'tomorrow-morning'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>Tomorrow Morning</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('tomorrow-evening')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      preset === 'tomorrow-evening'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>Tomorrow Evening</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreset('custom')}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-between mt-1 transition-all duration-150 ${
                    preset === 'custom'
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                      : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span>Custom Date & Time</span>
                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>

              {/* Custom Date/Time pickers when "custom" is selected */}
              {preset === 'custom' && (
                <div className="flex flex-col gap-2 mt-1 animate-fadeIn">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {isCustomDateNative ? (
                        <div className="flex items-center gap-1.5 w-full animate-fadeIn">
                          <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDateNative(false);
                              setCustomDate(getTodayDateString(new Date()));
                            }}
                            className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded text-[10px] font-semibold transition-colors"
                          >
                            List
                          </button>
                        </div>
                      ) : (
                        <select
                          value={customDate}
                          onChange={(e) => {
                            if (e.target.value === 'native') {
                              setIsCustomDateNative(true);
                            } else {
                              setCustomDate(e.target.value);
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer"
                        >
                          {getDateOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                          <option value="native">Specific Date...</option>
                        </select>
                      )}
                    </div>
                    <div className="flex-1">
                      {isCustomTimeNative ? (
                        <div className="flex items-center gap-1.5 w-full animate-fadeIn">
                          <input
                            type="time"
                            value={customTime}
                            onChange={(e) => setCustomTime(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomTimeNative(false);
                              setCustomTime(getTimeString(getRoundedDateTime(new Date())));
                            }}
                            className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded text-[10px] font-semibold transition-colors"
                          >
                            List
                          </button>
                        </div>
                      ) : (
                        <select
                          value={customTime}
                          onChange={(e) => {
                            if (e.target.value === 'native') {
                              setIsCustomTimeNative(true);
                            } else {
                              setCustomTime(e.target.value);
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer"
                        >
                          {getTimeOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                          <option value="native">Specific Time...</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Everyday Checkbox */}
              <div className="flex items-center gap-2 px-1 py-0.5">
                <input
                  type="checkbox"
                  id="options-everyday"
                  checked={everyday}
                  onChange={(e) => setEveryday(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-800 bg-zinc-900 text-zinc-100 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-200"
                />
                <label htmlFor="options-everyday" className="text-xs text-zinc-400 font-medium cursor-pointer select-none">
                  Repeat everyday at this time
                </label>
              </div>

              {/* Optional Note */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Why save this?</label>
                <div className="relative">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an optional reminder note..."
                    maxLength={300}
                    rows={3}
                    className="w-full bg-zinc-900/50 border border-zinc-900 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:bg-zinc-900 focus:border-zinc-800 resize-none"
                  />
                  <div className="absolute bottom-2.5 right-3 text-[10px] text-zinc-600 font-semibold">
                    {note.length}/300
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Form Controls for Postpone */}
          {action === 'postpone' && (
            <>
              {/* Snooze Presets */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Postpone Duration</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostponePreset('15m')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      postponePreset === '15m'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>15 minutes</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostponePreset('1h')}
                    className={`px-3 py-2 text-left rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      postponePreset === '1h'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>1 hour</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostponePreset('tomorrow')}
                    className={`w-full col-span-2 px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-between transition-all duration-150 ${
                      postponePreset === 'tomorrow'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                        : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span>Tomorrow Morning (9 AM)</span>
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPostponePreset('custom')}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-between mt-1 transition-all duration-150 ${
                    postponePreset === 'custom'
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-100 ring-1 ring-zinc-700'
                      : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span>Custom Time</span>
                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>

              {/* Custom Date/Time pickers when "custom" is selected */}
              {postponePreset === 'custom' && (
                <div className="flex flex-col gap-2 mt-1 animate-fadeIn">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {isCustomDateNative ? (
                        <div className="flex items-center gap-1.5 w-full animate-fadeIn">
                          <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDateNative(false);
                              setCustomDate(getTodayDateString(new Date()));
                            }}
                            className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded text-[10px] font-semibold transition-colors"
                          >
                            List
                          </button>
                        </div>
                      ) : (
                        <select
                          value={customDate}
                          onChange={(e) => {
                            if (e.target.value === 'native') {
                              setIsCustomDateNative(true);
                            } else {
                              setCustomDate(e.target.value);
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer"
                        >
                          {getDateOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                          <option value="native">Specific Date...</option>
                        </select>
                      )}
                    </div>
                    <div className="flex-1">
                      {isCustomTimeNative ? (
                        <div className="flex items-center gap-1.5 w-full animate-fadeIn">
                          <input
                            type="time"
                            value={customTime}
                            onChange={(e) => setCustomTime(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomTimeNative(false);
                              setCustomTime(getTimeString(getRoundedDateTime(new Date())));
                            }}
                            className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-zinc-900 hover:border-zinc-800 rounded text-[10px] font-semibold transition-colors"
                          >
                            List
                          </button>
                        </div>
                      ) : (
                        <select
                          value={customTime}
                          onChange={(e) => {
                            if (e.target.value === 'native') {
                              setIsCustomTimeNative(true);
                            } else {
                              setCustomTime(e.target.value);
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-zinc-700 focus:border-zinc-700 outline-none cursor-pointer"
                        >
                          {getTimeOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                          <option value="native">Specific Time...</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer buttons */}
          <div className="flex gap-2.5 mt-auto pt-4 border-t border-zinc-900">
            {action === 'postpone' && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 border border-red-950 bg-red-950/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-950/50 hover:border-red-900 flex items-center gap-1.5 transition-all duration-150 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                Delete
              </button>
            )}
            
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-900 text-zinc-400 rounded-lg text-xs font-medium hover:bg-zinc-900 hover:text-zinc-300 transition-all duration-150"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-zinc-100 text-zinc-950 hover:bg-white rounded-lg text-xs font-semibold shadow-md active:scale-[0.98] transition-all duration-150"
            >
              {action === 'add' ? 'Save to Shelf' : action === 'edit' ? 'Save Changes' : 'Confirm'}
            </button>
          </div>

        </form>
      )}
    </div>
  );
}
