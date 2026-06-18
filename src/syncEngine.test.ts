import { describe, it, expect, beforeEach } from "vitest";
import {
  compressLocalChanges,
  canCompressChanges,
  detectConflicts,
  resolveConflict,
  getChangeGroupKey,
} from "./syncEngine";
import {
  ReplayableChange,
  UserRole,
  ChangeEntityType,
  RemoteSnapshot,
  AppData,
  getInitialData,
  createReplayableChange,
  createRemoteSnapshot,
  createConflictEntry,
  ConflictResolution,
  ConflictEntry,
} from "./db";

function createChange(overrides: Partial<ReplayableChange> & {
  caseId: string;
  entityType: ChangeEntityType;
  entityId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: UserRole;
}): ReplayableChange {
  return createReplayableChange({
    ...overrides,
    source: overrides.source || "local",
    syncStatus: overrides.syncStatus || "pending",
  });
}

function isoTime(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function changeWithTime(
  timeIso: string,
  overrides: Partial<ReplayableChange> & {
    caseId: string;
    entityType: ChangeEntityType;
    entityId: string;
    field: string;
    oldValue: string;
    newValue: string;
    changedBy: UserRole;
  }
): ReplayableChange {
  const c = createChange(overrides);
  return { ...c, changedAt: timeIso };
}

describe("compressLocalChanges", () => {
  it("同case同entity同field同角色，5分钟内多次变更压缩为1条", () => {
    const t1 = isoTime(4);
    const t2 = isoTime(3);
    const t3 = isoTime(2);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "牙髓炎", newValue: "慢性牙髓炎", changedBy: "医生",
    });
    const c = changeWithTime(t3, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性牙髓炎", newValue: "慢性根尖周炎", changedBy: "医生",
    });

    const { compressed, groups } = compressLocalChanges([a, b, c]);

    expect(groups.length).toBe(1);
    expect(groups[0].changes.length).toBe(3);
    expect(groups[0].firstChangedAt).toBe(t1);
    expect(groups[0].lastChangedAt).toBe(t3);
    expect(compressed.length).toBe(1);
    expect(compressed[0].oldValue).toBe("");
    expect(compressed[0].newValue).toBe("慢性根尖周炎");
    expect(compressed[0].changedAt).toBe(t3);
    expect(compressed[0].compressedFrom).toEqual([a.id, b.id, c.id]);
  });

  it("不同field不压缩", () => {
    const t1 = isoTime(2);
    const t2 = isoTime(1);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "currentStep", oldValue: "开髓", newValue: "测长", changedBy: "医生",
    });

    const { compressed, groups } = compressLocalChanges([a, b]);

    expect(groups.length).toBe(0);
    expect(compressed.length).toBe(2);
  });

  it("不同角色(changedBy)不压缩", () => {
    const t1 = isoTime(2);
    const t2 = isoTime(1);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "牙髓炎", newValue: "慢性牙髓炎", changedBy: "助理",
    });

    const { compressed, groups } = compressLocalChanges([a, b]);

    expect(groups.length).toBe(0);
    expect(compressed.length).toBe(2);
  });

  it("超过5分钟窗口不压缩", () => {
    const t1 = isoTime(10);
    const t2 = isoTime(1);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "牙髓炎", newValue: "慢性牙髓炎", changedBy: "医生",
    });

    const { compressed, groups } = compressLocalChanges([a, b]);

    expect(groups.length).toBe(0);
    expect(compressed.length).toBe(2);
  });

  it("非本地pending变更不参与压缩，原样返回", () => {
    const t1 = isoTime(2);
    const t2 = isoTime(1);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
      source: "remote", syncStatus: "synced",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "牙髓炎", newValue: "慢性牙髓炎", changedBy: "医生",
    });

    const { compressed } = compressLocalChanges([a, b]);
    expect(compressed.length).toBe(2);
    expect(compressed.some(c => c.source === "remote")).toBe(true);
  });

  it("不同entityId不压缩", () => {
    const t1 = isoTime(2);
    const t2 = isoTime(1);
    const a = changeWithTime(t1, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "", newValue: "牙髓炎", changedBy: "医生",
    });
    const b = changeWithTime(t2, {
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_2",
      field: "diagnosis", oldValue: "", newValue: "慢性牙髓炎", changedBy: "医生",
    });

    const { compressed, groups } = compressLocalChanges([a, b]);
    expect(groups.length).toBe(0);
    expect(compressed.length).toBe(2);
  });
});

