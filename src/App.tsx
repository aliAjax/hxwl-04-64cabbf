import React, { useState, useEffect, useRef } from "react";
import "./styles.css";
import {
  initDB,
  saveData,
  resetToInitialData,
  AppData,
  CaseRecord as ICaseRecord,
  FormErrors,
  FollowUpPlan,
  ConfirmedStatus,
  CanalEntry,
  WorkingLengthRecord,
  TreatmentStep,
  TimelineNode,
  TreatmentTimeline,
  UserRole,
  ContactStatus,
  CaseBasicInfo,
  OperationLog,
  OperationAction,
  FieldChange,
  ConflictEntry,
  SyncStatus,
  createCaseIdExternal,
  createOperationLog,
} from "./db";
import {
  buildCaseSummaries,
  generateCSV,
  downloadCSV,
  generatePrintableHTML,
  openPrintWindow,
  buildSummaryRows,
  generateCSVFromRows,
  generatePrintableHTMLFromRows,
  EXPORT_FIELD_GROUPS,
  DEFAULT_SELECTED_FIELDS,
  getFieldLabel,
  ExportScope,
  ExportFormat,
  CaseSummaryRow,
} from "./exportUtils";

const project = {
  "id": "hxwl-04",
  "port": 5104,
  "title": "牙科根管治疗",
  "subtitle": "按牙位组织根管步骤、工作长度与复诊计划",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#0369a1",
    "#7c3aed",
    "#ea580c"
  ],
  "domain": "牙体牙髓",
  "users": [
    "牙科医生",
    "助理",
    "前台复诊协调员"
  ],
  "metrics": [
    "待复诊",
    "已充填",
    "平均工作长度",
    "封药病例"
  ],
  "filters": [
    "开髓",
    "测长",
    "根管预备",
    "冲洗",
    "封药",
    "充填"
  ],
  "fields": [
    "牙位",
    "开髓",
    "测长",
    "根管预备",
    "冲洗",
    "封药",
    "主尖锉号"
  ],
};

type CaseRecord = ICaseRecord;

interface CanalDraft {
  toothPosition: string;
  entries: CanalEntry[];
  note: string;
  editingId: string | null;
}

interface TimelineDraft {
  toothPosition: string;
  editingNodeId: string | null;
  node: TimelineNode | null;
}

const statusColors = ["status-ok", "status-watch", "status-danger"];

const referenceApexOptions = ["根尖孔", "牙本质牙骨质界", "解剖根尖孔", "根尖狭窄部"];
const measurementMethodOptions = ["电测法", "X线估测法", "手感法", "纸尖法"];
const confirmedStatusOptions: ConfirmedStatus[] = ["待确认", "已确认", "需重测"];
const canalNameSuggestions = ["MB", "ML", "DB", "DL", "腭侧", "MB2", "ML2", "DB2", "颊侧", "舌侧", "近中", "远中", "单根管"];

const confirmedStatusColors: Record<ConfirmedStatus, string> = {
  "已确认": "#059669",
  "待确认": "#ea580c",
  "需重测": "#dc2626",
};

const treatmentSteps: TreatmentStep[] = ["开髓", "测长", "根管预备", "冲洗", "封药", "充填"];
const steps = treatmentSteps;

function createCanalId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyCanalEntry(): CanalEntry {
  return {
    id: createCanalId(),
    canalName: "",
    measuredLength: "",
    referenceApex: "根尖孔",
    measurementMethod: "电测法",
    confirmedStatus: "待确认",
    isSupplementary: false,
  };
}

