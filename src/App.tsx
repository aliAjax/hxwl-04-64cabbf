import React, { useState } from "react";
import "./styles.css";

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
  "records": [
    [
      "#36",
      "慢性根尖周炎",
      "封药",
      "MB 19.5mm，主尖锉#30",
      "待复诊"
    ],
    [
      "#11",
      "外伤后变色",
      "充填",
      "单根管，冷侧压完成",
      "已充填"
    ],
    [
      "#46",
      "急性牙髓炎",
      "测长",
      "近中双根管需复诊",
      "待复诊"
    ],
    [
      "#14",
      "深龋穿髓",
      "开髓",
      "开髓孔通畅，出血明显",
      "待复诊"
    ],
    [
      "#25",
      "慢性牙髓炎",
      "根管预备",
      "MB2 18mm，主尖锉#25",
      "待复诊"
    ],
    [
      "#37",
      "牙髓坏死",
      "冲洗",
      "3%NaClO冲洗，超声荡洗",
      "待复诊"
    ],
    [
      "#16",
      "急性根尖周炎",
      "开髓",
      "开髓引流，脓液溢出",
      "待复诊"
    ],
    [
      "#21",
      "牙体缺损",
      "充填",
      "热牙胶垂直加压，桩道预备",
      "已充填"
    ],
    [
      "#47",
      "慢性根尖周脓肿",
      "根管预备",
      "远中根20mm，弯曲根管",
      "待复诊"
    ],
    [
      "#15",
      "可逆性牙髓炎",
      "冲洗",
      "生理盐水冲洗，EDTA预备",
      "待复诊"
    ],
    [
      "#26",
      "隐裂牙",
      "封药",
      "Ca(OH)2封药，一周后复诊",
      "待复诊"
    ],
    [
      "#31",
      "外伤露髓",
      "测长",
      "17mm，根尖孔闭合",
      "待复诊"
    ],
    [
      "#45",
      "慢性牙髓炎急性发作",
      "根管预备",
      "预备至#30，5.25%NaClO冲洗",
      "待复诊"
    ],
    [
      "#24",
      "深龋",
      "开髓",
      "局麻下开髓，冠髓切除",
      "待复诊"
    ],
    [
      "#35",
      "根尖周炎",
      "充填",
      "恰填，术后片显示良好",
      "已充填"
    ]
  ]
};