describe("canCompressChanges", () => {
  it("返回true的所有条件都满足", () => {
    const base = {
      caseId: "c1", entityType: "caseBasicInfo" as ChangeEntityType, entityId: "c1",
      field: "diagnosis", changedBy: "医生" as UserRole,
      source: "local" as const, syncStatus: "pending" as const,
      oldValue: "", newValue: "v1", id: "1",
    };
    const a: ReplayableChange = { ...base, changedAt: isoTime(3) };
    const b: ReplayableChange = { ...base, changedAt: isoTime(1), id: "2", oldValue: "v1", newValue: "v2" };
    expect(canCompressChanges(a, b)).toBe(true);
  });

  it("source不是local返回false", () => {
    const base = {
      caseId: "c1", entityType: "caseBasicInfo" as ChangeEntityType, entityId: "c1",
      field: "diagnosis", changedBy: "医生" as UserRole,
      syncStatus: "pending" as const,
      oldValue: "", newValue: "v1", id: "1",
    };
    const a: ReplayableChange = { ...base, source: "remote", changedAt: isoTime(3) };
    const b: ReplayableChange = { ...base, source: "remote", changedAt: isoTime(1), id: "2" };
    expect(canCompressChanges(a, b)).toBe(false);
  });

  it("syncStatus不是pending返回false", () => {
    const base = {
      caseId: "c1", entityType: "caseBasicInfo" as ChangeEntityType, entityId: "c1",
      field: "diagnosis", changedBy: "医生" as UserRole,
      source: "local" as const,
      oldValue: "", newValue: "v1", id: "1",
    };
    const a: ReplayableChange = { ...base, syncStatus: "synced", changedAt: isoTime(3) };
    const b: ReplayableChange = { ...base, syncStatus: "synced", changedAt: isoTime(1), id: "2" };
    expect(canCompressChanges(a, b)).toBe(false);
  });
});

