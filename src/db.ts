export interface CaseRecord {
  toothPosition: string;
  diagnosis: string;
  currentStep: string;
  workingLength: string;
  mainFileNumber: string;
  medication: string;
  remark: string;
  followUpDate: string;
  followUpDoctor: string;
  followUpReason: string;
  followUpReminder: boolean;
}

export interface OperationLog {
  id: string;
  caseId: string;
  operator: string;
  role: UserRole;
  action: string;
  detail: string;
  timestamp: string;
}

export type OperationAction =
  | "创建病例"
  | "更新基础信息"
  | "更新根管参数"
  | "完成治疗步骤"
  | "编辑治疗步骤"
  | "创建复诊计划"
  | "更新复诊计划"
  | "更新联系状态"
  | "确认今日到诊"
  | "删除病例";

export interface CaseBasicInfo {
  id: string;
  toothPosition: string;
  patientName: string;
  phone: string;
  diagnosis: string;
  currentStep: TreatmentStep;
  workingLength: string;
  mainFileNumber: string;
  medication: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactStatus = "待联系" | "已联系" | "已确认" | "未接通" | "已取消";

export interface FollowUpPlan {
  id: string;
  caseId: string;
  toothPosition: string;
  nextDate: string;
  doctor: string;
  reason: string;
  reminderEnabled: boolean;
  contactStatus: ContactStatus;
  contactNote: string;
  patientName: string;
  phone: string;
}

export type ConfirmedStatus = "待确认" | "已确认" | "需重测";

export interface CanalEntry {
  id: string;
  canalName: string;
  measuredLength: string;
  referenceApex: string;
  measurementMethod: string;
  confirmedStatus: ConfirmedStatus;
  isSupplementary: boolean;
}

export interface WorkingLengthRecord {
  id: string;
  caseId: string;
  toothPosition: string;
  entries: CanalEntry[];
  note: string;
}

export type UserRole = "医生" | "助理" | "前台";

export type TreatmentStep = "开髓" | "测长" | "根管预备" | "冲洗" | "封药" | "充填";

export interface TimelineNode {
  id: string;
  step: TreatmentStep;
  completedAt: string;
  operator: string;
  keyParams: string;
  exceptionNotes: string;
  isCompleted: boolean;
}

export interface TreatmentTimeline {
  id: string;
  caseId: string;
  toothPosition: string;
  nodes: TimelineNode[];
  createdAt: string;
}

export interface FormErrors {
  toothPosition?: string;
  diagnosis?: string;
  currentStep?: string;
}

export type SyncStatus = "online" | "offline" | "syncing";

export interface FieldChange {
  id: string;
  caseId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: UserRole;
  changedAt: string;
  syncStatus: "pending" | "synced" | "conflict";
}

export interface ConflictEntry {
  id: string;
  caseId: string;
  field: string;
  localValue: string;
  localChangedBy: UserRole;
  localChangedAt: string;
  remoteValue: string;
  remoteChangedBy: UserRole;
  remoteChangedAt: string;
  resolved: boolean;
  resolvedValue?: string;
  resolvedAt?: string;
  resolvedBy?: UserRole;
}

export interface AppData {
  records: string[][];
  caseInfos: CaseBasicInfo[];
  operationLogs: OperationLog[];
  followUpPlans: FollowUpPlan[];
  workingLengths: WorkingLengthRecord[];
  timelines: TreatmentTimeline[];
  activeStage: string | null;
  changeQueue: FieldChange[];
  conflicts: ConflictEntry[];
  syncStatus: SyncStatus;
  lastSyncAt: string;
}

function createCaseId(): string {
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createOperationLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createCaseIdExternal(): string {
  return createCaseId();
}

export function createOperationLog(
  caseId: string,
  operator: string,
  role: UserRole,
  action: OperationAction,
  detail: string
): OperationLog {
  return {
    id: createOperationLogId(),
    caseId,
    operator,
    role,
    action,
    detail,
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
}

const DB_NAME = "dental-rct-db";
const DB_VERSION = 1;
const STORE_NAME = "appData";

const patientData = [
  { patientName: "王建国", phone: "138****1234" },
  { patientName: "李文静", phone: "139****8876" },
  { patientName: "李明华", phone: "139****5678" },
  { patientName: "张秀英", phone: "136****9012" },
  { patientName: "陈志强", phone: "137****3456" },
  { patientName: "刘美玲", phone: "135****7890" },
  { patientName: "赵大宝", phone: "133****2345" },
  { patientName: "孙丽娟", phone: "132****1122" },
  { patientName: "吴金凤", phone: "130****4567" },
  { patientName: "郑伟国", phone: "138****8901" },
  { patientName: "周海涛", phone: "131****0123" },
  { patientName: "冯晓燕", phone: "139****2345" },
  { patientName: "钱伟东", phone: "136****6789" },
  { patientName: "马晓红", phone: "137****2233" },
  { patientName: "黄建军", phone: "135****4455" },
];

const rawRecords: [string, string, TreatmentStep, string, string][] = [
  ["#36", "慢性根尖周炎", "封药", "MB 19.5mm，主尖锉#30", "待复诊"],
  ["#11", "外伤后变色", "充填", "单根管，冷侧压完成", "已充填"],
  ["#46", "急性牙髓炎", "测长", "近中双根管需复诊", "待复诊"],
  ["#14", "深龋穿髓", "开髓", "开髓孔通畅，出血明显", "待复诊"],
  ["#25", "慢性牙髓炎", "根管预备", "MB2 18mm，主尖锉#25", "待复诊"],
  ["#37", "牙髓坏死", "冲洗", "3%NaClO冲洗，超声荡洗", "待复诊"],
  ["#16", "急性根尖周炎", "开髓", "开髓引流，脓液溢出", "待复诊"],
  ["#21", "牙体缺损", "充填", "热牙胶垂直加压，桩道预备", "已充填"],
  ["#47", "慢性根尖周脓肿", "根管预备", "远中根20mm，弯曲根管", "待复诊"],
  ["#15", "可逆性牙髓炎", "冲洗", "生理盐水冲洗，EDTA预备", "待复诊"],
  ["#26", "隐裂牙", "封药", "Ca(OH)2封药，一周后复诊", "待复诊"],
  ["#31", "外伤露髓", "测长", "17mm，根尖孔闭合", "待复诊"],
  ["#45", "慢性牙髓炎急性发作", "根管预备", "预备至#30，5.25%NaClO冲洗", "待复诊"],
  ["#24", "深龋", "开髓", "局麻下开髓，冠髓切除", "待复诊"],
  ["#35", "根尖周炎", "充填", "恰填，术后片显示良好", "已充填"],
];

const projectData = {
  records: rawRecords.map((r, i) => {
    const caseId = `case_init_${i + 1}`;
    return [caseId, r[0], r[1], r[2], r[3], r[4]] as string[];
  }) as string[][],
  caseInfos: rawRecords.map((r, i): CaseBasicInfo => {
    const pd = patientData[i];
    return {
      id: `case_init_${i + 1}`,
      toothPosition: r[0],
      patientName: pd.patientName,
      phone: pd.phone,
      diagnosis: r[1],
      currentStep: r[2],
      workingLength: r[3].includes("mm") ? r[3].split("，")[0] : "",
      mainFileNumber: r[3].includes("主尖锉") ? r[3].match(/主尖锉#?(\d+)/)?.[1] || "" : "",
      medication: r[3].includes("Ca(OH)2") ? "Ca(OH)2" : "",
      remark: "",
      createdAt: "2026-06-10",
      updatedAt: "2026-06-15",
    };
  }),
  operationLogs: rawRecords.map((r, i): OperationLog => ({
    id: `log_init_${i + 1}`,
    caseId: `case_init_${i + 1}`,
    operator: "张医生",
    role: "医生",
    action: "创建病例",
    detail: `创建 ${r[0]} 病例，诊断：${r[1]}，当前阶段：${r[2]}`,
    timestamp: `2026-06-10 ${String(9 + i).padStart(2, "0")}:30:00`,
  })).concat(
    rawRecords.slice(0, 5).map((r, i): OperationLog => ({
      id: `log_init_upd_${i + 1}`,
      caseId: `case_init_${i + 1}`,
      operator: "李助理",
      role: "助理",
      action: "更新基础信息",
      detail: `更新 ${r[0]} 治疗参数：${r[3]}`,
      timestamp: `2026-06-12 ${String(10 + i).padStart(2, "0")}:15:00`,
    }))
  ),
};

const treatmentSteps: TreatmentStep[] = ["开髓", "测长", "根管预备", "冲洗", "封药", "充填"];

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

const toothToCaseId: Record<string, string> = {};
projectData.records.forEach(r => {
  toothToCaseId[r[1]] = r[0];
});

const initialFollowUpPlans: FollowUpPlan[] = [
  { id: "fp1", caseId: toothToCaseId["#36"] || "", toothPosition: "#36", nextDate: "2026-06-14", doctor: "张医生", reason: "Ca(OH)2封药到期，需换药或根充", reminderEnabled: true, contactStatus: "已确认", contactNote: "患者已确认明天上午10点到诊", patientName: "王建国", phone: "138****1234" },
  { id: "fp2", caseId: toothToCaseId["#46"] || "", toothPosition: "#46", nextDate: "2026-06-18", doctor: "李医生", reason: "近中双根管继续测长", reminderEnabled: true, contactStatus: "待联系", contactNote: "", patientName: "李明华", phone: "139****5678" },
  { id: "fp3", caseId: toothToCaseId["#14"] || "", toothPosition: "#14", nextDate: "2026-06-20", doctor: "张医生", reason: "开髓后继续根管预备", reminderEnabled: false, contactStatus: "已联系", contactNote: "已电话通知，患者表示时间合适", patientName: "张秀英", phone: "136****9012" },
  { id: "fp4", caseId: toothToCaseId["#25"] || "", toothPosition: "#25", nextDate: "2026-06-19", doctor: "王医生", reason: "根管预备完成后封药评估", reminderEnabled: true, contactStatus: "未接通", contactNote: "两次电话未接通，稍后再试", patientName: "陈志强", phone: "137****3456" },
  { id: "fp5", caseId: toothToCaseId["#37"] || "", toothPosition: "#37", nextDate: "2026-06-15", doctor: "李医生", reason: "冲洗后封药观察", reminderEnabled: true, contactStatus: "待联系", contactNote: "", patientName: "刘美玲", phone: "135****7890" },
  { id: "fp6", caseId: toothToCaseId["#16"] || "", toothPosition: "#16", nextDate: "2026-06-17", doctor: "张医生", reason: "开髓引流后复查", reminderEnabled: false, contactStatus: "已确认", contactNote: "患者今日复诊，已安排上午号", patientName: "赵大宝", phone: "133****2345" },
  { id: "fp7", caseId: toothToCaseId["#26"] || "", toothPosition: "#26", nextDate: "2026-06-22", doctor: "王医生", reason: "Ca(OH)2封药一周后复诊", reminderEnabled: true, contactStatus: "待联系", contactNote: "", patientName: "孙丽娟", phone: "132****6789" },
  { id: "fp8", caseId: toothToCaseId["#31"] || "", toothPosition: "#31", nextDate: "2026-06-25", doctor: "李医生", reason: "测长后根管预备", reminderEnabled: false, contactStatus: "已联系", contactNote: "短信通知已发送", patientName: "周海涛", phone: "131****0123" },
  { id: "fp9", caseId: toothToCaseId["#47"] || "", toothPosition: "#47", nextDate: "2026-06-16", doctor: "张医生", reason: "弯曲根管预备复诊", reminderEnabled: true, contactStatus: "待联系", contactNote: "", patientName: "吴金凤", phone: "130****4567" },
  { id: "fp10", caseId: toothToCaseId["#15"] || "", toothPosition: "#15", nextDate: "2026-06-21", doctor: "王医生", reason: "冲洗后评估封药", reminderEnabled: true, contactStatus: "未接通", contactNote: "患者关机，明日再联系", patientName: "郑伟国", phone: "138****8901" },
  { id: "fp11", caseId: toothToCaseId["#45"] || "", toothPosition: "#45", nextDate: "2026-06-19", doctor: "李医生", reason: "根管预备后封药观察", reminderEnabled: true, contactStatus: "待联系", contactNote: "", patientName: "冯晓燕", phone: "139****2345" },
  { id: "fp12", caseId: toothToCaseId["#24"] || "", toothPosition: "#24", nextDate: "2026-06-18", doctor: "张医生", reason: "局麻开髓后继续治疗", reminderEnabled: false, contactStatus: "已取消", contactNote: "患者出差，改约下月初", patientName: "钱伟东", phone: "136****6789" },
];

const initialTimelines: TreatmentTimeline[] = projectData.records.map((r, i) =>
  buildTimelineForRecord(`tl${i + 1}`, r[0], r[1], r[3], r[4], "2026-06-10")
);

const initialWorkingLengths: WorkingLengthRecord[] = [
  {
    id: "wl1",
    caseId: toothToCaseId["#36"] || "",
    toothPosition: "#36",
    note: "近中双根管，电测法确认",
    entries: [
      { id: "c1", canalName: "MB", measuredLength: "19.5", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c2", canalName: "ML", measuredLength: "18.5", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c3", canalName: "DB", measuredLength: "20.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "待确认", isSupplementary: false },
    ],
  },
  {
    id: "wl2",
    caseId: toothToCaseId["#11"] || "",
    toothPosition: "#11",
    note: "单根管，冷侧压完成",
    entries: [
      { id: "c4", canalName: "单根管", measuredLength: "23.0", referenceApex: "牙本质牙骨质界", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
    ],
  },
  {
    id: "wl3",
    caseId: toothToCaseId["#46"] || "",
    toothPosition: "#46",
    note: "近中双根管需复诊测长",
    entries: [
      { id: "c5", canalName: "MB", measuredLength: "19.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "待确认", isSupplementary: false },
      { id: "c6", canalName: "ML", measuredLength: "18.5", referenceApex: "根尖孔", measurementMethod: "手感法", confirmedStatus: "需重测", isSupplementary: false },
    ],
  },
  {
    id: "wl4",
    caseId: toothToCaseId["#25"] || "",
    toothPosition: "#25",
    note: "MB2遗漏根管补录",
    entries: [
      { id: "c7", canalName: "MB", measuredLength: "18.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c8", canalName: "MB2", measuredLength: "18.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: true },
    ],
  },
  {
    id: "wl5",
    caseId: toothToCaseId["#47"] || "",
    toothPosition: "#47",
    note: "远中根弯曲",
    entries: [
      { id: "c9", canalName: "近中", measuredLength: "19.5", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c10", canalName: "远中", measuredLength: "20.0", referenceApex: "根尖孔", measurementMethod: "X线估测法", confirmedStatus: "待确认", isSupplementary: false },
    ],
  },
  {
    id: "wl6",
    caseId: toothToCaseId["#31"] || "",
    toothPosition: "#31",
    note: "根尖孔闭合",
    entries: [
      { id: "c11", canalName: "单根管", measuredLength: "17.0", referenceApex: "解剖根尖孔", measurementMethod: "手感法", confirmedStatus: "已确认", isSupplementary: false },
    ],
  },
];

export const getInitialData = (): AppData => ({
  records: projectData.records,
  caseInfos: projectData.caseInfos,
  operationLogs: projectData.operationLogs,
  followUpPlans: initialFollowUpPlans,
  workingLengths: initialWorkingLengths,
  timelines: initialTimelines,
  activeStage: null,
  changeQueue: [],
  conflicts: [],
  syncStatus: "online",
  lastSyncAt: new Date().toISOString().replace("T", " ").slice(0, 19),
});

const DATA_KEY = "main";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

export async function saveData(data: AppData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ key: DATA_KEY, ...data });

    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function loadData(): Promise<AppData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(DATA_KEY);

    request.onsuccess = () => {
      db.close();
      const result = request.result;
      if (!result) {
        resolve(null);
      } else {
        const { key, ...data } = result;
        resolve(data as AppData);
      }
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function hasData(): Promise<boolean> {
  const data = await loadData();
  return data !== null;
}

export async function clearData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(DATA_KEY);

    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function resetToInitialData(): Promise<AppData> {
  await clearData();
  const initial = getInitialData();
  await saveData(initial);
  return initial;
}

export async function initDB(): Promise<AppData> {
  const existing = await loadData();
  if (existing) {
    return existing;
  }
  const initial = getInitialData();
  await saveData(initial);
  return initial;
}
