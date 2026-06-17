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

export interface FollowUpPlan {
  id: string;
  toothPosition: string;
  nextDate: string;
  doctor: string;
  reason: string;
  reminderEnabled: boolean;
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
  toothPosition: string;
  entries: CanalEntry[];
  note: string;
}

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
  toothPosition: string;
  nodes: TimelineNode[];
  createdAt: string;
}

export interface FormErrors {
  toothPosition?: string;
  diagnosis?: string;
  currentStep?: string;
}

export interface AppData {
  records: string[][];
  followUpPlans: FollowUpPlan[];
  workingLengths: WorkingLengthRecord[];
  timelines: TreatmentTimeline[];
  activeStage: string | null;
}

const DB_NAME = "dental-rct-db";
const DB_VERSION = 1;
const STORE_NAME = "appData";

const projectData = {
  records: [
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
  ] as string[][],
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
  return { id, toothPosition, nodes, createdAt };
}

const initialFollowUpPlans: FollowUpPlan[] = [
  { id: "fp1", toothPosition: "#36", nextDate: "2026-06-14", doctor: "张医生", reason: "Ca(OH)2封药到期，需换药或根充", reminderEnabled: true },
  { id: "fp2", toothPosition: "#46", nextDate: "2026-06-18", doctor: "李医生", reason: "近中双根管继续测长", reminderEnabled: true },
  { id: "fp3", toothPosition: "#14", nextDate: "2026-06-20", doctor: "张医生", reason: "开髓后继续根管预备", reminderEnabled: false },
  { id: "fp4", toothPosition: "#25", nextDate: "2026-06-19", doctor: "王医生", reason: "根管预备完成后封药评估", reminderEnabled: true },
  { id: "fp5", toothPosition: "#37", nextDate: "2026-06-15", doctor: "李医生", reason: "冲洗后封药观察", reminderEnabled: true },
  { id: "fp6", toothPosition: "#16", nextDate: "2026-06-17", doctor: "张医生", reason: "开髓引流后复查", reminderEnabled: false },
  { id: "fp7", toothPosition: "#26", nextDate: "2026-06-22", doctor: "王医生", reason: "Ca(OH)2封药一周后复诊", reminderEnabled: true },
  { id: "fp8", toothPosition: "#31", nextDate: "2026-06-25", doctor: "李医生", reason: "测长后根管预备", reminderEnabled: false },
  { id: "fp9", toothPosition: "#47", nextDate: "2026-06-16", doctor: "张医生", reason: "弯曲根管预备复诊", reminderEnabled: true },
  { id: "fp10", toothPosition: "#15", nextDate: "2026-06-21", doctor: "王医生", reason: "冲洗后评估封药", reminderEnabled: true },
  { id: "fp11", toothPosition: "#45", nextDate: "2026-06-19", doctor: "李医生", reason: "根管预备后封药观察", reminderEnabled: true },
  { id: "fp12", toothPosition: "#24", nextDate: "2026-06-18", doctor: "张医生", reason: "局麻开髓后继续治疗", reminderEnabled: false },
];

const initialTimelines: TreatmentTimeline[] = projectData.records.map((r, i) =>
  buildTimelineForRecord(`tl${i + 1}`, r[0], r[2], r[3], "2026-06-10")
);

const initialWorkingLengths: WorkingLengthRecord[] = [
  {
    id: "wl1",
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
    toothPosition: "#11",
    note: "单根管，冷侧压完成",
    entries: [
      { id: "c4", canalName: "单根管", measuredLength: "23.0", referenceApex: "牙本质牙骨质界", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
    ],
  },
  {
    id: "wl3",
    toothPosition: "#46",
    note: "近中双根管需复诊测长",
    entries: [
      { id: "c5", canalName: "MB", measuredLength: "19.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "待确认", isSupplementary: false },
      { id: "c6", canalName: "ML", measuredLength: "18.5", referenceApex: "根尖孔", measurementMethod: "手感法", confirmedStatus: "需重测", isSupplementary: false },
    ],
  },
  {
    id: "wl4",
    toothPosition: "#25",
    note: "MB2遗漏根管补录",
    entries: [
      { id: "c7", canalName: "MB", measuredLength: "18.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c8", canalName: "MB2", measuredLength: "18.0", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: true },
    ],
  },
  {
    id: "wl5",
    toothPosition: "#47",
    note: "远中根弯曲",
    entries: [
      { id: "c9", canalName: "近中", measuredLength: "19.5", referenceApex: "根尖孔", measurementMethod: "电测法", confirmedStatus: "已确认", isSupplementary: false },
      { id: "c10", canalName: "远中", measuredLength: "20.0", referenceApex: "根尖孔", measurementMethod: "X线估测法", confirmedStatus: "待确认", isSupplementary: false },
    ],
  },
  {
    id: "wl6",
    toothPosition: "#31",
    note: "根尖孔闭合",
    entries: [
      { id: "c11", canalName: "单根管", measuredLength: "17.0", referenceApex: "解剖根尖孔", measurementMethod: "手感法", confirmedStatus: "已确认", isSupplementary: false },
    ],
  },
];

export const getInitialData = (): AppData => ({
  records: projectData.records,
  followUpPlans: initialFollowUpPlans,
  workingLengths: initialWorkingLengths,
  timelines: initialTimelines,
  activeStage: null,
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
