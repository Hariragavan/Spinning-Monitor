import { NextRequest, NextResponse } from 'next/server';
import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS, REMOTE_IOT_API } from '@/lib/iot/iotDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8909505529:AAHzxK7Qt_KyrxIQ5ZuCH5GBcRy_lrvfkts';
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const TELEGRAM_CONFIG_COL = 'telegramconfigs';
const TELEGRAM_SUBS_COL = 'telegramsubscribers';

async function getTelegramConfigDoc(db: any) {
  let doc = await db.collection(TELEGRAM_CONFIG_COL).findOne({ configId: 'default' });
  if (!doc) {
    // Try alternate collection name
    doc = await db.collection('iot_telegram_configs').findOne({ configId: 'default' });
  }
  if (!doc) {
    const initial = {
      configId: 'default',
      botToken: DEFAULT_BOT_TOKEN,
      chatId: DEFAULT_CHAT_ID,
      inactivityAlertEnabled: true,
      inactivityMinutesThreshold: 30,
      shiftReportEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection(TELEGRAM_CONFIG_COL).insertOne(initial);
    return initial;
  }
  return doc;
}

async function sendTelegramHttpRequest(botToken: string, method: string, payload: any) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string, parseMode: string = 'Markdown') {
  if (!botToken) throw new Error('Telegram Bot Token is not configured');
  if (!chatId) throw new Error('Telegram Chat ID is not configured');

  let result = await sendTelegramHttpRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode
  });

  // Fallback to plain text if Markdown entity parsing fails
  if (!result.ok && result.description && result.description.includes("can't parse entities")) {
    result = await sendTelegramHttpRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text
    });
  }

  if (!result.ok) {
    throw new Error(result.description || 'Telegram API call failed');
  }

  return result;
}