interface CaseRecord {
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

interface FormErrors {
  toothPosition?: string;
  diagnosis?: string;
  currentStep?: string;
}

interface FollowUpPlan {
  id: string;
  toothPosition: string;
  nextDate: string;
  doctor: string;
  reason: string;
  reminderEnabled: boolean;
}

type ConfirmedStatus = "待确认" | "已确认" | "需重测";

interface CanalEntry {
  id: string;
  canalName: string;
  measuredLength: string;
  referenceApex: string;
  measurementMethod: string;
  confirmedStatus: ConfirmedStatus;
  isSupplementary: boolean;
}

interface WorkingLengthRecord {
  id: string;
  toothPosition: string;
  entries: CanalEntry[];
  note: string;
}

interface CanalDraft {
  toothPosition: string;
  entries: CanalEntry[];
  note: string;
  editingId: string | null;
}

type TreatmentStep = "开髓" | "测长" | "根管预备" | "冲洗" | "封药" | "充填";

interface TimelineNode {
  id: string;
  step: TreatmentStep;
  completedAt: string;
  operator: string;
  keyParams: string;
  exceptionNotes: string;
  isCompleted: boolean;
}

interface TreatmentTimeline {
  id: string;
  toothPosition: string;
  nodes: TimelineNode[];
  createdAt: string;
}

interface TimelineDraft {
  toothPosition: string;
  editingNodeId: string | null;
  node: TimelineNode | null;
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

function createInitialTimeline(toothPosition: string): TreatmentTimeline {
  return {
    id: `tl_${Date.now()}`,
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

const initialTimelines: TreatmentTimeline[] = project.records.map((r, i) =>
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
    ? records.filter(r => r[2] === activeStage)
    : records;

  const pendingReview = filteredRecords.filter(r => r[4] === "待复诊").length;
  const filled = filteredRecords.filter(r => r[2] === "充填").length;
  const medicationCases = filteredRecords.filter(r => r[2] === "封药").length;

  const lengths = filteredRecords
    .map(r => extractWorkingLength(r[3]))
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

function App() {
  const [records, setRecords] = useState<string[][]>(project.records);
  const [formData, setFormData] = useState<CaseRecord>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [followUpPlans, setFollowUpPlans] = useState<FollowUpPlan[]>(initialFollowUpPlans);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [workingLengths, setWorkingLengths] = useState<WorkingLengthRecord[]>(initialWorkingLengths);
  const [canalDraft, setCanalDraft] = useState<CanalDraft>({
    toothPosition: "",
    entries: [],
    note: "",
    editingId: null,
  });
  const [canalDraftError, setCanalDraftError] = useState<string>("");
  const [timelines, setTimelines] = useState<TreatmentTimeline[]>(initialTimelines);
  const [selectedToothPosition, setSelectedToothPosition] = useState<string | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft>({
    toothPosition: "",
    editingNodeId: null,
    node: null,
  });
  const [timelineDraftError, setTimelineDraftError] = useState<string>("");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  const metricValues = calculateMetrics(records, activeStage);
  const filteredRecords = activeStage
    ? records.filter(r => r[2] === activeStage)
    : records;

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
      setErrors(prev => ({ ...prev, [field]: undefined }));
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

    const newRecord: string[] = [
      formData.toothPosition,
      formData.diagnosis,
      formData.currentStep,
      details.join("，") || "无附加信息",
    ];

    setRecords(prev => [newRecord, ...prev]);

    const existingTimeline = findTimeline(formData.toothPosition.trim());
    if (!existingTimeline) {
      const newTimeline = buildTimelineForRecord(
        `tl_${Date.now()}`,
        formData.toothPosition.trim(),
        formData.currentStep,
        details.join("，") || "无附加信息",
        new Date().toISOString().split("T")[0],
      );
      setTimelines(prev => [newTimeline, ...prev]);
    }

    if (formData.followUpDate) {
      const newPlan: FollowUpPlan = {
        id: `fp_${Date.now()}`,
        toothPosition: formData.toothPosition,
        nextDate: formData.followUpDate,
        doctor: formData.followUpDoctor || "待分配",
        reason: formData.followUpReason || `${formData.currentStep}后复诊`,
        reminderEnabled: formData.followUpReminder,
      };
      setFollowUpPlans(prev => [newPlan, ...prev]);
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

    if (canalDraft.editingId) {
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
    } else {
      const newRecord: WorkingLengthRecord = {
        id: `wl_${Date.now()}`,
        toothPosition: canalDraft.toothPosition.trim(),
        entries: validEntries,
        note: canalDraft.note,
      };
      setWorkingLengths(prev => [newRecord, ...prev]);
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

  const getOrCreateTimeline = (toothPosition: string): TreatmentTimeline => {
    const existing = findTimeline(toothPosition);
    if (existing) return existing;
    const newTimeline = createInitialTimeline(toothPosition);
    setTimelines(prev => [newTimeline, ...prev]);
    return newTimeline;
  };

  const openDetailModal = (toothPosition: string) => {
    getOrCreateTimeline(toothPosition);
    setSelectedToothPosition(toothPosition);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedToothPosition(null);
    setTimelineDraft({ toothPosition: "", editingNodeId: null, node: null });
    setTimelineDraftError("");
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

    setTimelines(prev => prev.map(timeline => {
      if (timeline.toothPosition !== selectedToothPosition) return timeline;
      return {
        ...timeline,
        nodes: timeline.nodes.map(n =>
          n.id === node.id ? node : n
        ),
      };
    }));

    cancelEditingNode();
  };

  const toggleNodeCompletion = (timelineId: string, nodeId: string) => {
    setTimelines(prev => prev.map(timeline => {
      if (timeline.toothPosition !== timelineId) return timeline;
      return {
        ...timeline,
        nodes: timeline.nodes.map(n => {
          if (n.id === nodeId) {
            const isCompleted = !n.isCompleted;
            return {
              ...n,
              isCompleted,
              completedAt: isCompleted && !n.completedAt
                ? new Date().toISOString().replace("T", " ").slice(0, 16)
                : n.completedAt,
            };
          }
          return n;
        }),
      };
    }));
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      <section className="stage-tabs">
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
              {records.filter(r => r[2] === stage).length}
            </span>
          </button>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>病例录入</h2>
            </div>
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
            <button type="button" onClick={handleSubmit} className="primary-action">提交病例</button>
          </div>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>{activeStage ? `${activeStage}阶段` : "全部病例"}</p>
            <h2>
              {activeStage ? `${activeStage}病例` : "近期记录"}
              <span className="record-total">共 {filteredRecords.length} 条</span>
            </h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record: string[], index: number) => {
              const wlRecord = findWorkingLength(record[0]);
              const confirmedCount = wlRecord
                ? wlRecord.entries.filter(e => e.confirmedStatus === "已确认").length
                : 0;
              const timeline = findTimeline(record[0]);
              const currentStepIdx = timeline ? getCurrentStepIndex(timeline.nodes) : -1;
              return (
                <article key={record.join("-") + index} className="record-card" onClick={() => openDetailModal(record[0])}>
                  <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="record-content">
                    <div className="record-header">
                      <h3>{record[0]}</h3>
                      <span
                        className="stage-badge"
                        style={{ backgroundColor: stageColors[record[2]] }}
                      >
                        {record[2]}
                      </span>
                    </div>
                    <p>{record.slice(1, 4).join(" · ")}</p>
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
                                }}
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
                                  }}
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
            <label className="wl-tooth-input">
              <span>牙位 <span className="required">*</span></span>
              <input
                placeholder="例如：#36"
                value={canalDraft.toothPosition}
                onChange={(e) => handleCanalDraftChange("toothPosition", e.target.value)}
              />
            </label>
            <span className="wl-form-hint">
              支持单根管、多根管及遗漏根管补录，同一牙位可录入多条根管明细
            </span>
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

      <section className="followup-section panel">
        <div className="section-heading">
          <div>
            <p>复诊管理</p>
            <h2>
              复诊计划
              <span className="record-total">共 {followUpPlans.length} 条</span>
            </h2>
          </div>
          <div className="followup-actions">
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
        <div className="followup-kanban">
          {sortedPlans.length > 0 ? (
            sortedPlans.map((plan) => {
              const daysUntil = getDaysUntil(plan.nextDate);
              let urgencyClass = "";
              if (daysUntil < 0) urgencyClass = "followup-card--overdue";
              else if (daysUntil <= 3) urgencyClass = "followup-card--urgent";
              else urgencyClass = "followup-card--normal";

              return (
                <article key={plan.id} className={`followup-card ${urgencyClass}`}>
                  <div className="followup-card-header">
                    <h3>{plan.toothPosition}</h3>
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
                    <div className="followup-detail">
                      <span className="followup-label">提醒状态</span>
                      <span className={`followup-value ${plan.reminderEnabled ? "reminder-on" : "reminder-off"}`}>
                        {plan.reminderEnabled ? "🔔 已开启" : "🔕 已关闭"}
                      </span>
                    </div>
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

      {showDetailModal && selectedToothPosition && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">根管治疗流程时间线</p>
                <h2 className="modal-title">
                  {selectedToothPosition} 治疗时间线
                </h2>
              </div>
              <button className="modal-close" onClick={closeDetailModal}>×</button>
            </div>
            {(() => {
              const timeline = findTimeline(selectedToothPosition);
              if (!timeline) return null;
              const currentIdx = getCurrentStepIndex(timeline.nodes);
              const completedCount = timeline.nodes.filter(n => n.isCompleted).length;
              return (
                <>
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
                              }}
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
                                }}
                              />
                            )}
                          </div>
                          <div className="timeline-detail-body">
                            <div className="timeline-detail-header">
                              <h3
                                className="timeline-detail-step"
                                style={{
                                  "--stage-color": stageColors[node.step],
                                }}
                              >
                                {node.step}
                              </h3>
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
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