function createTimelineNodeId(): string {
  return `tn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyTimelineNode(step: TreatmentStep): TimelineNode {
  return {
    id: createTimelineNodeId(),
    step,
    completedAt: "",
    operator: "",
    keyParams: "",
    exceptionNotes: "",
    isCompleted: false,
  };
}

function createInitialTimeline(toothPosition: string, caseId?: string): TreatmentTimeline {
  return {
    id: `tl_${Date.now()}`,
    caseId: caseId || "",
    toothPosition,
    nodes: treatmentSteps.map(step => createEmptyTimelineNode(step)),
    createdAt: new Date().toISOString().split("T")[0],
  };
}

function getCurrentStepIndex(nodes: TimelineNode[]): number {
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].isCompleted) return i;
  }
  return nodes.length - 1;
}

function deriveCurrentStepFromTimeline(nodes: TimelineNode[]): TreatmentStep {
  const idx = getCurrentStepIndex(nodes);
  return nodes[idx]?.step || treatmentSteps[0];
}

function buildTimelineForRecord(
  id: string,
  caseId: string,
  toothPosition: string,
  currentStep: string,
  detail: string,
  createdAt: string,
): TreatmentTimeline {
  const stepIdx = treatmentSteps.indexOf(currentStep as TreatmentStep);
  const nodes: TimelineNode[] = treatmentSteps.map((step, idx) => {
    const isCompleted = stepIdx >= 0 && idx < stepIdx;
    return {
      id: `${id}_tn${idx + 1}`,
      step,
      completedAt: isCompleted ? `${createdAt} ${String(9 + idx).padStart(2, "0")}:00` : "",
      operator: isCompleted ? "张医生" : "",
      keyParams: isCompleted ? detail : "",
      exceptionNotes: "",
      isCompleted,
    };
  });
  return { id, caseId, toothPosition, nodes, createdAt };
}

const stageColors: Record<string, string> = {
  "开髓": "#ea580c",
  "测长": "#0369a1",
  "根管预备": "#7c3aed",
  "冲洗": "#059669",
  "封药": "#db2777",
  "充填": "#0891b2",
};

function extractWorkingLength(detail: string): number | null {
  const match = detail.match(/(\d+\.?\d*)mm/);
  return match ? parseFloat(match[1]) : null;
}

function calculateMetrics(records: string[][], activeStage: string | null) {
  const filteredRecords = activeStage
    ? records.filter(r => r[3] === activeStage)
    : records;

  const pendingReview = filteredRecords.filter(r => r[5] === "待复诊").length;
  const filled = filteredRecords.filter(r => r[3] === "充填").length;
  const medicationCases = filteredRecords.filter(r => r[3] === "封药").length;

  const lengths = filteredRecords
    .map(r => extractWorkingLength(r[4]))
    .filter((n): n is number => n !== null);
  const avgLength = lengths.length > 0
    ? (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) + "mm"
    : "-";

  return [String(pendingReview), String(filled), avgLength, String(medicationCases)];
}

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

const initialFormData: CaseRecord = {
  toothPosition: "",
  diagnosis: "",
  currentStep: "",
  workingLength: "",
  mainFileNumber: "",
  medication: "",
  remark: "",
  followUpDate: "",
  followUpDoctor: "",
  followUpReason: "",
  followUpReminder: true,
};

const contactStatusOptions: ContactStatus[] = ["待联系", "已联系", "已确认", "未接通", "已取消"];

const contactStatusColors: Record<ContactStatus, string> = {
  "待联系": "#ea580c",
  "已联系": "#0369a1",
  "已确认": "#059669",
  "未接通": "#dc2626",
  "已取消": "#64748b",
};

const roleColors: Record<UserRole, string> = {
  "医生": "#0369a1",
  "助理": "#7c3aed",
  "前台": "#ea580c",
};

const roleDescriptions: Record<UserRole, string> = {
  "医生": "查看治疗参数与病例进展",
  "助理": "录入治疗步骤与材料信息",
  "前台": "管理复诊日期与联系状态",
};

interface FollowUpEditDraft {
  id: string | null;
  plan: FollowUpPlan | null;
}

type CaseDetailTab = "basic" | "canal" | "timeline" | "followup" | "logs" | "summary";

function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>("医生");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [records, setRecords] = useState<string[][]>([]);
  const [caseInfos, setCaseInfos] = useState<CaseBasicInfo[]>([]);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [formData, setFormData] = useState<CaseRecord>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [followUpPlans, setFollowUpPlans] = useState<FollowUpPlan[]>([]);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatus | null>(null);
  const [workingLengths, setWorkingLengths] = useState<WorkingLengthRecord[]>([]);
  const [canalDraft, setCanalDraft] = useState<CanalDraft>({
    toothPosition: "",
    entries: [],
    note: "",
    editingId: null,
  });
  const [canalDraftError, setCanalDraftError] = useState<string>("");
  const [showCaseSelectModal, setShowCaseSelectModal] = useState<boolean>(false);
  const [caseSelectSearch, setCaseSelectSearch] = useState<string>("");
  const [timelines, setTimelines] = useState<TreatmentTimeline[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedToothPosition, setSelectedToothPosition] = useState<string | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft>({
    toothPosition: "",
    editingNodeId: null,
    node: null,
  });
  const [timelineDraftError, setTimelineDraftError] = useState<string>("");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [activeCaseTab, setActiveCaseTab] = useState<CaseDetailTab>("basic");
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState<boolean>(false);
  const [basicInfoDraft, setBasicInfoDraft] = useState<CaseBasicInfo | null>(null);
  const [basicInfoError, setBasicInfoError] = useState<string>("");
  const [followUpEditDraft, setFollowUpEditDraft] = useState<FollowUpEditDraft>({
    id: null,
    plan: null,
  });
  const [showFollowUpEditModal, setShowFollowUpEditModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<ExportScope>("filtered");
  const [exportCustomStages, setExportCustomStages] = useState<string[]>([]);
  const [exportSelectedFields, setExportSelectedFields] = useState<string[]>(DEFAULT_SELECTED_FIELDS);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [changeQueue, setChangeQueue] = useState<FieldChange[]>([]);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");
  const [lastSyncAt, setLastSyncAt] = useState<string>("");
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [showChangeQueuePanel, setShowChangeQueuePanel] = useState<boolean>(false);
  const [simulatingSync, setSimulatingSync] = useState<boolean>(false);
  const [changeQueueFilter, setChangeQueueFilter] = useState<"all" | "pending" | "synced" | "conflict">("all");
  const [changeQueueRoleFilter, setChangeQueueRoleFilter] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showBatchPanel, setShowBatchPanel] = useState<boolean>(false);
  const [batchFilterType, setBatchFilterType] = useState<"overdue" | "within3days" | "pending">("overdue");
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchTargetStatus, setBatchTargetStatus] = useState<ContactStatus>("已联系");
  const [batchNoteTemplate, setBatchNoteTemplate] = useState<string>("");
  const [batchConfirmOpen, setBatchConfirmOpen] = useState<boolean>(false);

  const isInitialized = useRef(false);
  const isPersistEnabled = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await initDB();
        const migrated = migrateLegacyData(data);
        setRecords(migrated.records);
        setCaseInfos(migrated.caseInfos || []);
        setOperationLogs(migrated.operationLogs || []);
        setFollowUpPlans(migrated.followUpPlans);
        setWorkingLengths(migrated.workingLengths);
        setTimelines(migrated.timelines);
        setActiveStage(migrated.activeStage);
        setChangeQueue(migrated.changeQueue || []);
        setConflicts(migrated.conflicts || []);
        setSyncStatus(migrated.syncStatus || "online");
        setLastSyncAt(migrated.lastSyncAt || new Date().toISOString().replace("T", " ").slice(0, 19));
        isInitialized.current = true;
        isPersistEnabled.current = true;
      } catch (err) {
        console.error("初始化 IndexedDB 失败：", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function migrateLegacyData(data: AppData): AppData {
    const records = data.records || [];
    if (records.length === 0) return data;

    const hasNewStructure = records.every(r => r.length >= 6);
    if (hasNewStructure) return data;

    const oldRecords = records as string[][];
    const toothToCaseId: Record<string, string> = {};
    const today = new Date().toISOString().split("T")[0];

    const newRecords: string[][] = oldRecords.map(r => {
      if (r.length >= 6) return r;
      const [toothPosition, diagnosis, currentStep, detail] = r;
      const caseId = createCaseIdExternal();
      toothToCaseId[toothPosition] = caseId;
      const status = currentStep === "充填" ? "已充填" : "待复诊";
      return [caseId, toothPosition, diagnosis || "", currentStep || "开髓", detail || "", status];
    });

    let caseInfos = data.caseInfos || [];
    const followUpPlans = (data.followUpPlans || []).map(p => {
      const caseId = p.caseId || toothToCaseId[p.toothPosition] || createCaseIdExternal();
      if (p.toothPosition && !toothToCaseId[p.toothPosition]) {
        toothToCaseId[p.toothPosition] = caseId;
      }
      return { ...p, caseId };
    });

    const workingLengths = (data.workingLengths || []).map(w => ({
      ...w,
      caseId: w.caseId || toothToCaseId[w.toothPosition] || createCaseIdExternal(),
    }));

    const timelines = (data.timelines || []).map(t => ({
      ...t,
      caseId: t.caseId || toothToCaseId[t.toothPosition] || createCaseIdExternal(),
    }));

    if (caseInfos.length === 0) {
      caseInfos = newRecords.map((r) => {
        const caseId = r[0];
        const toothPosition = r[1];
        const diagnosis = r[2];
        const currentStep = r[3] as TreatmentStep;
        const followUp = followUpPlans.find(p => p.toothPosition === toothPosition);
        const wlMatch = (r[4] || "").match(/工作长度\s*([^，,]+)/);
        const mainMatch = (r[4] || "").match(/主尖锉\s*#?([0-9]+)/);
        const medMatch = (r[4] || "").match(/封药[：:]\s*([^，,]+)/);
        const info: CaseBasicInfo = {
          id: caseId,
          toothPosition,
          patientName: followUp?.patientName || "",
          phone: followUp?.phone || "",
          diagnosis,
          currentStep,
          workingLength: wlMatch ? wlMatch[1] : "",
          mainFileNumber: mainMatch ? mainMatch[1] : "",
          medication: medMatch ? medMatch[1] : "",
          remark: r[4] || "",
          createdAt: today,
          updatedAt: today,
        };
        return info;
      });
    }

    const existingIds = new Set(caseInfos.map(c => c.id));
    for (const r of newRecords) {
      const caseId = r[0];
      if (!existingIds.has(caseId)) {
        const toothPosition = r[1];
        const followUp = followUpPlans.find(p => p.toothPosition === toothPosition);
        const info: CaseBasicInfo = {
          id: caseId,
          toothPosition,
          patientName: followUp?.patientName || "",
          phone: followUp?.phone || "",
          diagnosis: r[2],
          currentStep: (r[3] as TreatmentStep) || "开髓",
          workingLength: "",
          mainFileNumber: "",
          medication: "",
          remark: r[4] || "",
          createdAt: today,
          updatedAt: today,
        };
        caseInfos.push(info);
      }
    }

    return {
      ...data,
      records: newRecords,
      caseInfos,
      followUpPlans,
      workingLengths,
      timelines,
    };
  }

  useEffect(() => {
    if (!isPersistEnabled.current) return;
    const data: AppData = {
      records,
      caseInfos,
      operationLogs,
      followUpPlans,
      workingLengths,
      timelines,
      activeStage,
      changeQueue,
      conflicts,
      syncStatus,
      lastSyncAt,
    };
    saveData(data).catch(err => console.error("保存数据失败：", err));
  }, [records, caseInfos, operationLogs, followUpPlans, workingLengths, timelines, activeStage, changeQueue, conflicts, syncStatus, lastSyncAt]);

  const addOperationLog = (
    caseId: string,
    action: OperationAction,
    detail: string
  ) => {
    const operatorName =
      currentRole === "医生" ? "张医生" : currentRole === "助理" ? "李助理" : "王前台";
    const log = createOperationLog(caseId, operatorName, currentRole, action, detail);
    setOperationLogs(prev => [log, ...prev]);
  };

  const recordFieldChange = (
    caseId: string,
    field: string,
    oldValue: string,
    newValue: string
  ) => {
    if (oldValue === newValue) return;
    const operatorName =
      currentRole === "医生" ? "张医生" : currentRole === "助理" ? "李助理" : "王前台";
    const change: FieldChange = {
      id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      caseId,
      field,
      oldValue,
      newValue,
      changedBy: currentRole,
      changedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      syncStatus: "pending" as const,
    };
    setChangeQueue(prev => [change, ...prev]);
  };

  const getFieldChangeForCase = (caseId: string, field: string): FieldChange | undefined => {
    return changeQueue.find(c => c.caseId === caseId && c.field === field);
  };

  const getLatestFieldChangeForCase = (caseId: string, field: string): FieldChange | undefined => {
    return changeQueue.find(c => c.caseId === caseId && c.field === field);
  };

  const fieldLabelMap: Record<string, string> = {
    toothPosition: "牙位",
    patientName: "患者姓名",
    phone: "联系电话",
    diagnosis: "诊断",
    currentStep: "当前步骤",
    workingLength: "工作长度",
    mainFileNumber: "主尖锉号",
    medication: "封药情况",
    remark: "备注",
    contactStatus: "联系状态",
    nextDate: "复诊日期",
    doctor: "负责医生",
    reason: "复诊原因",
    contactNote: "联系备注",
    workingLengthDetails: "根管参数",
    "timeline_开髓": "开髓步骤",
    "timeline_测长": "测长步骤",
    "timeline_根管预备": "根管预备步骤",
    "timeline_冲洗": "冲洗步骤",
    "timeline_封药": "封药步骤",
    "timeline_充填": "充填步骤",
  };

  const getFieldLabel = (field: string): string => {
    return fieldLabelMap[field] || field;
  };

  const enumFields = new Set(["currentStep", "contactStatus", "confirmedStatus", "referenceApex", "measurementMethod"]);

  const isTextField = (field: string): boolean => {
    return !enumFields.has(field) && !field.startsWith("timeline_") && field !== "workingLengthDetails";
  };

  const [mergedValues, setMergedValues] = useState<Record<string, string>>({});

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

  const unresolvedConflicts = conflicts.filter(c => !c.resolved);

  const simulateRemoteChanges = () => {
    if (caseInfos.length === 0) return;
    setSimulatingSync(true);
    setSyncStatus("syncing");

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const allRoles: UserRole[] = ["医生", "助理", "前台"];
    const randomRole = allRoles[Math.floor(Math.random() * allRoles.length)];

    const doctorFields = [
      { field: "diagnosis", getValue: (c: CaseBasicInfo) => c.diagnosis ? c.diagnosis + "（复查确认）" : "慢性牙髓炎" },
      { field: "currentStep", getValue: () => treatmentSteps[Math.floor(Math.random() * treatmentSteps.length)] },
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

    const numCases = Math.min(3 + Math.floor(Math.random() * 3), caseInfos.length);
    const shuffled = [...caseInfos].sort(() => Math.random() - 0.5);
    const targetCases = shuffled.slice(0, numCases);

    setTimeout(() => {
      const newConflicts: ConflictEntry[] = [];
      const newChanges: FieldChange[] = [];

      targetCases.forEach((caseInfo, idx) => {
        const caseId = caseInfo.id;
        const localPending = changeQueue.filter(c => c.caseId === caseId && c.syncStatus === "pending");
        let hasConflict = false;

        const rolesToSimulate = idx === 0 ? allRoles : [randomRole];

        rolesToSimulate.forEach((simRole, roleIdx) => {
          const fields = getFieldsForRole(simRole);
          const fieldDef = fields[Math.floor(Math.random() * fields.length)];
          const remoteValue = fieldDef.getValue(caseInfo);
          const localChange = localPending.find(c => c.field === fieldDef.field);
          const currentValue = String(caseInfo[fieldDef.field as keyof CaseBasicInfo] || "");

          if (localChange && localChange.newValue !== remoteValue && localChange.changedBy !== simRole) {
            newConflicts.push({
              id: `conflict_${Date.now()}_${idx}_${roleIdx}`,
              caseId,
              field: fieldDef.field,
              localValue: localChange.newValue,
              localChangedBy: localChange.changedBy,
              localChangedAt: localChange.changedAt,
              remoteValue,
              remoteChangedBy: simRole,
              remoteChangedAt: now,
              resolved: false,
            });
            hasConflict = true;
          } else if (!localChange && remoteValue !== currentValue) {
            newChanges.push({
              id: `fc_remote_${Date.now()}_${idx}_${roleIdx}`,
              caseId,
              field: fieldDef.field,
              oldValue: currentValue,
              newValue: remoteValue,
              changedBy: simRole,
              changedAt: now,
              syncStatus: "synced",
            });
            setCaseInfos(prev => prev.map(c =>
              c.id === caseId ? { ...c, [fieldDef.field]: remoteValue, updatedAt: now.split(" ")[0] } : c
            ));
          }
        });

        if (!hasConflict) {
          const followUp = followUpPlans.find(f => f.caseId === caseId);
          if (followUp && Math.random() > 0.5) {
            const contactStatuses: ContactStatus[] = ["已联系", "已确认", "未接通"];
            const newContactStatus = contactStatuses[Math.floor(Math.random() * contactStatuses.length)];
            if (followUp.contactStatus !== newContactStatus) {
              const localChange = localPending.find(c => c.field === "contactStatus");
              if (localChange && localChange.newValue !== newContactStatus) {
                newConflicts.push({
                  id: `conflict_${Date.now()}_${idx}_fu`,
                  caseId,
                  field: "contactStatus",
                  localValue: localChange.newValue,
                  localChangedBy: localChange.changedBy,
                  localChangedAt: localChange.changedAt,
                  remoteValue: newContactStatus,
                  remoteChangedBy: "前台",
                  remoteChangedAt: now,
                  resolved: false,
                });
                hasConflict = true;
              } else if (!localChange) {
                newChanges.push({
                  id: `fc_remote_${Date.now()}_${idx}_fu`,
                  caseId,
                  field: "contactStatus",
                  oldValue: followUp.contactStatus,
                  newValue: newContactStatus,
                  changedBy: "前台",
                  changedAt: now,
                  syncStatus: "synced",
                });
                setFollowUpPlans(prev => prev.map(p =>
                  p.caseId === caseId ? { ...p, contactStatus: newContactStatus } : p
                ));
              }
            }
          }
        }

        if (hasConflict) {
          setChangeQueue(prev => prev.map(c => {
            if (c.caseId === caseId && newConflicts.some(cf => cf.field === c.field)) {
              return { ...c, syncStatus: "conflict" as const };
            }
            return c;
          }));
        }
      });

      const conflictFields = newConflicts.map(c => `${c.caseId}:${c.field}`);
      setChangeQueue(prev => {
        const updated = prev.map(c => {
          if (c.syncStatus === "pending" && !conflictFields.includes(`${c.caseId}:${c.field}`)) {
            return { ...c, syncStatus: "synced" as const };
          }
          return c;
        });
        return [...newChanges, ...updated];
      });
      if (newConflicts.length > 0) {
        setConflicts(prev => [...newConflicts, ...prev]);
        setShowConflictModal(true);
      }

      setSyncStatus("online");
      setLastSyncAt(now);
      setSimulatingSync(false);
    }, 1500 + Math.random() * 1000);
  };

  const resolveConflict = (conflictId: string, resolution: "local" | "remote" | { customValue: string }) => {
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

    setConflicts(prev => prev.map(c =>
      c.id === conflictId
        ? {
            ...c,
            resolved: true,
            resolvedValue,
            resolvedAt: now,
            resolvedBy: currentRole,
          }
        : c
    ));

    const caseInfoFields = ["toothPosition", "patientName", "phone", "diagnosis", "currentStep", "workingLength", "mainFileNumber", "medication", "remark"];
    if (caseInfoFields.includes(conflict.field)) {
      setCaseInfos(prev => prev.map(c => {
        if (c.id === conflict.caseId) {
          return { ...c, [conflict.field]: resolvedValue, updatedAt: now.split(" ")[0] };
        }
        return c;
      }));
    }

    const followUpFields = ["contactStatus", "nextDate", "doctor", "reason", "contactNote", "patientName", "phone"];
    if (followUpFields.includes(conflict.field)) {
      setFollowUpPlans(prev => prev.map(p => {
        if (p.caseId === conflict.caseId) {
          return { ...p, [conflict.field]: resolvedValue } as FollowUpPlan;
        }
        return p;
      }));
    }

    setChangeQueue(prev => prev.map(c => {
      if (c.caseId === conflict.caseId && c.field === conflict.field) {
        return { ...c, syncStatus: "synced" as const, newValue: resolvedValue };
      }
      return c;
    }));

    let logDetail: string;
    if (resolutionType === "merged") {
      logDetail = `冲突解决：${getFieldLabel(conflict.field)} 手动合并，结果「${resolvedValue}」（本地：${conflict.localValue || "空"}，远端：${conflict.remoteValue || "空"}）`;
    } else {
      logDetail = `冲突解决：${getFieldLabel(conflict.field)} 保留${resolutionType === "local" ? "本地" : "远端"}版本「${resolvedValue}」`;
    }
    addOperationLog(conflict.caseId, "更新基础信息", logDetail);

    setMergedValues(prev => {
      const next = { ...prev };
      delete next[conflictId];
      return next;
    });
  };

  const toggleSyncStatus = () => {
    setSyncStatus(prev => prev === "online" ? "offline" : "online");
  };

  const findCaseInfoByTooth = (toothPosition: string): CaseBasicInfo | undefined =>
    caseInfos.find(c => c.toothPosition === toothPosition);

  const findCaseInfoById = (caseId: string): CaseBasicInfo | undefined =>
    caseInfos.find(c => c.id === caseId);

  const findCaseIdByTooth = (toothPosition: string): string | null => {
    const fromCaseInfo = caseInfos.find(c => c.toothPosition === toothPosition);
    if (fromCaseInfo) return fromCaseInfo.id;
    const fromRecord = records.find(r => r[1] === toothPosition);
    return fromRecord ? fromRecord[0] : null;
  };

  const findRecordByCaseId = (caseId: string): string[] | undefined =>
    records.find(r => r[0] === caseId);

  const getToothByCaseId = (caseId: string): string | null => {
    const info = findCaseInfoById(caseId);
    if (info) return info.toothPosition;
    const rec = findRecordByCaseId(caseId);
    return rec ? rec[1] : null;
  };

  const handleResetData = async () => {
    if (!confirm("确定要清空所有本地数据并恢复到初始示例数据吗？此操作不可撤销。")) {
      return;
    }
    try {
      setIsResetting(true);
      isPersistEnabled.current = false;
      const initial = await resetToInitialData();
      setRecords(initial.records);
      setCaseInfos(initial.caseInfos || []);
      setOperationLogs(initial.operationLogs || []);
      setFollowUpPlans(initial.followUpPlans);
      setWorkingLengths(initial.workingLengths);
      setTimelines(initial.timelines);
      setActiveStage(initial.activeStage);
      setChangeQueue(initial.changeQueue || []);
      setConflicts(initial.conflicts || []);
      setSyncStatus(initial.syncStatus || "online");
      setLastSyncAt(initial.lastSyncAt || new Date().toISOString().replace("T", " ").slice(0, 19));
      handleClear();
      resetCanalDraft();
      closeDetailModal();
      setTimeout(() => {
        isPersistEnabled.current = true;
      }, 100);
    } catch (err) {
      console.error("重置数据失败：", err);
      alert("重置数据失败，请查看控制台。");
    } finally {
      setIsResetting(false);
    }
  };

  const stageFilteredRecords = activeStage
    ? records.filter(r => r[3] === activeStage)
    : records;

  const filteredRecords = searchKeyword.trim()
    ? stageFilteredRecords.filter(r => {
        const caseId = r[0];
        const toothPosition = r[1];
        const diagnosis = r[2];
        const caseInfo = findCaseInfoById(caseId);
        const followUp = findFollowUpByCaseId(caseId);
        const patientName = (caseInfo?.patientName || followUp?.patientName || "").toLowerCase();
        const keyword = searchKeyword.trim().toLowerCase();
        return (
          patientName.includes(keyword) ||
          toothPosition.toLowerCase().includes(keyword) ||
          diagnosis.toLowerCase().includes(keyword)
        );
      })
    : stageFilteredRecords;

  const metricValues = calculateMetrics(filteredRecords, null);

  const getDaysUntil = (dateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const sortedPlans = [...followUpPlans].sort((a, b) => {
    const diff = new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
    return sortAsc ? diff : -diff;
  });

  const handleInputChange = (field: keyof CaseRecord, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev: FormErrors) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.toothPosition.trim()) {
      newErrors.toothPosition = "请填写牙位";
    }
    if (!formData.diagnosis.trim()) {
      newErrors.diagnosis = "请填写诊断";
    }
    if (!formData.currentStep.trim()) {
      newErrors.currentStep = "请选择当前步骤";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const details: string[] = [];
    if (formData.workingLength) details.push(`工作长度 ${formData.workingLength}`);
    if (formData.mainFileNumber) details.push(`主尖锉${formData.mainFileNumber}`);
    if (formData.medication) details.push(`封药：${formData.medication}`);
    if (formData.remark) details.push(formData.remark);

    const caseId = createCaseIdExternal();
    const today = new Date().toISOString().split("T")[0];
    const status = formData.currentStep === "充填" ? "已充填" : "待复诊";
    const newRecord: string[] = [
      caseId,
      formData.toothPosition,
      formData.diagnosis,
      formData.currentStep,
      details.join("，") || "无附加信息",
      status,
    ];

    setRecords(prev => [newRecord, ...prev]);

    const newCaseInfo: CaseBasicInfo = {
      id: caseId,
      toothPosition: formData.toothPosition.trim(),
      patientName: "",
      phone: "",
      diagnosis: formData.diagnosis,
      currentStep: formData.currentStep as TreatmentStep,
      workingLength: formData.workingLength,
      mainFileNumber: formData.mainFileNumber,
      medication: formData.medication,
      remark: formData.remark,
      createdAt: today,
      updatedAt: today,
    };
    setCaseInfos(prev => [newCaseInfo, ...prev]);
    addOperationLog(caseId, "创建病例", `创建 ${formData.toothPosition} 病例，诊断：${formData.diagnosis}，当前阶段：${formData.currentStep}`);

    const existingTimeline = findTimeline(formData.toothPosition.trim());
    if (!existingTimeline) {
      const newTimeline = buildTimelineForRecord(
        `tl_${Date.now()}`,
        caseId,
        formData.toothPosition.trim(),
        formData.currentStep,
        details.join("，") || "无附加信息",
        today,
      );
      setTimelines(prev => [newTimeline, ...prev]);
    }

    if (formData.followUpDate) {
      const newPlan: FollowUpPlan = {
        id: `fp_${Date.now()}`,
        caseId,
        toothPosition: formData.toothPosition,
        nextDate: formData.followUpDate,
        doctor: formData.followUpDoctor || "待分配",
        reason: formData.followUpReason || `${formData.currentStep}后复诊`,
        reminderEnabled: formData.followUpReminder,
        contactStatus: "待联系",
        contactNote: "",
        patientName: "",
        phone: "",
      };
      setFollowUpPlans(prev => [newPlan, ...prev]);
      addOperationLog(caseId, "创建复诊计划", `创建复诊计划：${formData.followUpDate}，${newPlan.reason}`);
    }

    handleClear();
  };

  const handleClear = () => {
    setFormData(initialFormData);
    setErrors({});
  };

  const canalStats = {
    teeth: workingLengths.length,
    canals: workingLengths.reduce((sum, w) => sum + w.entries.length, 0),
    confirmed: workingLengths.reduce(
      (sum, w) => sum + w.entries.filter(e => e.confirmedStatus === "已确认").length,
      0
    ),
    supplementary: workingLengths.reduce(
      (sum, w) => sum + w.entries.filter(e => e.isSupplementary).length,
      0
    ),
  };

  const findWorkingLength = (toothPosition: string): WorkingLengthRecord | undefined =>
    workingLengths.find(w => w.toothPosition === toothPosition);

  const addCanalEntry = () => {
    setCanalDraft(prev => ({ ...prev, entries: [...prev.entries, createEmptyCanalEntry()] }));
    setCanalDraftError("");
  };

  const updateCanalEntry = (id: string, field: keyof CanalEntry, value: string | boolean) => {
    setCanalDraft(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.id === id ? { ...entry, [field]: value } as CanalEntry : entry
      ),
    }));
  };

  const removeCanalEntry = (id: string) => {
    setCanalDraft(prev => ({ ...prev, entries: prev.entries.filter(entry => entry.id !== id) }));
  };

  const resetCanalDraft = () => {
    setCanalDraft({ toothPosition: "", entries: [], note: "", editingId: null });
    setCanalDraftError("");
  };

  const handleSelectCaseForWL = (caseInfo: CaseBasicInfo) => {
    const existingWL = findWorkingLength(caseInfo.toothPosition);
    if (existingWL) {
      loadWorkingLengthForEdit(existingWL);
    } else {
      setCanalDraft(prev => ({ ...prev, toothPosition: caseInfo.toothPosition }));
      setCanalDraftError("");
    }
    setShowCaseSelectModal(false);
    setCaseSelectSearch("");
  };

  const handleCanalDraftChange = (field: keyof CanalDraft, value: string) => {
    setCanalDraft(prev => ({ ...prev, [field]: value }));
    if (canalDraftError) setCanalDraftError("");
  };

  const loadWorkingLengthForEdit = (record: WorkingLengthRecord) => {
    setCanalDraft({
      toothPosition: record.toothPosition,
      entries: record.entries.map(entry => ({ ...entry })),
      note: record.note,
      editingId: record.id,
    });
    setCanalDraftError("");
  };

  const saveCanalDraft = () => {
    if (!canalDraft.toothPosition.trim()) {
      setCanalDraftError("请填写牙位");
      return;
    }
    const validEntries = canalDraft.entries.filter(e => e.canalName.trim());
    if (validEntries.length === 0) {
      setCanalDraftError("请至少添加一条带名称的根管明细");
      return;
    }
    const conflict = workingLengths.find(
      w => w.toothPosition === canalDraft.toothPosition.trim() && w.id !== canalDraft.editingId
    );
    if (conflict) {
      setCanalDraftError(`牙位 ${canalDraft.toothPosition.trim()} 已存在工作长度记录，请编辑原记录`);
      return;
    }

    const caseId = findCaseIdByTooth(canalDraft.toothPosition.trim());

    if (canalDraft.editingId) {
      const existingWl = workingLengths.find(w => w.id === canalDraft.editingId);
      if (existingWl && caseId) {
        const oldEntrySummary = existingWl.entries.map(e => `${e.canalName}:${e.measuredLength}`).join(",");
        const newEntrySummary = validEntries.map(e => `${e.canalName}:${e.measuredLength}`).join(",");
        if (oldEntrySummary !== newEntrySummary) {
          recordFieldChange(caseId, "workingLengthDetails", oldEntrySummary, newEntrySummary);
        }
      }
      setWorkingLengths(prev => prev.map(w =>
        w.id === canalDraft.editingId
          ? {
              ...w,
              toothPosition: canalDraft.toothPosition.trim(),
              entries: validEntries,
              note: canalDraft.note,
            }
          : w
      ));
      if (caseId) {
        addOperationLog(caseId, "更新根管参数", `更新牙位 ${canalDraft.toothPosition} 的 ${validEntries.length} 条根管参数`);
      }
    } else {
      const newRecord: WorkingLengthRecord = {
        id: `wl_${Date.now()}`,
        caseId: caseId || "",
        toothPosition: canalDraft.toothPosition.trim(),
        entries: validEntries,
        note: canalDraft.note,
      };
      setWorkingLengths(prev => [newRecord, ...prev]);
      if (caseId) {
        addOperationLog(caseId, "更新根管参数", `新增牙位 ${canalDraft.toothPosition} 的 ${validEntries.length} 条根管参数`);
      }
    }
    resetCanalDraft();
  };

  const deleteWorkingLength = (id: string) => {
    setWorkingLengths(prev => prev.filter(w => w.id !== id));
    if (canalDraft.editingId === id) resetCanalDraft();
  };

  const toggleCanalSupplementary = (id: string) => {
    setCanalDraft(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.id === id ? { ...entry, isSupplementary: !entry.isSupplementary } : entry
      ),
    }));
  };

  const findTimeline = (toothPosition: string): TreatmentTimeline | undefined =>
    timelines.find(t => t.toothPosition === toothPosition);

  const findTimelineByCaseId = (caseId: string): TreatmentTimeline | undefined =>
    timelines.find(t => t.caseId === caseId);

  const getOrCreateTimeline = (toothPosition: string, caseId?: string): TreatmentTimeline => {
    const existing = findTimeline(toothPosition);
    if (existing) return existing;
    const newTimeline = createInitialTimeline(toothPosition, caseId);
    setTimelines(prev => [newTimeline, ...prev]);
    return newTimeline;
  };

  const syncCaseStepFromTimeline = (toothPosition: string, timelineNodes: TimelineNode[]) => {
    const caseId = findCaseIdByTooth(toothPosition);
    if (!caseId) return;

    const derivedStep = deriveCurrentStepFromTimeline(timelineNodes);
    const today = new Date().toISOString().split("T")[0];

    const caseInfo = findCaseInfoById(caseId);
    const oldStep = caseInfo?.currentStep || "";

    if (oldStep === derivedStep) return;

    setCaseInfos(prev => prev.map(c =>
      c.id === caseId ? { ...c, currentStep: derivedStep, updatedAt: today } : c
    ));

    setRecords(prev => prev.map(r => {
      if (r[0] === caseId) {
        const status = derivedStep === "充填" ? "已充填" : "待复诊";
        return [r[0], r[1], r[2], derivedStep, r[4], status];
      }
      return r;
    }));

    recordFieldChange(caseId, "currentStep", oldStep, derivedStep);
    addOperationLog(
      caseId,
      "更新基础信息",
      `治疗时间线驱动：当前步骤由「${oldStep || "未设置"}」更新为「${derivedStep}」`
    );
  };

  const openDetailModal = (toothPositionOrCaseId: string, source: "list" | "stage" | "followup" = "list") => {
    let caseId: string | null = null;
    let toothPosition: string | null = null;

    if (toothPositionOrCaseId.startsWith("case_")) {
      caseId = toothPositionOrCaseId;
      toothPosition = getToothByCaseId(caseId);
    } else {
      toothPosition = toothPositionOrCaseId;
      caseId = findCaseIdByTooth(toothPosition);
    }

    if (toothPosition) {
      getOrCreateTimeline(toothPosition, caseId || undefined);
      setSelectedCaseId(caseId);
      setSelectedToothPosition(toothPosition);
      setActiveCaseTab("summary");
      setIsEditingBasicInfo(false);
      setBasicInfoDraft(null);
      setShowDetailModal(true);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCaseId(null);
    setSelectedToothPosition(null);
    setTimelineDraft({ toothPosition: "", editingNodeId: null, node: null });
    setTimelineDraftError("");
    setIsEditingBasicInfo(false);
    setBasicInfoDraft(null);
    setBasicInfoError("");
  };

  const findWorkingLengthByCaseId = (caseId: string): WorkingLengthRecord | undefined =>
    workingLengths.find(w => w.caseId === caseId);

  const findFollowUpByCaseId = (caseId: string): FollowUpPlan | undefined =>
    followUpPlans.find(f => f.caseId === caseId);

  const findLogsByCaseId = (caseId: string): OperationLog[] =>
    operationLogs.filter(l => l.caseId === caseId);

  const startEditingBasicInfo = () => {
    if (!selectedCaseId) return;
    const caseInfo = findCaseInfoById(selectedCaseId);
    if (caseInfo) {
      setBasicInfoDraft({ ...caseInfo });
    } else if (selectedToothPosition) {
      const rec = findRecordByCaseId(selectedCaseId);
      setBasicInfoDraft({
        id: selectedCaseId,
        toothPosition: selectedToothPosition,
        patientName: "",
        phone: "",
        diagnosis: rec ? rec[2] : "",
        currentStep: (rec ? rec[3] as TreatmentStep : "开髓"),
        workingLength: "",
        mainFileNumber: "",
        medication: "",
        remark: "",
        createdAt: new Date().toISOString().split("T")[0],
        updatedAt: new Date().toISOString().split("T")[0],
      });
    }
    setIsEditingBasicInfo(true);
    setBasicInfoError("");
  };

  const cancelEditingBasicInfo = () => {
    setIsEditingBasicInfo(false);
    setBasicInfoDraft(null);
    setBasicInfoError("");
  };

  const updateBasicInfoDraft = (field: keyof CaseBasicInfo, value: string) => {
    if (!basicInfoDraft) return;
    setBasicInfoDraft(prev => prev ? { ...prev, [field]: value } : null);
    if (basicInfoError) setBasicInfoError("");
  };

  const saveBasicInfo = () => {
    if (!basicInfoDraft || !selectedCaseId) return;
    if (!basicInfoDraft.toothPosition.trim()) {
      setBasicInfoError("牙位不能为空");
      return;
    }
    if (!basicInfoDraft.diagnosis.trim()) {
      setBasicInfoError("诊断不能为空");
      return;
    }

    const existingInfo = findCaseInfoById(selectedCaseId);
    const trackableFields: (keyof CaseBasicInfo)[] = [
      "toothPosition", "patientName", "phone", "diagnosis",
      "currentStep", "workingLength", "mainFileNumber", "medication", "remark"
    ];

    if (existingInfo) {
      trackableFields.forEach(field => {
        const oldVal = String(existingInfo[field] || "");
        const newVal = String(basicInfoDraft![field] || "");
        if (oldVal !== newVal) {
          recordFieldChange(selectedCaseId, field, oldVal, newVal);
        }
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const updatedInfo = { ...basicInfoDraft, updatedAt: today };

    setCaseInfos(prev => {
      const exists = prev.find(c => c.id === selectedCaseId);
      if (exists) {
        return prev.map(c => c.id === selectedCaseId ? updatedInfo : c);
      }
      return [updatedInfo, ...prev];
    });

    setRecords(prev => prev.map(r => {
      if (r[0] === selectedCaseId) {
        const status = updatedInfo.currentStep === "充填" ? "已充填" : "待复诊";
        return [r[0], updatedInfo.toothPosition, updatedInfo.diagnosis, updatedInfo.currentStep, r[4], status];
      }
      return r;
    }));

    setFollowUpPlans(prev => prev.map(p => {
      if (p.caseId === selectedCaseId || p.toothPosition === updatedInfo.toothPosition) {
        return {
          ...p,
          caseId: selectedCaseId,
          patientName: updatedInfo.patientName || p.patientName,
          phone: updatedInfo.phone,
          toothPosition: updatedInfo.toothPosition,
        };
      }
      return p;
    }));

    addOperationLog(selectedCaseId, "更新基础信息", `更新患者信息：${updatedInfo.patientName || "未命名"}，牙位：${updatedInfo.toothPosition}，当前阶段：${updatedInfo.currentStep}`);

    setIsEditingBasicInfo(false);
    setBasicInfoDraft(null);
    setBasicInfoError("");
  };

  const startEditingNode = (timelineId: string, node: TimelineNode) => {
    setTimelineDraft({
      toothPosition: timelineId,
      editingNodeId: node.id,
      node: { ...node },
    });
    setTimelineDraftError("");
  };

  const cancelEditingNode = () => {
    setTimelineDraft({ toothPosition: "", editingNodeId: null, node: null });
    setTimelineDraftError("");
  };

  const updateDraftNode = (field: keyof TimelineNode, value: string | boolean) => {
    if (!timelineDraft.node) return;
    setTimelineDraft(prev => ({
      ...prev,
      node: prev.node ? { ...prev.node, [field]: value } : null,
    }));
    if (timelineDraftError) setTimelineDraftError("");
  };

  const saveNode = () => {
    if (!timelineDraft.node || !selectedToothPosition) {
      setTimelineDraftError("无法保存：缺少必要信息");
      return;
    }

    const node = timelineDraft.node;
    if (node.isCompleted && !node.completedAt.trim()) {
      setTimelineDraftError("已完成节点请填写完成时间");
      return;
    }
    if (node.isCompleted && !node.operator.trim()) {
      setTimelineDraftError("已完成节点请填写操作者");
      return;
    }

    const currentTimeline = findTimeline(selectedToothPosition);
    const newNodes = currentTimeline
      ? currentTimeline.nodes.map(n => (n.id === node.id ? node : n))
      : [node];

    setTimelines(prev => prev.map(timeline => {
      if (timeline.toothPosition !== selectedToothPosition) return timeline;
      return {
        ...timeline,
        nodes: newNodes,
      };
    }));

    syncCaseStepFromTimeline(selectedToothPosition, newNodes);

    if (selectedCaseId) {
      recordFieldChange(selectedCaseId, `timeline_${node.step}`, node.isCompleted ? "未完成" : "已完成", node.isCompleted ? "已完成" : "未完成");
      addOperationLog(selectedCaseId, "编辑治疗步骤", `编辑「${node.step}」步骤：${node.keyParams || "更新参数"}`);
    }

    cancelEditingNode();
  };

  const toggleNodeCompletion = (timelineId: string, nodeId: string) => {
    const timeline = findTimeline(timelineId);
    if (!timeline) return;

    const targetNode = timeline.nodes.find(n => n.id === nodeId);
    if (!targetNode) return;

    const newIsCompleted = !targetNode.isCompleted;
    const defaultOperator =
      currentRole === "医生" ? "张医生" : currentRole === "助理" ? "李助理" : "王前台";

    if (newIsCompleted) {
      if (!targetNode.completedAt.trim() && !targetNode.operator.trim()) {
        const confirmed = confirm(
          `即将标记「${targetNode.step}」为已完成，将自动填写：\n• 完成时间：${new Date().toISOString().replace("T", " ").slice(0, 16)}\n• 操作者：${defaultOperator}\n\n是否确认？`
        );
        if (!confirmed) return;
      } else if (!targetNode.completedAt.trim()) {
        const confirmed = confirm(
          `即将标记「${targetNode.step}」为已完成，将自动填写完成时间。\n是否确认？`
        );
        if (!confirmed) return;
      } else if (!targetNode.operator.trim()) {
        const confirmed = confirm(
          `即将标记「${targetNode.step}」为已完成，将自动填写操作者为「${defaultOperator}」。\n是否确认？`
        );
        if (!confirmed) return;
      }
    }

    const newNodes = timeline.nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          isCompleted: newIsCompleted,
          completedAt: newIsCompleted && !n.completedAt.trim()
            ? new Date().toISOString().replace("T", " ").slice(0, 16)
            : n.completedAt,
          operator: newIsCompleted && !n.operator.trim()
            ? defaultOperator
            : n.operator,
        };
      }
      return n;
    });

    setTimelines(prev => prev.map(tl =>
      tl.toothPosition === timelineId ? { ...tl, nodes: newNodes } : tl
    ));

    syncCaseStepFromTimeline(timelineId, newNodes);

    if (selectedCaseId) {
      recordFieldChange(selectedCaseId, `timeline_${targetNode.step}`, newIsCompleted ? "未完成" : "已完成", newIsCompleted ? "已完成" : "未完成");
      addOperationLog(selectedCaseId, "完成治疗步骤", `${newIsCompleted ? "标记完成" : "取消完成"}「${targetNode.step}」步骤`);
    }
  };

  const openFollowUpEdit = (plan: FollowUpPlan) => {
    setFollowUpEditDraft({
      id: plan.id,
      plan: { ...plan },
    });
    setShowFollowUpEditModal(true);
  };

  const closeFollowUpEdit = () => {
    setShowFollowUpEditModal(false);
    setFollowUpEditDraft({ id: null, plan: null });
  };

  const getFilterLabel = (): string => {
    const stageLabel = activeStage ? `${activeStage}阶段` : "全部病例";
    if (searchKeyword.trim()) {
      return `${stageLabel} · 搜索「${searchKeyword.trim()}」`;
    }
    return stageLabel;
  };

  const getExportScopeLabel = (): string => {
    switch (exportScope) {
      case "all":
        return "全部病例";
      case "filtered":
        return getFilterLabel();
      case "custom":
        if (exportCustomStages.length === 0) return "自定义（未选择阶段）";
        return `自定义：${exportCustomStages.join("、")}`;
      default:
        return getFilterLabel();
    }
  };

  const getRecordsForExport = (): string[][] => {
    switch (exportScope) {
      case "all":
        return records;
      case "filtered":
        return filteredRecords;
      case "custom":
        if (exportCustomStages.length === 0) return [];
        return records.filter((r) => exportCustomStages.includes(r[3]));
      default:
        return filteredRecords;
    }
  };

  const toggleFieldSelection = (fieldKey: string) => {
    setExportSelectedFields((prev) =>
      prev.includes(fieldKey)
        ? prev.filter((f) => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const toggleStageSelection = (stage: string) => {
    setExportCustomStages((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage]
    );
  };

  const selectAllFieldsInGroup = (groupKey: string) => {
    const groupFields = EXPORT_FIELD_GROUPS[groupKey as keyof typeof EXPORT_FIELD_GROUPS]?.fields || [];
    const fieldKeys = groupFields.map((f) => f.key);
    setExportSelectedFields((prev) => {
      const allSelected = fieldKeys.every((k) => prev.includes(k));
      if (allSelected) {
        return prev.filter((f) => !fieldKeys.includes(f));
      } else {
        return [...new Set([...prev, ...fieldKeys])];
      }
    });
  };

  const handleExport = () => {
    if (exportSelectedFields.length === 0) {
      alert("请至少选择一个导出字段");
      return;
    }

    const exportRecords = getRecordsForExport();
    if (exportRecords.length === 0) {
      alert("当前筛选条件下没有可导出的记录");
      return;
    }

    const rows = buildSummaryRows({
      records: exportRecords,
      caseInfos,
      followUpPlans,
      workingLengths,
      operationLogs,
      timelines,
      selectedFields: exportSelectedFields,
    });

    const scopeLabel = getExportScopeLabel();
    const dateStr = new Date().toISOString().split("T")[0];
    const scopePart =
      exportScope === "all"
        ? "全部"
        : exportScope === "filtered"
        ? activeStage || "全部"
        : exportCustomStages.length > 0
        ? exportCustomStages.join("-")
        : "自定义";
    const searchPart = exportScope === "filtered" && searchKeyword.trim() ? `_搜索${searchKeyword.trim()}` : "";

    if (exportFormat === "csv") {
      const csvContent = generateCSVFromRows(rows, exportSelectedFields);
      const filename = `根管治疗病例摘要_${scopePart}${searchPart}_${dateStr}.csv`;
      downloadCSV(csvContent, filename);
    } else {
      const filterLabel = scopeLabel + (exportScope === "filtered" && searchKeyword.trim() ? "" : "");
      const htmlContent = generatePrintableHTMLFromRows(rows, exportSelectedFields, filterLabel);
      openPrintWindow(htmlContent);
    }

    setShowExportModal(false);
  };

  const handleExportCSV = () => {
    const summaries = buildCaseSummaries(filteredRecords, followUpPlans, workingLengths);
    const csvContent = generateCSV(summaries);
    const dateStr = new Date().toISOString().split("T")[0];
    const filterPart = activeStage ? activeStage : "全部";
    const searchPart = searchKeyword.trim() ? `_搜索${searchKeyword.trim()}` : "";
    const filename = `根管治疗病例摘要_${filterPart}${searchPart}_${dateStr}.csv`;
    downloadCSV(csvContent, filename);
    setShowExportModal(false);
  };

  const handleExportHTML = () => {
    const summaries = buildCaseSummaries(filteredRecords, followUpPlans, workingLengths);
    const filterLabel = getFilterLabel();
    const htmlContent = generatePrintableHTML(summaries, filterLabel);
    openPrintWindow(htmlContent);
    setShowExportModal(false);
  };

  const updateFollowUpDraft = (field: keyof FollowUpPlan, value: string | boolean) => {
    if (!followUpEditDraft.plan) return;
    setFollowUpEditDraft(prev => ({
      ...prev,
      plan: prev.plan ? { ...prev.plan, [field]: value } as FollowUpPlan : null,
    }));
  };

  const saveFollowUpPlan = () => {
    if (!followUpEditDraft.plan || !followUpEditDraft.id) return;
    const plan = followUpEditDraft.plan;
    const existingPlan = followUpPlans.find(p => p.id === followUpEditDraft.id);

    if (existingPlan && plan.caseId) {
      const trackableFields: (keyof FollowUpPlan)[] = [
        "nextDate", "doctor", "contactStatus", "patientName", "phone", "reason", "contactNote"
      ];
      trackableFields.forEach(field => {
        const oldVal = String(existingPlan[field] || "");
        const newVal = String(plan![field] || "");
        if (oldVal !== newVal) {
          recordFieldChange(plan!.caseId, field, oldVal, newVal);
        }
      });
    }

    setFollowUpPlans(prev => prev.map(p =>
      p.id === followUpEditDraft.id ? plan! : p
    ));
    if (plan.caseId) {
      addOperationLog(plan.caseId, "更新复诊计划", `更新复诊计划：日期 ${plan.nextDate}，医生：${plan.doctor}，联系状态：${plan.contactStatus}`);
    }
    closeFollowUpEdit();
  };

  const updateContactStatus = (planId: string, status: ContactStatus) => {
    const plan = followUpPlans.find(p => p.id === planId);
    if (!plan || plan.contactStatus === status) return;

    recordFieldChange(plan.caseId, "contactStatus", plan.contactStatus, status);
    addOperationLog(plan.caseId, "更新联系状态", `更新复诊联系状态为「${status}」`);

    setFollowUpPlans(prev => prev.map(p =>
      p.id === planId ? { ...p, contactStatus: status } : p
    ));
  };

  const markConfirmedArrival = (planId: string) => {
    const plan = followUpPlans.find(p => p.id === planId);
    if (!plan) return;

    const now = new Date();
    const timestamp = now.toISOString().replace("T", " ").slice(0, 16);
    const newContactNote = plan.contactNote
      ? `${plan.contactNote}\n【${timestamp}】已确认今日到诊`
      : `【${timestamp}】已确认今日到诊`;

    if (plan.contactStatus !== "已确认") {
      recordFieldChange(plan.caseId, "contactStatus", plan.contactStatus, "已确认");
    }
    recordFieldChange(plan.caseId, "contactNote", plan.contactNote, newContactNote);

    addOperationLog(
      plan.caseId,
      "确认今日到诊",
      `标记复诊确认到诊：${plan.toothPosition}，${plan.patientName || "未命名患者"}，复诊日期：${plan.nextDate}`
    );

    setFollowUpPlans(prev => prev.map(p =>
      p.id === planId
        ? { ...p, contactStatus: "已确认", contactNote: newContactNote }
        : p
    ));
  };

  const getBatchCandidates = (): FollowUpPlan[] => {
    return followUpPlans.filter(plan => {
      const days = getDaysUntil(plan.nextDate);
      switch (batchFilterType) {
        case "overdue":
          return days < 0;
        case "within3days":
          return days >= 0 && days <= 3;
        case "pending":
          return plan.contactStatus === "待联系";
        default:
          return false;
      }
    });
  };

  const toggleBatchSelect = (planId: string) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  };

  const selectAllBatchCandidates = () => {
    const candidates = getBatchCandidates();
    setBatchSelectedIds(new Set(candidates.map(c => c.id)));
  };

  const clearBatchSelection = () => {
    setBatchSelectedIds(new Set());
  };

  const getCancelledCount = (): number => {
    return Array.from(batchSelectedIds).filter(id => {
      const plan = followUpPlans.find(p => p.id === id);
      return plan?.contactStatus === "已取消";
    }).length;
  };

  const executeBatchUpdate = () => {
    const selectedPlans = Array.from(batchSelectedIds)
      .map(id => followUpPlans.find(p => p.id === id))
      .filter((p): p is FollowUpPlan => p !== null);

    const blockedPlans = selectedPlans.filter(p => p.contactStatus === "已取消" && batchTargetStatus === "已确认");
    if (blockedPlans.length > 0) {
      alert(`${blockedPlans.length} 条已取消的计划不能批量改为已确认，已自动跳过`);
    }

    const validPlans = selectedPlans.filter(p => !(p.contactStatus === "已取消" && batchTargetStatus === "已确认"));
    if (validPlans.length === 0) {
      setBatchConfirmOpen(false);
      return;
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    setFollowUpPlans(prev => prev.map(plan => {
      if (!batchSelectedIds.has(plan.id)) return plan;
      if (plan.contactStatus === "已取消" && batchTargetStatus === "已确认") return plan;
      return {
        ...plan,
        contactStatus: batchTargetStatus,
        contactNote: batchNoteTemplate.trim()
          ? (plan.contactNote ? `${plan.contactNote}\n【${now}】${batchNoteTemplate.trim()}` : `【${now}】${batchNoteTemplate.trim()}`)
          : plan.contactNote,
      };
    }));

    validPlans.forEach(plan => {
      if (plan.contactStatus !== batchTargetStatus) {
        recordFieldChange(plan.caseId, "contactStatus", plan.contactStatus, batchTargetStatus);
      }
      if (batchNoteTemplate.trim()) {
        const newNote = plan.contactNote
          ? `${plan.contactNote}\n【${now}】${batchNoteTemplate.trim()}`
          : `【${now}】${batchNoteTemplate.trim()}`;
        recordFieldChange(plan.caseId, "contactNote", plan.contactNote, newNote);
      }
      addOperationLog(
        plan.caseId,
        "批量更新联系状态",
        `${plan.toothPosition} ${plan.patientName || ""}：${plan.contactStatus} → ${batchTargetStatus}${batchNoteTemplate.trim() ? "，备注：" + batchNoteTemplate.trim() : ""}`
      );
    });

    setBatchConfirmOpen(false);
    setBatchSelectedIds(new Set());
    setBatchNoteTemplate("");
  };

  const filteredFollowUpPlans = contactStatusFilter
    ? followUpPlans.filter(p => p.contactStatus === contactStatusFilter)
    : followUpPlans;

  const sortedAndFilteredPlans = [...filteredFollowUpPlans].sort((a, b) => {
    const diff = new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
    return sortAsc ? diff : -diff;
  });

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>正在加载本地数据...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero" style={{ borderLeftColor: roleColors[currentRole] }}>
        <div>
          <p className="eyebrow" style={{ color: roleColors[currentRole] }}>
            {project.id} · port {project.port}
          </p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
          <div className="role-switcher">
            <span className="role-switcher-label">当前角色：</span>
            <div className="role-tabs">
              {(["医生", "助理", "前台"] as UserRole[]).map(role => (
                <button
                  key={role}
                  className={`role-tab ${currentRole === role ? "active" : ""}`}
                  style={currentRole === role ? {
                    backgroundColor: roleColors[role],
                    borderColor: roleColors[role],
                  } as React.CSSProperties : {}}
                  onClick={() => setCurrentRole(role)}
                >
                  {role}
                  <span className="role-tab-desc">{roleDescriptions[role]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <div className="sync-controls">
            <button
              type="button"
              className={`sync-toggle-btn ${syncStatus}`}
              onClick={toggleSyncStatus}
            >
              <span className={`sync-dot sync-dot--${syncStatus}`}></span>
              {syncStatus === "online" ? "在线" : syncStatus === "offline" ? "离线" : "同步中"}
            </button>
            <button
              type="button"
              className="simulate-sync-btn"
              onClick={simulateRemoteChanges}
              disabled={simulatingSync || syncStatus === "offline"}
            >
              {simulatingSync ? "同步中..." : "模拟远端同步"}
            </button>
            <button
              type="button"
              className={`change-queue-btn ${unresolvedConflicts.length > 0 ? "has-conflicts" : ""}`}
              onClick={() => setShowChangeQueuePanel(prev => !prev)}
            >
              变更队列 ({changeQueue.length})
              {unresolvedConflicts.length > 0 && (
                <span className="conflict-badge">{unresolvedConflicts.length} 冲突</span>
              )}
            </button>
          </div>
          <button
            type="button"
            className="reset-data-btn"
            onClick={handleResetData}
            disabled={isResetting}
          >
            {isResetting ? "重置中..." : "恢复示例数据"}
          </button>
          <div className="stack-card">
            <span>技术栈</span>
            <strong>{project.stack}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      {showChangeQueuePanel && (
        <section className="collab-panel panel">
          <div className="section-heading">
            <div>
              <p>离线协作 · 变更队列</p>
              <h2>
                本地变更记录
                <span className="record-total">共 {changeQueue.length} 条 · {unresolvedConflicts.length} 冲突未解决</span>
              </h2>
            </div>
            <div className="collab-panel-actions">
              {unresolvedConflicts.length > 0 && (
                <button
                  type="button"
                  className="primary-action conflict-action-btn"
                  onClick={() => setShowConflictModal(true)}
                >
                  解决冲突 ({unresolvedConflicts.length})
                </button>
              )}
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowChangeQueuePanel(false)}
              >
                收起
              </button>
            </div>
          </div>
          <div className="collab-sync-info">
            <div className="collab-sync-stat">
              <span className={`sync-dot sync-dot--${syncStatus}`}></span>
              <strong>{syncStatus === "online" ? "在线" : syncStatus === "offline" ? "离线" : "同步中"}</strong>
              <span>当前状态</span>
            </div>
            <div className="collab-sync-stat">
              <strong>{changeQueue.filter(c => c.syncStatus === "pending").length}</strong>
              <span>待同步</span>
            </div>
            <div className="collab-sync-stat">
              <strong>{changeQueue.filter(c => c.syncStatus === "synced").length}</strong>
              <span>已同步</span>
            </div>
            <div className="collab-sync-stat collab-sync-stat--conflict">
              <strong>{unresolvedConflicts.length}</strong>
              <span>冲突</span>
            </div>
            <div className="collab-sync-stat">
              <strong>{lastSyncAt ? lastSyncAt.split(" ")[1] : "-"}</strong>
              <span>上次同步</span>
            </div>
          </div>
          <div className="collab-filters">
            <div className="collab-filter-group">
              <span className="collab-filter-label">状态：</span>
              <div className="collab-filter-chips">
                {[
                  { key: "all", label: "全部" },
                  { key: "pending", label: "待同步" },
                  { key: "synced", label: "已同步" },
                  { key: "conflict", label: "冲突" },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className={`collab-filter-chip ${changeQueueFilter === item.key ? "collab-filter-chip--active" : ""}`}
                    onClick={() => setChangeQueueFilter(item.key as any)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="collab-filter-group">
              <span className="collab-filter-label">角色：</span>
              <div className="collab-filter-chips">
                {[
                  { key: "all", label: "全部" },
                  { key: "医生", label: "医生" },
                  { key: "助理", label: "助理" },
                  { key: "前台", label: "前台" },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className={`collab-filter-chip ${changeQueueRoleFilter === item.key ? "collab-filter-chip--active" : ""}`}
                    onClick={() => setChangeQueueRoleFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="collab-queue-list">
            {(() => {
              const filtered = changeQueue.filter(c => {
                if (changeQueueFilter !== "all" && c.syncStatus !== changeQueueFilter) return false;
                if (changeQueueRoleFilter !== "all" && c.changedBy !== changeQueueRoleFilter) return false;
                return true;
              });
              if (filtered.length === 0) {
                return (
                  <div className="empty-state">
                    <p>暂无符合条件的变更记录</p>
                    <p className="empty-state-hint">尝试调整筛选条件或编辑病例字段</p>
                  </div>
                );
              }
              return filtered.slice(0, 30).map(change => {
                const caseInfo = findCaseInfoById(change.caseId);
                const isConflict = change.syncStatus === "conflict";
                return (
                  <div key={change.id} className={`collab-queue-item ${isConflict ? "collab-queue-item--conflict" : ""}`}>
                    <div className="collab-queue-left">
                      <span
                        className="collab-queue-avatar"
                        style={{ backgroundColor: roleColors[change.changedBy] }}
                      >
                        {change.changedBy.charAt(0)}
                      </span>
                    </div>
                    <div className="collab-queue-body">
                      <div className="collab-queue-header">
                        <span className="collab-queue-case">
                          {caseInfo?.toothPosition || change.caseId.slice(0, 12)}
                        </span>
                        <span className="collab-queue-field">{getFieldLabel(change.field)}</span>
                        <span
                          className={`collab-queue-status collab-queue-status--${change.syncStatus}`}
                        >
                          {change.syncStatus === "pending" ? "待同步" : change.syncStatus === "synced" ? "已同步" : "冲突"}
                        </span>
                      </div>
                      <div className="collab-queue-diff">
                        <span className="collab-queue-old">{change.oldValue || "(空)"}</span>
                        <span className="collab-queue-arrow">→</span>
                        <span className="collab-queue-new">{change.newValue || "(空)"}</span>
                      </div>
                      <div className="collab-queue-meta">
                        <span style={{ color: roleColors[change.changedBy] }}>{change.changedBy}</span>
                        <span>{change.changedAt}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}

      <section className="stage-tabs-wrapper">
        <div className="stage-tabs">
          <button
            className={`stage-tab ${activeStage === null ? 'active' : ''}`}
            onClick={() => setActiveStage(null)}
          >
            全部
          </button>
          {steps.map((stage) => (
            <button
              key={stage}
              className={`stage-tab ${activeStage === stage ? 'active' : ''}`}
              style={activeStage === stage ? { '--stage-color': stageColors[stage] } as React.CSSProperties : {}}
              onClick={() => setActiveStage(stage)}
            >
              {stage}
              <span className="stage-count">
                {records.filter(r => r[3] === stage).length}
              </span>
            </button>
          ))}
        </div>
        <div className="search-box-wrapper">
          <div className="search-box">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="搜索患者姓名、牙位、诊断关键词..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            {searchKeyword && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchKeyword("")}
                title="清空搜索"
              >
                ×
              </button>
            )}
          </div>
          {searchKeyword && (
            <span className="search-result-info">
              匹配 {filteredRecords.length} 条
            </span>
          )}
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色切换</h2>
          <div className="chips role-chips">
            {(["医生", "助理", "前台"] as UserRole[]).map((role) => (
              <button
                key={role}
                className={currentRole === role ? "role-chip-active" : ""}
                style={currentRole === role ? {
                  backgroundColor: roleColors[role],
                  borderColor: roleColors[role],
                  color: "#fff",
                } as React.CSSProperties : {}}
                onClick={() => setCurrentRole(role)}
              >
                {role}
              </button>
            ))}
          </div>
          {currentRole !== "前台" && (
            <>
              <h2>阶段筛选</h2>
              <div className="chips muted">
                {project.filters.map((filter: string) => (
                  <button key={filter}>{filter}</button>
                ))}
              </div>
            </>
          )}
          {currentRole === "前台" && (
            <>
              <h2>联系状态</h2>
              <div className="chips muted">
                <button
                  className={contactStatusFilter === null ? "active" : ""}
                  onClick={() => setContactStatusFilter(null)}
                >
                  全部
                </button>
                {contactStatusOptions.map((status) => (
                  <button
                    key={status}
                    className={contactStatusFilter === status ? "active" : ""}
                    style={contactStatusFilter === status ? {
                      color: contactStatusColors[status],
                      borderColor: contactStatusColors[status],
                    } as React.CSSProperties : {}}
                    onClick={() => setContactStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {currentRole === "医生" && (
          <section className="panel doctor-panel">
            <div className="section-heading">
              <div>
                <p className="section-eyebrow-doctor">医生工作台</p>
                <h2>治疗参数总览</h2>
              </div>
              <span className="role-badge" style={{ backgroundColor: roleColors["医生"] }}>
                医生视图
              </span>
            </div>
            <div className="doctor-summary">
              <div className="doctor-summary-item">
                <strong>{records.length}</strong>
                <span>在管病例</span>
              </div>
              <div className="doctor-summary-item">
                <strong>{workingLengths.length}</strong>
                <span>已记录工作长度</span>
              </div>
              <div className="doctor-summary-item">
                <strong>{followUpPlans.filter(p => p.contactStatus === "已确认").length}</strong>
                <span>已确认复诊</span>
              </div>
              <div className="doctor-summary-item">
                <strong>{records.filter(r => r[3] === "充填").length}</strong>
                <span>已完成充填</span>
              </div>
            </div>
            <p className="doctor-hint">
              💡 您可以在下方查看所有病例记录，点击病例卡片可查看完整治疗时间线和工作长度详情。
            </p>
          </section>
        )}

        {currentRole === "助理" && (
          <section className="panel assistant-panel">
            <div className="section-heading">
              <div>
                <p className="section-eyebrow-assistant">助理工作台</p>
                <h2>病例录入</h2>
              </div>
              <span className="role-badge" style={{ backgroundColor: roleColors["助理"] }}>
                助理视图
              </span>
            </div>
            <div className="form-grid">
              <label>
                <span>牙位 <span className="required">*</span></span>
                <input
                  placeholder="例如：#36、#11"
                  value={formData.toothPosition}
                  onChange={(e) => handleInputChange("toothPosition", e.target.value)}
                  className={errors.toothPosition ? "input-error" : ""}
                />
                {errors.toothPosition && <span className="error-text">{errors.toothPosition}</span>}
              </label>
              <label>
                <span>诊断 <span className="required">*</span></span>
                <input
                  placeholder="例如：慢性根尖周炎"
                  value={formData.diagnosis}
                  onChange={(e) => handleInputChange("diagnosis", e.target.value)}
                  className={errors.diagnosis ? "input-error" : ""}
                />
                {errors.diagnosis && <span className="error-text">{errors.diagnosis}</span>}
              </label>
              <label>
                <span>当前步骤 <span className="required">*</span></span>
                <select
                  value={formData.currentStep}
                  onChange={(e) => handleInputChange("currentStep", e.target.value)}
                  className={errors.currentStep ? "input-error" : ""}
                >
                  <option value="">请选择步骤</option>
                  {steps.map(step => (
                    <option key={step} value={step}>{step}</option>
                  ))}
                </select>
                {errors.currentStep && <span className="error-text">{errors.currentStep}</span>}
              </label>
              <label>
                <span>工作长度</span>
                <input
                  placeholder="例如：MB 19.5mm"
                  value={formData.workingLength}
                  onChange={(e) => handleInputChange("workingLength", e.target.value)}
                />
              </label>
              <label>
                <span>主尖锉号</span>
                <input
                  placeholder="例如：#30"
                  value={formData.mainFileNumber}
                  onChange={(e) => handleInputChange("mainFileNumber", e.target.value)}
                />
              </label>
              <label>
                <span>封药情况</span>
                <input
                  placeholder="例如：Ca(OH)2"
                  value={formData.medication}
                  onChange={(e) => handleInputChange("medication", e.target.value)}
                />
              </label>
              <label>
                <span>复诊日期</span>
                <input
                  type="date"
                  value={formData.followUpDate}
                  onChange={(e) => handleInputChange("followUpDate", e.target.value)}
                />
              </label>
              <label>
                <span>负责医生</span>
                <input
                  placeholder="例如：张医生"
                  value={formData.followUpDoctor}
                  onChange={(e) => handleInputChange("followUpDoctor", e.target.value)}
                />
              </label>
              <label>
                <span>复诊原因</span>
                <input
                  placeholder="例如：封药到期换药"
                  value={formData.followUpReason}
                  onChange={(e) => handleInputChange("followUpReason", e.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <span>复诊提醒</span>
                <div className="toggle-wrapper">
                  <input
                    type="checkbox"
                    checked={formData.followUpReminder}
                    onChange={(e) => setFormData(prev => ({ ...prev, followUpReminder: e.target.checked }))}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text">{formData.followUpReminder ? "已开启" : "已关闭"}</span>
                </div>
              </label>
              <label className="full-width">
                <span>备注</span>
                <textarea
                  placeholder="其他需要记录的信息"
                  value={formData.remark}
                  onChange={(e) => handleInputChange("remark", e.target.value)}
                  rows={3}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" onClick={handleClear} className="secondary-action">清空</button>
              <button
                type="button"
                onClick={handleSubmit}
                className="primary-action"
                style={{ backgroundColor: roleColors["助理"], borderColor: roleColors["助理"] }}
              >
                提交病例
              </button>
            </div>
            <p className="assistant-hint">
              💡 您还可以在下方「工作长度录入」区域详细记录各根管的测量数据和材料使用情况。
            </p>
          </section>
        )}

        {currentRole === "前台" && (
          <section className="panel reception-panel">
            <div className="section-heading">
              <div>
                <p className="section-eyebrow-reception">前台工作台</p>
                <h2>复诊协调</h2>
              </div>
              <span className="role-badge" style={{ backgroundColor: roleColors["前台"] }}>
                前台视图
              </span>
            </div>
            <div className="reception-stats">
              <div className="reception-stat" style={{ borderColor: contactStatusColors["待联系"] }}>
                <strong style={{ color: contactStatusColors["待联系"] }}>
                  {followUpPlans.filter(p => p.contactStatus === "待联系").length}
                </strong>
                <span>待联系</span>
              </div>
              <div className="reception-stat" style={{ borderColor: contactStatusColors["已联系"] }}>
                <strong style={{ color: contactStatusColors["已联系"] }}>
                  {followUpPlans.filter(p => p.contactStatus === "已联系").length}
                </strong>
                <span>已联系</span>
              </div>
              <div className="reception-stat" style={{ borderColor: contactStatusColors["已确认"] }}>
                <strong style={{ color: contactStatusColors["已确认"] }}>
                  {followUpPlans.filter(p => p.contactStatus === "已确认").length}
                </strong>
                <span>已确认</span>
              </div>
              <div className="reception-stat" style={{ borderColor: contactStatusColors["未接通"] }}>
                <strong style={{ color: contactStatusColors["未接通"] }}>
                  {followUpPlans.filter(p => p.contactStatus === "未接通").length}
                </strong>
                <span>未接通</span>
              </div>
            </div>
            <p className="reception-hint">
              💡 您可以在下方「复诊计划」区域管理所有复诊安排，更新联系状态和患者信息。点击「批量联系」可按逾期、3天内、待联系快速筛选并批量更新。
            </p>
          </section>
        )}
      </section>

      {currentRole !== "前台" && (
        <section className="records panel">
          <div className="section-heading">
            <div>
              <p>{activeStage ? `${activeStage}阶段` : "全部病例"}</p>
              <h2>
                {currentRole === "医生" ? "病例进展" : activeStage ? `${activeStage}病例` : "近期记录"}
                <span className="record-total">共 {filteredRecords.length} 条</span>
              </h2>
            </div>
            <button
              className="export-btn"
              onClick={() => setShowExportModal(true)}
            >
              导出摘要
            </button>
          </div>
        <div className="record-list">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record: string[], index: number) => {
              const caseId = record[0];
              const toothPosition = record[1];
              const caseInfo = findCaseInfoById(caseId);
              const wlRecord = findWorkingLength(toothPosition);
              const confirmedCount = wlRecord
                ? wlRecord.entries.filter(e => e.confirmedStatus === "已确认").length
                : 0;
              const timeline = findTimeline(toothPosition);
              const currentStepIdx = timeline ? getCurrentStepIndex(timeline.nodes) : -1;
              const casePendingChanges = changeQueue.filter(c => c.caseId === caseId && c.syncStatus === "pending").length;
              const caseConflicts = conflicts.filter(c => c.caseId === caseId && !c.resolved).length;
              const caseSyncedChanges = changeQueue.filter(c => c.caseId === caseId && c.syncStatus === "synced").length;
              return (
                <article key={caseId + index} className="record-card" onClick={() => openDetailModal(caseId, activeStage ? "stage" : "list")}>
                  <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="record-content">
                    <div className="record-header">
                      <h3>
                        {toothPosition}
                        {caseInfo?.patientName && (
                          <span className="record-patient-name">{caseInfo.patientName}</span>
                        )}
                      </h3>
                      <div className="record-header-right">
                        <span
                          className="stage-badge"
                          style={{ backgroundColor: stageColors[record[3]] }}
                        >
                          {record[3]}
                        </span>
                        {(casePendingChanges > 0 || caseConflicts > 0) && (
                          <span className={`record-sync-badge ${caseConflicts > 0 ? "record-sync-badge--conflict" : "record-sync-badge--pending"}`}>
                            {caseConflicts > 0 ? `${caseConflicts} 冲突` : `${casePendingChanges} 待同步`}
                          </span>
                        )}
                      </div>
                    </div>
                    <p>{[record[2], record[4]].filter(Boolean).join(" · ")}</p>
                    {timeline && (
                      <div className="timeline-progress">
                        <div className="timeline-progress-track">
                          {timeline.nodes.map((node, idx) => (
                            <React.Fragment key={node.id}>
                              <div
                                className={`timeline-progress-dot ${
                                  idx < currentStepIdx
                                    ? "timeline-progress-dot--done"
                                    : idx === currentStepIdx
                                    ? "timeline-progress-dot--current"
                                    : "timeline-progress-dot--pending"
                                }`}
                                style={{
                                  "--stage-color":
                                    idx < currentStepIdx || idx === currentStepIdx
                                      ? stageColors[node.step]
                                      : undefined,
                                } as React.CSSProperties}
                                title={`${node.step}${node.isCompleted ? " (已完成)" : ""}`}
                              />
                              {idx < timeline.nodes.length - 1 && (
                                <div
                                  className={`timeline-progress-line ${
                                    idx < currentStepIdx
                                      ? "timeline-progress-line--done"
                                      : "timeline-progress-line--pending"
                                  }`}
                                  style={{
                                    "--stage-color":
                                      idx < currentStepIdx
                                        ? stageColors[node.step]
                                        : undefined,
                                  } as React.CSSProperties}
                                />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="timeline-progress-labels">
                          {timeline.nodes.map((node, idx) => (
                            <span
                              key={node.id}
                              className={`timeline-progress-label ${
                                idx === currentStepIdx
                                  ? "timeline-progress-label--active"
                                  : ""
                              }`}
                            >
                              {node.step}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {wlRecord && wlRecord.entries.length > 0 && (
                      <div className="wl-summary">
                        <span className="wl-summary-label">
                          工作长度<span className="wl-count">{wlRecord.entries.length}根管</span>
                        </span>
                        <div className="wl-summary-chips">
                          {wlRecord.entries.map(entry => (
                            <span
                              key={entry.id}
                              className="wl-chip"
                              style={{ borderColor: confirmedStatusColors[entry.confirmedStatus] }}
                              title={`${entry.referenceApex} · ${entry.measurementMethod}${entry.isSupplementary ? " · 遗漏根管补录" : ""}`}
                            >
                              <span className="wl-chip-name">{entry.canalName}</span>
                              <span className="wl-chip-length">
                                {entry.measuredLength ? `${entry.measuredLength}mm` : "未填"}
                              </span>
                              <span
                                className="wl-chip-status"
                                style={{ color: confirmedStatusColors[entry.confirmedStatus] }}
                              >
                                {entry.confirmedStatus === "已确认" ? "✓"
                                  : entry.confirmedStatus === "需重测" ? "↻"
                                  : "…"}
                              </span>
                              {entry.isSupplementary && <span className="wl-chip-supplement">补</span>}
                            </span>
                          ))}
                        </div>
                        <span className="wl-summary-meta">
                          已确认 {confirmedCount}/{wlRecord.entries.length}
                          {wlRecord.entries.some(e => e.isSupplementary) ? " · 含补录根管" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <p>该阶段暂无病例记录</p>
            </div>
          )}
        </div>
        </section>
      )}

      {currentRole !== "前台" && (
        <section className="wl-section panel">
        <div className="section-heading">
          <div>
            <p>根管工作长度管理</p>
            <h2>
              工作长度录入
              <span className="record-total">
                共 {canalStats.teeth} 牙位 · {canalStats.canals} 根管
              </span>
            </h2>
          </div>
        </div>

        <div className="wl-stats">
          <div className="wl-stat">
            <strong>{canalStats.teeth}</strong>
            <span>覆盖牙位</span>
          </div>
          <div className="wl-stat wl-stat--confirmed">
            <strong>{canalStats.confirmed}/{canalStats.canals}</strong>
            <span>已确认根管</span>
          </div>
          <div className="wl-stat wl-stat--supplement">
            <strong>{canalStats.supplementary}</strong>
            <span>遗漏根管补录</span>
          </div>
        </div>

        <datalist id="canalNameSuggestions">
          {canalNameSuggestions.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="wl-form">
          <div className="wl-form-header">
            <div className="wl-tooth-row">
              <label className="wl-tooth-input">
                <span>牙位 <span className="required">*</span></span>
                <input
                  placeholder="例如：#36"
                  value={canalDraft.toothPosition}
                  onChange={(e) => handleCanalDraftChange("toothPosition", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary-action wl-select-case-btn"
                onClick={() => {
                  setCaseSelectSearch("");
                  setShowCaseSelectModal(true);
                }}
              >
                📋 选择病例
              </button>
            </div>
            <span className="wl-form-hint">
              支持单根管、多根管及遗漏根管补录，同一牙位可录入多条根管明细
            </span>
            {canalDraft.toothPosition && findCaseInfoByTooth(canalDraft.toothPosition.trim()) && (
              <div className="wl-case-info">
                <div className="wl-case-info-item">
                  <span className="wl-case-info-label">患者</span>
                  <span className="wl-case-info-value">
                    {findCaseInfoByTooth(canalDraft.toothPosition.trim())?.patientName}
                  </span>
                </div>
                <div className="wl-case-info-item">
                  <span className="wl-case-info-label">诊断</span>
                  <span className="wl-case-info-value">
                    {findCaseInfoByTooth(canalDraft.toothPosition.trim())?.diagnosis}
                  </span>
                </div>
                <div className="wl-case-info-item">
                  <span className="wl-case-info-label">当前步骤</span>
                  <span
                    className="wl-case-info-badge"
                    style={{
                      backgroundColor: stageColors[findCaseInfoByTooth(canalDraft.toothPosition.trim())?.currentStep || "开髓"],
                    }}
                  >
                    {findCaseInfoByTooth(canalDraft.toothPosition.trim())?.currentStep}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="wl-entry-header">
            <h3>根管明细</h3>
            <button type="button" className="secondary-action wl-add-btn" onClick={addCanalEntry}>
              + 添加根管
            </button>
          </div>

          <div className="wl-entry-list">
            {canalDraft.entries.length > 0 ? (
              canalDraft.entries.map((entry, entryIndex) => (
                <div key={entry.id} className="wl-entry-row">
                  <div className="wl-entry-index">{entryIndex + 1}</div>
                  <div className="wl-entry-fields">
                    <label>
                      <span>根管名称</span>
                      <input
                        list="canalNameSuggestions"
                        placeholder="例如：MB"
                        value={entry.canalName}
                        onChange={(e) => updateCanalEntry(entry.id, "canalName", e.target.value)}
                      />
                    </label>
                    <label>
                      <span>测量长度(mm)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="19.5"
                        value={entry.measuredLength}
                        onChange={(e) => updateCanalEntry(entry.id, "measuredLength", e.target.value)}
                      />
                    </label>
                    <label>
                      <span>参考尖点</span>
                      <select
                        value={entry.referenceApex}
                        onChange={(e) => updateCanalEntry(entry.id, "referenceApex", e.target.value)}
                      >
                        {referenceApexOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>测长方式</span>
                      <select
                        value={entry.measurementMethod}
                        onChange={(e) => updateCanalEntry(entry.id, "measurementMethod", e.target.value)}
                      >
                        {measurementMethodOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>确认状态</span>
                      <select
                        value={entry.confirmedStatus}
                        onChange={(e) => updateCanalEntry(entry.id, "confirmedStatus", e.target.value)}
                      >
                        {confirmedStatusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                    <label className="wl-supplement-label">
                      <span>遗漏根管补录</span>
                      <div className="toggle-wrapper">
                        <input
                          type="checkbox"
                          className="toggle-checkbox"
                          checked={entry.isSupplementary}
                          onChange={() => toggleCanalSupplementary(entry.id)}
                        />
                        <span className="toggle-track">
                          <span className="toggle-thumb" />
                        </span>
                        <span className="toggle-text">
                          {entry.isSupplementary ? "已标记补录" : "常规根管"}
                        </span>
                      </div>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="wl-entry-remove"
                    onClick={() => removeCanalEntry(entry.id)}
                    title="删除该根管"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="wl-entry-empty">
                <p>暂无根管明细，点击「添加根管」开始录入（支持单根管或多根管）</p>
              </div>
            )}
          </div>

          <label className="wl-note-label full-width">
            <span>备注</span>
            <textarea
              placeholder="例如：MB2为遗漏根管补录，电测法与X线片复核"
              value={canalDraft.note}
              onChange={(e) => handleCanalDraftChange("note", e.target.value)}
              rows={2}
            />
          </label>

          {canalDraftError && <p className="error-text wl-form-error">{canalDraftError}</p>}

          <div className="form-actions wl-form-actions">
            {canalDraft.editingId && (
              <span className="wl-editing-tag">正在编辑：{canalDraft.toothPosition}</span>
            )}
            <button type="button" className="secondary-action" onClick={resetCanalDraft}>
              取消
            </button>
            <button type="button" className="primary-action" onClick={saveCanalDraft}>
              {canalDraft.editingId ? "更新工作长度" : "保存工作长度"}
            </button>
          </div>
        </div>

        <div className="wl-saved-header">
          <h3>已保存的工作长度记录</h3>
        </div>
        <div className="wl-saved-list">
          {workingLengths.length > 0 ? (
            workingLengths.map(wl => {
              const confirmed = wl.entries.filter(e => e.confirmedStatus === "已确认").length;
              return (
                <article key={wl.id} className="wl-saved-card">
                  <div className="wl-saved-top">
                    <div className="wl-saved-title">
                      <h4>{wl.toothPosition}</h4>
                      <span className="wl-saved-count">{wl.entries.length}根管</span>
                      <span className="wl-saved-confirmed">
                        已确认 {confirmed}/{wl.entries.length}
                      </span>
                      {wl.entries.some(e => e.isSupplementary) && (
                        <span className="wl-saved-supplement">含补录</span>
                      )}
                    </div>
                    <div className="wl-saved-actions">
                      <button
                        type="button"
                        className="secondary-action wl-action-btn"
                        onClick={() => loadWorkingLengthForEdit(wl)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="secondary-action wl-action-btn wl-action-remove"
                        onClick={() => deleteWorkingLength(wl.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="wl-saved-chips">
                    {wl.entries.map(entry => (
                      <span
                        key={entry.id}
                        className="wl-saved-chip"
                        style={{ borderColor: confirmedStatusColors[entry.confirmedStatus] }}
                        title={`${entry.referenceApex} · ${entry.measurementMethod}${entry.isSupplementary ? " · 遗漏根管补录" : ""}`}
                      >
                        <span className="wl-chip-name">{entry.canalName || "未命名"}</span>
                        <span className="wl-chip-length">
                          {entry.measuredLength ? `${entry.measuredLength}mm` : "未填"}
                        </span>
                        <span
                          className="wl-chip-status"
                          style={{ color: confirmedStatusColors[entry.confirmedStatus] }}
                        >
                          {entry.confirmedStatus === "已确认" ? "✓"
                            : entry.confirmedStatus === "需重测" ? "↻"
                            : "…"}
                        </span>
                        {entry.isSupplementary && <span className="wl-chip-supplement">补</span>}
                      </span>
                    ))}
                  </div>
                  {wl.note && <p className="wl-saved-note">{wl.note}</p>}
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <p>暂无工作长度记录，请在上方录入根管明细后保存</p>
            </div>
          )}
        </div>
        </section>
      )}

      <section className={`followup-section panel ${currentRole === "前台" ? "followup-section--reception" : ""}`}>
        <div className="section-heading">
          <div>
            <p>{currentRole === "前台" ? "复诊协调管理" : "复诊管理"}</p>
            <h2>
              {currentRole === "前台" ? "复诊计划与联系状态" : "复诊计划"}
              <span className="record-total">
                共 {currentRole === "前台" ? sortedAndFilteredPlans.length : followUpPlans.length} 条
              </span>
            </h2>
          </div>
          <div className="followup-actions">
            {currentRole === "前台" && (
              <button
                className={`primary-action batch-toggle-btn ${showBatchPanel ? "batch-toggle-btn--active" : ""}`}
                onClick={() => {
                  setShowBatchPanel(prev => !prev);
                  if (!showBatchPanel) {
                    setBatchSelectedIds(new Set());
                  }
                }}
              >
                {showBatchPanel ? "关闭批量" : "批量联系"}
              </button>
            )}
            <button
              className="secondary-action sort-btn"
              onClick={() => setSortAsc(prev => !prev)}
            >
              {sortAsc ? "日期升序 ↑" : "日期降序 ↓"}
            </button>
          </div>
        </div>
        <div className="followup-summary">
          <div className="followup-stat followup-stat--overdue">
            <strong>{followUpPlans.filter(p => getDaysUntil(p.nextDate) < 0).length}</strong>
            <span>已逾期</span>
          </div>
          <div className="followup-stat followup-stat--urgent">
            <strong>{followUpPlans.filter(p => { const d = getDaysUntil(p.nextDate); return d >= 0 && d <= 3; }).length}</strong>
            <span>3天内</span>
          </div>
          <div className="followup-stat followup-stat--upcoming">
            <strong>{followUpPlans.filter(p => getDaysUntil(p.nextDate) > 3).length}</strong>
            <span>后续</span>
          </div>
        </div>
        {currentRole === "前台" && showBatchPanel && (
          <div className="batch-panel">
            <div className="batch-panel-header">
              <h3>批量联系工作流</h3>
              <span className="batch-panel-hint">按条件筛选候选复诊计划，勾选后批量更新联系状态与备注</span>
            </div>
            <div className="batch-filter-bar">
              <span className="batch-filter-label">筛选条件：</span>
              <div className="batch-filter-chips">
                {([
                  { key: "overdue" as const, label: "逾期", icon: "🔴" },
                  { key: "within3days" as const, label: "3天内", icon: "🟠" },
                  { key: "pending" as const, label: "待联系", icon: "🔵" },
                ]).map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className={`batch-filter-chip ${batchFilterType === item.key ? "batch-filter-chip--active" : ""}`}
                    onClick={() => {
                      setBatchFilterType(item.key);
                      setBatchSelectedIds(new Set());
                    }}
                  >
                    {item.icon} {item.label}
                    <span className="batch-filter-count">
                      {followUpPlans.filter(p => {
                        const days = getDaysUntil(p.nextDate);
                        if (item.key === "overdue") return days < 0;
                        if (item.key === "within3days") return days >= 0 && days <= 3;
                        return p.contactStatus === "待联系";
                      }).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="batch-toolbar">
              <div className="batch-toolbar-left">
                <button type="button" className="secondary-action batch-toolbar-btn" onClick={selectAllBatchCandidates}>
                  全选
                </button>
                <button type="button" className="secondary-action batch-toolbar-btn" onClick={clearBatchSelection}>
                  清空
                </button>
                <span className="batch-selected-count">
                  已选 {batchSelectedIds.size} 条
                </span>
              </div>
              <div className="batch-toolbar-right">
                <label className="batch-status-label">
                  目标状态：
                  <select
                    className="contact-status-select"
                    value={batchTargetStatus}
                    onChange={(e) => setBatchTargetStatus(e.target.value as ContactStatus)}
                    style={{ borderColor: contactStatusColors[batchTargetStatus] }}
                  >
                    {contactStatusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  className="batch-note-input"
                  placeholder="备注模板（可选，如：已电话通知复诊）"
                  value={batchNoteTemplate}
                  onChange={(e) => setBatchNoteTemplate(e.target.value)}
                />
                <button
                  type="button"
                  className="primary-action batch-execute-btn"
                  disabled={batchSelectedIds.size === 0}
                  onClick={() => setBatchConfirmOpen(true)}
                >
                  批量更新 ({batchSelectedIds.size})
                </button>
              </div>
            </div>
            {getCancelledCount() > 0 && batchTargetStatus === "已确认" && (
              <div className="batch-warning">
                ⚠️ 已取消的计划不能批量改为已确认，将自动跳过（共 {getCancelledCount()} 条）
              </div>
            )}
            <div className="batch-candidate-list">
              {(() => {
                const candidates = getBatchCandidates();
                if (candidates.length === 0) {
                  return (
                    <div className="empty-state">
                      <p>当前筛选条件下无候选复诊计划</p>
                    </div>
                  );
                }
                return candidates.map(plan => {
                  const days = getDaysUntil(plan.nextDate);
                  const isSelected = batchSelectedIds.has(plan.id);
                  const isCancelled = plan.contactStatus === "已取消";
                  return (
                    <label
                      key={plan.id}
                      className={`batch-candidate-item ${isSelected ? "batch-candidate-item--selected" : ""} ${isCancelled ? "batch-candidate-item--cancelled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleBatchSelect(plan.id)}
                      />
                      <div className="batch-candidate-body">
                        <div className="batch-candidate-main">
                          <strong>{plan.toothPosition}</strong>
                          <span className="batch-candidate-patient">{plan.patientName || "未命名"}</span>
                          <span
                            className="contact-status-badge"
                            style={{
                              backgroundColor: contactStatusColors[plan.contactStatus] + "15",
                              color: contactStatusColors[plan.contactStatus],
                              borderColor: contactStatusColors[plan.contactStatus],
                              fontSize: "11px",
                              padding: "2px 8px",
                            }}
                          >
                            {plan.contactStatus}
                          </span>
                          <span className={`urgency-badge ${
                            days < 0
                              ? "urgency-badge--overdue"
                              : days <= 3
                              ? "urgency-badge--urgent"
                              : "urgency-badge--upcoming"
                          }`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                            {days < 0 ? `逾期${Math.abs(days)}天` : days === 0 ? "今日" : `${days}天后`}
                          </span>
                        </div>
                        <div className="batch-candidate-sub">
                          <span>复诊：{plan.nextDate}</span>
                          <span>医生：{plan.doctor}</span>
                          <span>{plan.reason}</span>
                        </div>
                        {isCancelled && batchTargetStatus === "已确认" && (
                          <span className="batch-cancelled-hint">已取消，不可改为已确认</span>
                        )}
                      </div>
                    </label>
                  );
                });
              })()}
            </div>
          </div>
        )}
        <div className="followup-kanban">
          {(currentRole === "前台" ? sortedAndFilteredPlans : sortedPlans).length > 0 ? (
            (currentRole === "前台" ? sortedAndFilteredPlans : sortedPlans).map((plan) => {
              const daysUntil = getDaysUntil(plan.nextDate);
              let urgencyClass = "";
              if (daysUntil < 0) urgencyClass = "followup-card--overdue";
              else if (daysUntil <= 3) urgencyClass = "followup-card--urgent";
              else urgencyClass = "followup-card--normal";

              return (
                <article key={plan.id} className={`followup-card ${urgencyClass} ${currentRole === "前台" ? "followup-card--reception" : ""}`}>
                  <div
                    className="followup-card-header followup-card-header--clickable"
                    onClick={() => plan.caseId && openDetailModal(plan.caseId, "followup")}
                  >
                    <div>
                      <h3>
                        {plan.toothPosition}
                        <span className="followup-view-case">查看病例 →</span>
                      </h3>
                      {plan.patientName && (
                        <span className="followup-patient">{plan.patientName}</span>
                      )}
                    </div>
                    <div className="followup-badges">
                      {daysUntil < 0 && (
                        <span className="urgency-badge urgency-badge--overdue">
                          逾期{Math.abs(daysUntil)}天
                        </span>
                      )}
                      {daysUntil >= 0 && daysUntil <= 3 && (
                        <span className="urgency-badge urgency-badge--urgent">
                          {daysUntil === 0 ? "今日复诊" : `${daysUntil}天后`}
                        </span>
                      )}
                      {daysUntil > 3 && (
                        <span className="urgency-badge urgency-badge--upcoming">
                          {daysUntil}天后
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="followup-card-body">
                    <div className="followup-detail">
                      <span className="followup-label">复诊日期</span>
                      <span className="followup-value">{plan.nextDate}</span>
                    </div>
                    <div className="followup-detail">
                      <span className="followup-label">负责医生</span>
                      <span className="followup-value">{plan.doctor}</span>
                    </div>
                    <div className="followup-detail full-width">
                      <span className="followup-label">复诊原因</span>
                      <span className="followup-value">{plan.reason}</span>
                    </div>
                    {currentRole !== "前台" && (
                      <div className="followup-detail">
                        <span className="followup-label">提醒状态</span>
                        <span className={`followup-value ${plan.reminderEnabled ? "reminder-on" : "reminder-off"}`}>
                          {plan.reminderEnabled ? "🔔 已开启" : "🔕 已关闭"}
                        </span>
                      </div>
                    )}
                    {currentRole === "前台" && (
                      <>
                        <div className="followup-detail">
                          <span className="followup-label">联系电话</span>
                          <span className="followup-value">{plan.phone || "未填写"}</span>
                        </div>
                        <div className="followup-detail full-width">
                          <span className="followup-label">联系状态</span>
                          <span
                            className="contact-status-badge"
                            style={{
                              backgroundColor: contactStatusColors[plan.contactStatus] + "15",
                              color: contactStatusColors[plan.contactStatus],
                              borderColor: contactStatusColors[plan.contactStatus],
                            }}
                          >
                            {plan.contactStatus}
                          </span>
                        </div>
                        {plan.contactNote && (
                          <div className="followup-detail full-width">
                            <span className="followup-label">联系备注</span>
                            <span className="followup-value followup-note">{plan.contactNote}</span>
                          </div>
                        )}
                        <div className="followup-card-actions">
                          <button
                            type="button"
                            className="primary-action confirm-arrival-btn"
                            onClick={() => markConfirmedArrival(plan.id)}
                          >
                            已确认今日到诊
                          </button>
                          <select
                            className="contact-status-select"
                            value={plan.contactStatus}
                            onChange={(e) => updateContactStatus(plan.id, e.target.value as ContactStatus)}
                            style={{ borderColor: contactStatusColors[plan.contactStatus] }}
                          >
                            {contactStatusOptions.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="secondary-action followup-edit-btn"
                            onClick={() => openFollowUpEdit(plan)}
                          >
                            编辑详情
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <p>暂无复诊计划</p>
            </div>
          )}
        </div>
      </section>

      {showDetailModal && selectedToothPosition && selectedCaseId && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal-content modal-content--case-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--case">
              <div>
                <p className="modal-eyebrow">病例详情 · ID: {selectedCaseId}</p>
                <h2 className="modal-title">
                  {selectedToothPosition}
                  {findCaseInfoById(selectedCaseId)?.patientName && (
                    <span className="modal-title-sub">
                      {findCaseInfoById(selectedCaseId)?.patientName}
                    </span>
                  )}
                  <span
                    className="stage-badge modal-stage-badge"
                    style={{
                      backgroundColor: stageColors[findCaseInfoById(selectedCaseId)?.currentStep || findRecordByCaseId(selectedCaseId)?.[3] || "开髓"],
                    }}
                  >
                    {findCaseInfoById(selectedCaseId)?.currentStep || findRecordByCaseId(selectedCaseId)?.[3] || "-"}
                  </span>
                </h2>
              </div>
              <button className="modal-close" onClick={closeDetailModal}>×</button>
            </div>

            <div className="case-tabs">
              {([
                { key: "summary", label: "临床摘要", icon: "📊" },
                { key: "basic", label: "基础信息", icon: "📋" },
                { key: "canal", label: "根管参数", icon: "🦷" },
                { key: "timeline", label: "治疗时间线", icon: "📅" },
                { key: "followup", label: "复诊计划", icon: "🔔" },
                { key: "logs", label: "操作记录", icon: "📝" },
              ] as { key: CaseDetailTab; label: string; icon: string }[]).map(tab => (
                <button
                  key={tab.key}
                  className={`case-tab ${activeCaseTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveCaseTab(tab.key)}
                >
                  <span className="case-tab-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="case-tab-content">
              {activeCaseTab === "summary" && (() => {
                const caseInfo = findCaseInfoById(selectedCaseId);
                const record = findRecordByCaseId(selectedCaseId);
                const wlRecord = findWorkingLength(selectedToothPosition) || findWorkingLengthByCaseId(selectedCaseId);
                const timeline = findTimeline(selectedToothPosition);
                const followUp = findFollowUpByCaseId(selectedCaseId);
                const caseConflicts = conflicts.filter(c => c.caseId === selectedCaseId && !c.resolved);

                const diagnosis = caseInfo?.diagnosis || record?.[2] || "-";
                const currentStep = caseInfo?.currentStep || record?.[3] || "开髓";
                const medication = caseInfo?.medication || "-";

                const completedSteps = timeline ? timeline.nodes.filter(n => n.isCompleted).length : 0;
                const totalSteps = timeline?.nodes.length || 6;
                const currentStepIdx = timeline ? getCurrentStepIndex(timeline.nodes) : 0;

                const confirmedCanals = wlRecord ? wlRecord.entries.filter(e => e.confirmedStatus === "已确认") : [];
                const retestCanals = wlRecord ? wlRecord.entries.filter(e => e.confirmedStatus === "需重测") : [];

                const nextFollowUpDate = followUp?.nextDate || "-";
                const followUpDoctor = followUp?.doctor || "-";
                const followUpReason = followUp?.reason || "-";
                const daysUntil = followUp ? getDaysUntil(followUp.nextDate) : null;

                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>临床摘要</h3>
                    </div>

                    <div className="summary-grid">
                      <div className="summary-card summary-card--primary">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">🏥</span>
                          <h4>诊断</h4>
                        </div>
                        <p className="summary-card-value">{diagnosis}</p>
                      </div>

                      <div className="summary-card">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">📈</span>
                          <h4>治疗进度</h4>
                        </div>
                        <div className="summary-progress">
                          <div className="summary-progress-bar">
                            <div
                              className="summary-progress-fill"
                              style={{
                                width: `${(completedSteps / totalSteps) * 100}%`,
                                backgroundColor: stageColors[currentStep as TreatmentStep] || stageColors["开髓"],
                              }}
                            />
                          </div>
                          <div className="summary-progress-info">
                            <span className="summary-progress-text">
                              已完成 {completedSteps}/{totalSteps} 步
                            </span>
                            <span
                              className="summary-progress-step"
                              style={{
                                backgroundColor: (stageColors[currentStep as TreatmentStep] || stageColors["开髓"]) + "15",
                                color: stageColors[currentStep as TreatmentStep] || stageColors["开髓"],
                              }}
                            >
                              当前：{currentStep}
                            </span>
                          </div>
                          <div className="summary-progress-track">
                            {timeline?.nodes.map((node, idx) => (
                              <div
                                key={node.id}
                                className={`summary-progress-dot ${
                                  idx < currentStepIdx
                                    ? "summary-progress-dot--done"
                                    : idx === currentStepIdx
                                    ? "summary-progress-dot--current"
                                    : "summary-progress-dot--pending"
                                }`}
                                style={{
                                  "--stage-color":
                                    idx < currentStepIdx || idx === currentStepIdx
                                      ? stageColors[node.step]
                                      : undefined,
                                } as React.CSSProperties}
                                title={node.step}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="summary-card">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">✅</span>
                          <h4>已确认根管</h4>
                        </div>
                        {confirmedCanals.length > 0 ? (
                          <div className="summary-canal-list">
                            {confirmedCanals.map(canal => (
                              <span key={canal.id} className="summary-canal-chip summary-canal-chip--confirmed">
                                <span className="summary-canal-name">{canal.canalName}</span>
                                <span className="summary-canal-length">{canal.measuredLength}mm</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="summary-card-empty">暂无已确认根管</p>
                        )}
                      </div>

                      <div className="summary-card summary-card--warning">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">⚠️</span>
                          <h4>需重测根管</h4>
                        </div>
                        {retestCanals.length > 0 ? (
                          <div className="summary-canal-list">
                            {retestCanals.map(canal => (
                              <span key={canal.id} className="summary-canal-chip summary-canal-chip--retest">
                                <span className="summary-canal-name">{canal.canalName}</span>
                                <span className="summary-canal-length">{canal.measuredLength || "待测量"}mm</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="summary-card-empty">无需重测根管</p>
                        )}
                      </div>

                      <div className="summary-card">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">💊</span>
                          <h4>封药情况</h4>
                        </div>
                        <p className="summary-card-value">{medication}</p>
                      </div>

                      <div className="summary-card summary-card--accent">
                        <div className="summary-card-header">
                          <span className="summary-card-icon">📅</span>
                          <h4>下一次复诊</h4>
                        </div>
                        {followUp ? (
                          <div className="summary-followup">
                            <div className="summary-followup-date">
                              <strong>{nextFollowUpDate}</strong>
                              {daysUntil !== null && (
                                <span className={`summary-followup-days ${
                                  daysUntil < 0
                                    ? "summary-followup-days--overdue"
                                    : daysUntil <= 3
                                    ? "summary-followup-days--urgent"
                                    : ""
                                }`}>
                                  {daysUntil < 0
                                    ? `逾期${Math.abs(daysUntil)}天`
                                    : daysUntil === 0
                                    ? "今日"
                                    : `${daysUntil}天后`}
                                </span>
                              )}
                            </div>
                            <p className="summary-followup-detail">
                              医生：{followUpDoctor} · {followUpReason}
                            </p>
                            {followUp.contactStatus && (
                              <span
                                className="summary-followup-status"
                                style={{
                                  backgroundColor: contactStatusColors[followUp.contactStatus] + "15",
                                  color: contactStatusColors[followUp.contactStatus],
                                  borderColor: contactStatusColors[followUp.contactStatus],
                                }}
                              >
                                {followUp.contactStatus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="summary-card-empty">暂无复诊计划</p>
                        )}
                      </div>

                      {caseConflicts.length > 0 && (
                        <div className="summary-card summary-card--conflict full-width">
                          <div className="summary-card-header">
                            <span className="summary-card-icon">🚨</span>
                            <h4>未解决冲突 ({caseConflicts.length})</h4>
                          </div>
                          <div className="summary-conflict-list">
                            {caseConflicts.map(conflict => {
                              const textField = isTextField(conflict.field);
                              const mergedVal = getMergedValue(conflict.id, "local");
                              return (
                                <div key={conflict.id} className={`summary-conflict-item ${textField ? "summary-conflict-item--text" : ""}`}>
                                  <div className="summary-conflict-field">
                                    {getFieldLabel(conflict.field)}
                                    <span className={`conflict-field-type ${textField ? "conflict-field-type--text" : "conflict-field-type--enum"}`}>
                                      {textField ? "可编辑合并" : "二选一"}
                                    </span>
                                  </div>
                                  {textField ? (
                                    <>
                                      <div className="summary-conflict-compare">
                                        <div className="summary-conflict-version summary-conflict-version--local">
                                          <span className="summary-conflict-role" style={{ color: roleColors[conflict.localChangedBy] }}>
                                            {conflict.localChangedBy}（本地）
                                          </span>
                                          <span className="summary-conflict-value">{conflict.localValue || "(空)"}</span>
                                        </div>
                                        <span className="summary-conflict-arrow">↔</span>
                                        <div className="summary-conflict-version summary-conflict-version--remote">
                                          <span className="summary-conflict-role" style={{ color: roleColors[conflict.remoteChangedBy] }}>
                                            {conflict.remoteChangedBy}（远端）
                                          </span>
                                          <span className="summary-conflict-value">{conflict.remoteValue || "(空)"}</span>
                                        </div>
                                      </div>
                                      <div className="summary-conflict-merge">
                                        <div className="summary-conflict-merge-header">
                                          <span>合并结果（可编辑）</span>
                                          <div className="summary-conflict-merge-quick">
                                            <button
                                              type="button"
                                              className="summary-conflict-merge-quick-btn"
                                              onClick={() => setMergedValue(conflict.id, conflict.localValue)}
                                            >
                                              用本地值
                                            </button>
                                            <button
                                              type="button"
                                              className="summary-conflict-merge-quick-btn"
                                              onClick={() => setMergedValue(conflict.id, conflict.remoteValue)}
                                            >
                                              用远端值
                                            </button>
                                          </div>
                                        </div>
                                        <textarea
                                          className="summary-conflict-merge-textarea"
                                          value={mergedVal}
                                          onChange={(e) => setMergedValue(conflict.id, e.target.value)}
                                          rows={2}
                                        />
                                        <div className="summary-conflict-merge-actions">
                                          <button
                                            type="button"
                                            className="summary-conflict-btn summary-conflict-btn--merge"
                                            onClick={() => resolveConflict(conflict.id, { customValue: mergedVal })}
                                          >
                                            ✓ 确认合并
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="summary-conflict-compare">
                                        <div className="summary-conflict-version summary-conflict-version--local">
                                          <span className="summary-conflict-role" style={{ color: roleColors[conflict.localChangedBy] }}>
                                            {conflict.localChangedBy}（本地）
                                          </span>
                                          <span className="summary-conflict-value">{conflict.localValue || "(空)"}</span>
                                        </div>
                                        <span className="summary-conflict-arrow">↔</span>
                                        <div className="summary-conflict-version summary-conflict-version--remote">
                                          <span className="summary-conflict-role" style={{ color: roleColors[conflict.remoteChangedBy] }}>
                                            {conflict.remoteChangedBy}（远端）
                                          </span>
                                          <span className="summary-conflict-value">{conflict.remoteValue || "(空)"}</span>
                                        </div>
                                      </div>
                                      <div className="summary-conflict-actions">
                                        <button
                                          type="button"
                                          className="summary-conflict-btn summary-conflict-btn--local"
                                          onClick={() => resolveConflict(conflict.id, "local")}
                                        >
                                          保留本地
                                        </button>
                                        <button
                                          type="button"
                                          className="summary-conflict-btn summary-conflict-btn--remote"
                                          onClick={() => resolveConflict(conflict.id, "remote")}
                                        >
                                          保留远端
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {activeCaseTab === "basic" && (() => {
                const caseInfo = findCaseInfoById(selectedCaseId);
                const record = findRecordByCaseId(selectedCaseId);
                const displayInfo = basicInfoDraft || caseInfo;
                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>基础信息</h3>
                      {!isEditingBasicInfo && currentRole !== "前台" && (
                        <button
                          className="secondary-action"
                          onClick={startEditingBasicInfo}
                        >
                          编辑信息
                        </button>
                      )}
                    </div>
                    {isEditingBasicInfo && basicInfoDraft ? (
                      <div className="form-grid">
                        <label>
                          <span>牙位 <span className="required">*</span></span>
                          <input
                            value={basicInfoDraft.toothPosition}
                            onChange={(e) => updateBasicInfoDraft("toothPosition", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>患者姓名</span>
                          <input
                            placeholder="请输入患者姓名"
                            value={basicInfoDraft.patientName}
                            onChange={(e) => updateBasicInfoDraft("patientName", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>联系电话</span>
                          <input
                            placeholder="请输入联系电话"
                            value={basicInfoDraft.phone}
                            onChange={(e) => updateBasicInfoDraft("phone", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>诊断 <span className="required">*</span></span>
                          <input
                            value={basicInfoDraft.diagnosis}
                            onChange={(e) => updateBasicInfoDraft("diagnosis", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>当前步骤</span>
                          <select
                            value={basicInfoDraft.currentStep}
                            onChange={(e) => updateBasicInfoDraft("currentStep", e.target.value)}
                          >
                            {treatmentSteps.map(step => (
                              <option key={step} value={step}>{step}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>工作长度</span>
                          <input
                            placeholder="例如：MB 19.5mm"
                            value={basicInfoDraft.workingLength}
                            onChange={(e) => updateBasicInfoDraft("workingLength", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>主尖锉号</span>
                          <input
                            placeholder="例如：#30"
                            value={basicInfoDraft.mainFileNumber}
                            onChange={(e) => updateBasicInfoDraft("mainFileNumber", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>封药情况</span>
                          <input
                            placeholder="例如：Ca(OH)2"
                            value={basicInfoDraft.medication}
                            onChange={(e) => updateBasicInfoDraft("medication", e.target.value)}
                          />
                        </label>
                        <label className="full-width">
                          <span>备注</span>
                          <textarea
                            rows={3}
                            value={basicInfoDraft.remark}
                            onChange={(e) => updateBasicInfoDraft("remark", e.target.value)}
                          />
                        </label>
                        {basicInfoError && <p className="error-text">{basicInfoError}</p>}
                        <div className="form-actions">
                          <button type="button" className="secondary-action" onClick={cancelEditingBasicInfo}>
                            取消
                          </button>
                          <button type="button" className="primary-action" onClick={saveBasicInfo}>
                            保存修改
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="basic-info-grid">
                        {([
                          { label: "牙位", field: "toothPosition", value: displayInfo?.toothPosition || record?.[1] || "-" },
                          { label: "患者姓名", field: "patientName", value: displayInfo?.patientName || "-" },
                          { label: "联系电话", field: "phone", value: displayInfo?.phone || "-" },
                          { label: "诊断", field: "diagnosis", value: displayInfo?.diagnosis || record?.[2] || "-" },
                          { label: "当前步骤", field: "currentStep", value: displayInfo?.currentStep || record?.[3] || "-", isStage: true },
                          { label: "工作长度", field: "workingLength", value: displayInfo?.workingLength || "-" },
                          { label: "主尖锉号", field: "mainFileNumber", value: displayInfo?.mainFileNumber ? `#${displayInfo.mainFileNumber}` : "-" },
                          { label: "封药情况", field: "medication", value: displayInfo?.medication || "-" },
                          { label: "备注", field: "remark", value: displayInfo?.remark || "暂无备注", fullWidth: true },
                          { label: "创建日期", field: "createdAt", value: displayInfo?.createdAt || "-" },
                          { label: "最后更新", field: "updatedAt", value: displayInfo?.updatedAt || "-" },
                        ] as { label: string; field: string; value: string; isStage?: boolean; fullWidth?: boolean }[]).map(item => {
                          const change = getLatestFieldChangeForCase(selectedCaseId, item.field);
                          const conflictForField = conflicts.find(c => c.caseId === selectedCaseId && c.field === item.field && !c.resolved);
                          return (
                            <div key={item.field} className={`basic-info-item ${item.fullWidth ? "full-width" : ""} ${conflictForField ? "basic-info-item--conflict" : ""}`}>
                              <span className="basic-info-label">
                                {item.label}
                                {change && (
                                  <span
                                    className="field-source-tag"
                                    style={{ backgroundColor: roleColors[change.changedBy] + "15", color: roleColors[change.changedBy] }}
                                  >
                                    {change.changedBy} · {change.changedAt.split(" ")[1]}
                                  </span>
                                )}
                                {conflictForField && (
                                  <span className="field-conflict-tag">冲突</span>
                                )}
                              </span>
                              {item.isStage ? (
                                <span
                                  className="basic-info-value stage-tag"
                                  style={{
                                    backgroundColor: stageColors[displayInfo?.currentStep || record?.[3] || "开髓"] + "15",
                                    color: stageColors[displayInfo?.currentStep || record?.[3] || "开髓"],
                                  }}
                                >
                                  {item.value}
                                </span>
                              ) : (
                                <span className="basic-info-value">{item.value}</span>
                              )}
                              {conflictForField && (
                                <div className={`field-conflict-detail ${isTextField(conflictForField.field) ? "field-conflict-detail--text" : ""}`}>
                                  <div className="field-conflict-detail-versions">
                                    <span>本地：{conflictForField.localValue || "(空)"}（{conflictForField.localChangedBy}）</span>
                                    <span>远端：{conflictForField.remoteValue || "(空)"}（{conflictForField.remoteChangedBy}）</span>
                                  </div>
                                  {isTextField(conflictForField.field) && (
                                    <div className="field-conflict-merge-inline">
                                      <textarea
                                        className="field-conflict-merge-textarea"
                                        value={getMergedValue(conflictForField.id, "local")}
                                        onChange={(e) => setMergedValue(conflictForField.id, e.target.value)}
                                        rows={2}
                                        placeholder="编辑合并结果..."
                                      />
                                      <div className="field-conflict-merge-inline-actions">
                                        <button
                                          type="button"
                                          className="field-conflict-merge-quick-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMergedValue(conflictForField.id, conflictForField.localValue);
                                          }}
                                        >
                                          ← 本地
                                        </button>
                                        <button
                                          type="button"
                                          className="field-conflict-merge-quick-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMergedValue(conflictForField.id, conflictForField.remoteValue);
                                          }}
                                        >
                                          远端 →
                                        </button>
                                        <button
                                          type="button"
                                          className="field-conflict-btn field-conflict-btn--merge"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            resolveConflict(conflictForField.id, { customValue: getMergedValue(conflictForField.id, "local") });
                                          }}
                                        >
                                          ✓ 确认合并
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {!isTextField(conflictForField.field) && (
                                    <div className="field-conflict-actions">
                                      <button
                                        type="button"
                                        className="field-conflict-btn field-conflict-btn--local"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          resolveConflict(conflictForField.id, "local");
                                        }}
                                      >
                                        保留本地
                                      </button>
                                      <button
                                        type="button"
                                        className="field-conflict-btn field-conflict-btn--remote"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          resolveConflict(conflictForField.id, "remote");
                                        }}
                                      >
                                        保留远端
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeCaseTab === "canal" && (() => {
                const wlRecord = findWorkingLength(selectedToothPosition) || findWorkingLengthByCaseId(selectedCaseId);
                const confirmedCount = wlRecord ? wlRecord.entries.filter(e => e.confirmedStatus === "已确认").length : 0;
                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>根管参数详情</h3>
                      {wlRecord && (
                        <button
                          className="secondary-action"
                          onClick={() => loadWorkingLengthForEdit(wlRecord)}
                        >
                          编辑根管参数
                        </button>
                      )}
                    </div>
                    {wlRecord ? (
                      <>
                        <div className="wl-detail-stats">
                          <div className="wl-stat">
                            <strong>{wlRecord.entries.length}</strong>
                            <span>根管总数</span>
                          </div>
                          <div className="wl-stat wl-stat--confirmed">
                            <strong>{confirmedCount}/{wlRecord.entries.length}</strong>
                            <span>已确认</span>
                          </div>
                          <div className="wl-stat wl-stat--supplement">
                            <strong>{wlRecord.entries.filter(e => e.isSupplementary).length}</strong>
                            <span>补录根管</span>
                          </div>
                        </div>
                        {wlRecord.note && (
                          <div className="wl-detail-note">
                            <strong>备注：</strong>{wlRecord.note}
                          </div>
                        )}
                        <div className="wl-detail-table">
                          <div className="wl-detail-row wl-detail-row--header">
                            <span>#</span>
                            <span>根管名称</span>
                            <span>测量长度</span>
                            <span>参考尖点</span>
                            <span>测长方式</span>
                            <span>确认状态</span>
                            <span>类型</span>
                          </div>
                          {wlRecord.entries.map((entry, idx) => (
                            <div key={entry.id} className="wl-detail-row">
                              <span>{idx + 1}</span>
                              <span className="wl-detail-name">{entry.canalName || "未命名"}</span>
                              <span className="wl-detail-length">{entry.measuredLength ? `${entry.measuredLength}mm` : "-"}</span>
                              <span>{entry.referenceApex}</span>
                              <span>{entry.measurementMethod}</span>
                              <span>
                                <span
                                  className="status-dot"
                                  style={{ backgroundColor: confirmedStatusColors[entry.confirmedStatus] }}
                                />
                                {entry.confirmedStatus}
                              </span>
                              <span>
                                {entry.isSupplementary ? (
                                  <span className="wl-detail-supplement">补录</span>
                                ) : "常规"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        <p>该病例暂无根管参数记录</p>
                        <p className="empty-state-hint">在助理视图中可录入工作长度</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeCaseTab === "timeline" && (() => {
                const timeline = findTimeline(selectedToothPosition);
                if (!timeline) return null;
                const currentIdx = getCurrentStepIndex(timeline.nodes);
                const completedCount = timeline.nodes.filter(n => n.isCompleted).length;
                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>治疗时间线</h3>
                    </div>
                    <div className="modal-stats">
                      <div className="modal-stat">
                        <strong>{completedCount}/{timeline.nodes.length}</strong>
                        <span>已完成步骤</span>
                      </div>
                      <div className="modal-stat">
                        <strong>{timeline.nodes[currentIdx]?.step || "-"}</strong>
                        <span>当前阶段</span>
                      </div>
                      <div className="modal-stat">
                        <strong>{timeline.createdAt}</strong>
                        <span>创建日期</span>
                      </div>
                    </div>
                    <div className="timeline-detail">
                      {timeline.nodes.map((node, idx) => {
                        const isEditing = timelineDraft.editingNodeId === node.id;
                        return (
                          <div
                            key={node.id}
                            className={`timeline-detail-item ${
                              node.isCompleted
                                ? "timeline-detail-item--completed"
                                : idx === currentIdx
                                ? "timeline-detail-item--current"
                                : "timeline-detail-item--pending"
                            }`}
                          >
                            <div className="timeline-detail-left">
                              <div
                                className="timeline-detail-dot"
                                style={{
                                  "--stage-color": stageColors[node.step],
                                } as React.CSSProperties}
                              >
                                {node.isCompleted ? "✓" : idx + 1}
                              </div>
                              {idx < timeline.nodes.length - 1 && (
                                <div
                                  className={`timeline-detail-line ${
                                    node.isCompleted ? "timeline-detail-line--done" : ""
                                  }`}
                                  style={{
                                    "--stage-color": stageColors[node.step],
                                  } as React.CSSProperties}
                                />
                              )}
                            </div>
                            <div className="timeline-detail-body">
                              <div className="timeline-detail-header">
                                <h3
                                  className="timeline-detail-step"
                                  style={{
                                    "--stage-color": stageColors[node.step],
                                  } as React.CSSProperties}
                                >
                                  {node.step}
                                </h3>
                                {currentRole !== "前台" && (
                                  <div className="timeline-detail-actions">
                                    <label className="timeline-toggle">
                                      <input
                                        type="checkbox"
                                        checked={node.isCompleted}
                                        onChange={() => toggleNodeCompletion(selectedToothPosition, node.id)}
                                      />
                                      <span>{node.isCompleted ? "已完成" : "未完成"}</span>
                                    </label>
                                    {!isEditing && (
                                      <button
                                        className="timeline-edit-btn"
                                        onClick={() => startEditingNode(selectedToothPosition, node)}
                                      >
                                        编辑
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {isEditing && timelineDraft.node ? (
                                <div className="timeline-edit-form">
                                  <div className="form-grid">
                                    <label>
                                      <span>完成时间</span>
                                      <input
                                        type="text"
                                        placeholder="例：2026-06-17 10:30"
                                        value={timelineDraft.node.completedAt}
                                        onChange={(e) => updateDraftNode("completedAt", e.target.value)}
                                      />
                                    </label>
                                    <label>
                                      <span>操作者</span>
                                      <input
                                        placeholder="例：张医生"
                                        value={timelineDraft.node.operator}
                                        onChange={(e) => updateDraftNode("operator", e.target.value)}
                                      />
                                    </label>
                                    <label className="full-width">
                                      <span>关键参数</span>
                                      <textarea
                                        placeholder="例：MB 19.5mm，主尖锉#30，5.25%NaClO冲洗"
                                        value={timelineDraft.node.keyParams}
                                        onChange={(e) => updateDraftNode("keyParams", e.target.value)}
                                        rows={2}
                                      />
                                    </label>
                                    <label className="full-width">
                                      <span>异常备注</span>
                                      <textarea
                                        placeholder="例：MB2根管遗漏，出血明显，需后续处理"
                                        value={timelineDraft.node.exceptionNotes}
                                        onChange={(e) => updateDraftNode("exceptionNotes", e.target.value)}
                                        rows={2}
                                      />
                                    </label>
                                  </div>
                                  {timelineDraftError && (
                                    <p className="error-text">{timelineDraftError}</p>
                                  )}
                                  <div className="form-actions">
                                    <button
                                      type="button"
                                      className="secondary-action"
                                      onClick={cancelEditingNode}
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      className="primary-action"
                                      onClick={saveNode}
                                    >
                                      保存
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {node.isCompleted && (
                                    <div className="timeline-detail-info">
                                      <div className="timeline-info-row">
                                        <span className="timeline-info-label">完成时间：</span>
                                        <span className="timeline-info-value">{node.completedAt || "-"}</span>
                                      </div>
                                      <div className="timeline-info-row">
                                        <span className="timeline-info-label">操作者：</span>
                                        <span className="timeline-info-value">{node.operator || "-"}</span>
                                      </div>
                                      {node.keyParams && (
                                        <div className="timeline-info-row">
                                          <span className="timeline-info-label">关键参数：</span>
                                          <span className="timeline-info-value">{node.keyParams}</span>
                                        </div>
                                      )}
                                      {node.exceptionNotes && (
                                        <div className="timeline-info-row timeline-info-row--warning">
                                          <span className="timeline-info-label">异常备注：</span>
                                          <span className="timeline-info-value">{node.exceptionNotes}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {!node.isCompleted && idx === currentIdx && (
                                    <div className="timeline-detail-pending">
                                      <p>当前正在进行此步骤</p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {activeCaseTab === "followup" && (() => {
                const plan = findFollowUpByCaseId(selectedCaseId);
                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>复诊计划</h3>
                      {plan && (
                        <button
                          className="secondary-action"
                          onClick={() => openFollowUpEdit(plan)}
                        >
                          编辑复诊
                        </button>
                      )}
                    </div>
                    {plan ? (
                      <div className="followup-detail">
                        <div className="followup-detail-header"
                          style={{
                            borderLeftColor: contactStatusColors[plan.contactStatus],
                          }}
                        >
                          <div>
                            <span className={`urgency-badge ${
                              getDaysUntil(plan.nextDate) < 0
                                ? "urgency-badge--overdue"
                                : getDaysUntil(plan.nextDate) <= 3
                                ? "urgency-badge--urgent"
                                : "urgency-badge--upcoming"
                            }`}>
                              {getDaysUntil(plan.nextDate) < 0
                                ? `逾期${Math.abs(getDaysUntil(plan.nextDate))}天`
                                : getDaysUntil(plan.nextDate) === 0
                                ? "今日复诊"
                                : `${getDaysUntil(plan.nextDate)}天后`}
                            </span>
                            <h4 style={{ margin: "8px 0 0 0" }}>
                              {plan.nextDate}
                              <span style={{ fontSize: "14px", color: "#64748b", fontWeight: "normal", marginLeft: "12px" }}>
                                负责医生：{plan.doctor}
                              </span>
                            </h4>
                          </div>
                          <span
                            className="contact-status-badge"
                            style={{
                              backgroundColor: contactStatusColors[plan.contactStatus] + "15",
                              color: contactStatusColors[plan.contactStatus],
                              borderColor: contactStatusColors[plan.contactStatus],
                            }}
                          >
                            {plan.contactStatus}
                          </span>
                        </div>
                        <div className="basic-info-grid">
                          <div className="basic-info-item">
                            <span className="basic-info-label">复诊原因</span>
                            <span className="basic-info-value">{plan.reason}</span>
                          </div>
                          <div className="basic-info-item">
                            <span className="basic-info-label">患者姓名</span>
                            <span className="basic-info-value">{plan.patientName || "-"}</span>
                          </div>
                          <div className="basic-info-item">
                            <span className="basic-info-label">联系电话</span>
                            <span className="basic-info-value">{plan.phone || "-"}</span>
                          </div>
                          <div className="basic-info-item">
                            <span className="basic-info-label">提醒状态</span>
                            <span className={`basic-info-value ${plan.reminderEnabled ? "reminder-on" : "reminder-off"}`}>
                              {plan.reminderEnabled ? "🔔 已开启" : "🔕 已关闭"}
                            </span>
                          </div>
                          {plan.contactNote && (
                            <div className="basic-info-item full-width">
                              <span className="basic-info-label">联系备注</span>
                              <span className="basic-info-value followup-note">{plan.contactNote}</span>
                            </div>
                          )}
                        </div>
                        {currentRole === "前台" && (
                          <div className="followup-detail-actions">
                            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>更新联系状态：</span>
                              <select
                                value={plan.contactStatus}
                                onChange={(e) => updateContactStatus(plan.id, e.target.value as ContactStatus)}
                                style={{ borderColor: contactStatusColors[plan.contactStatus] }}
                              >
                                {contactStatusOptions.map(status => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <p>该病例暂无复诊计划</p>
                        <p className="empty-state-hint">在助理视图中录入病历时可添加复诊安排</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeCaseTab === "logs" && (() => {
                const logs = findLogsByCaseId(selectedCaseId);
                return (
                  <div className="case-section">
                    <div className="case-section-header">
                      <h3>操作记录</h3>
                      <span className="record-total">共 {logs.length} 条</span>
                    </div>
                    {logs.length > 0 ? (
                      <div className="operation-logs">
                        {logs.map((log, idx) => (
                          <div key={log.id} className="operation-log-item">
                            <div className="operation-log-left">
                              <div
                                className="operation-log-avatar"
                                style={{ backgroundColor: roleColors[log.role] }}
                              >
                                {log.operator.charAt(0)}
                              </div>
                              {idx < logs.length - 1 && (
                                <div className="operation-log-line" />
                              )}
                            </div>
                            <div className="operation-log-body">
                              <div className="operation-log-header">
                                <span className="operation-log-action">{log.action}</span>
                                <span
                                  className="operation-log-role"
                                  style={{
                                    backgroundColor: roleColors[log.role] + "15",
                                    color: roleColors[log.role],
                                  }}
                                >
                                  {log.role}
                                </span>
                                <span className="operation-log-time">{log.timestamp}</span>
                              </div>
                              <p className="operation-log-detail">
                                <strong>{log.operator}</strong> · {log.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <p>该病例暂无操作记录</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showFollowUpEditModal && followUpEditDraft.plan && (
        <div className="modal-overlay" onClick={closeFollowUpEdit}>
          <div className="modal-content modal-content--followup" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow" style={{ color: roleColors["前台"] }}>复诊计划编辑</p>
                <h2 className="modal-title">
                  {followUpEditDraft.plan.toothPosition} 复诊详情
                </h2>
              </div>
              <button className="modal-close" onClick={closeFollowUpEdit}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  <span>牙位</span>
                  <input
                    value={followUpEditDraft.plan.toothPosition}
                    onChange={(e) => updateFollowUpDraft("toothPosition", e.target.value)}
                  />
                </label>
                <label>
                  <span>复诊日期</span>
                  <input
                    type="date"
                    value={followUpEditDraft.plan.nextDate}
                    onChange={(e) => updateFollowUpDraft("nextDate", e.target.value)}
                  />
                </label>
                <label>
                  <span>负责医生</span>
                  <input
                    placeholder="例如：张医生"
                    value={followUpEditDraft.plan.doctor}
                    onChange={(e) => updateFollowUpDraft("doctor", e.target.value)}
                  />
                </label>
                <label>
                  <span>联系状态</span>
                  <select
                    value={followUpEditDraft.plan.contactStatus}
                    onChange={(e) => updateFollowUpDraft("contactStatus", e.target.value)}
                    style={{ borderColor: contactStatusColors[followUpEditDraft.plan.contactStatus] }}
                  >
                    {contactStatusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>患者姓名</span>
                  <input
                    placeholder="请输入患者姓名"
                    value={followUpEditDraft.plan.patientName}
                    onChange={(e) => updateFollowUpDraft("patientName", e.target.value)}
                  />
                </label>
                <label>
                  <span>联系电话</span>
                  <input
                    placeholder="请输入联系电话"
                    value={followUpEditDraft.plan.phone}
                    onChange={(e) => updateFollowUpDraft("phone", e.target.value)}
                  />
                </label>
                <label className="full-width">
                  <span>复诊原因</span>
                  <input
                    placeholder="例如：封药到期换药"
                    value={followUpEditDraft.plan.reason}
                    onChange={(e) => updateFollowUpDraft("reason", e.target.value)}
                  />
                </label>
                <label className="checkbox-label">
                  <span>复诊提醒</span>
                  <div className="toggle-wrapper">
                    <input
                      type="checkbox"
                      checked={followUpEditDraft.plan.reminderEnabled}
                      onChange={(e) => updateFollowUpDraft("reminderEnabled", e.target.checked)}
                      className="toggle-checkbox"
                    />
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-text">
                      {followUpEditDraft.plan.reminderEnabled ? "已开启" : "已关闭"}
                    </span>
                  </div>
                </label>
                <label className="full-width">
                  <span>联系备注</span>
                  <textarea
                    placeholder="记录联系过程中的重要信息"
                    value={followUpEditDraft.plan.contactNote}
                    onChange={(e) => updateFollowUpDraft("contactNote", e.target.value)}
                    rows={3}
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={closeFollowUpEdit}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="primary-action"
                  style={{ backgroundColor: roleColors["前台"], borderColor: roleColors["前台"] }}
                  onClick={saveFollowUpPlan}
                >
                  保存修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCaseSelectModal && (
        <div className="modal-overlay" onClick={() => setShowCaseSelectModal(false)}>
          <div className="modal-content modal-content--case-select" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">工作长度录入</p>
                <h2 className="modal-title">选择病例</h2>
              </div>
              <button className="modal-close" onClick={() => setShowCaseSelectModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="case-select-search">
                <input
                  type="text"
                  placeholder="搜索牙位、患者姓名或诊断..."
                  value={caseSelectSearch}
                  onChange={(e) => setCaseSelectSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="case-select-list">
                {caseInfos
                  .filter(c => {
                    const keyword = caseSelectSearch.trim().toLowerCase();
                    if (!keyword) return true;
                    return (
                      c.toothPosition.toLowerCase().includes(keyword) ||
                      c.patientName.toLowerCase().includes(keyword) ||
                      c.diagnosis.toLowerCase().includes(keyword)
                    );
                  })
                  .sort((a, b) => a.toothPosition.localeCompare(b.toothPosition))
                  .map(caseInfo => {
                    const hasWL = findWorkingLength(caseInfo.toothPosition);
                    return (
                      <div
                        key={caseInfo.id}
                        className={`case-select-item ${hasWL ? "case-select-item--has-wl" : ""}`}
                        onClick={() => handleSelectCaseForWL(caseInfo)}
                      >
                        <div className="case-select-item-left">
                          <div className="case-select-item-main">
                            <div className="case-select-item-tooth">{caseInfo.toothPosition}</div>
                            <div className="case-select-item-patient">{caseInfo.patientName}</div>
                          </div>
                          <div className="case-select-item-sub">
                            <span className="case-select-item-diagnosis">{caseInfo.diagnosis}</span>
                            <span
                              className="case-select-item-step"
                              style={{ backgroundColor: stageColors[caseInfo.currentStep] }}
                            >
                              {caseInfo.currentStep}
                            </span>
                          </div>
                        </div>
                        {hasWL && (
                          <div className="case-select-item-badge">
                            ✎ 编辑
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {caseInfos.length === 0 && (
                <div className="empty-state">
                  <p>暂无病例数据</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content modal-content--export-config" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">病例摘要导出</p>
                <h2 className="modal-title">配置导出选项</h2>
              </div>
              <button className="modal-close" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="export-hint">
                当前筛选：<strong>{getFilterLabel()}</strong> · 共 <strong>{filteredRecords.length}</strong> 条记录
              </p>

              <div className="export-config-section">
                <h3 className="export-config-title">1. 选择导出范围</h3>
                <div className="export-scope-options">
                  <label className={`export-scope-option ${exportScope === "all" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "all"}
                      onChange={() => setExportScope("all")}
                    />
                    <div>
                      <span className="export-scope-label">全部病例</span>
                      <span className="export-scope-count">共 {records.length} 条</span>
                    </div>
                  </label>
                  <label className={`export-scope-option ${exportScope === "filtered" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "filtered"}
                      onChange={() => setExportScope("filtered")}
                    />
                    <div>
                      <span className="export-scope-label">当前筛选结果</span>
                      <span className="export-scope-count">共 {filteredRecords.length} 条</span>
                    </div>
                  </label>
                  <label className={`export-scope-option ${exportScope === "custom" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "custom"}
                      onChange={() => setExportScope("custom")}
                    />
                    <div>
                      <span className="export-scope-label">自定义阶段</span>
                      <span className="export-scope-count">
                        {exportCustomStages.length > 0
                          ? `已选 ${exportCustomStages.length} 个阶段，共 ${
                              records.filter((r) => exportCustomStages.includes(r[3])).length
                            } 条`
                          : "请选择阶段"}
                      </span>
                    </div>
                  </label>
                </div>
                {exportScope === "custom" && (
                  <div className="export-custom-stages">
                    {steps.map((stage) => (
                      <label key={stage} className="export-stage-checkbox">
                        <input
                          type="checkbox"
                          checked={exportCustomStages.includes(stage)}
                          onChange={() => toggleStageSelection(stage)}
                        />
                        <span
                          className="export-stage-badge"
                          style={{ backgroundColor: stageColors[stage] }}
                        >
                          {stage}
                        </span>
                        <span className="export-stage-count">
                          {records.filter((r) => r[3] === stage).length} 条
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="export-config-section">
                <h3 className="export-config-title">2. 选择导出字段</h3>
                <div className="export-field-groups">
                  {Object.entries(EXPORT_FIELD_GROUPS).map(([groupKey, group]) => {
                    const groupFields = group.fields;
                    const allSelected = groupFields.every((f) =>
                      exportSelectedFields.includes(f.key)
                    );
                    const someSelected = groupFields.some((f) =>
                      exportSelectedFields.includes(f.key)
                    );
                    return (
                      <div key={groupKey} className="export-field-group">
                        <div className="export-field-group-header">
                          <label className="export-group-select-all">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={() => selectAllFieldsInGroup(groupKey)}
                            />
                            <span className="export-group-name">{group.label}</span>
                            <span className="export-group-count">
                              {groupFields.filter((f) => exportSelectedFields.includes(f.key)).length}/
                              {groupFields.length}
                            </span>
                          </label>
                        </div>
                        <div className="export-field-checkboxes">
                          {groupFields.map((field) => (
                            <label key={field.key} className="export-field-checkbox">
                              <input
                                type="checkbox"
                                checked={exportSelectedFields.includes(field.key)}
                                onChange={() => toggleFieldSelection(field.key)}
                              />
                              <span>{field.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="export-config-section">
                <h3 className="export-config-title">3. 选择导出格式</h3>
                <div className="export-format-options">
                  <label className={`export-format-option ${exportFormat === "csv" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === "csv"}
                      onChange={() => setExportFormat("csv")}
                    />
                    <div className="export-format-content">
                      <div className="export-format-icon">📊</div>
                      <div>
                        <span className="export-format-label">CSV 格式</span>
                        <span className="export-format-desc">可直接用 Excel 打开，方便数据整理和统计分析</span>
                      </div>
                    </div>
                  </label>
                  <label className={`export-format-option ${exportFormat === "html" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === "html"}
                      onChange={() => setExportFormat("html")}
                    />
                    <div className="export-format-content">
                      <div className="export-format-icon">📄</div>
                      <div>
                        <span className="export-format-label">可打印 HTML</span>
                        <span className="export-format-desc">生成美观的打印页面，可直接打印或保存为 PDF</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="export-config-summary">
                <div className="export-summary-item">
                  <span>导出范围：</span>
                  <strong>{getExportScopeLabel()}</strong>
                </div>
                <div className="export-summary-item">
                  <span>记录数量：</span>
                  <strong>{getRecordsForExport().length} 条</strong>
                </div>
                <div className="export-summary-item">
                  <span>导出字段：</span>
                  <strong>{exportSelectedFields.length} 个</strong>
                </div>
                <div className="export-summary-item">
                  <span>导出格式：</span>
                  <strong>{exportFormat === "csv" ? "CSV" : "可打印 HTML"}</strong>
                </div>
              </div>

              <div className="export-config-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowExportModal(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleExport}
                  disabled={exportSelectedFields.length === 0 || getRecordsForExport().length === 0}
                >
                  {exportFormat === "csv" ? "📥 下载 CSV" : "🖨️ 生成打印页面"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {batchConfirmOpen && (
        <div className="modal-overlay" onClick={() => setBatchConfirmOpen(false)}>
          <div className="modal-content modal-content--batch-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow" style={{ color: roleColors["前台"] }}>批量更新确认</p>
                <h2 className="modal-title">确认批量更新联系状态</h2>
              </div>
              <button className="modal-close" onClick={() => setBatchConfirmOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="batch-confirm-summary">
                <div className="batch-confirm-item">
                  <span>选中数量</span>
                  <strong>{batchSelectedIds.size} 条</strong>
                </div>
                <div className="batch-confirm-item">
                  <span>目标状态</span>
                  <strong style={{ color: contactStatusColors[batchTargetStatus] }}>{batchTargetStatus}</strong>
                </div>
                {batchNoteTemplate.trim() && (
                  <div className="batch-confirm-item">
                    <span>备注模板</span>
                    <strong>{batchNoteTemplate.trim()}</strong>
                  </div>
                )}
                {getCancelledCount() > 0 && batchTargetStatus === "已确认" && (
                  <div className="batch-confirm-item batch-confirm-item--warning">
                    <span>自动跳过</span>
                    <strong>{getCancelledCount()} 条已取消计划</strong>
                  </div>
                )}
              </div>
              <div className="batch-confirm-detail">
                {Array.from(batchSelectedIds).map(id => {
                  const plan = followUpPlans.find(p => p.id === id);
                  if (!plan) return null;
                  const isBlocked = plan.contactStatus === "已取消" && batchTargetStatus === "已确认";
                  return (
                    <div key={id} className={`batch-confirm-row ${isBlocked ? "batch-confirm-row--blocked" : ""}`}>
                      <span>{plan.toothPosition} {plan.patientName || ""}</span>
                      <span
                        className="contact-status-badge"
                        style={{
                          backgroundColor: contactStatusColors[plan.contactStatus] + "15",
                          color: contactStatusColors[plan.contactStatus],
                          borderColor: contactStatusColors[plan.contactStatus],
                          fontSize: "11px",
                          padding: "2px 8px",
                        }}
                      >
                        {plan.contactStatus}
                      </span>
                      <span className="batch-confirm-arrow">→</span>
                      <span
                        className="contact-status-badge"
                        style={{
                          backgroundColor: isBlocked ? "#f1f5f9" : contactStatusColors[batchTargetStatus] + "15",
                          color: isBlocked ? "#94a3b8" : contactStatusColors[batchTargetStatus],
                          borderColor: isBlocked ? "#e2e8f0" : contactStatusColors[batchTargetStatus],
                          fontSize: "11px",
                          padding: "2px 8px",
                        }}
                      >
                        {isBlocked ? "跳过" : batchTargetStatus}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="form-actions">
                <button type="button" className="secondary-action" onClick={() => setBatchConfirmOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary-action"
                  style={{ backgroundColor: roleColors["前台"], borderColor: roleColors["前台"] }}
                  onClick={executeBatchUpdate}
                >
                  确认批量更新
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConflictModal && unresolvedConflicts.length > 0 && (
        <div className="modal-overlay" onClick={() => setShowConflictModal(false)}>
          <div className="modal-content modal-content--conflict" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow" style={{ color: "#dc2626" }}>数据冲突</p>
                <h2 className="modal-title">
                  解决同步冲突
                  <span className="record-total">{unresolvedConflicts.length} 个字段存在冲突</span>
                </h2>
              </div>
              <button className="modal-close" onClick={() => setShowConflictModal(false)}>×</button>
            </div>
            <div className="conflict-list">
              {unresolvedConflicts.map(conflict => {
                const caseInfo = findCaseInfoById(conflict.caseId);
                const textField = isTextField(conflict.field);
                const mergedVal = getMergedValue(conflict.id, "local");
                return (
                  <div key={conflict.id} className={`conflict-item ${textField ? "conflict-item--text" : ""}`}>
                    <div className="conflict-item-header">
                      <h3>{caseInfo?.toothPosition || conflict.caseId.slice(0, 12)}</h3>
                      <span className="conflict-field-name">
                        {getFieldLabel(conflict.field)}
                        <span className={`conflict-field-type ${textField ? "conflict-field-type--text" : "conflict-field-type--enum"}`}>
                          {textField ? "可编辑合并" : "二选一"}
                        </span>
                      </span>
                    </div>
                    {textField ? (
                      <div className="conflict-merge">
                        <div className="conflict-merge-refs">
                          <div className="conflict-merge-ref conflict-merge-ref--local">
                            <div className="conflict-merge-ref-header">
                              <span
                                className="conflict-version-role"
                                style={{ backgroundColor: roleColors[conflict.localChangedBy] + "15", color: roleColors[conflict.localChangedBy] }}
                              >
                                {conflict.localChangedBy} · 本地
                              </span>
                              <span className="conflict-version-time">{conflict.localChangedAt.split(" ")[1]}</span>
                            </div>
                            <div className="conflict-merge-ref-value">{conflict.localValue || "(空)"}</div>
                            <button
                              type="button"
                              className="conflict-merge-copy-btn"
                              onClick={() => setMergedValue(conflict.id, conflict.localValue)}
                            >
                              ← 复制到合并
                            </button>
                          </div>
                          <div className="conflict-merge-ref conflict-merge-ref--remote">
                            <div className="conflict-merge-ref-header">
                              <span
                                className="conflict-version-role"
                                style={{ backgroundColor: roleColors[conflict.remoteChangedBy] + "15", color: roleColors[conflict.remoteChangedBy] }}
                              >
                                {conflict.remoteChangedBy} · 远端
                              </span>
                              <span className="conflict-version-time">{conflict.remoteChangedAt.split(" ")[1]}</span>
                            </div>
                            <div className="conflict-merge-ref-value">{conflict.remoteValue || "(空)"}</div>
                            <button
                              type="button"
                              className="conflict-merge-copy-btn"
                              onClick={() => setMergedValue(conflict.id, conflict.remoteValue)}
                            >
                              复制到合并 →
                            </button>
                          </div>
                        </div>
                        <div className="conflict-merge-editor">
                          <div className="conflict-merge-editor-label">
                            <span>合并结果（可编辑）</span>
                          </div>
                          <textarea
                            className="conflict-merge-textarea"
                            value={mergedVal}
                            onChange={(e) => setMergedValue(conflict.id, e.target.value)}
                            rows={3}
                            placeholder="在此编辑最终值..."
                          />
                          <div className="conflict-merge-actions">
                            <button
                              type="button"
                              className="conflict-merge-submit-btn"
                              onClick={() => resolveConflict(conflict.id, { customValue: mergedVal })}
                            >
                              ✓ 确认合并结果
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="conflict-compare">
                        <div className="conflict-version conflict-version--local">
                          <div className="conflict-version-header">
                            <span
                              className="conflict-version-role"
                              style={{ backgroundColor: roleColors[conflict.localChangedBy] + "15", color: roleColors[conflict.localChangedBy] }}
                            >
                              {conflict.localChangedBy} · 本地
                            </span>
                            <span className="conflict-version-time">{conflict.localChangedAt.split(" ")[1]}</span>
                          </div>
                          <div className="conflict-version-value">{conflict.localValue || "(空)"}</div>
                          <button
                            type="button"
                            className="conflict-choose-btn conflict-choose-btn--local"
                            onClick={() => resolveConflict(conflict.id, "local")}
                          >
                            保留本地版本
                          </button>
                        </div>
                        <div className="conflict-vs">VS</div>
                        <div className="conflict-version conflict-version--remote">
                          <div className="conflict-version-header">
                            <span
                              className="conflict-version-role"
                              style={{ backgroundColor: roleColors[conflict.remoteChangedBy] + "15", color: roleColors[conflict.remoteChangedBy] }}
                            >
                              {conflict.remoteChangedBy} · 远端
                            </span>
                            <span className="conflict-version-time">{conflict.remoteChangedAt.split(" ")[1]}</span>
                          </div>
                          <div className="conflict-version-value">{conflict.remoteValue || "(空)"}</div>
                          <button
                            type="button"
                            className="conflict-choose-btn conflict-choose-btn--remote"
                            onClick={() => resolveConflict(conflict.id, "remote")}
                          >
                            保留远端版本
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="conflict-footer">
              <p className="conflict-hint">文本字段可编辑合并结果；枚举字段仅支持二选一。冲突解决后会自动同步。</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
