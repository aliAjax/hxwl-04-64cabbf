import {
  AppData,
  ReplayableChange,
  RemoteSnapshot,
  ConflictEntry,
  CaseBasicInfo,
  FollowUpPlan,
  WorkingLengthRecord,
  TreatmentTimeline,
  TimelineNode,
  UserRole,
  ChangeEntityType,
  createReplayableChange,
  createConflictEntry,
  createRemoteSnapshot,
  ConflictResolution,
} from "./db";

export interface SyncApplyResult {
  success: boolean;
  appliedChanges: ReplayableChange[];
  conflicts: ConflictEntry[];
  skippedChanges: ReplayableChange[];
  errors: string[];
}

export interface CompressedChangeGroup {
  groupKey: string;
  caseId: string;
  entityType: ChangeEntityType;
  entityId: string;
  field: string;
  changes: ReplayableChange[];
  firstChangedAt: string;
  lastChangedAt: string;
  compressedChange: ReplayableChange;
}

export interface CompressedChangePayload {
  id: string;
  oldValue: string;
  newValue: string;
  changedBy: UserRole;
  changedAt: string;
  source: "local" | "remote";
  syncStatus: "pending" | "synced" | "conflict";
}

const COMPRESS_WINDOW_MS = 5 * 60 * 1000;

const TRACKABLE_CASE_INFO_FIELDS: (keyof CaseBasicInfo)[] = [
  "toothPosition", "patientName", "phone", "diagnosis",
  "currentStep", "workingLength", "mainFileNumber", "medication", "remark",
];

const TRACKABLE_FOLLOW_UP_FIELDS: (keyof FollowUpPlan)[] = [
  "nextDate", "doctor", "contactStatus", "patientName",
  "phone", "reason", "contactNote",
];

const TRACKABLE_WORKING_LENGTH_FIELDS = ["note"];

const TRACKABLE_TIMELINE_NODE_FIELDS: (keyof TimelineNode)[] = [
  "completedAt", "operator", "keyParams", "exceptionNotes", "isCompleted",
];

const TRACKABLE_RECORD_INDICES = [2, 3, 5];

export function getChangeGroupKey(change: ReplayableChange): string {
  return `${change.caseId}:${change.entityType}:${change.entityId}:${change.field}`;
}

export function canCompressChanges(prev: ReplayableChange, next: ReplayableChange): boolean {
  if (prev.source !== "local" || next.source !== "local") return false;
  if (prev.syncStatus !== "pending" || next.syncStatus !== "pending") return false;
  if (prev.caseId !== next.caseId) return false;
  if (prev.entityType !== next.entityType) return false;
  if (prev.entityId !== next.entityId) return false;
  if (prev.field !== next.field) return false;
  if (prev.changedBy !== next.changedBy) return false;

  const prevTime = new Date(prev.changedAt).getTime();
  const nextTime = new Date(next.changedAt).getTime();
  return Math.abs(nextTime - prevTime) <= COMPRESS_WINDOW_MS;
}

function serializeCompressedPayload(change: ReplayableChange): CompressedChangePayload {
  return {
    id: change.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    changedBy: change.changedBy,
    changedAt: change.changedAt,
    source: change.source,
    syncStatus: change.syncStatus,
  };
}

