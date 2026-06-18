import React, { useState } from "react";
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
  ExportScope,
  ExportFormat,
  CaseSummaryRow,
} from "../exportUtils";
import {
  CaseBasicInfo,
  FollowUpPlan,
  WorkingLengthRecord,
  OperationLog,
  TreatmentTimeline,
} from "../db";

interface UseExportConfigParams {
  records: string[][];
  filteredRecords: string[][];
  caseInfos: CaseBasicInfo[];
  followUpPlans: FollowUpPlan[];
  workingLengths: WorkingLengthRecord[];
  operationLogs: OperationLog[];
  timelines: TreatmentTimeline[];
  activeStage: string | null;
  searchKeyword: string;
}

interface UseExportConfigReturn {
  showExportModal: boolean;
  setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;
  exportScope: ExportScope;
  setExportScope: React.Dispatch<React.SetStateAction<ExportScope>>;
  exportCustomStages: string[];
  setExportCustomStages: React.Dispatch<React.SetStateAction<string[]>>;
  exportSelectedFields: string[];
  setExportSelectedFields: React.Dispatch<React.SetStateAction<string[]>>;
  exportFormat: ExportFormat;
  setExportFormat: React.Dispatch<React.SetStateAction<ExportFormat>>;
  getExportScopeLabel: () => string;
  getRecordsForExport: () => string[][];
  toggleFieldSelection: (fieldKey: string) => void;
  toggleStageSelection: (stage: string) => void;
  selectAllFieldsInGroup: (groupKey: string) => void;
  handleExport: () => void;
  handleExportCSV: () => void;
  handleExportHTML: () => void;
}

export function useExportConfig(params: UseExportConfigParams): UseExportConfigReturn {
  const {
    records,
    filteredRecords,
    caseInfos,
    followUpPlans,
    workingLengths,
    operationLogs,
    timelines,
    activeStage,
    searchKeyword,
  } = params;

  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<ExportScope>("filtered");
  const [exportCustomStages, setExportCustomStages] = useState<string[]>([]);
  const [exportSelectedFields, setExportSelectedFields] = useState<string[]>(DEFAULT_SELECTED_FIELDS);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");

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

  return {
    showExportModal,
    setShowExportModal,
    exportScope,
    setExportScope,
    exportCustomStages,
    setExportCustomStages,
    exportSelectedFields,
    setExportSelectedFields,
    exportFormat,
    setExportFormat,
    getExportScopeLabel,
    getRecordsForExport,
    toggleFieldSelection,
    toggleStageSelection,
    selectAllFieldsInGroup,
    handleExport,
    handleExportCSV,
    handleExportHTML,
  };
}
