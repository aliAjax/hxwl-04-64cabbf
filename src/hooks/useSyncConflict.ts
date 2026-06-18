import React, { useState, useCallback } from "react";
import {
  AppData,
  CaseBasicInfo,
  FollowUpPlan,
  WorkingLengthRecord,
  TreatmentTimeline,
  OperationLog,
  UserRole,
  FieldChange,
  ReplayableChange,
  RemoteSnapshot,
  ConflictEntry,
  SyncStatus,
  ConflictResolution,
  ChangeEntityType,
  createOperationLog,
} from "../db";
import {
  enterOfflineMode,
  queueLocalChange,
  applyRemoteSnapshot,
  resolveConflict as engineResolveConflict,
  compressLocalChanges,
  getFieldLabelForEntity,
  generateOperationLogDetail,
} from "../syncEngine";

interface UseSyncConflictParams {
  currentRole: UserRole;
  records: string[][];
  setRecords: React.Dispatch<React.SetStateAction<string[][]>>;
  caseInfos: CaseBasicInfo[];
  setCaseInfos: React.Dispatch<React.SetStateAction<CaseBasicInfo[]>>;
  operationLogs: OperationLog[];
  setOperationLogs: React.Dispatch<React.SetStateAction<OperationLog[]>>;
  followUpPlans: FollowUpPlan[];
  setFollowUpPlans: React.Dispatch<React.SetStateAction<FollowUpPlan[]>>;
  workingLengths: WorkingLengthRecord[];
  setWorkingLengths: React.Dispatch<React.SetStateAction<WorkingLengthRecord[]>>;
  timelines: TreatmentTimeline[];
  setTimelines: React.Dispatch<React.SetStateAction<TreatmentTimeline[]>>;
  activeStage: string | null;
  setActiveStage: React.Dispatch<React.SetStateAction<string | null>>;
  findCaseInfoById: (caseId: string) => CaseBasicInfo | undefined;
  addOperationLog: (caseId: string, action: string, detail: string) => void;
  TreatmentStep: string[];
  fieldLabelMap: Record<string, string>;
}

interface UseSyncConflictReturn {
  changeQueue: FieldChange[];
  setChangeQueue: React.Dispatch<React.SetStateAction<FieldChange[]>>;
  replayableChanges: ReplayableChange[];
  setReplayableChanges: React.Dispatch<React.SetStateAction<ReplayableChange[]>>;
  lastRemoteSnapshot: RemoteSnapshot | null;
  setLastRemoteSnapshot: React.Dispatch<React.SetStateAction<RemoteSnapshot | null>>;
  offlineStartedAt: string | null;
  setOfflineStartedAt: React.Dispatch<React.SetStateAction<string | null>>;
  conflicts: ConflictEntry[];
  setConflicts: React.Dispatch<React.SetStateAction<ConflictEntry[]>>;
  syncStatus: SyncStatus;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  lastSyncAt: string;
  setLastSyncAt: React.Dispatch<React.SetStateAction<string>>;
  showConflictModal: boolean;
  setShowConflictModal: React.Dispatch<React.SetStateAction<boolean>>;
  showChangeQueuePanel: boolean;
  setShowChangeQueuePanel: React.Dispatch<React.SetStateAction<boolean>>;
  simulatingSync: boolean;
  setSimulatingSync: React.Dispatch<React.SetStateAction<boolean>>;
  changeQueueFilter: "all" | "pending" | "synced" | "conflict";
  setChangeQueueFilter: React.Dispatch<React.SetStateAction<"all" | "pending" | "synced" | "conflict">>;
  changeQueueSourceFilter: "all" | "local" | "remote";
  setChangeQueueSourceFilter: React.Dispatch<React.SetStateAction<"all" | "local" | "remote">>;
  changeQueueRoleFilter: string;
  setChangeQueueRoleFilter: React.Dispatch<React.SetStateAction<string>>;
  expandedChangeId: string | null;
  setExpandedChangeId: React.Dispatch<React.SetStateAction<string | null>>;
  mergedValues: Record<string, string>;
  setMergedValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  unresolvedConflicts: ConflictEntry[];
  getFieldChangeForCase: (caseId: string, field: string) => FieldChange | undefined;
  getLatestFieldChangeForCase: (caseId: string, field: string) => FieldChange | undefined;
  getFieldLabel: (field: string) => string;
  getMergedValue: (conflictId: string, defaultSource?: "local" | "remote") => string;
  setMergedValue: (conflictId: string, value: string) => void;
  initMergedValue: (conflictId: string, value: string) => void;
  getCurrentAppData: () => AppData;
  applyDataState: (data: AppData) => void;
  queueReplayableChange: (params: {
    caseId: string;
    entityType: ChangeEntityType;
    entityId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }) => void;
  buildSimulatedRemoteSnapshot: (baseData: AppData) => {
    remoteSnapshot: RemoteSnapshot;
    remoteChangedBy: UserRole;
  };
  simulateRemoteChanges: () => void;
  buildRecordDetail: (caseInfo: CaseBasicInfo) => string;
  syncRecordsFromCaseInfo: (caseId: string, updatedFields?: string[]) => void;
  resolveConflict: (
    conflictId: string,
    resolution: "local" | "remote" | { customValue: string }
  ) => void;
  toggleSyncStatus: () => void;
  compressLocalChanges: (changes: ReplayableChange[]) => {
    compressed: ReplayableChange[];
    groups: any[];
  };
}

