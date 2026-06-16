import { useState } from "react";
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

const steps = ["开髓", "测长", "根管预备", "冲洗", "封药", "充填"];

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
            filteredRecords.map((record: string[], index: number) => (
              <article key={record.join("-") + index} className="record-card">
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
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <p>该阶段暂无病例记录</p>
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
    </main>
  );
}

export default App;
