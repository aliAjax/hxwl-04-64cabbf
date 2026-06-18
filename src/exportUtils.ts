import { FollowUpPlan, WorkingLengthRecord, OperationLog, CaseBasicInfo, TreatmentTimeline } from "./db";

export type ExportFieldGroup = "basic" | "canal" | "followup" | "logs";
export type ExportFormat = "csv" | "html";
export type ExportScope = "all" | "filtered" | "custom";

export interface ExportField {
  key: string;
  label: string;
  group: ExportFieldGroup;
  defaultValue?: string;
}

export interface ExportConfig {
  scope: ExportScope;
  customStages: string[];
  selectedFields: string[];
  format: ExportFormat;
}

export interface CaseSummaryRow {
  [key: string]: string;
}

export const EXPORT_FIELD_GROUPS: Record<ExportFieldGroup, { label: string; fields: ExportField[] }> = {
  basic: {
    label: "病例基础字段",
    fields: [
      { key: "patientName", label: "患者姓名", group: "basic" },
      { key: "phone", label: "联系电话", group: "basic" },
      { key: "toothPosition", label: "牙位", group: "basic" },
      { key: "diagnosis", label: "诊断", group: "basic" },
      { key: "currentStage", label: "当前阶段", group: "basic" },
      { key: "workingLength", label: "工作长度摘要", group: "basic" },
      { key: "mainFileNumber", label: "主尖锉号", group: "basic" },
      { key: "medicationStatus", label: "封药状态", group: "basic" },
      { key: "remark", label: "备注", group: "basic" },
      { key: "createdAt", label: "创建日期", group: "basic" },
      { key: "updatedAt", label: "更新日期", group: "basic" },
    ],
  },
  canal: {
    label: "根管明细",
    fields: [
      { key: "canalDetails", label: "根管明细（全部）", group: "canal" },
      { key: "canalCount", label: "根管数量", group: "canal" },
      { key: "canalConfirmedCount", label: "已确认根管数", group: "canal" },
      { key: "canalNote", label: "工作长度备注", group: "canal" },
    ],
  },
  followup: {
    label: "复诊计划",
    fields: [
      { key: "followUpDate", label: "复诊日期", group: "followup" },
      { key: "followUpDoctor", label: "负责医生", group: "followup" },
      { key: "followUpReason", label: "复诊原因", group: "followup" },
      { key: "followUpContactStatus", label: "联系状态", group: "followup" },
      { key: "followUpContactNote", label: "联系备注", group: "followup" },
    ],
  },
  logs: {
    label: "操作日志摘要",
    fields: [
      { key: "lastOperation", label: "最近操作", group: "logs" },
      { key: "operationCount", label: "操作次数", group: "logs" },
      { key: "operationSummary", label: "操作摘要", group: "logs" },
    ],
  },
};

export const ALL_EXPORT_FIELDS: ExportField[] = Object.values(EXPORT_FIELD_GROUPS).flatMap(
  (g) => g.fields
);

export const DEFAULT_SELECTED_FIELDS: string[] = [
  "patientName",
  "toothPosition",
  "diagnosis",
  "currentStage",
  "workingLength",
  "medicationStatus",
  "followUpDate",
  "followUpReason",
  "remark",
];

export interface BuildSummaryOptions {
  records: string[][];
  caseInfos: CaseBasicInfo[];
  followUpPlans: FollowUpPlan[];
  workingLengths: WorkingLengthRecord[];
  operationLogs: OperationLog[];
  timelines: TreatmentTimeline[];
  selectedFields: string[];
}

function findCaseInfoById(caseInfos: CaseBasicInfo[], caseId: string): CaseBasicInfo | undefined {
  return caseInfos.find((c) => c.id === caseId);
}

function findFollowUpByCaseId(followUpPlans: FollowUpPlan[], caseId: string): FollowUpPlan | undefined {
  return followUpPlans.find((p) => p.caseId === caseId);
}

