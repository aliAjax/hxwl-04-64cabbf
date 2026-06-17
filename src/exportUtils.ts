import { FollowUpPlan, WorkingLengthRecord } from "./db";

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
    const toothPosition = record[0];
    const diagnosis = record[1];
    const currentStage = record[2];
    const detail = record[3] || "";

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
