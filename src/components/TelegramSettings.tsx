'use client';

import React, { useState, useEffect } from 'react';
import {
  Send, Bot, Radio, Shield, Users, RefreshCw, CheckCircle2,
  AlertTriangle, Eye, EyeOff, Sparkles, Clock, MessageSquare,
  Sliders, Bell, Layers, Cpu, Play, Check, Copy, ExternalLink, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TelegramConfigData {
  botToken: string;
  chatId: string;
  inactivityAlertEnabled: boolean;
  inactivityMinutesThreshold: number;
  shiftReportEnabled: boolean;
  subscribersCount: number;
  hasToken: boolean;
  hasChatId: boolean;
}

export interface TelegramSubscriberItem {
  _id?: string;
  chatId: string;
  name: string;
  username?: string;
  chatType?: string;
  active: boolean;
  lastSeenAt?: string | Date;
}

export const TelegramSettings: React.FC = () => {
  const [config, setConfig] = useState<TelegramConfigData>({
    botToken: '8909505529:AAHzxK7Qt_KyrxIQ5ZuCH5GBcRy_lrvfkts',
    chatId: '',
    inactivityAlertEnabled: true,
    inactivityMinutesThreshold: 30,
    shiftReportEnabled: true,
    subscribersCount: 0,
    hasToken: true,
    hasChatId: false
  });

  const [subscribers, setSubscribers] = useState<TelegramSubscriberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Form states
  const [formBotToken, setFormBotToken] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [formInactivityEnabled, setFormInactivityEnabled] = useState(true);
  const [formInactivityThreshold, setFormInactivityThreshold] = useState(30);
  const [formShiftReportEnabled, setFormShiftReportEnabled] = useState(true);

  // Manual Trigger states
  const [triggerShift, setTriggerShift] = useState<number>(1);
  const [triggerDate, setTriggerDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [sendingShiftReport, setSendingShiftReport] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [checkingInactivity, setCheckingInactivity] = useState(false);
  const [detectingChat, setDetectingChat] = useState(false);

  // Broadcast state
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  // Notification / Alert banners
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4500);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedChatId(text);
    setTimeout(() => setCopiedChatId(null), 2000);
  };

  // Load config & subscribers
  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch('/api/telegram', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success && json?.data) {
        setConfig(json.data);
        setFormBotToken(json.data.botToken || '');
        setFormChatId(json.data.chatId || '');
        setFormInactivityEnabled(json.data.inactivityAlertEnabled !== false);
        setFormInactivityThreshold(json.data.inactivityMinutesThreshold || 30);
        setFormShiftReportEnabled(json.data.shiftReportEnabled !== false);
      }
      if (Array.isArray(json?.subscribers)) {
        setSubscribers(json.subscribers);
      }
    } catch (err: any) {
      console.error('Error loading Telegram data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Configuration
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          botToken: formBotToken.trim(),
          chatId: formChatId.trim(),
          inactivityAlertEnabled: formInactivityEnabled,
          inactivityMinutesThreshold: Number(formInactivityThreshold) || 30,
          shiftReportEnabled: formShiftReportEnabled
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update config');

      showFeedback('success', 'Telegram configuration saved successfully!');
      await loadData(true);
    } catch (err: any) {
      showFeedback('error', err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  // Sync Subscribers from Telegram API
  const handleSyncSubscribers = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_subscribers',
          botToken: formBotToken.trim() || config.botToken
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to sync subscribers');

      showFeedback('success', json.message || 'Subscribers synced from Telegram!');
      if (Array.isArray(json.subscribers)) {
        setSubscribers(json.subscribers);
      }
      await loadData(true);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to sync subscribers');
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-Detect Chat ID
  const handleDetectChat = async () => {
    setDetectingChat(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'detect_chat',
          botToken: formBotToken.trim() || config.botToken
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not detect chat ID');

      if (json.chatId) {
        setFormChatId(json.chatId);
      }
      showFeedback('success', json.message || 'Chat ID detected successfully!');
      await loadData(true);
    } catch (err: any) {
      showFeedback('error', err.message || 'Chat ID detection failed');
    } finally {
      setDetectingChat(false);
    }
  };

  // Send Test Notification
  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_test',
          botToken: formBotToken.trim() || config.botToken,
          chatId: formChatId.trim() || config.chatId
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to send test message');

      showFeedback('success', json.message || 'Test notification sent successfully!');
    } catch (err: any) {
      showFeedback('error', err.message || 'Error sending test message');
    } finally {
      setSendingTest(false);
    }
  };

  // Broadcast Custom Notification
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;

    setBroadcasting(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'broadcast',
          message: broadcastText.trim(),
          botToken: formBotToken.trim() || config.botToken
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to broadcast message');

      showFeedback('success', json.message || 'Notification broadcasted successfully!');
      setBroadcastText('');
    } catch (err: any) {
      showFeedback('error', err.message || 'Broadcast failed');
    } finally {
      setBroadcasting(false);
    }
  };

  // Trigger Shift Productivity Report Now
  const handleTriggerShiftReport = async () => {
    setSendingShiftReport(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_shift_report',
          shift: triggerShift,
          date: triggerDate,
          botToken: formBotToken.trim() || config.botToken
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to send shift report');

      showFeedback('success', json.message || 'Shift productivity report broadcasted successfully!');
    } catch (err: any) {
      showFeedback('error', err.message || 'Error sending shift report');
    } finally {
      setSendingShiftReport(false);
    }
  };

  // Trigger Inactivity Check Now
  const handleTriggerInactivityCheck = async () => {
    setCheckingInactivity(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_inactivity_check',
          minutes: formInactivityThreshold,
          botToken: formBotToken.trim() || config.botToken
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Inactivity check failed');

      showFeedback('success', json.message || 'Inactivity check completed!');
    } catch (err: any) {
      showFeedback('error', err.message || 'Inactivity check error');
    } finally {
      setCheckingInactivity(false);
    }
  };

  // Toggle Subscriber Active / Inactive
  const handleToggleSubscriber = async (sub: TelegramSubscriberItem) => {
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_subscriber',
          chatId: sub.chatId,
          active: !sub.active
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);

      setSubscribers(prev => prev.map(s => s.chatId === sub.chatId ? { ...s, active: !s.active } : s));
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to toggle subscriber');
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-stone-900 tracking-tight">
                  Telegram Notifications & Alerts
                </h1>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                  config.hasToken && (config.hasChatId || subscribers.length > 0)
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                )}>
                  {config.hasToken && (config.hasChatId || subscribers.length > 0) ? 'Connected' : 'Setup Required'}
                </span>
              </div>
              <p className="text-xs font-medium text-stone-500 mt-0.5">
                Automated shift-end productivity reports, operator inactivity alerts, and real-time plant broadcasts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSendTest}
              disabled={sendingTest}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Send className={cn("w-3.5 h-3.5", sendingTest && "animate-pulse")} />
              {sendingTest ? 'Sending Test...' : 'Send Test Notification'}
            </button>
            <button
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="inline-flex items-center justify-center w-9 h-9 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-all border border-stone-200/80 cursor-pointer disabled:opacity-50"
              title="Refresh Telegram status"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className={cn(
            "mt-4 p-3 rounded-xl border text-xs font-bold flex items-center justify-between animate-in fade-in duration-150",
            feedback.type === 'success'
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          )}>
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Bot Credentials & Automated Alert Toggles */}
        <div className="space-y-6">
          {/* Card 1: Bot Credentials */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  Bot Credentials & Target Chat
                </h3>
                <p className="text-[11px] text-stone-500">
                  Telegram Bot API Token and primary broadcast Chat ID
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3.5">
              {/* Bot Token */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Telegram Bot Token</span>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-[11px] text-sky-600 hover:text-sky-700 lowercase font-bold flex items-center gap-1"
                  >
                    {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </label>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={formBotToken}
                  onChange={e => setFormBotToken(e.target.value)}
                  placeholder="e.g. 8909505529:AAHzxK7Qt_..."
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              {/* Default Chat ID */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Default Chat ID / Channel</span>
                  <button
                    type="button"
                    onClick={handleDetectChat}
                    disabled={detectingChat}
                    className="text-[11px] text-sky-600 hover:text-sky-700 lowercase font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    {detectingChat ? 'Detecting...' : 'Auto-Detect Chat ID'}
                  </button>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formChatId}
                    onChange={e => setFormChatId(e.target.value)}
                    placeholder="e.g. 123456789 or -100123456789"
                    className="flex-1 px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                  {formChatId && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(formChatId)}
                      className="px-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl transition-all border border-stone-200"
                      title="Copy Chat ID"
                    >
                      {copiedChatId === formChatId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  Send a message (e.g. <code>/start</code>) to the bot from your Telegram group or personal chat, then click <strong>Auto-Detect</strong>.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 bg-stone-900 hover:bg-black active:bg-stone-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Telegram Settings'}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Automated Alert Triggers */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  Automated Alert Rules
                </h3>
                <p className="text-[11px] text-stone-500">
                  Configure background triggers for shift productivity & operator inactivity
                </p>
              </div>
            </div>

            {/* Toggle 1: Shift-End Productivity Reports */}
            <div className="p-3.5 bg-stone-50/70 border border-stone-200/60 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-stone-900 flex items-center gap-2">
                    <span>Shift-End Productivity Reports</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                      formShiftReportEnabled ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-stone-200 text-stone-600 border-stone-300"
                    )}>
                      {formShiftReportEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Dispatches formatted shift summaries to Telegram at 14:00 (Shift 1), 22:00 (Shift 2), and 06:00 (Shift 3).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !formShiftReportEnabled;
                    setFormShiftReportEnabled(next);
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    formShiftReportEnabled ? "bg-emerald-600" : "bg-stone-300"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      formShiftReportEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Toggle 2: Operator Inactivity Alerts */}
            <div className="p-3.5 bg-stone-50/70 border border-stone-200/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-stone-900 flex items-center gap-2">
                    <span>Operator Inactivity Alerts</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                      formInactivityEnabled ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-stone-200 text-stone-600 border-stone-300"
                    )}>
                      {formInactivityEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Sends an alert if an assigned operator does not tap their card within the threshold.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !formInactivityEnabled;
                    setFormInactivityEnabled(next);
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    formInactivityEnabled ? "bg-emerald-600" : "bg-stone-300"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      formInactivityEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Threshold Slider */}
              <div className="pt-2 border-t border-stone-200/60">
                <div className="flex items-center justify-between text-xs font-bold text-stone-700 mb-1.5">
                  <span>Inactivity Threshold</span>
                  <span className="text-emerald-700 font-mono font-black">{formInactivityThreshold} Minutes</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={formInactivityThreshold}
                  onChange={e => setFormInactivityThreshold(Number(e.target.value))}
                  disabled={!formInactivityEnabled}
                  className="w-full accent-emerald-600 cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-stone-400 font-bold mt-1">
                  <span>10 mins</span>
                  <span>30 mins (Default)</span>
                  <span>60 mins</span>
                  <span>120 mins</span>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleTriggerInactivityCheck}
                  disabled={checkingInactivity || !formInactivityEnabled}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition-all border border-stone-200 cursor-pointer disabled:opacity-50"
                >
                  <Radio className={cn("w-3.5 h-3.5 text-amber-600", checkingInactivity && "animate-pulse")} />
                  {checkingInactivity ? 'Checking...' : 'Check Inactivity Now'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Manual Report Trigger, Instant Broadcast & Subscriber List */}
        <div className="space-y-6">
          {/* Card 3: Manual Shift Report Dispatcher */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  Dispatch Shift Productivity Report
                </h3>
                <p className="text-[11px] text-stone-500">
                  Instantly format and broadcast shift productivity metrics to all Telegram subscribers
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Select Shift
                </label>
                <select
                  value={triggerShift}
                  onChange={e => setTriggerShift(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-900 focus:outline-none"
                >
                  <option value={1}>Shift I (06:00 - 14:00)</option>
                  <option value={2}>Shift II (14:00 - 22:00)</option>
                  <option value={3}>Shift III (22:00 - 06:00)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={triggerDate}
                  onChange={e => setTriggerDate(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-900 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerShiftReport}
              disabled={sendingShiftReport}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className={cn("w-3.5 h-3.5", sendingShiftReport && "animate-pulse")} />
              {sendingShiftReport ? 'Broadcasting Shift Report...' : 'Broadcast Shift Report Now'}
            </button>
          </div>

          {/* Card 4: Quick Broadcast Notification */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  Instant Plant Announcement
                </h3>
                <p className="text-[11px] text-stone-500">
                  Send an immediate alert or message to all active Telegram subscribers
                </p>
              </div>
            </div>

            <form onSubmit={handleBroadcast} className="space-y-3">
              <textarea
                rows={3}
                value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                placeholder="Type your message here... Supports Markdown (*bold*, _italic_)"
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={broadcasting || !broadcastText.trim()}
                  className="px-4 py-2 bg-stone-900 hover:bg-black active:bg-stone-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {broadcasting ? 'Broadcasting...' : 'Broadcast Announcement'}
                </button>
              </div>
            </form>
          </div>

          {/* Card 5: Subscribers Table */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Telegram Subscribers ({subscribers.length})
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Users and groups who have interacted with the bot
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncSubscribers}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition-all border border-stone-200 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
                Sync from Telegram
              </button>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 text-[10px] font-black text-stone-500 uppercase tracking-wider border-b border-stone-200/80">
                    <th className="py-2.5 px-3">Chat ID</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {subscribers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-stone-400">
                        No subscribers registered yet. Message your bot on Telegram to join!
                      </td>
                    </tr>
                  ) : (
                    subscribers.map(sub => (
                      <tr key={sub.chatId} className="hover:bg-stone-50/60">
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-900">
                          <div className="inline-flex items-center gap-1">
                            <span>{sub.chatId}</span>
                            <button
                              onClick={() => copyToClipboard(sub.chatId)}
                              className="text-stone-400 hover:text-stone-700 ml-1"
                              title="Copy Chat ID"
                            >
                              {copiedChatId === sub.chatId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-stone-800">
                          <div>{sub.name}</div>
                          {sub.username && <div className="text-[10px] text-stone-400 font-normal">{sub.username}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-[10px] font-semibold text-stone-500 capitalize">
                          {sub.chatType || 'private'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleToggleSubscriber(sub)}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider cursor-pointer",
                              sub.active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-stone-100 text-stone-400 border border-stone-200"
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full", sub.active ? "bg-emerald-500" : "bg-stone-400")} />
                            {sub.active ? 'Active' : 'Muted'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