function findWorkingLengthByCaseId(
  workingLengths: WorkingLengthRecord[],
  caseId: string
): WorkingLengthRecord | undefined {
  return workingLengths.find((w) => w.caseId === caseId);
}

function findLogsByCaseId(operationLogs: OperationLog[], caseId: string): OperationLog[] {
  return operationLogs.filter((l) => l.caseId === caseId);
}

export function buildSummaryRows(options: BuildSummaryOptions): CaseSummaryRow[] {
  const { records, caseInfos, followUpPlans, workingLengths, operationLogs, selectedFields } = options;

  return records.map((record) => {
    const caseId = record[0];
    const toothPosition = record[1];
    const diagnosis = record[2];
    const currentStage = record[3];
    const detail = record[4] || "";

    const caseInfo = findCaseInfoById(caseInfos, caseId);
    const followUp = findFollowUpByCaseId(followUpPlans, caseId);
    const wlRecord = findWorkingLengthByCaseId(workingLengths, caseId);
    const logs = findLogsByCaseId(operationLogs, caseId);

    const row: CaseSummaryRow = {};

    const fieldValueMap: Record<string, string> = {};

    const patientName = caseInfo?.patientName || followUp?.patientName || "未填写";
    const phone = caseInfo?.phone || followUp?.phone || "-";

    let workingLength = "-";
    if (wlRecord && wlRecord.entries.length > 0) {
      workingLength = wlRecord.entries
        .map((e) => `${e.canalName || "未命名"} ${e.measuredLength ? e.measuredLength + "mm" : "未填"}`)
        .join("；");
    } else {
      const wlMatch = detail.match(/工作长度\s*([^，]+)/);
      if (wlMatch) {
        workingLength = wlMatch[1];
      }
    }

    let medicationStatus = "-";
    const medMatch = detail.match(/封药[：:]\s*([^，]+)/);
    if (medMatch) {
      medicationStatus = medMatch[1];
    } else if (currentStage === "封药") {
      medicationStatus = "封药中";
    } else if (caseInfo?.medication) {
      medicationStatus = caseInfo.medication;
    }

    let remark = "-";
    if (wlRecord?.note) {
      remark = wlRecord.note;
    } else if (caseInfo?.remark && caseInfo.remark !== "无附加信息") {
      remark = caseInfo.remark;
    } else if (detail && detail !== "无附加信息") {
      const parts = detail.split("，");
      const nonWlParts = parts.filter(
        (p) => !p.startsWith("工作长度") && !p.startsWith("主尖锉") && !p.startsWith("封药")
      );
      if (nonWlParts.length > 0) {
        remark = nonWlParts.join("，");
      }
    }

    fieldValueMap["patientName"] = patientName;
    fieldValueMap["phone"] = phone;
    fieldValueMap["toothPosition"] = toothPosition;
    fieldValueMap["diagnosis"] = diagnosis || caseInfo?.diagnosis || "-";
    fieldValueMap["currentStage"] = currentStage;
    fieldValueMap["workingLength"] = workingLength;
    fieldValueMap["mainFileNumber"] = caseInfo?.mainFileNumber || "-";
    fieldValueMap["medicationStatus"] = medicationStatus;
    fieldValueMap["remark"] = remark;
    fieldValueMap["createdAt"] = caseInfo?.createdAt || "-";
    fieldValueMap["updatedAt"] = caseInfo?.updatedAt || "-";

    if (wlRecord && wlRecord.entries.length > 0) {
      fieldValueMap["canalDetails"] = wlRecord.entries
        .map(
          (e) =>
            `${e.canalName || "未命名"}: ${e.measuredLength ? e.measuredLength + "mm" : "未填"} (${e.referenceApex}, ${e.measurementMethod}, ${e.confirmedStatus})${e.isSupplementary ? " [补录]" : ""}`
        )
        .join("\n");
      fieldValueMap["canalCount"] = String(wlRecord.entries.length);
      fieldValueMap["canalConfirmedCount"] = String(
        wlRecord.entries.filter((e) => e.confirmedStatus === "已确认").length
      );
      fieldValueMap["canalNote"] = wlRecord.note || "-";
    } else {
      fieldValueMap["canalDetails"] = "-";
      fieldValueMap["canalCount"] = "0";
      fieldValueMap["canalConfirmedCount"] = "0";
      fieldValueMap["canalNote"] = "-";
    }

    if (followUp) {
      fieldValueMap["followUpDate"] = followUp.nextDate;
      fieldValueMap["followUpDoctor"] = followUp.doctor;
      fieldValueMap["followUpReason"] = followUp.reason;
      fieldValueMap["followUpContactStatus"] = followUp.contactStatus;
      fieldValueMap["followUpContactNote"] = followUp.contactNote || "-";
    } else {
      fieldValueMap["followUpDate"] = "-";
      fieldValueMap["followUpDoctor"] = "-";
      fieldValueMap["followUpReason"] = "-";
      fieldValueMap["followUpContactStatus"] = "-";
      fieldValueMap["followUpContactNote"] = "-";
    }

    if (logs.length > 0) {
      const lastLog = logs[0];
      fieldValueMap["lastOperation"] = `${lastLog.timestamp} · ${lastLog.operator} · ${lastLog.action}`;
      fieldValueMap["operationCount"] = String(logs.length);
      fieldValueMap["operationSummary"] = logs
        .slice(0, 5)
        .map((l) => `[${l.timestamp}] ${l.operator}(${l.role}): ${l.action} - ${l.detail}`)
        .join("\n");
    } else {
      fieldValueMap["lastOperation"] = "-";
      fieldValueMap["operationCount"] = "0";
      fieldValueMap["operationSummary"] = "-";
    }

    selectedFields.forEach((fieldKey) => {
      row[fieldKey] = fieldValueMap[fieldKey] || "-";
    });

    return row;
  });
}

