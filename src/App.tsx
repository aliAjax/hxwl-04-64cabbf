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
} from "./db";
import {
  buildCaseSummaries,
  generateCSV,
  downloadCSV,
  generatePrintableHTML,
  openPrintWindow,
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

function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>("医生");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [records, setRecords] = useState<string[][]>([]);
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
  const [timelines, setTimelines] = useState<TreatmentTimeline[]>([]);
  const [selectedToothPosition, setSelectedToothPosition] = useState<string | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft>({
    toothPosition: "",
    editingNodeId: null,
    node: null,
  });
  const [timelineDraftError, setTimelineDraftError] = useState<string>("");
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [followUpEditDraft, setFollowUpEditDraft] = useState<FollowUpEditDraft>({
    id: null,
    plan: null,
  });
  const [showFollowUpEditModal, setShowFollowUpEditModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  const isInitialized = useRef(false);
  const isPersistEnabled = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await initDB();
        setRecords(data.records);
        setFollowUpPlans(data.followUpPlans);
        setWorkingLengths(data.workingLengths);
        setTimelines(data.timelines);
        setActiveStage(data.activeStage);
        isInitialized.current = true;
        isPersistEnabled.current = true;
      } catch (err) {
        console.error("初始化 IndexedDB 失败：", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isPersistEnabled.current) return;
    const data: AppData = {
      records,
      followUpPlans,
      workingLengths,
      timelines,
      activeStage,
    };
    saveData(data).catch(err => console.error("保存数据失败：", err));
  }, [records, followUpPlans, workingLengths, timelines, activeStage]);

  const handleResetData = async () => {
    if (!confirm("确定要清空所有本地数据并恢复到初始示例数据吗？此操作不可撤销。")) {
      return;
    }
    try {
      setIsResetting(true);
      isPersistEnabled.current = false;
      const initial = await resetToInitialData();
      setRecords(initial.records);
      setFollowUpPlans(initial.followUpPlans);
      setWorkingLengths(initial.workingLengths);
      setTimelines(initial.timelines);
      setActiveStage(initial.activeStage);
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
        contactStatus: "待联系",
        contactNote: "",
        patientName: "",
        phone: "",
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
    if (activeStage) {
      return `${activeStage}阶段`;
    }
    return "全部病例";
  };

  const handleExportCSV = () => {
    const summaries = buildCaseSummaries(filteredRecords, followUpPlans, workingLengths);
    const csvContent = generateCSV(summaries);
    const dateStr = new Date().toISOString().split("T")[0];
    const filterName = activeStage || "全部";
    const filename = `根管治疗病例摘要_${filterName}_${dateStr}.csv`;
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
    setFollowUpPlans(prev => prev.map(plan =>
      plan.id === followUpEditDraft.id ? followUpEditDraft.plan! : plan
    ));
    closeFollowUpEdit();
  };

  const updateContactStatus = (planId: string, status: ContactStatus) => {
    setFollowUpPlans(prev => prev.map(plan =>
      plan.id === planId ? { ...plan, contactStatus: status } : plan
    ));
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
                <strong>{records.filter(r => r[2] === "充填").length}</strong>
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
              💡 您可以在下方「复诊计划」区域管理所有复诊安排，更新联系状态和患者信息。
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
          {(currentRole === "前台" ? sortedAndFilteredPlans : sortedPlans).length > 0 ? (
            (currentRole === "前台" ? sortedAndFilteredPlans : sortedPlans).map((plan) => {
              const daysUntil = getDaysUntil(plan.nextDate);
              let urgencyClass = "";
              if (daysUntil < 0) urgencyClass = "followup-card--overdue";
              else if (daysUntil <= 3) urgencyClass = "followup-card--urgent";
              else urgencyClass = "followup-card--normal";

              return (
                <article key={plan.id} className={`followup-card ${urgencyClass} ${currentRole === "前台" ? "followup-card--reception" : ""}`}>
                  <div className="followup-card-header">
                    <div>
                      <h3>{plan.toothPosition}</h3>
                      {currentRole === "前台" && plan.patientName && (
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

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content modal-content--export" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">病例摘要导出</p>
                <h2 className="modal-title">选择导出格式</h2>
              </div>
              <button className="modal-close" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="export-hint">
                当前筛选：<strong>{getFilterLabel()}</strong> · 共 <strong>{filteredRecords.length}</strong> 条记录
              </p>
              <div className="export-options">
                <button className="export-option" onClick={handleExportCSV}>
                  <div className="export-option-icon">📊</div>
                  <div className="export-option-content">
                    <h3>CSV 格式</h3>
                    <p>可直接用 Excel 打开，方便数据整理和统计分析</p>
                  </div>
                </button>
                <button className="export-option" onClick={handleExportHTML}>
                  <div className="export-option-icon">📄</div>
                  <div className="export-option-content">
                    <h3>可打印 HTML</h3>
                    <p>生成美观的打印页面，可直接打印或保存为 PDF</p>
                  </div>
                </button>
              </div>
              <div className="export-fields-info">
                <p className="export-fields-title">导出字段：</p>
                <div className="export-field-tags">
                  <span className="export-field-tag">患者姓名</span>
                  <span className="export-field-tag">牙位</span>
                  <span className="export-field-tag">诊断</span>
                  <span className="export-field-tag">当前阶段</span>
                  <span className="export-field-tag">工作长度</span>
                  <span className="export-field-tag">封药状态</span>
                  <span className="export-field-tag">复诊计划</span>
                  <span className="export-field-tag">备注</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