describe("detectConflicts", () => {
  function makeBaseSnapshot(): RemoteSnapshot {
    return createRemoteSnapshot({
      caseInfos: [{
        id: "case_1",
        toothPosition: "#36",
        patientName: "王建国",
        phone: "138****1234",
        diagnosis: "慢性根尖周炎",
        currentStep: "封药",
        workingLength: "MB 19.5mm",
        mainFileNumber: "30",
        medication: "Ca(OH)2",
        remark: "",
        createdAt: "2026-06-10",
        updatedAt: "2026-06-15",
      }],
      followUpPlans: [],
      workingLengths: [],
      timelines: [],
      records: [["case_1", "#36", "慢性根尖周炎", "封药", "MB 19.5mm，主尖锉#30", "待复诊"]],
    });
  }

  it("本地pending与远端修改同case同entity同field且值不同，产生冲突", () => {
    const localChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "医生",
      changedAt: isoTime(2),
    });
    const remoteChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "慢性牙髓炎", changedBy: "助理",
      source: "remote", syncStatus: "synced",
      changedAt: isoTime(1),
    });
    const base = makeBaseSnapshot();

    const conflicts = detectConflicts([localChange], [remoteChange], base);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].caseId).toBe("case_1");
    expect(conflicts[0].field).toBe("diagnosis");
    expect(conflicts[0].localValue).toBe("急性根尖周炎");
    expect(conflicts[0].remoteValue).toBe("慢性牙髓炎");
    expect(conflicts[0].baseValue).toBe("慢性根尖周炎");
  });

  it("本地pending与远端值相同，不产生冲突", () => {
    const localChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "医生",
      changedAt: isoTime(2),
    });
    const remoteChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "助理",
      source: "remote", syncStatus: "synced",
      changedAt: isoTime(1),
    });
    const base = makeBaseSnapshot();

    const conflicts = detectConflicts([localChange], [remoteChange], base);
    expect(conflicts.length).toBe(0);
  });

  it("没有远端变更，不产生冲突", () => {
    const localChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "医生",
      changedAt: isoTime(2),
    });
    const base = makeBaseSnapshot();

    const conflicts = detectConflicts([localChange], [], base);
    expect(conflicts.length).toBe(0);
  });

  it("本地非pending变更不参与冲突检测", () => {
    const localSynced = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "医生",
      syncStatus: "synced", changedAt: isoTime(2),
    });
    const remoteChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "慢性牙髓炎", changedBy: "助理",
      source: "remote", syncStatus: "synced",
      changedAt: isoTime(1),
    });
    const base = makeBaseSnapshot();

    const conflicts = detectConflicts([localSynced], [remoteChange], base);
    expect(conflicts.length).toBe(0);
  });

  it("不同field不产生冲突", () => {
    const localChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "diagnosis", oldValue: "慢性根尖周炎", newValue: "急性根尖周炎", changedBy: "医生",
      changedAt: isoTime(2),
    });
    const remoteChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "currentStep", oldValue: "封药", newValue: "充填", changedBy: "助理",
      source: "remote", syncStatus: "synced",
      changedAt: isoTime(1),
    });
    const base = makeBaseSnapshot();

    const conflicts = detectConflicts([localChange], [remoteChange], base);
    expect(conflicts.length).toBe(0);
  });

  it("getBaseValueFromSnapshot 从 snapshot 中读取 baseValue", () => {
    const base = makeBaseSnapshot();
    const localChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "currentStep", oldValue: "封药", newValue: "充填", changedBy: "医生",
      changedAt: isoTime(2),
    });
    const remoteChange = createChange({
      caseId: "case_1", entityType: "caseBasicInfo", entityId: "case_1",
      field: "currentStep", oldValue: "封药", newValue: "测长", changedBy: "助理",
      source: "remote", syncStatus: "synced",
      changedAt: isoTime(1),
    });

    const conflicts = detectConflicts([localChange], [remoteChange], base);
    expect(conflicts[0].baseValue).toBe("封药");
  });
});