export function getFieldLabel(fieldKey: string): string {
  const field = ALL_EXPORT_FIELDS.find((f) => f.key === fieldKey);
  return field?.label || fieldKey;
}

export interface CaseSummary {
  patientName: string;
  toothPosition: string;
  diagnosis: string;
  currentStage: string;
  workingLength: string;
  medicationStatus: string;
  followUpPlan: string;
  remark: string;
}

export function buildCaseSummaries(
  filteredRecords: string[][],
  followUpPlans: FollowUpPlan[],
  workingLengths: WorkingLengthRecord[]
): CaseSummary[] {
  return filteredRecords.map((record) => {
    const caseId = record[0];
    const toothPosition = record[1];
    const diagnosis = record[2];
    const currentStage = record[3];
    const detail = record[4] || "";

    const followUp = followUpPlans.find((p) => p.toothPosition === toothPosition);
    const wlRecord = workingLengths.find((w) => w.toothPosition === toothPosition);

    const patientName = followUp?.patientName || "未填写";

    let workingLength = "-";
    if (wlRecord && wlRecord.entries.length > 0) {
      workingLength = wlRecord.entries
        .map((e) => `${e.canalName || "未命名"} ${e.measuredLength ? e.measuredLength + "mm" : "未填"}`)
        .join("；");
    } else {
      const wlMatch = detail.match(/工作长度\s*([^，]+)/);
      if (wlMatch) {
        workingLength = wlMatch[1];
      }
    }

    let medicationStatus = "-";
    const medMatch = detail.match(/封药[：:]\s*([^，]+)/);
    if (medMatch) {
      medicationStatus = medMatch[1];
    } else if (currentStage === "封药") {
      medicationStatus = "封药中";
    }

    let followUpPlan = "-";
    if (followUp) {
      followUpPlan = `${followUp.nextDate} · ${followUp.doctor} · ${followUp.reason}`;
    }

    let remark = "-";
    if (wlRecord?.note) {
      remark = wlRecord.note;
    } else if (detail && detail !== "无附加信息") {
      const parts = detail.split("，");
      const nonWlParts = parts.filter(
        (p) => !p.startsWith("工作长度") && !p.startsWith("主尖锉") && !p.startsWith("封药")
      );
      if (nonWlParts.length > 0) {
        remark = nonWlParts.join("，");
      }
    }

    return {
      patientName,
      toothPosition,
      diagnosis,
      currentStage,
      workingLength,
      medicationStatus,
      followUpPlan,
      remark,
    };
  });
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function generateCSVFromRows(rows: CaseSummaryRow[], selectedFields: string[]): string {
  const headers = selectedFields.map(getFieldLabel);
  const headerRow = headers.map(escapeCSV).join(",");

  const dataRows = rows.map((row) =>
    selectedFields.map((fieldKey) => escapeCSV(row[fieldKey] || "-")).join(",")
  );

  const BOM = "\uFEFF";
  return BOM + [headerRow, ...dataRows].join("\n");
}

export function generateCSV(summaries: CaseSummary[]): string {
  const headers = ["患者姓名", "牙位", "诊断", "当前阶段", "工作长度", "封药状态", "复诊计划", "备注"];
  const headerRow = headers.map(escapeCSV).join(",");

  const dataRows = summaries.map((s) =>
    [
      s.patientName,
      s.toothPosition,
      s.diagnosis,
      s.currentStage,
      s.workingLength,
      s.medicationStatus,
      s.followUpPlan,
      s.remark,
    ]
      .map(escapeCSV)
      .join(",")
  );

  const BOM = "\uFEFF";
  return BOM + [headerRow, ...dataRows].join("\n");
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generatePrintableHTMLFromRows(
  rows: CaseSummaryRow[],
  selectedFields: string[],
  filterLabel: string
): string {
  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const headers = selectedFields.map(getFieldLabel);

  const rowsHTML = rows
    .map(
      (row, index) => `
    <tr>
      <td>${index + 1}</td>
      ${selectedFields.map((fieldKey) => `<td>${escapeHTML(row[fieldKey] || "-").replace(/\n/g, "<br>")}</td>`).join("")}
    </tr>
  `
    )
    .join("");

  const filledCount = rows.filter((r) => r["currentStage"] === "充填").length;
  const medicationCount = rows.filter(
    (r) => r["medicationStatus"] && r["medicationStatus"] !== "-" && r["medicationStatus"] !== "封药中"
  ).length;
  const sealingCount = rows.filter((r) => r["currentStage"] === "封药").length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>根管治疗病例摘要 - ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      padding: 24px;
      color: #1f2937;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #0369a1;
    }
    .header h1 {
      font-size: 24px;
      color: #0369a1;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .header .date {
      color: #6b7280;
      font-size: 13px;
      margin-top: 4px;
    }
    .filter-info {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      color: #0369a1;
    }
    .fields-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 12px;
      color: #64748b;
    }
    .fields-info strong {
      color: #475569;
    }
    .stats {
      display: flex;
      gap: 24px;
      margin-bottom: 20px;
    }
    .stat-item {
      flex: 1;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-item strong {
      display: block;
      font-size: 24px;
      color: #0369a1;
    }
    .stat-item span {
      font-size: 13px;
      color: #6b7280;
    }
    .table-wrapper {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      white-space: pre-wrap;
      word-break: break-word;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    tbody tr:hover {
      background: #f0f9ff;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      text-align: right;
      color: #9ca3af;
      font-size: 12px;
    }
    @media print {
      body { padding: 16px; }
      .header { border-bottom-color: #000; }
      .header h1 { color: #000; }
      .filter-info { background: #fff; border-color: #ccc; color: #333; }
      th { background: #f0f0f0; }
      .stat-item strong { color: #000; }
      .table-wrapper { overflow-x: visible; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>根管治疗病例摘要</h1>
    <div class="subtitle">牙体牙髓科 · 治疗进展汇总</div>
    <div class="date">导出日期：${dateStr}</div>
  </div>
  
  <div class="filter-info">
    当前筛选：${escapeHTML(filterLabel)} · 共 ${rows.length} 条记录
  </div>

  <div class="fields-info">
    <strong>导出字段：</strong>${headers.map(escapeHTML).join(" · ")}
  </div>

  <div class="stats">
    <div class="stat-item">
      <strong>${rows.length}</strong>
      <span>病例总数</span>
    </div>
    <div class="stat-item">
      <strong>${filledCount}</strong>
      <span>已充填</span>
    </div>
    <div class="stat-item">
      <strong>${sealingCount}</strong>
      <span>封药中</span>
    </div>
    <div class="stat-item">
      <strong>${medicationCount}</strong>
      <span>有封药记录</span>
    </div>
  </div>

  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th>序号</th>
          ${headers.map((h) => `<th>${escapeHTML(h)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  </div>

  <div class="footer">
    本摘要由系统自动生成，仅供临床参考
  </div>
</body>
</html>`;
}

export function generatePrintableHTML(
  summaries: CaseSummary[],
  filterLabel: string
): string {
  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rowsHTML = summaries
    .map(
      (s, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(s.patientName)}</td>
      <td>${escapeHTML(s.toothPosition)}</td>
      <td>${escapeHTML(s.diagnosis)}</td>
      <td>${escapeHTML(s.currentStage)}</td>
      <td>${escapeHTML(s.workingLength)}</td>
      <td>${escapeHTML(s.medicationStatus)}</td>
      <td>${escapeHTML(s.followUpPlan)}</td>
      <td>${escapeHTML(s.remark)}</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>根管治疗病例摘要 - ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      padding: 24px;
      color: #1f2937;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #0369a1;
    }
    .header h1 {
      font-size: 24px;
      color: #0369a1;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .header .date {
      color: #6b7280;
      font-size: 13px;
      margin-top: 4px;
    }
    .filter-info {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      color: #0369a1;
    }
    .stats {
      display: flex;
      gap: 24px;
      margin-bottom: 20px;
    }
    .stat-item {
      flex: 1;
      background: #f8fafc;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-item strong {
      display: block;
      font-size: 24px;
      color: #0369a1;
    }
    .stat-item span {
      font-size: 13px;
      color: #6b7280;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    tbody tr:hover {
      background: #f0f9ff;
    }
    .footer {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      text-align: right;
      color: #9ca3af;
      font-size: 12px;
    }
    @media print {
      body { padding: 16px; }
      .header { border-bottom-color: #000; }
      .header h1 { color: #000; }
      .filter-info { background: #fff; border-color: #ccc; color: #333; }
      th { background: #f0f0f0; }
      .stat-item strong { color: #000; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>根管治疗病例摘要</h1>
    <div class="subtitle">牙体牙髓科 · 治疗进展汇总</div>
    <div class="date">导出日期：${dateStr}</div>
  </div>
  
  <div class="filter-info">
    当前筛选：${escapeHTML(filterLabel)} · 共 ${summaries.length} 条记录
  </div>

  <div class="stats">
    <div class="stat-item">
      <strong>${summaries.length}</strong>
      <span>病例总数</span>
    </div>
    <div class="stat-item">
      <strong>${summaries.filter((s) => s.currentStage === "充填").length}</strong>
      <span>已充填</span>
    </div>
    <div class="stat-item">
      <strong>${summaries.filter((s) => s.currentStage === "封药").length}</strong>
      <span>封药中</span>
    </div>
    <div class="stat-item">
      <strong>${summaries.filter((s) => s.medicationStatus !== "-" && s.medicationStatus !== "封药中").length}</strong>
      <span>有封药记录</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>患者姓名</th>
        <th>牙位</th>
        <th>诊断</th>
        <th>当前阶段</th>
        <th>工作长度</th>
        <th>封药状态</th>
        <th>复诊计划</th>
        <th>备注</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
  </table>

  <div class="footer">
    本摘要由系统自动生成，仅供临床参考
  </div>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function openPrintWindow(htmlContent: string): void {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}