export function compressLocalChanges(changes: ReplayableChange[]): {
  compressed: ReplayableChange[];
  groups: CompressedChangeGroup[];
} {
  const groups: Map<string, ReplayableChange[]> = new Map();

  const localPending = changes
    .filter(c => c.source === "local" && c.syncStatus === "pending")
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());

  const compressed: ReplayableChange[] = [];
  const groupResults: CompressedChangeGroup[] = [];

  localPending.forEach(change => {
    const key = getChangeGroupKey(change);
    const existing = groups.get(key) || [];

    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (canCompressChanges(last, change)) {
        existing.push(change);
        groups.set(key, existing);
        return;
      }
    }

    groups.set(key, [change]);
  });

  const nonCompressible = changes.filter(c => !(c.source === "local" && c.syncStatus === "pending"));

  groups.forEach((groupChanges, key) => {
    if (groupChanges.length <= 1) {
      compressed.push(...groupChanges);
      return;
    }

    const first = groupChanges[0];
    const last = groupChanges[groupChanges.length - 1];
    const compressedPayloads = groupChanges.map(c => serializeCompressedPayload(c));

    const mergedChange: ReplayableChange = {
      ...last,
      id: `rc_compressed_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      oldValue: first.oldValue,
      newValue: last.newValue,
      changedAt: last.changedAt,
      compressedFrom: compressedPayloads.map(p => p.id),
    };

    compressed.push(mergedChange);
    groupResults.push({
      groupKey: key,
      caseId: first.caseId,
      entityType: first.entityType,
      entityId: first.entityId,
      field: first.field,
      changes: [...groupChanges],
      firstChangedAt: first.changedAt,
      lastChangedAt: last.changedAt,
      compressedChange: mergedChange,
    });
  });

  return {
    compressed: [...compressed, ...nonCompressible],
    groups: groupResults,
  };
}

export function enterOfflineMode(data: AppData): AppData {
  const snapshot = createRemoteSnapshot({
    caseInfos: data.caseInfos,
    followUpPlans: data.followUpPlans,
    workingLengths: data.workingLengths,
    timelines: data.timelines,
    records: data.records,
  });

  return {
    ...data,
    syncStatus: "offline",
    lastRemoteSnapshot: snapshot,
    offlineStartedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
}

export function queueLocalChange(
  data: AppData,
  params: {
    caseId: string;
    entityType: ChangeEntityType;
    entityId: string;
    field: string;
    oldValue: string;
    newValue: string;
    changedBy: UserRole;
  }
): { data: AppData; change: ReplayableChange } {
  const change = createReplayableChange({
    ...params,
    source: "local",
    syncStatus: data.syncStatus === "online" ? "synced" : "pending",
  });

  const updatedChanges = [...data.replayableChanges, change];

  return {
    data: {
      ...data,
      replayableChanges: updatedChanges,
    },
    change,
  };
}

export function diffSnapshots(
  base: RemoteSnapshot | null,
  current: {
    caseInfos: CaseBasicInfo[];
    followUpPlans: FollowUpPlan[];
    workingLengths: WorkingLengthRecord[];
    timelines: TreatmentTimeline[];
    records: string[][];
  },
  changedBy: UserRole
): ReplayableChange[] {
  const changes: ReplayableChange[] = [];

  if (!base) return changes;

  const caseInfoMap = new Map(base.caseInfos.map(c => [c.id, c]));
  current.caseInfos.forEach(c => {
    const baseCase = caseInfoMap.get(c.id);
    if (!baseCase) return;
    TRACKABLE_CASE_INFO_FIELDS.forEach(field => {
      const baseVal = String(baseCase[field] || "");
      const currVal = String(c[field] || "");
      if (baseVal !== currVal) {
        changes.push(createReplayableChange({
          caseId: c.id,
          entityType: "caseBasicInfo",
          entityId: c.id,
          field,
          oldValue: baseVal,
          newValue: currVal,
          changedBy,
          source: "remote",
          syncStatus: "synced",
        }));
      }
    });
  });

  const followUpMap = new Map(base.followUpPlans.map(p => [p.id, p]));
  current.followUpPlans.forEach(p => {
    const basePlan = followUpMap.get(p.id);
    if (!basePlan) return;
    TRACKABLE_FOLLOW_UP_FIELDS.forEach(field => {
      const baseVal = String(basePlan[field] || "");
      const currVal = String(p[field] || "");
      if (baseVal !== currVal) {
        changes.push(createReplayableChange({
          caseId: p.caseId,
          entityType: "followUpPlan",
          entityId: p.id,
          field,
          oldValue: baseVal,
          newValue: currVal,
          changedBy,
          source: "remote",
          syncStatus: "synced",
        }));
      }
    });
  });

  const wlMap = new Map(base.workingLengths.map(w => [w.id, w]));
  current.workingLengths.forEach(w => {
    const baseWl = wlMap.get(w.id);
    if (!baseWl) return;
    TRACKABLE_WORKING_LENGTH_FIELDS.forEach(field => {
      const baseVal = String((baseWl as any)[field] || "");
      const currVal = String((w as any)[field] || "");
      if (baseVal !== currVal) {
        const caseId = w.caseId || findCaseIdFromRecords(base.records, w.toothPosition);
        changes.push(createReplayableChange({
          caseId,
          entityType: "workingLength",
          entityId: w.id,
          field,
          oldValue: baseVal,
          newValue: currVal,
          changedBy,
          source: "remote",
          syncStatus: "synced",
        }));
      }
    });
    const baseEntryMap = new Map(baseWl.entries.map(e => [e.id, e]));
    w.entries.forEach(entry => {
      const baseEntry = baseEntryMap.get(entry.id);
      if (!baseEntry) return;
      const entryFields: (keyof typeof entry)[] = [
        "measuredLength", "referenceApex", "measurementMethod", "confirmedStatus",
      ];
      entryFields.forEach(field => {
        const baseVal = String(baseEntry[field] || "");
        const currVal = String(entry[field] || "");
        if (baseVal !== currVal) {
          const caseId = w.caseId || findCaseIdFromRecords(base.records, w.toothPosition);
          changes.push(createReplayableChange({
            caseId,
            entityType: "workingLength",
            entityId: `${w.id}::${entry.id}`,
            field: `entries.${field}`,
            oldValue: baseVal,
            newValue: currVal,
            changedBy,
            source: "remote",
            syncStatus: "synced",
          }));
        }
      });
    });
  });

  const tlMap = new Map(base.timelines.map(t => [t.id, t]));
  current.timelines.forEach(t => {
    const baseTl = tlMap.get(t.id);
    if (!baseTl) return;
    const baseNodeMap = new Map(baseTl.nodes.map(n => [n.id, n]));
    t.nodes.forEach(node => {
      const baseNode = baseNodeMap.get(node.id);
      if (!baseNode) return;
      TRACKABLE_TIMELINE_NODE_FIELDS.forEach(field => {
        const baseVal = String(baseNode[field] || "");
        const currVal = String(node[field] || "");
        if (baseVal !== currVal) {
          const caseId = t.caseId || findCaseIdFromRecords(base.records, t.toothPosition);
          changes.push(createReplayableChange({
            caseId,
            entityType: "timelineNode",
            entityId: node.id,
            field,
            oldValue: baseVal,
            newValue: currVal,
            changedBy,
            source: "remote",
            syncStatus: "synced",
          }));
        }
      });
    });
  });

  const baseRecordMap = new Map(base.records.map(r => [r[0], r]));
  current.records.forEach(record => {
    const caseId = record[0];
    const baseRecord = baseRecordMap.get(caseId);
    if (!baseRecord) return;
    TRACKABLE_RECORD_INDICES.forEach(idx => {
      const baseVal = baseRecord[idx] || "";
      const currVal = record[idx] || "";
      if (baseVal !== currVal) {
        changes.push(createReplayableChange({
          caseId,
          entityType: "caseRecord",
          entityId: caseId,
          field: `record[${idx}]`,
          oldValue: baseVal,
          newValue: currVal,
          changedBy,
          source: "remote",
          syncStatus: "synced",
        }));
      }
    });
  });

  return changes;
}

function findCaseIdFromRecords(records: string[][], toothPosition: string): string {
  const rec = records.find(r => r[1] === toothPosition);
  return rec ? rec[0] : "";
}

export function detectConflicts(
  localChanges: ReplayableChange[],
  remoteChanges: ReplayableChange[],
  baseSnapshot: RemoteSnapshot | null
): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const processed = new Set<string>();

  const localPending = localChanges.filter(c => c.source === "local" && c.syncStatus === "pending");
  const localByKey = new Map<string, ReplayableChange>();
  localPending.forEach(c => {
    const key = getChangeGroupKey(c);
    const existing = localByKey.get(key);
    if (!existing || new Date(c.changedAt) > new Date(existing.changedAt)) {
      localByKey.set(key, c);
    }
  });

  const remoteByKey = new Map<string, ReplayableChange>();
  remoteChanges.forEach(c => {
    const key = getChangeGroupKey(c);
    const existing = remoteByKey.get(key);
    if (!existing || new Date(c.changedAt) > new Date(existing.changedAt)) {
      remoteByKey.set(key, c);
    }
  });

  localByKey.forEach((localChange, key) => {
    const remoteChange = remoteByKey.get(key);
    if (!remoteChange) return;
    if (processed.has(key)) return;
    processed.add(key);

    if (localChange.newValue === remoteChange.newValue) return;

    let baseValue = "";
    if (baseSnapshot) {
      baseValue = getBaseValueFromSnapshot(baseSnapshot, localChange);
    }

    conflicts.push(createConflictEntry({
      caseId: localChange.caseId,
      field: localChange.field,
      entityType: localChange.entityType,
      entityId: localChange.entityId,
      localChange,
      remoteChange,
      baseValue,
    }));
  });

  return conflicts;
}

function getBaseValueFromSnapshot(snapshot: RemoteSnapshot, change: ReplayableChange): string {
  switch (change.entityType) {
    case "caseBasicInfo": {
      const c = snapshot.caseInfos.find(ci => ci.id === change.entityId);
      if (c && change.field in c) return String((c as any)[change.field] || "");
      break;
    }
    case "followUpPlan": {
      const p = snapshot.followUpPlans.find(fp => fp.id === change.entityId);
      if (p && change.field in p) return String((p as any)[change.field] || "");
      break;
    }
    case "workingLength": {
      if (change.field.startsWith("entries.")) {
        const wl = snapshot.workingLengths.find(w => change.entityId.startsWith(w.id));
        if (wl) {
          const entryId = change.entityId.split("::")[1];
          const entry = wl.entries.find(e => e.id === entryId);
          if (entry) {
            const subField = change.field.replace("entries.", "");
            return String((entry as any)[subField] || "");
          }
        }
      } else {
        const w = snapshot.workingLengths.find(wl => wl.id === change.entityId);
        if (w && change.field in w) return String((w as any)[change.field] || "");
      }
      break;
    }
    case "timelineNode": {
      for (const tl of snapshot.timelines) {
        const node = tl.nodes.find(n => n.id === change.entityId);
        if (node && change.field in node) return String((node as any)[change.field] || "");
      }
      break;
    }
    case "caseRecord": {
      const rec = snapshot.records.find(r => r[0] === change.entityId);
      if (rec) {
        const idxMatch = change.field.match(/record\[(\d+)\]/);
        if (idxMatch) {
          const idx = parseInt(idxMatch[1], 10);
          return rec[idx] || "";
        }
      }
      break;
    }
  }
  return "";
}

function rebuildRecordFromCaseInfo(ci: CaseBasicInfo): string[] {
  const status = ci.currentStep === "充填" ? "已充填" : "待复诊";
  const detailParts: string[] = [];
  if (ci.workingLength) detailParts.push(`工作长度 ${ci.workingLength}`);
  if (ci.mainFileNumber) detailParts.push(`主尖锉${ci.mainFileNumber}`);
  if (ci.medication) detailParts.push(`封药：${ci.medication}`);
  if (ci.remark) detailParts.push(ci.remark);
  return [ci.id, ci.toothPosition, ci.diagnosis, ci.currentStep, detailParts.join("，") || "无附加信息", status];
}

function applyChangeToEntity<T extends Record<string, any>>(
  items: T[],
  entityId: string,
  field: string,
  value: string
): T[] {
  return items.map(item =>
    item.id === entityId ? { ...item, [field]: value } as T : item
  );
}

export function applyRemoteSnapshot(
  data: AppData,
  remoteSnapshot: {
    caseInfos: CaseBasicInfo[];
    followUpPlans: FollowUpPlan[];
    workingLengths: WorkingLengthRecord[];
    timelines: TreatmentTimeline[];
    records: string[][];
  },
  remoteChangedBy: UserRole
): {
  data: AppData;
  result: SyncApplyResult;
  remoteChanges: ReplayableChange[];
} {
  const baseSnapshot = data.lastRemoteSnapshot;
  const remoteChanges = diffSnapshots(baseSnapshot, remoteSnapshot, remoteChangedBy);
  const conflicts = detectConflicts(data.replayableChanges, remoteChanges, baseSnapshot);

  const conflictKeys = new Set(conflicts.map(c => getConflictKey(c)));

  const nonConflictingRemote = remoteChanges.filter(rc => {
    const key = getChangeGroupKey(rc);
    return !conflictKeys.has(key);
  });

  let newCaseInfos = [...data.caseInfos];
  let newFollowUpPlans = [...data.followUpPlans];
  let newWorkingLengths = data.workingLengths.map(w => ({ ...w, entries: w.entries.map(e => ({ ...e })) }));
  let newTimelines = data.timelines.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })) }));
  let newRecords = data.records.map(r => [...r]);

  nonConflictingRemote.forEach(change => {
    switch (change.entityType) {
      case "caseBasicInfo":
        newCaseInfos = applyChangeToEntity(newCaseInfos, change.entityId, change.field, change.newValue);
        if (change.field === "currentStep" || change.field === "workingLength" || change.field === "mainFileNumber" || change.field === "medication" || change.field === "remark" || change.field === "diagnosis" || change.field === "toothPosition") {
          const ci = newCaseInfos.find(c => c.id === change.entityId);
          if (ci) {
            const recIdx = newRecords.findIndex(r => r[0] === ci.id);
            if (recIdx >= 0) {
              newRecords[recIdx] = rebuildRecordFromCaseInfo(ci);
            }
          }
        }
        break;
      case "followUpPlan":
        newFollowUpPlans = applyChangeToEntity(newFollowUpPlans, change.entityId, change.field, change.newValue);
        break;
      case "workingLength":
        if (change.field.startsWith("entries.")) {
          const wlId = change.entityId.split("::")[0];
          const entryId = change.entityId.split("::")[1];
          const subField = change.field.replace("entries.", "");
          newWorkingLengths = newWorkingLengths.map(w => {
            if (w.id !== wlId) return w;
            return {
              ...w,
              entries: w.entries.map(e =>
                e.id === entryId ? { ...e, [subField]: change.newValue } : e
              ),
            };
          });
        } else {
          newWorkingLengths = applyChangeToEntity(newWorkingLengths, change.entityId, change.field, change.newValue);
        }
        break;
      case "timelineNode":
        newTimelines = newTimelines.map(tl => ({
          ...tl,
          nodes: tl.nodes.map(n =>
            n.id === change.entityId ? { ...n, [change.field]: change.newValue } : n
          ),
        }));
        break;
      case "caseRecord": {
        const recIdx = newRecords.findIndex(r => r[0] === change.entityId);
        if (recIdx >= 0) {
          const idxMatch = change.field.match(/record\[(\d+)\]/);
          if (idxMatch) {
            const idx = parseInt(idxMatch[1], 10);
            newRecords[recIdx][idx] = change.newValue;
          }
        }
        break;
      }
    }
  });

  newCaseInfos.forEach(ci => {
    const idx = newRecords.findIndex(r => r[0] === ci.id);
    if (idx >= 0) {
      newRecords[idx] = rebuildRecordFromCaseInfo(ci);
    }
  });

  const updatedLocalChanges = data.replayableChanges.map(c => {
    if (c.source === "local" && c.syncStatus === "pending") {
      const key = getChangeGroupKey(c);
      if (conflictKeys.has(key)) {
        return { ...c, syncStatus: "conflict" as const };
      }
      return { ...c, syncStatus: "synced" as const };
    }
    return c;
  });

  const allChanges = [...nonConflictingRemote, ...updatedLocalChanges];
  const unresolvedConflicts = [...conflicts, ...data.conflicts.filter(c => !c.resolved)];

  return {
    data: {
      ...data,
      caseInfos: newCaseInfos,
      followUpPlans: newFollowUpPlans,
      workingLengths: newWorkingLengths,
      timelines: newTimelines,
      records: newRecords,
      replayableChanges: allChanges,
      lastRemoteSnapshot: createRemoteSnapshot({
        caseInfos: newCaseInfos,
        followUpPlans: newFollowUpPlans,
        workingLengths: newWorkingLengths,
        timelines: newTimelines,
        records: newRecords,
      }),
      conflicts: unresolvedConflicts,
      syncStatus: "online",
      lastSyncAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      offlineStartedAt: null,
    },
    result: {
      success: true,
      appliedChanges: nonConflictingRemote,
      conflicts,
      skippedChanges: [],
      errors: [],
    },
    remoteChanges,
  };
}

function getConflictKey(c: ConflictEntry): string {
  return `${c.caseId}:${c.entityType}:${c.entityId}:${c.field}`;
}

export function resolveConflict(
  data: AppData,
  conflictId: string,
  resolution: ConflictResolution
): AppData {
  const conflict = data.conflicts.find(c => c.id === conflictId);
  if (!conflict || conflict.resolved) return data;

  let newCaseInfos = [...data.caseInfos];
  let newFollowUpPlans = [...data.followUpPlans];
  let newWorkingLengths = data.workingLengths.map(w => ({ ...w, entries: w.entries.map(e => ({ ...e })) }));
  let newTimelines = data.timelines.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })) }));
  let newRecords = data.records.map(r => [...r]);

  const today = new Date().toISOString().split("T")[0];

  switch (conflict.entityType) {
    case "caseBasicInfo":
      newCaseInfos = newCaseInfos.map(c =>
        c.id === conflict.entityId
          ? { ...c, [conflict.field]: resolution.resolvedValue, updatedAt: today } as CaseBasicInfo
          : c
      );
      {
        const ci = newCaseInfos.find(c => c.id === conflict.entityId);
        if (ci) {
          const recIdx = newRecords.findIndex(r => r[0] === ci.id);
          if (recIdx >= 0) {
            newRecords[recIdx] = rebuildRecordFromCaseInfo(ci);
          }
        }
      }
      break;
    case "followUpPlan":
      newFollowUpPlans = newFollowUpPlans.map(p =>
        p.id === conflict.entityId ? { ...p, [conflict.field]: resolution.resolvedValue } as FollowUpPlan : p
      );
      {
        const plan = newFollowUpPlans.find(p => p.id === conflict.entityId);
        if (plan) {
          const ci = newCaseInfos.find(c => c.id === plan.caseId);
          if (ci) {
            const recIdx = newRecords.findIndex(r => r[0] === ci.id);
            if (recIdx >= 0) {
              newRecords[recIdx] = rebuildRecordFromCaseInfo(ci);
            }
          }
        }
      }
      break;
    case "workingLength":
      if (conflict.field.startsWith("entries.")) {
        const wlId = conflict.entityId.split("::")[0];
        const entryId = conflict.entityId.split("::")[1];
        const subField = conflict.field.replace("entries.", "");
        newWorkingLengths = newWorkingLengths.map(w => {
          if (w.id !== wlId) return w;
          return {
            ...w,
            entries: w.entries.map(e =>
              e.id === entryId ? { ...e, [subField]: resolution.resolvedValue } : e
            ),
          };
        });
      } else {
        newWorkingLengths = newWorkingLengths.map(w =>
          w.id === conflict.entityId ? { ...w, [conflict.field]: resolution.resolvedValue } as WorkingLengthRecord : w
        );
      }
      {
        const wl = newWorkingLengths.find(w =>
          w.id === conflict.entityId || conflict.entityId.startsWith(w.id)
        );
        if (wl) {
          const ci = newCaseInfos.find(c => c.id === wl.caseId);
          if (ci) {
            const recIdx = newRecords.findIndex(r => r[0] === ci.id);
            if (recIdx >= 0) {
              newRecords[recIdx] = rebuildRecordFromCaseInfo(ci);
            }
          }
        }
      }
      break;
    case "timelineNode":
      newTimelines = newTimelines.map(tl => ({
        ...tl,
        nodes: tl.nodes.map(n =>
          n.id === conflict.entityId ? { ...n, [conflict.field]: resolution.resolvedValue } : n
        ),
      }));
      {
        const tl = newTimelines.find(t =>
          t.nodes.some(n => n.id === conflict.entityId)
        );
        if (tl) {
          const ci = newCaseInfos.find(c => c.id === tl.caseId);
          if (ci) {
            const recIdx = newRecords.findIndex(r => r[0] === ci.id);
            if (recIdx >= 0) {
              newRecords[recIdx] = rebuildRecordFromCaseInfo(ci);
            }
          }
        }
      }
      break;
    case "caseRecord": {
      const recIdx = newRecords.findIndex(r => r[0] === conflict.entityId);
      if (recIdx >= 0) {
        const idxMatch = conflict.field.match(/record\[(\d+)\]/);
        if (idxMatch) {
          const idx = parseInt(idxMatch[1], 10);
          newRecords[recIdx][idx] = resolution.resolvedValue;
        }
      }
      break;
    }
  }

  const localChangeId = conflict.localChangeId;
  const remoteChangeId = conflict.remoteChangeId;

  const newChanges = data.replayableChanges.map(c => {
    if (c.id === localChangeId || c.id === remoteChangeId) {
      return { ...c, syncStatus: "synced" as const, newValue: resolution.resolvedValue };
    }
    if (c.compressedFrom && (c.compressedFrom.includes(localChangeId) || c.compressedFrom.includes(remoteChangeId))) {
      return { ...c, syncStatus: "synced" as const, newValue: resolution.resolvedValue };
    }
    return c;
  });

  const newConflicts = data.conflicts.map(c =>
    c.id === conflictId ? { ...c, resolved: true, resolution } : c
  );

  return {
    ...data,
    caseInfos: newCaseInfos,
    followUpPlans: newFollowUpPlans,
    workingLengths: newWorkingLengths,
    timelines: newTimelines,
    records: newRecords,
    replayableChanges: newChanges,
    conflicts: newConflicts,
  };
}

export function replayLocalChanges(
  data: AppData
): { data: AppData; replayed: ReplayableChange[] } {
  const pending = data.replayableChanges
    .filter(c => c.source === "local" && c.syncStatus === "pending")
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());

  if (pending.length === 0) return { data, replayed: [] };

  let newCaseInfos = [...data.caseInfos];
  let newFollowUpPlans = [...data.followUpPlans];
  let newWorkingLengths = data.workingLengths.map(w => ({ ...w, entries: w.entries.map(e => ({ ...e })) }));
  let newTimelines = data.timelines.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })) }));

  pending.forEach(change => {
    switch (change.entityType) {
      case "caseBasicInfo":
        newCaseInfos = applyChangeToEntity(newCaseInfos, change.entityId, change.field, change.newValue);
        break;
      case "followUpPlan":
        newFollowUpPlans = applyChangeToEntity(newFollowUpPlans, change.entityId, change.field, change.newValue);
        break;
      case "workingLength":
        if (change.field.startsWith("entries.")) {
          const wlId = change.entityId.split("::")[0];
          const entryId = change.entityId.split("::")[1];
          const subField = change.field.replace("entries.", "");
          newWorkingLengths = newWorkingLengths.map(w => {
            if (w.id !== wlId) return w;
            return {
              ...w,
              entries: w.entries.map(e =>
                e.id === entryId ? { ...e, [subField]: change.newValue } : e
              ),
            };
          });
        } else {
          newWorkingLengths = applyChangeToEntity(newWorkingLengths, change.entityId, change.field, change.newValue);
        }
        break;
      case "timelineNode":
        newTimelines = newTimelines.map(tl => ({
          ...tl,
          nodes: tl.nodes.map(n =>
            n.id === change.entityId ? { ...n, [change.field]: change.newValue } : n
          ),
        }));
        break;
    }
  });

  const newRecords = data.records.map(r => [...r]);
  newCaseInfos.forEach(ci => {
    const idx = newRecords.findIndex(r => r[0] === ci.id);
    if (idx >= 0) {
      newRecords[idx] = rebuildRecordFromCaseInfo(ci);
    }
  });

  const syncedChanges = data.replayableChanges.map(c => {
    if (c.source === "local" && c.syncStatus === "pending") {
      return { ...c, syncStatus: "synced" as const };
    }
    return c;
  });

  return {
    data: {
      ...data,
      caseInfos: newCaseInfos,
      followUpPlans: newFollowUpPlans,
      workingLengths: newWorkingLengths,
      timelines: newTimelines,
      records: newRecords,
      replayableChanges: syncedChanges,
    },
    replayed: pending,
  };
}

export function getFieldLabelForEntity(entityType: ChangeEntityType, field: string): string {
  const labels: Record<ChangeEntityType, Record<string, string>> = {
    caseBasicInfo: {
      toothPosition: "牙位",
      patientName: "患者姓名",
      phone: "联系电话",
      diagnosis: "诊断",
      currentStep: "当前步骤",
      workingLength: "工作长度",
      mainFileNumber: "主尖锉号",
      medication: "封药情况",
      remark: "备注",
    },
    followUpPlan: {
      nextDate: "复诊日期",
      doctor: "负责医生",
      contactStatus: "联系状态",
      patientName: "患者姓名",
      phone: "联系电话",
      reason: "复诊原因",
      contactNote: "联系备注",
    },
    workingLength: {
      note: "工作长度备注",
      "entries.measuredLength": "测量长度",
      "entries.referenceApex": "参照点",
      "entries.measurementMethod": "测量方法",
      "entries.confirmedStatus": "确认状态",
    },
    timelineNode: {
      completedAt: "完成时间",
      operator: "操作者",
      keyParams: "关键参数",
      exceptionNotes: "异常说明",
      isCompleted: "完成状态",
    },
    caseRecord: {
      "record[2]": "诊断",
      "record[3]": "当前步骤",
      "record[5]": "治疗状态",
    },
  };

  return labels[entityType]?.[field] || field;
}

export function generateOperationLogDetail(
  change: ReplayableChange,
  isCompressed: boolean = false
): string {
  const label = getFieldLabelForEntity(change.entityType, change.field);
  const compressedHint = isCompressed ? "（合并多次修改）" : "";
  return `${label}${compressedHint}：${change.oldValue || "空"} → ${change.newValue || "空"}`;
}
