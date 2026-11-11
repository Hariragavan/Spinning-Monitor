import { Db } from 'mongodb';
import { IOT_COLLECTIONS } from '@/lib/iot/iotDb';

function normalizeToIsoDate(dStr: string | null | undefined): string {
  if (!dStr) return '';
  let clean = String(dStr).trim();
  if (clean.includes('T')) {
    clean = clean.split('T')[0];
  }
  if (clean.includes(' ')) {
    clean = clean.split(' ')[0];
  }
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return clean.slice(0, 10);
}

export interface MigrationReport {
  success: boolean;
  transferred: {
    machineEmToIotEm: number;
    machineEmLogsToIotEm: number;
    commondatasShiftsToShiftwise: number;
    historiesShiftsToShiftwise: number;
    incentiveRules: number;
    yarnCounts: number;
  };
  droppedCollections: string[];
  errors: string[];
  timestamp: string;
}

/**
 * Transfers all valid data from duplicate or legacy tables into their canonical target tables,
 * then safely drops the unwanted tables so Atlas and Local stay clean, organized, and minimal.
 */
export async function transferAndCleanupDatabase(db: Db): Promise<MigrationReport> {
  const report: MigrationReport = {
    success: true,
    transferred: {
      machineEmToIotEm: 0,
      machineEmLogsToIotEm: 0,
      commondatasShiftsToShiftwise: 0,
      historiesShiftsToShiftwise: 0,
      incentiveRules: 0,
      yarnCounts: 0
    },
    droppedCollections: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  try {
    const existingCols = await db.listCollections().toArray();
    const existingNames = new Set(existingCols.map(c => c.name));

    // -------------------------------------------------------------
    // 1. Transfer from machine_em -> iot_em
    // -------------------------------------------------------------
    if (existingNames.has('machine_em')) {
      try {
        let transferredCount = 0;

        // 1a. Format with single _id: 'machine_em_data'
        const emDoc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });
        if (emDoc && emDoc.data) {
          const bulkEm: any[] = [];
          for (const [dateStr, frameMap] of Object.entries(emDoc.data as Record<string, any>)) {
            const isoDate = normalizeToIsoDate(dateStr);
            const month = isoDate.slice(0, 7);
            for (const [frameNo, shiftMap] of Object.entries(frameMap as Record<string, any>)) {
              for (const [shiftKey, emVal] of Object.entries(shiftMap as Record<string, any>)) {
                const shift = Number(shiftKey);
                const val = Number(emVal);
                if (!isNaN(shift) && !isNaN(val) && val > 0) {
                  bulkEm.push({
                    updateOne: {
                      filter: { machineNo: frameNo, date: isoDate, shift },
                      update: {
                        $set: {
                          machineNo: frameNo,
                          date: isoDate,
                          month,
                          shift,
                          emTotal: val,
                          isShiftFinal: true,
                          updatedAt: new Date()
                        },
                        $setOnInsert: { recordedAt: new Date() }
                      },
                      upsert: true
                    }
                  });
                }
              }
            }
          }
          if (bulkEm.length > 0) {
            await db.collection(IOT_COLLECTIONS.EM).bulkWrite(bulkEm, { ordered: false });
            transferredCount += bulkEm.length;
          }
        }

        // 1b. Format with individual docs in machine_em
        const indDocs = await db.collection('machine_em').find({ _id: { $ne: 'machine_em_data' as any } }).toArray();
        if (indDocs.length > 0) {
          const bulkInd: any[] = [];
          for (const d of indDocs) {
            const frameNo = String(d.machineNo || d.frameNo || '');
            const isoDate = normalizeToIsoDate(d.date || d.shiftDate);
            const shift = Number(d.shift || 1);
            const emTotal = Number(d.emTotal ?? d.emValue ?? 0);
            if (frameNo && isoDate && emTotal > 0) {
              bulkInd.push({
                updateOne: {
                  filter: { machineNo: frameNo, date: isoDate, shift },
                  update: {
                    $set: {
                      machineNo: frameNo,
                      date: isoDate,
                      month: isoDate.slice(0, 7),
                      shift,
                      emTotal,
                      isShiftFinal: true,
                      updatedAt: new Date()
                    },
                    $setOnInsert: { recordedAt: new Date() }
                  },
                  upsert: true
                }
              });
            }
          }
          if (bulkInd.length > 0) {
            await db.collection(IOT_COLLECTIONS.EM).bulkWrite(bulkInd, { ordered: false });
            transferredCount += bulkInd.length;
          }
        }

        report.transferred.machineEmToIotEm = transferredCount;
        await db.collection('machine_em').drop().catch(() => {});
        report.droppedCollections.push('machine_em');
      } catch (err: any) {
        report.errors.push(`machine_em migration error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 2. Transfer from machineemlogs -> iot_em
    // -------------------------------------------------------------
    if (existingNames.has('machineemlogs')) {
      try {
        const logs = await db.collection('machineemlogs').find({}).toArray();
        if (logs.length > 0) {
          const bulkLogEm: any[] = [];
          for (const log of logs) {
            const isoDate = normalizeToIsoDate(log.date);
            const month = isoDate.slice(0, 7);
            const frameNo = String(log.frameNo || '');
            const shift = Number(log.shift || 1);
            const emVal = Number(log.emValue || (Number(log.doffEmt || 0) + Number(log.naturalEmt || 0)));
            if (frameNo && isoDate && emVal > 0) {
              bulkLogEm.push({
                updateOne: {
                  filter: { machineNo: frameNo, date: isoDate, shift },
                  update: {
                    $set: {
                      machineNo: frameNo,
                      date: isoDate,
                      month,
                      shift,
                      emTotal: emVal,
                      isShiftFinal: true,
                      updatedAt: new Date()
                    },
                    $setOnInsert: { recordedAt: new Date() }
                  },
                  upsert: true
                }
              });
            }
          }
          if (bulkLogEm.length > 0) {
            await db.collection(IOT_COLLECTIONS.EM).bulkWrite(bulkLogEm, { ordered: false });
            report.transferred.machineEmLogsToIotEm = bulkLogEm.length;
          }
        }
        await db.collection('machineemlogs').drop().catch(() => {});
        report.droppedCollections.push('machineemlogs');
      } catch (err: any) {
        report.errors.push(`machineemlogs migration error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 3. Transfer from iot_commondatas & iot_spinfo_histories -> iot_shiftwise_data & iot_em
    // -------------------------------------------------------------
    const historyTables = ['iot_commondatas', 'iot_spinfo_histories'].filter(c => existingNames.has(c));
    for (const cName of historyTables) {
      try {
        const docs = await db.collection(cName).find({ machines: { $exists: true, $ne: [] } }).toArray();
        if (docs.length > 0) {
          const shiftGroups = new Map<string, any[]>();
          for (const doc of docs) {
            const sDate = normalizeToIsoDate(doc.shiftDate || (doc.dataTime ? doc.dataTime.slice(0, 10) : ''));
            const sNum = Number(doc.shift || 1);
            const key = `${sDate}_${sNum}`;
            const list = shiftGroups.get(key) || [];
            list.push(doc);
            shiftGroups.set(key, list);
          }

          let shiftsCount = 0;
          for (const [_key, packetList] of shiftGroups.entries()) {
            const base = packetList[packetList.length - 1]; // latest packet for shift
            const sDate = normalizeToIsoDate(base.shiftDate || (base.dataTime ? base.dataTime.slice(0, 10) : ''));
            const sNum = Number(base.shift || 1);
            const month = sDate.slice(0, 7);

            // Merge machines
            const mMerged = new Map<string, any>();
            for (const pkt of packetList) {
              for (const m of (pkt.machines || [])) {
                const mId = String(m.machine || m.machineId || '');
                if (mId) mMerged.set(mId, m);
              }
            }
            const machines = Array.from(mMerged.values());

            // Upsert shift closing summary into iot_shiftwise_data
            const { _id, ...cleanBase } = base;
            const msgId = cleanBase.msgId || `${sDate.replace(/-/g, '')}-S${sNum}-END`;
            await db.collection(IOT_COLLECTIONS.SHIFTWISE).updateOne(
              { shiftDate: sDate, shift: sNum },
              {
                $set: {
                  ...cleanBase,
                  msgId,
                  recordType: 'SHIFT_END',
                  shiftDate: sDate,
                  month,
                  shift: sNum,
                  machineCount: machines.length,
                  machines,
                  updatedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
              },
              { upsert: true }
            );

            // Upsert machine EM into iot_em
            const emBulk: any[] = [];
            for (const m of machines) {
              const mNo = String(m.machine || m.machineId || '');
              const sideL = (m.sides || []).find((s: any) => s.side === 'L');
              const sideR = (m.sides || []).find((s: any) => s.side === 'R');
              const emLeft = Number(sideL?.endMendingTime || 0);
              const emRight = Number(sideR?.endMendingTime || 0);
              const emTotal = Number((emLeft + emRight).toFixed(2));
              if (mNo && (emTotal > 0 || m.shiftEndBreaks > 0)) {
                emBulk.push({
                  updateOne: {
                    filter: { machineNo: mNo, date: sDate, shift: sNum },
                    update: {
                      $set: {
                        machineNo: mNo,
                        date: sDate,
                        month,
                        shift: sNum,
                        emLeft,
                        emRight,
                        emTotal,
                        isShiftFinal: true,
                        updatedAt: new Date()
                      },
                      $setOnInsert: { recordedAt: new Date() }
                    },
                    upsert: true
                  }
                });
              }
            }
            if (emBulk.length > 0) {
              await db.collection(IOT_COLLECTIONS.EM).bulkWrite(emBulk, { ordered: false });
            }
            shiftsCount++;
          }

          if (cName === 'iot_commondatas') {
            report.transferred.commondatasShiftsToShiftwise = shiftsCount;
          } else {
            report.transferred.historiesShiftsToShiftwise = shiftsCount;
          }
        }

        // Drop the legacy heavy tick collections
        await db.collection(cName).drop().catch(() => {});
        report.droppedCollections.push(cName);
      } catch (err: any) {
        report.errors.push(`${cName} migration error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 4. Transfer incentiverules -> incentive_rules
    // -------------------------------------------------------------
    if (existingNames.has('incentiverules')) {
      try {
        const rules = await db.collection('incentiverules').find({}).toArray();
        if (rules.length > 0) {
          const bulkRules = rules.map(({ _id, ...r }) => {
            const cleanCount = String(r.count || '').trim();
            const shed = r.shed || 'Shed 1';
            const dept = r.department || 'Sider';
            return {
              updateOne: {
                filter: { count: cleanCount, shed, department: dept },
                update: { $set: { ...r, count: cleanCount, shed, department: dept } },
                upsert: true
              }
            };
          });
          await db.collection('incentive_rules').bulkWrite(bulkRules, { ordered: false });
          report.transferred.incentiveRules = bulkRules.length;
        }
        await db.collection('incentiverules').drop().catch(() => {});
        report.droppedCollections.push('incentiverules');
      } catch (err: any) {
        report.errors.push(`incentiverules migration error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 5. Transfer yarncounts -> count_conversions
    // -------------------------------------------------------------
    if (existingNames.has('yarncounts')) {
      try {
        const counts = await db.collection('yarncounts').find({}).toArray();
        if (counts.length > 0) {
          const bulkCounts = counts.map(({ _id, ...c }) => ({
            updateOne: {
              filter: { count: c.count },
              update: { $set: c },
              upsert: true
            }
          }));
          await db.collection('count_conversions').bulkWrite(bulkCounts, { ordered: false });
          report.transferred.yarnCounts = bulkCounts.length;
        }
        await db.collection('yarncounts').drop().catch(() => {});
        report.droppedCollections.push('yarncounts');
      } catch (err: any) {
        report.errors.push(`yarncounts migration error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 6. Drop obsolete shiftallocations (allocations already in reports)
    // -------------------------------------------------------------
    if (existingNames.has('shiftallocations')) {
      try {
        await db.collection('shiftallocations').drop().catch(() => {});
        report.droppedCollections.push('shiftallocations');
      } catch (err: any) {
        report.errors.push(`shiftallocations drop error: ${err.message}`);
      }
    }

  } catch (outerErr: any) {
    report.success = false;
    report.errors.push(`General error: ${outerErr.message}`);
  }

  return report;
}
