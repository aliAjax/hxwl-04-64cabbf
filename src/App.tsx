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
      "MB 19.5mm，主尖锉#30"
    ],
    [
      "#11",
      "外伤后变色",
      "充填",
      "单根管，冷侧压完成"
    ],
    [
      "#46",
      "急性牙髓炎",
      "测长",
      "近中双根管需复诊"
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
}

interface FormErrors {
  toothPosition?: string;
  diagnosis?: string;
  currentStep?: string;
}

const statusColors = ["status-ok", "status-watch", "status-danger"];

const steps = ["开髓", "测长", "根管预备", "封药", "充填"];

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
};

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [records, setRecords] = useState<string[][]>(project.records);
  const [formData, setFormData] = useState<CaseRecord>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});

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
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
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
            <p>示例数据</p>
            <h2>近期记录</h2>
          </div>
          <button>导出摘要</button>
        </div>
        <div className="record-list">
          {records.map((record: string[], index: number) => (
            <article key={record.join("-") + index} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{record[0]}</h3>
                <p>{record.slice(1).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