export function useSyncConflict(params: UseSyncConflictParams): UseSyncConflictReturn {
  const {
    currentRole,
    records,
    setRecords,
    caseInfos,
    setCaseInfos,
    operationLogs,
    setOperationLogs,
    followUpPlans,
    setFollowUpPlans,
    workingLengths,
    setWorkingLengths,
    timelines,
    setTimelines,
    activeStage,
    setActiveStage,
    findCaseInfoById,
    addOperationLog,
    TreatmentStep,
    fieldLabelMap,
  } = params;

  const [changeQueue, setChangeQueue] = useState<FieldChange[]>([]);
  const [replayableChanges, setReplayableChanges] = useState<ReplayableChange[]>([]);
  const [lastRemoteSnapshot, setLastRemoteSnapshot] = useState<RemoteSnapshot | null>(null);
  const [offlineStartedAt, setOfflineStartedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");
  const [lastSyncAt, setLastSyncAt] = useState<string>("");
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [showChangeQueuePanel, setShowChangeQueuePanel] = useState<boolean>(false);
  const [simulatingSync, setSimulatingSync] = useState<boolean>(false);
  const [changeQueueFilter, setChangeQueueFilter] = useState<"all" | "pending" | "synced" | "conflict">("all");
  const [changeQueueSourceFilter, setChangeQueueSourceFilter] = useState<"all" | "local" | "remote">("all");
  const [changeQueueRoleFilter, setChangeQueueRoleFilter] = useState<string>("all");
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null);
  const [mergedValues, setMergedValues] = useState<Record<string, string>>({});

  const unresolvedConflicts = conflicts.filter(c => !c.resolved);

  const getFieldChangeForCase = (caseId: string, field: string): FieldChange | undefined => {
    return changeQueue.find(c => c.caseId === caseId && c.field === field);
  };

  const getLatestFieldChangeForCase = (caseId: string, field: string): FieldChange | undefined => {
    return changeQueue.find(c => c.caseId === caseId && c.field === field);
  };

  const getFieldLabel = (field: string): string => {
    return fieldLabelMap[field] || field;
  };

  const getMergedValue = (conflictId: string, defaultSource: "local" | "remote" = "local"): string => {
    if (mergedValues[conflictId] !== undefined) return mergedValues[conflictId];
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return "";
    return defaultSource === "local" ? conflict.localValue : conflict.remoteValue;
  };

  const setMergedValue = (conflictId: string, value: string) => {
    setMergedValues(prev => ({ ...prev, [conflictId]: value }));
  };

  const initMergedValue = (conflictId: string, value: string) => {
    if (mergedValues[conflictId] === undefined) {
      setMergedValues(prev => ({ ...prev, [conflictId]: value }));
    }
  };

  const getCurrentAppData = useCallback((): AppData => ({
    records,
    caseInfos,
    operationLogs,
    followUpPlans,
    workingLengths,
    timelines,
    activeStage,
    changeQueue,
    replayableChanges,
    lastRemoteSnapshot,
    conflicts,
    syncStatus,
    lastSyncAt,
    offlineStartedAt,
  }), [records, caseInfos, operationLogs, followUpPlans, workingLengths, timelines, activeStage, changeQueue, replayableChanges, lastRemoteSnapshot, conflicts, syncStatus, lastSyncAt, offlineStartedAt]);

  const applyDataState = useCallback((data: AppData) => {
    setRecords(data.records);
    setCaseInfos(data.caseInfos);
    setFollowUpPlans(data.followUpPlans);
    setWorkingLengths(data.workingLengths);
    setTimelines(data.timelines);
    setActiveStage(data.activeStage);
    setChangeQueue(data.changeQueue);
    setReplayableChanges(data.replayableChanges);
    setLastRemoteSnapshot(data.lastRemoteSnapshot);
    setConflicts(data.conflicts);
    setSyncStatus(data.syncStatus);
    setLastSyncAt(data.lastSyncAt);
    setOfflineStartedAt(data.offlineStartedAt);
  }, [setRecords, setCaseInfos, setFollowUpPlans, setWorkingLengths, setTimelines, setActiveStage, setChangeQueue, setReplayableChanges, setLastRemoteSnapshot, setConflicts, setSyncStatus, setLastSyncAt, setOfflineStartedAt]);

  const queueReplayableChange = useCallback((params: {
    caseId: string;
    entityType: ChangeEntityType;
    entityId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }) => {
    if (params.oldValue === params.newValue) return;
    const currentData = getCurrentAppData();
    const { data: newData } = queueLocalChange(currentData, {
      ...params,
      changedBy: currentRole,
    });
    applyDataState(newData);
  }, [currentRole, getCurrentAppData, applyDataState]);

  const buildRecordDetail = (caseInfo: CaseBasicInfo): string => {
    const details: string[] = [];
    if (caseInfo.workingLength) details.push(`工作长度 ${caseInfo.workingLength}`);
    if (caseInfo.mainFileNumber) details.push(`主尖锉${caseInfo.mainFileNumber}`);
    if (caseInfo.medication) details.push(`封药：${caseInfo.medication}`);
    if (caseInfo.remark) details.push(caseInfo.remark);
    return details.join("，") || "无附加信息";
  };

  const syncRecordsFromCaseInfo = (caseId: string, updatedFields?: string[]) => {
    const caseInfo = findCaseInfoById(caseId);
    if (!caseInfo) return;

    const fieldsToUpdate = updatedFields || ["toothPosition", "diagnosis", "currentStep", "workingLength", "mainFileNumber", "medication", "remark"];
    const needsDetailUpdate = fieldsToUpdate.some(f => 
      ["workingLength", "mainFileNumber", "medication", "remark"].includes(f)
    );

    setRecords(prev => prev.map(r => {
      if (r[0] !== caseId) return r;
      
      const newRecord = [...r];
      if (fieldsToUpdate.includes("toothPosition")) newRecord[1] = caseInfo.toothPosition;
      if (fieldsToUpdate.includes("diagnosis")) newRecord[2] = caseInfo.diagnosis;
      if (fieldsToUpdate.includes("currentStep")) {
        newRecord[3] = caseInfo.currentStep;
        newRecord[5] = caseInfo.currentStep === "充填" ? "已充填" : "待复诊";
      }
      if (needsDetailUpdate) {
        newRecord[4] = buildRecordDetail(caseInfo);
      }
      return newRecord;
    }));
  };

  const buildSimulatedRemoteSnapshot = (baseData: AppData) => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const allRoles: UserRole[] = ["医生", "助理", "前台"];
    const randomRole = allRoles[Math.floor(Math.random() * allRoles.length)];

    const doctorFields = [
      { field: "diagnosis", getValue: (c: CaseBasicInfo) => c.diagnosis ? c.diagnosis + "（复查确认）" : "慢性牙髓炎" },
      { field: "currentStep", getValue: () => TreatmentStep[Math.floor(Math.random() * TreatmentStep.length)] },
      { field: "workingLength", getValue: (c: CaseBasicInfo) => c.workingLength ? c.workingLength.replace(/[\d.]+/, (parseFloat(c.workingLength) + 0.3).toFixed(1)) : "20.0mm" },
    ];

    const assistantFields = [
      { field: "medication", getValue: () => ["Ca(OH)2 封药", "碘仿糊剂", "CP 棉球", "氢氧化钙糊剂"][Math.floor(Math.random() * 4)] },
      { field: "mainFileNumber", getValue: (c: CaseBasicInfo) => c.mainFileNumber ? String(parseInt(c.mainFileNumber) + 5) : "25" },
      { field: "remark", getValue: (c: CaseBasicInfo) => c.remark ? c.remark + "；助理补充记录" : "治疗过程顺利" },
    ];

    const receptionFields = [
      { field: "patientName", getValue: (c: CaseBasicInfo) => c.patientName + "（已核实）" },
      { field: "phone", getValue: (c: CaseBasicInfo) => c.phone ? c.phone.replace(/\d{4}$/, "9999") : "138****9999" },
    ];

    const getFieldsForRole = (role: UserRole) => {
      switch (role) {
        case "医生": return doctorFields;
        case "助理": return assistantFields;
        case "前台": return receptionFields;
      }
    };

    const numCases = Math.min(3 + Math.floor(Math.random() * 3), baseData.caseInfos.length);
    const shuffled = [...baseData.caseInfos].sort(() => Math.random() - 0.5);
    const targetCases = shuffled.slice(0, numCases);

    const simulatedCaseInfos = baseData.caseInfos.map(c => ({ ...c }));
    const simulatedFollowUpPlans = baseData.followUpPlans.map(p => ({ ...p }));
    const simulatedWorkingLengths = baseData.workingLengths.map(w => ({ ...w, entries: w.entries.map(e => ({ ...e })) }));
    const simulatedTimelines = baseData.timelines.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })) }));
    const simulatedRecords = baseData.records.map(r => [...r]);

    targetCases.forEach((caseInfo, idx) => {
      const caseId = caseInfo.id;
      const rolesToSimulate = idx === 0 ? allRoles : [randomRole];

      rolesToSimulate.forEach((simRole) => {
        const fields = getFieldsForRole(simRole);
        const fieldDef = fields[Math.floor(Math.random() * fields.length)];
        const remoteValue = fieldDef.getValue(caseInfo);
        const targetInfo = simulatedCaseInfos.find(c => c.id === caseId);
        if (targetInfo) {
          const currentValue = String((targetInfo as any)[fieldDef.field] || "");
          if (remoteValue !== currentValue) {
            (targetInfo as any)[fieldDef.field] = remoteValue;
            targetInfo.updatedAt = now.split(" ")[0];
          }
        }
      });

      const followUp = simulatedFollowUpPlans.find(f => f.caseId === caseId);
      if (followUp && Math.random() > 0.5) {
        const contactStatuses: any[] = ["已联系", "已确认", "未接通"];
        const newContactStatus = contactStatuses[Math.floor(Math.random() * contactStatuses.length)];
        if (followUp.contactStatus !== newContactStatus) {
          followUp.contactStatus = newContactStatus;
        }
      }

      const wl = simulatedWorkingLengths.find(w => w.caseId === caseId);
      if (wl && Math.random() > 0.6) {
        const randomEntry = wl.entries[Math.floor(Math.random() * wl.entries.length)];
        if (randomEntry) {
          const newLength = (parseFloat(randomEntry.measuredLength) + (Math.random() > 0.5 ? 0.5 : -0.3)).toFixed(1);
          if (parseFloat(newLength) > 0) {
            randomEntry.measuredLength = newLength;
          }
        }
        if (Math.random() > 0.7) {
          wl.note = wl.note ? wl.note + "；远端更新" : "远端补充备注";
        }
      }

      const tl = simulatedTimelines.find(t => t.caseId === caseId);
      if (tl && Math.random() > 0.6) {
        const incompleteNodes = tl.nodes.filter(n => !n.isCompleted);
        if (incompleteNodes.length > 0) {
          const targetNode = incompleteNodes[Math.floor(Math.random() * incompleteNodes.length)];
          targetNode.isCompleted = true;
          targetNode.completedAt = now;
          targetNode.operator = "李医生";
          targetNode.keyParams = "远端确认完成";
        } else {
          const completedNodes = tl.nodes.filter(n => n.isCompleted);
          if (completedNodes.length > 0) {
            const targetNode = completedNodes[Math.floor(Math.random() * completedNodes.length)];
            if (Math.random() > 0.5) {
              targetNode.keyParams = targetNode.keyParams ? targetNode.keyParams + "（远端修订）" : "远端更新参数";
            }
          }
        }
      }
    });

    simulatedCaseInfos.forEach(ci => {
      const idx = simulatedRecords.findIndex(r => r[0] === ci.id);
      if (idx >= 0) {
        const status = ci.currentStep === "充填" ? "已充填" : "待复诊";
        const detailParts: string[] = [];
        if (ci.workingLength) detailParts.push(`工作长度 ${ci.workingLength}`);
        if (ci.mainFileNumber) detailParts.push(`主尖锉${ci.mainFileNumber}`);
        if (ci.medication) detailParts.push(`封药：${ci.medication}`);
        if (ci.remark) detailParts.push(ci.remark);
        simulatedRecords[idx] = [ci.id, ci.toothPosition, ci.diagnosis, ci.currentStep, detailParts.join("，") || "无附加信息", status];
      }
    });

    return {
      remoteSnapshot: {
        id: `snap_${Date.now()}`,
        snapshotAt: now,
        caseInfos: simulatedCaseInfos,
        followUpPlans: simulatedFollowUpPlans,
        workingLengths: simulatedWorkingLengths,
        timelines: simulatedTimelines,
        records: simulatedRecords,
      },
      remoteChangedBy: allRoles[Math.floor(Math.random() * allRoles.length)],
    };
  };

  const simulateRemoteChanges = useCallback(() => {
    if (caseInfos.length === 0) return;
    setSimulatingSync(true);
    setSyncStatus("syncing");

    setTimeout(() => {
      const currentData = getCurrentAppData();
      const { remoteSnapshot, remoteChangedBy } = buildSimulatedRemoteSnapshot(currentData);
      const { data: newData, result } = applyRemoteSnapshot(currentData, remoteSnapshot, remoteChangedBy);

      applyDataState(newData);
      setOperationLogs(prev => {
        const logs: OperationLog[] = [];
        result.appliedChanges.forEach(change => {
          logs.push(createOperationLog(
            change.caseId,
            change.changedBy === "医生" ? "张医生" : change.changedBy === "助理" ? "李助理" : "王前台",
            change.changedBy,
            "更新基础信息",
            `[远端同步] ${generateOperationLogDetail(change)}`
          ));
        });
        return [...logs.reverse(), ...prev];
      });

      if (result.conflicts.length > 0) {
        setShowConflictModal(true);
      }

      setSimulatingSync(false);
    }, 1500 + Math.random() * 1000);
  }, [caseInfos.length, getCurrentAppData, applyDataState, setOperationLogs]);

  const resolveConflict = useCallback((conflictId: string, resolution: "local" | "remote" | { customValue: string }) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    let resolvedValue: string;
    let resolutionType: "local" | "remote" | "merged";

    if (typeof resolution === "string") {
      resolvedValue = resolution === "local" ? conflict.localValue : conflict.remoteValue;
      resolutionType = resolution;
    } else {
      resolvedValue = resolution.customValue;
      resolutionType = "merged";
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const conflictRes: ConflictResolution = {
      strategy: resolutionType,
      resolvedValue,
      resolvedBy: currentRole,
      resolvedAt: now,
    };

    const currentData = getCurrentAppData();
    const resolvedData = engineResolveConflict(currentData, conflictId, conflictRes);
    applyDataState(resolvedData);

    let logDetail: string;
    const fieldLabel = conflict.entityType && conflict.field
      ? getFieldLabelForEntity(conflict.entityType, conflict.field)
      : getFieldLabel(conflict.field);
    if (resolutionType === "merged") {
      logDetail = `冲突解决：${fieldLabel} 手动合并，结果「${resolvedValue}」（本地：${conflict.localValue || "空"}，远端：${conflict.remoteValue || "空"}）`;
    } else {
      logDetail = `冲突解决：${fieldLabel} 保留${resolutionType === "local" ? "本地" : "远端"}版本「${resolvedValue}」`;
    }
    addOperationLog(conflict.caseId, "更新基础信息", logDetail);

    setMergedValues(prev => {
      const next = { ...prev };
      delete next[conflictId];
      return next;
    });
  }, [conflicts, currentRole, getCurrentAppData, applyDataState, addOperationLog]);

  const toggleSyncStatus = useCallback(() => {
    if (syncStatus === "online") {
      const currentData = getCurrentAppData();
      const offlineData = enterOfflineMode(currentData);
      applyDataState(offlineData);
      addOperationLog("system", "更新基础信息", `进入离线模式，本地变更将暂存至恢复在线后同步`);
    } else if (syncStatus === "offline") {
      const currentData = getCurrentAppData();
      const remoteBaseData = currentData.lastRemoteSnapshot
        ? {
            ...currentData,
            caseInfos: currentData.lastRemoteSnapshot.caseInfos,
            followUpPlans: currentData.lastRemoteSnapshot.followUpPlans,
            workingLengths: currentData.lastRemoteSnapshot.workingLengths,
            timelines: currentData.lastRemoteSnapshot.timelines,
            records: currentData.lastRemoteSnapshot.records,
          }
        : currentData;
      const { remoteSnapshot, remoteChangedBy } = buildSimulatedRemoteSnapshot(remoteBaseData);
      const { data: syncedData, result } = applyRemoteSnapshot(currentData, remoteSnapshot, remoteChangedBy);
      applyDataState(syncedData);
      setOperationLogs(prev => {
        const logs: OperationLog[] = [];
        result.appliedChanges.forEach(change => {
          logs.push(createOperationLog(
            change.caseId,
            change.changedBy === "医生" ? "张医生" : change.changedBy === "助理" ? "李助理" : "王前台",
            change.changedBy,
            "更新基础信息",
            `[恢复在线远端快照] ${generateOperationLogDetail(change)}`
          ));
        });
        return [...logs.reverse(), ...prev];
      });
      if (result.conflicts.length > 0) {
        setShowConflictModal(true);
        addOperationLog("system", "更新基础信息", `恢复在线，检测到 ${result.conflicts.length} 个远端快照冲突`);
      } else if (result.appliedChanges.length > 0) {
        addOperationLog("system", "更新基础信息", `恢复在线，已应用 ${result.appliedChanges.length} 条远端快照变更并同步本地队列`);
      } else {
        addOperationLog("system", "更新基础信息", `恢复在线，无远端快照变更或待处理冲突`);
      }
    }
  }, [syncStatus, getCurrentAppData, applyDataState, addOperationLog, setOperationLogs]);

  return {
    changeQueue,
    setChangeQueue,
    replayableChanges,
    setReplayableChanges,
    lastRemoteSnapshot,
    setLastRemoteSnapshot,
    offlineStartedAt,
    setOfflineStartedAt,
    conflicts,
    setConflicts,
    syncStatus,
    setSyncStatus,
    lastSyncAt,
    setLastSyncAt,
    showConflictModal,
    setShowConflictModal,
    showChangeQueuePanel,
    setShowChangeQueuePanel,
    simulatingSync,
    setSimulatingSync,
    changeQueueFilter,
    setChangeQueueFilter,
    changeQueueSourceFilter,
    setChangeQueueSourceFilter,
    changeQueueRoleFilter,
    setChangeQueueRoleFilter,
    expandedChangeId,
    setExpandedChangeId,
    mergedValues,
    setMergedValues,
    unresolvedConflicts,
    getFieldChangeForCase,
    getLatestFieldChangeForCase,
    getFieldLabel,
    getMergedValue,
    setMergedValue,
    initMergedValue,
    getCurrentAppData,
    applyDataState,
    queueReplayableChange,
    buildSimulatedRemoteSnapshot,
    simulateRemoteChanges,
    buildRecordDetail,
    syncRecordsFromCaseInfo,
    resolveConflict,
    toggleSyncStatus,
    compressLocalChanges,
  };
}