describe("resolveConflict", () => {
  function buildDataWithConflict(entityType: ChangeEntityType, field: string, entityId: string, baseVal: string, localVal: string, remoteVal: string): { data: AppData; conflict: ConflictEntry } {
    const initial = getInitialData();
    const caseId = initial.caseInfos[0].id;
    const caseEntityId = entityType === "caseBasicInfo" ? caseId : entityId;
    const effCaseId = entityType === "caseBasicInfo" || entityType === "caseRecord" ? caseId : initial.caseInfos[0].id;

    const localChange = createReplayableChange({
      caseId: effCaseId, entityType, entityId: caseEntityId, field,
      oldValue: baseVal, newValue: localVal, changedBy: "医生",
      source: "local", syncStatus: "conflict",
    });
    const remoteChange = createReplayableChange({
      caseId: effCaseId, entityType, entityId: caseEntityId, field,
      oldValue: baseVal, newValue: remoteVal, changedBy: "助理",
      source: "remote", syncStatus: "synced",
    });
    const snapshot = createRemoteSnapshot({
      caseInfos: initial.caseInfos,
      followUpPlans: initial.followUpPlans,
      workingLengths: initial.workingLengths,
      timelines: initial.timelines,
      records: initial.records,
    });
    const conflict = createConflictEntry({
      caseId: effCaseId, field, entityType, entityId: caseEntityId,
      localChange, remoteChange, baseValue: baseVal,
    });
    const data: AppData = {
      ...initial,
      replayableChanges: [localChange, remoteChange],
      conflicts: [conflict],
      lastRemoteSnapshot: snapshot,
    };
    return { data, conflict };
  }

  it("caseBasicInfo 冲突解决：caseInfos 和 records 同步更新", () => {
    const { data, conflict } = buildDataWithConflict(
      "caseBasicInfo", "diagnosis", "case_init_1", "慢性根尖周炎", "急性根尖周炎", "慢性牙髓炎"
    );
    const caseId = data.caseInfos[0].id;

    const resolution: ConflictResolution = {
      strategy: "local", resolvedValue: "急性根尖周炎",
      resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };

    const updated = resolveConflict(data, conflict.id, resolution);

    const ci = updated.caseInfos.find(c => c.id === caseId);
    expect(ci?.diagnosis).toBe("急性根尖周炎");

    const rec = updated.records.find(r => r[0] === caseId);
    expect(rec?.[2]).toBe("急性根尖周炎");

    const resolvedConflict = updated.conflicts.find(c => c.id === conflict.id);
    expect(resolvedConflict?.resolved).toBe(true);
    expect(resolvedConflict?.resolution?.resolvedValue).toBe("急性根尖周炎");

    const changeUpdate = updated.replayableChanges.find(c => c.id === conflict.localChangeId);
    expect(changeUpdate?.syncStatus).toBe("synced");
    expect(changeUpdate?.newValue).toBe("急性根尖周炎");
  });

  it("caseBasicInfo currentStep 冲突解决，同步更新 records 中的状态列", () => {
    const { data, conflict } = buildDataWithConflict(
      "caseBasicInfo", "currentStep", "case_init_2", "充填", "开髓", "测长"
    );
    const caseId = conflict.caseId;

    const resolution: ConflictResolution = {
      strategy: "remote", resolvedValue: "充填",
      resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };

    const updated = resolveConflict(data, conflict.id, resolution);

    const ci = updated.caseInfos.find(c => c.id === caseId);
    expect(ci?.currentStep).toBe("充填");

    const rec = updated.records.find(r => r[0] === caseId);
    expect(rec?.[5]).toBe("已充填");
    expect(rec?.[3]).toBe("充填");
  });

  it("caseRecord 冲突直接更新 records 对应索引", () => {
    const initial = getInitialData();
    const caseId = initial.records[0][0];
    const localChange = createReplayableChange({
      caseId, entityType: "caseRecord", entityId: caseId, field: "record[5]",
      oldValue: "待复诊", newValue: "已确认", changedBy: "医生",
      source: "local", syncStatus: "conflict",
    });
    const remoteChange = createReplayableChange({
      caseId, entityType: "caseRecord", entityId: caseId, field: "record[5]",
      oldValue: "待复诊", newValue: "已取消", changedBy: "前台",
      source: "remote", syncStatus: "synced",
    });
    const conflict = createConflictEntry({
      caseId, field: "record[5]", entityType: "caseRecord", entityId: caseId,
      localChange, remoteChange, baseValue: "待复诊",
    });
    const data: AppData = {
      ...initial,
      replayableChanges: [localChange, remoteChange],
      conflicts: [conflict],
    };

    const resolution: ConflictResolution = {
      strategy: "local", resolvedValue: "已确认",
      resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };

    const updated = resolveConflict(data, conflict.id, resolution);
    const rec = updated.records.find(r => r[0] === caseId);
    expect(rec?.[5]).toBe("已确认");
    expect(updated.conflicts.find(c => c.id === conflict.id)?.resolved).toBe(true);
  });

  it("followUpPlan 冲突解决更新 followUpPlans 并刷新对应 records", () => {
    const initial = getInitialData();
    const fp = initial.followUpPlans[0];
    const localChange = createReplayableChange({
      caseId: fp.caseId, entityType: "followUpPlan", entityId: fp.id, field: "contactStatus",
      oldValue: "已确认", newValue: "待联系", changedBy: "医生",
      source: "local", syncStatus: "conflict",
    });
    const remoteChange = createReplayableChange({
      caseId: fp.caseId, entityType: "followUpPlan", entityId: fp.id, field: "contactStatus",
      oldValue: "已确认", newValue: "未接通", changedBy: "前台",
      source: "remote", syncStatus: "synced",
    });
    const conflict = createConflictEntry({
      caseId: fp.caseId, field: "contactStatus", entityType: "followUpPlan", entityId: fp.id,
      localChange, remoteChange, baseValue: "已确认",
    });
    const data: AppData = {
      ...initial,
      replayableChanges: [localChange, remoteChange],
      conflicts: [conflict],
    };

    const resolution: ConflictResolution = {
      strategy: "remote", resolvedValue: "未接通",
      resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };

    const updated = resolveConflict(data, conflict.id, resolution);
    const updatedFp = updated.followUpPlans.find(p => p.id === fp.id);
    expect(updatedFp?.contactStatus).toBe("未接通");
    expect(updated.conflicts.find(c => c.id === conflict.id)?.resolved).toBe(true);
  });

  it("不存在或已解决的冲突，数据不变", () => {
    const initial = getInitialData();
    const resolution: ConflictResolution = {
      strategy: "local", resolvedValue: "X", resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };
    const updated1 = resolveConflict(initial, "nonexistent", resolution);
    expect(updated1).toBe(initial);

    const { data, conflict } = buildDataWithConflict(
      "caseBasicInfo", "diagnosis", "case_init_1", "a", "b", "c"
    );
    data.conflicts[0].resolved = true;
    const updated2 = resolveConflict(data, conflict.id, resolution);
    expect(updated2).toBe(data);
  });

  it("workingLength entries 冲突解决更新对应子条目", () => {
    const initial = getInitialData();
    const wl = initial.workingLengths[0];
    const entry = wl.entries[0];
    const entityId = `${wl.id}::${entry.id}`;
    const localChange = createReplayableChange({
      caseId: wl.caseId, entityType: "workingLength", entityId, field: "entries.measuredLength",
      oldValue: entry.measuredLength, newValue: "20.0", changedBy: "医生",
      source: "local", syncStatus: "conflict",
    });
    const remoteChange = createReplayableChange({
      caseId: wl.caseId, entityType: "workingLength", entityId, field: "entries.measuredLength",
      oldValue: entry.measuredLength, newValue: "18.0", changedBy: "助理",
      source: "remote", syncStatus: "synced",
    });
    const conflict = createConflictEntry({
      caseId: wl.caseId, field: "entries.measuredLength", entityType: "workingLength", entityId,
      localChange, remoteChange, baseValue: entry.measuredLength,
    });
    const data: AppData = {
      ...initial,
      replayableChanges: [localChange, remoteChange],
      conflicts: [conflict],
    };
    const resolution: ConflictResolution = {
      strategy: "local", resolvedValue: "20.0",
      resolvedBy: "医生", resolvedAt: new Date().toISOString(),
    };

    const updated = resolveConflict(data, conflict.id, resolution);
    const updatedWl = updated.workingLengths.find(w => w.id === wl.id);
    const updatedEntry = updatedWl?.entries.find(e => e.id === entry.id);
    expect(updatedEntry?.measuredLength).toBe("20.0");
  });
});

describe("getChangeGroupKey", () => {
  it("拼接 caseId:entityType:entityId:field", () => {
    const c = createChange({
      caseId: "c1", entityType: "caseBasicInfo", entityId: "c1",
      field: "diagnosis", oldValue: "", newValue: "v", changedBy: "医生",
    });
    expect(getChangeGroupKey(c)).toBe("c1:caseBasicInfo:c1:diagnosis");
  });
});