export async function GET(req: NextRequest) {
  try {
    const db = await getIotDb();
    const config = await getTelegramConfigDoc(db);

    // Fetch subscribers
    let subscribers = await db.collection(TELEGRAM_SUBS_COL).find({}).sort({ lastSeenAt: -1, updatedAt: -1 }).toArray();
    if (!subscribers || subscribers.length === 0) {
      subscribers = await db.collection('iot_telegram_subscribers').find({}).sort({ lastSeenAt: -1 }).toArray();
    }

    return NextResponse.json({
      success: true,
      data: {
        botToken: config.botToken || DEFAULT_BOT_TOKEN,
        chatId: config.chatId || '',
        inactivityAlertEnabled: config.inactivityAlertEnabled !== false,
        inactivityMinutesThreshold: Number(config.inactivityMinutesThreshold || 30),
        shiftReportEnabled: config.shiftReportEnabled !== false,
        subscribersCount: subscribers.length,
        hasToken: !!config.botToken,
        hasChatId: !!config.chatId
      },
      subscribers
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error: any) {
    console.error('[API /api/telegram GET error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch Telegram config' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getIotDb();
    const body = await req.json();
    const action = body.action || 'update_config';
    const config = await getTelegramConfigDoc(db);
    const botToken = body.botToken || config.botToken || DEFAULT_BOT_TOKEN;

    // 1. Update Configuration
    if (action === 'update_config') {
      const updateData: any = {
        updatedAt: new Date()
      };
      if (body.botToken !== undefined) updateData.botToken = String(body.botToken).trim();
      if (body.chatId !== undefined) updateData.chatId = String(body.chatId).trim();
      if (body.inactivityAlertEnabled !== undefined) updateData.inactivityAlertEnabled = Boolean(body.inactivityAlertEnabled);
      if (body.inactivityMinutesThreshold !== undefined) updateData.inactivityMinutesThreshold = Math.max(5, Number(body.inactivityMinutesThreshold) || 30);
      if (body.shiftReportEnabled !== undefined) updateData.shiftReportEnabled = Boolean(body.shiftReportEnabled);

      await db.collection(TELEGRAM_CONFIG_COL).updateOne(
        { configId: 'default' },
        { $set: updateData },
        { upsert: true }
      );
      await db.collection('iot_telegram_configs').updateOne(
        { configId: 'default' },
        { $set: updateData },
        { upsert: true }
      ).catch(() => {});

      // Forward to remote backend if accessible
      try {
        await fetch(`${REMOTE_IOT_API}/telegram/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        }).catch(() => {});
      } catch (_) {}

      const updated = await getTelegramConfigDoc(db);
      return NextResponse.json({
        success: true,
        message: 'Telegram settings updated successfully',
        data: updated
      });
    }

    // 2. Sync Subscribers from Telegram API (getUpdates)
    if (action === 'sync_subscribers') {
      if (!botToken) {
        return NextResponse.json({ success: false, message: 'Bot token is missing' }, { status: 400 });
      }

      const getUpdatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
      const updatesJson = await getUpdatesRes.json();

      if (!updatesJson.ok) {
        return NextResponse.json({ success: false, message: `Telegram error: ${updatesJson.description}` }, { status: 400 });
      }

      const updates = updatesJson.result || [];
      const syncedChats = new Map<string, any>();

      for (const u of updates) {
        const msg = u.message || u.channel_post || u.edited_message || (u.my_chat_member && u.my_chat_member.chat) || (u.chat_member && u.chat_member.chat);
        if (msg && msg.chat) {
          const chat = msg.chat;
          const chatId = String(chat.id);
          const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Unknown User';
          const username = chat.username ? `@${chat.username}` : '';
          const chatType = chat.type || 'private';
          const date = msg.date ? new Date(msg.date * 1000) : new Date();

          syncedChats.set(chatId, { chatId, name, username, chatType, lastSeenAt: date, active: true });
        }
      }

      const now = new Date();
      for (const [chatId, data] of syncedChats.entries()) {
        await db.collection(TELEGRAM_SUBS_COL).updateOne(
          { chatId },
          {
            $set: {
              name: data.name,
              username: data.username,
              chatType: data.chatType,
              lastSeenAt: data.lastSeenAt,
              active: true,
              updatedAt: now
            },
            $setOnInsert: { createdAt: now }
          },
          { upsert: true }
        );
      }

      // If main chatId is empty and we have a subscriber, auto-set default chatId
      if (!config.chatId && syncedChats.size > 0) {
        const lastChatId = [...syncedChats.keys()].pop();
        await db.collection(TELEGRAM_CONFIG_COL).updateOne(
          { configId: 'default' },
          { $set: { chatId: lastChatId, updatedAt: new Date() } }
        );
      }

      const allSubscribers = await db.collection(TELEGRAM_SUBS_COL).find({}).sort({ lastSeenAt: -1 }).toArray();

      return NextResponse.json({
        success: true,
        message: `Synced ${syncedChats.size} Telegram chats/subscribers`,
        count: allSubscribers.length,
        subscribers: allSubscribers
      });
    }

    // 3. Toggle Subscriber Active / Inactive
    if (action === 'toggle_subscriber') {
      const chatId = String(body.chatId || '').trim();
      const active = body.active !== undefined ? Boolean(body.active) : true;

      if (!chatId) {
        return NextResponse.json({ success: false, message: 'Chat ID is required' }, { status: 400 });
      }

      await db.collection(TELEGRAM_SUBS_COL).updateOne(
        { chatId },
        { $set: { active, updatedAt: new Date() } }
      );

      return NextResponse.json({
        success: true,
        message: `Subscriber ${chatId} status set to ${active ? 'Active' : 'Inactive'}`
      });
    }

    // 4. Auto-detect Chat ID
    if (action === 'detect_chat') {
      if (!botToken) {
        return NextResponse.json({ success: false, message: 'Bot token is missing' }, { status: 400 });
      }

      const getUpdatesRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
      const updatesJson = await getUpdatesRes.json();

      if (!updatesJson.ok) {
        return NextResponse.json({ success: false, message: `Telegram error: ${updatesJson.description}` }, { status: 400 });
      }

      const updates = updatesJson.result || [];
      if (updates.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No recent messages found for the bot. Please send /start or "Hello" to the bot in Telegram first!'
        }, { status: 400 });
      }

      const latestUpdate = updates[updates.length - 1];
      const msg = latestUpdate.message || latestUpdate.channel_post || (latestUpdate.my_chat_member && latestUpdate.my_chat_member.chat);
      const chat = msg?.chat;

      if (!chat || !chat.id) {
        return NextResponse.json({ success: false, message: 'Could not extract Chat ID from recent messages' }, { status: 400 });
      }

      const detectedChatId = String(chat.id);
      const chatTitle = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Telegram User';

      await db.collection(TELEGRAM_CONFIG_COL).updateOne(
        { configId: 'default' },
        { $set: { chatId: detectedChatId, updatedAt: new Date() } }
      );

      return NextResponse.json({
        success: true,
        message: `Detected and saved Chat ID: ${detectedChatId} (${chatTitle})`,
        chatId: detectedChatId,
        chatTitle
      });
    }

    // 5. Send Test Notification
    if (action === 'send_test') {
      const targetChatId = body.chatId || config.chatId;
      const testMsg = body.message || '🤖 *SCM Spinning Monitor - Telegram Test Notification*\n\n✅ Telegram alerts are configured and operating normally!\n\n🏭 *System:* SCM Spinning + IoT Plant Monitoring\n⏰ *Time:* ' + new Date().toLocaleString('en-IN');

      if (!botToken) {
        return NextResponse.json({ success: false, message: 'Bot token is not configured' }, { status: 400 });
      }

      if (targetChatId) {
        const res = await sendTelegramMessage(botToken, targetChatId, testMsg);
        return NextResponse.json({
          success: true,
          message: `Test message sent successfully to Chat ID ${targetChatId}`,
          data: res
        });
      }

      // If no specific chat ID, broadcast to all active subscribers
      const activeSubs = await db.collection(TELEGRAM_SUBS_COL).find({ active: true }).toArray();
      if (activeSubs.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No active subscribers found and no default Chat ID configured. Send a message to the bot first!'
        }, { status: 400 });
      }

      let successCount = 0;
      for (const sub of activeSubs) {
        try {
          await sendTelegramMessage(botToken, sub.chatId, testMsg);
          successCount++;
        } catch (_) {}
      }

      return NextResponse.json({
        success: true,
        message: `Test notification sent to ${successCount} subscriber(s)`
      });
    }

    // 6. Broadcast Custom Notification
    if (action === 'broadcast') {
      const text = body.message || body.text;
      if (!text || !text.trim()) {
        return NextResponse.json({ success: false, message: 'Message text is required' }, { status: 400 });
      }

      const activeSubs = await db.collection(TELEGRAM_SUBS_COL).find({ active: true }).toArray();
      const targetChatIds = new Set<string>(activeSubs.map(s => s.chatId));
      if (config.chatId) targetChatIds.add(config.chatId);

      if (targetChatIds.size === 0) {
        return NextResponse.json({ success: false, message: 'No recipients or Chat IDs found' }, { status: 400 });
      }

      let sentCount = 0;
      for (const chatId of targetChatIds) {
        try {
          await sendTelegramMessage(botToken, chatId, text);
          sentCount++;
        } catch (_) {}
      }

      return NextResponse.json({
        success: true,
        message: `Notification broadcasted to ${sentCount} recipient(s)`,
        sentCount
      });
    }

    // 7. Trigger Shift Productivity Report
    if (action === 'trigger_shift_report') {
      const shiftNum = Number(body.shift || body.shiftId || 1);
      const targetDate = body.date || new Date().toISOString().slice(0, 10);
      const machineId = body.machineId || null;

      // 1. Fetch shift summary data from iot_shiftwise_data or dailyproductionlogs
      const shiftwiseDoc = await db.collection(IOT_COLLECTIONS.SHIFTWISE).findOne({
        shiftDate: targetDate,
        shift: shiftNum
      });

      // 2. Fetch employee performance / card taps for this shift
      const employeeActs = await db.collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES).find({
        shiftDate: targetDate,
        shift: shiftNum
      }).toArray();

      // Look up employee display names
      const allEmployees = await db.collection(IOT_COLLECTIONS.EMPLOYEES).find({}).toArray();
      const nameMap = new Map(allEmployees.map(e => [String(e.employeeId), e.employeeName || e.name || e.employeeId]));

      // Group activities by employee
      const empStats = new Map<string, { taps: number; maxRound: number; machines: Set<string>; devices: Set<string> }>();
      for (const act of employeeActs) {
        if (!act.employeeId) continue;
        const eId = String(act.employeeId);
        const curr = empStats.get(eId) || { taps: 0, maxRound: 0, machines: new Set(), devices: new Set() };
        curr.taps++;
        if (Number(act.cardTap) > curr.maxRound) curr.maxRound = Number(act.cardTap);
        if (act.machineId) curr.machines.add(String(act.machineId));
        if (act.deviceId) curr.devices.add(String(act.deviceId));
        empStats.set(eId, curr);
      }

      const shiftNames: Record<number, string> = {
        1: 'Shift I (06:00 - 14:00)',
        2: 'Shift II (14:00 - 22:00)',
        3: 'Shift III (22:00 - 06:00)'
      };

      let reportText = [
        `📊 *SCM TEXTILE SPINNERS - SHIFT REPORT* 📊`,
        `🏭 *Plant:* Spinning + IoT Live Monitoring`,
        `📅 *Date:* ${targetDate}`,
        `⏰ *Shift:* ${shiftNames[shiftNum] || `Shift ${shiftNum}`}`,
        ``
      ].join('\n');

      if (shiftwiseDoc?.machines && Array.isArray(shiftwiseDoc.machines)) {
        const totalMachines = shiftwiseDoc.machines.length;
        const running = shiftwiseDoc.machines.filter((m: any) => m.status === 'RUNNING' || Number(m.speed || m.rpm || 0) > 100).length;
        reportText += `⚙️ *Machines Active:* ${running} / ${totalMachines}\n`;
      }

      reportText += `\n👥 *Operator Duty & Productivity Summary:*\n`;
      reportText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (empStats.size === 0) {
        reportText += `ℹ️ _No RFID operator taps recorded yet for this shift._\n`;
      } else {
        for (const [eId, stats] of empStats.entries()) {
          const empName = nameMap.get(eId) || `EMP-${eId}`;
          const machinesStr = stats.machines.size > 0 ? Array.from(stats.machines).join(', ') : 'Assigned Frames';
          reportText += [
            `👤 *Operator:* ${empName}`,
            `🆔 *RFID Card:* \`${eId}\``,
            `🏭 *Frames:* ${machinesStr}`,
            `🔹 *Card Taps:* ${stats.taps} | *Completed Rounds:* ${stats.maxRound}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
          ].join('\n') + '\n';
        }
      }

      reportText += `\n_Generated automatically from SCM Spinning Monitor_`;

      // Broadcast report to all active Telegram subscribers
      const activeSubs = await db.collection(TELEGRAM_SUBS_COL).find({ active: true }).toArray();
      const targetChatIds = new Set<string>(activeSubs.map(s => s.chatId));
      if (config.chatId) targetChatIds.add(config.chatId);

      let sentCount = 0;
      for (const chatId of targetChatIds) {
        try {
          await sendTelegramMessage(botToken, chatId, reportText);
          sentCount++;
        } catch (_) {}
      }

      return NextResponse.json({
        success: true,
        message: `Shift report broadcasted to ${sentCount} recipient(s)`,
        sentCount,
        reportText
      });
    }

    // 8. Trigger Inactivity Check
    if (action === 'trigger_inactivity_check') {
      const thresholdMinutes = Number(body.minutes || config.inactivityMinutesThreshold || 30);
      const cutoffTime = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      // Find employees with assigned devices whose last tap was before cutoff
      const employees = await db.collection(IOT_COLLECTIONS.EMPLOYEES).find({
        assignedDeviceIds: { $exists: true, $not: { $size: 0 } },
        active: true
      }).toArray();

      const alerts: string[] = [];
      for (const emp of employees) {
        const lastAct = await db.collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES).findOne(
          { employeeId: emp.employeeId },
          { sort: { activityAt: -1, tapTime: -1, timestamp: -1 } }
        );

        const lastTapTime = lastAct ? new Date(lastAct.activityAt || lastAct.tapTime || lastAct.timestamp || 0) : null;
        if (!lastTapTime || lastTapTime < cutoffTime) {
          const minsInactive = lastTapTime ? Math.round((Date.now() - lastTapTime.getTime()) / 60000) : thresholdMinutes;
          const alertMsg = [
            `🚨 *OPERATOR INACTIVITY ALERT* 🚨`,
            ``,
            `👤 *Name:* ${emp.employeeName || emp.name}`,
            `🆔 *Card:* \`${emp.employeeId}\``,
            `📟 *Assigned Devices:* ${(emp.assignedDeviceIds || []).join(', ')}`,
            `⏰ *Last Activity:* ${lastTapTime ? lastTapTime.toLocaleTimeString('en-IN') : 'No tap recorded'} (${minsInactive} mins ago)`,
            ``,
            `⚠️ *Operator has exceeded the ${thresholdMinutes} minute inactivity threshold!*`
          ].join('\n');

          // Send to main chatId
          if (config.chatId) {
            try {
              await sendTelegramMessage(botToken, config.chatId, alertMsg);
              alerts.push(emp.employeeName || emp.employeeId);
            } catch (_) {}
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Inactivity check completed. ${alerts.length} alert(s) dispatched.`,
        alertCount: alerts.length,
        alertedEmployees: alerts
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[API /api/telegram POST error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Telegram action failed' }, { status: 500 });
  }
}
