import React, { useState } from "react";
import {
  CaseBasicInfo,
  FollowUpPlan,
  WorkingLengthRecord,
  TreatmentTimeline,
  OperationLog,
  AppData,
  UserRole,
} from "../db";
import {
  ConsistencyIssue,
  ConsistencySeverity,
  ConsistencyIssueType,
  RepairPlan,
  RepairPreview,
  checkConsistency,
  generateRepairPreview as engineGenerateRepairPreview,
  applyRepairs as engineApplyRepairs,
  getIssueTypeLabel,
  getSeverityColor,
  getSeverityLabel,
} from "../consistency";

interface UseConsistencyCheckParams {
  currentRole: UserRole;
  records: string[][];
  caseInfos: CaseBasicInfo[];
  followUpPlans: FollowUpPlan[];
  workingLengths: WorkingLengthRecord[];
  timelines: TreatmentTimeline[];
  operationLogs: OperationLog[];
  setCaseInfos: React.Dispatch<React.SetStateAction<CaseBasicInfo[]>>;
  setFollowUpPlans: React.Dispatch<React.SetStateAction<FollowUpPlan[]>>;
  setWorkingLengths: React.Dispatch<React.SetStateAction<WorkingLengthRecord[]>>;
  setTimelines: React.Dispatch<React.SetStateAction<TreatmentTimeline[]>>;
  setRecords: React.Dispatch<React.SetStateAction<string[][]>>;
  setOperationLogs: React.Dispatch<React.SetStateAction<OperationLog[]>>;
  getCurrentAppData: () => AppData;
  applyDataState: (data: AppData) => void;
  findCaseInfoById: (caseId: string) => CaseBasicInfo | undefined;
  addOperationLog: (caseId: string, action: string, detail: string) => void;
}

interface UseConsistencyCheckReturn {
  consistencyIssues: ConsistencyIssue[];
  setConsistencyIssues: React.Dispatch<React.SetStateAction<ConsistencyIssue[]>>;
  showConsistencyPanel: boolean;
  setShowConsistencyPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showRepairPreview: boolean;
  setShowRepairPreview: React.Dispatch<React.SetStateAction<boolean>>;
  repairPreview: RepairPreview | null;
  setRepairPreview: React.Dispatch<React.SetStateAction<RepairPreview | null>>;
  isCheckingConsistency: boolean;
  setIsCheckingConsistency: React.Dispatch<React.SetStateAction<boolean>>;
  isApplyingRepairs: boolean;
  setIsApplyingRepairs: React.Dispatch<React.SetStateAction<boolean>>;
  lastConsistencyCheck: string;
  setLastConsistencyCheck: React.Dispatch<React.SetStateAction<string>>;
  consistencyFilter: string;
  setConsistencyFilter: React.Dispatch<React.SetStateAction<string>>;
  expandedIssueId: string | null;
  setExpandedIssueId: React.Dispatch<React.SetStateAction<string | null>>;
  filteredIssues: ConsistencyIssue[];
  getIssueTypeLabel: (issueType: ConsistencyIssueType) => string;
  getSeverityLabel: (severity: ConsistencySeverity) => string;
  getSeverityColor: (severity: ConsistencySeverity) => string;
  performConsistencyCheck: (silent?: boolean, inputData?: AppData) => Promise<ConsistencyIssue[]>;
  generateRepairPlanPreview: () => void;
  toggleRepairPlanSelection: (issueId: string) => void;
  selectAllRepairPlans: () => void;
  deselectAllRepairPlans: () => void;
  applySelectedRepairs: () => void;
}

export function useConsistencyCheck(params: UseConsistencyCheckParams): UseConsistencyCheckReturn {
  const {
    currentRole,
    records,
    caseInfos,
    followUpPlans,
    workingLengths,
    timelines,
    operationLogs,
    setCaseInfos,
    setFollowUpPlans,
    setWorkingLengths,
    setTimelines,
    setRecords,
    setOperationLogs,
    getCurrentAppData,
    applyDataState,
    findCaseInfoById,
    addOperationLog,
  } = params;

  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[]>([]);
  const [showConsistencyPanel, setShowConsistencyPanel] = useState<boolean>(false);
  const [showRepairPreview, setShowRepairPreview] = useState<boolean>(false);
  const [repairPreview, setRepairPreview] = useState<RepairPreview | null>(null);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState<boolean>(false);
  const [isApplyingRepairs, setIsApplyingRepairs] = useState<boolean>(false);
  const [lastConsistencyCheck, setLastConsistencyCheck] = useState<string>("");
  const [consistencyFilter, setConsistencyFilter] = useState<string>("all");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const filteredIssues = consistencyFilter === "all"
    ? consistencyIssues
    : consistencyIssues.filter(i => i.severity === consistencyFilter);

  const performConsistencyCheck = async (silent: boolean = false, inputData?: AppData): Promise<ConsistencyIssue[]> => {
    setIsCheckingConsistency(true);
    try {
      const data = inputData || getCurrentAppData();
      const issues = checkConsistency(data);
      setConsistencyIssues(issues);
      setLastConsistencyCheck(new Date().toISOString().replace("T", " ").slice(0, 19));

      if (!silent && issues.length > 0) {
        const errorCount = issues.filter(i => i.severity === "error").length;
        const warningCount = issues.filter(i => i.severity === "warning").length;
        if (errorCount > 0 || warningCount > 0) {
          setShowConsistencyPanel(true);
        }
      }

      return issues;
    } catch (err) {
      console.error("一致性校验失败：", err);
      if (!silent) {
        alert("一致性校验失败，请查看控制台。");
      }
      return [];
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  const generateRepairPlanPreview = () => {
    const data = getCurrentAppData();
    const preview = engineGenerateRepairPreview(consistencyIssues, data);
    setRepairPreview(preview);
    setShowRepairPreview(true);
  };

  const toggleRepairPlanSelection = (issueId: string) => {
    if (!repairPreview) return;
    setRepairPreview({
      ...repairPreview,
      plans: repairPreview.plans.map((p: RepairPlan) =>
        p.issueId === issueId ? { ...p, selected: !p.selected } : p
      ),
    });
  };

  const selectAllRepairPlans = () => {
    if (!repairPreview) return;
    setRepairPreview({
      ...repairPreview,
      plans: repairPreview.plans.map((p: RepairPlan) =>
        p.actions.length > 0 ? { ...p, selected: true } : p
      ),
    });
  };

  const deselectAllRepairPlans = () => {
    if (!repairPreview) return;
    setRepairPreview({
      ...repairPreview,
      plans: repairPreview.plans.map((p: RepairPlan) => ({ ...p, selected: false })),
    });
  };

  const applySelectedRepairs = async () => {
    if (!repairPreview) return;

    if (!confirm("确认应用选中的修复方案吗？修复操作将直接修改数据，但会保留所有操作日志和待同步变更。")) {
      return;
    }

    setIsApplyingRepairs(true);
    try {
      const data = getCurrentAppData();
      const { data: newData, result } = engineApplyRepairs(repairPreview, data);

      if (!result.success) {
        alert(`部分修复失败：\n${result.errors.join("\n")}`);
      }

      const operatorName =
        currentRole === "医生" ? "张医生" : currentRole === "助理" ? "李助理" : "王前台";

      const repairLog: OperationLog = {
        id: `log_repair_${Date.now()}`,
        caseId: "system",
        operator: operatorName,
        role: currentRole,
        action: "更新基础信息",
        detail: `数据一致性修复：已应用 ${result.appliedCount} 项修复，跳过 ${result.skippedCount} 项，失败 ${result.failedCount} 项`,
        timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      };

      setRecords(newData.records);
      setCaseInfos(newData.caseInfos);
      setFollowUpPlans(newData.followUpPlans);
      setWorkingLengths(newData.workingLengths);
      setTimelines(newData.timelines);
      setOperationLogs(prev => [repairLog, ...prev]);

      setShowRepairPreview(false);
      setRepairPreview(null);

      setTimeout(() => {
        performConsistencyCheck(true);
      }, 300);

      alert(`修复完成：\n• 成功应用：${result.appliedCount} 项\n• 跳过：${result.skippedCount} 项\n• 失败：${result.failedCount} 项`);
    } catch (err) {
      console.error("应用修复失败：", err);
      alert("应用修复失败，请查看控制台。");
    } finally {
      setIsApplyingRepairs(false);
    }
  };

  return {
    consistencyIssues,
    setConsistencyIssues,
    showConsistencyPanel,
    setShowConsistencyPanel,
    showRepairPreview,
    setShowRepairPreview,
    repairPreview,
    setRepairPreview,
    isCheckingConsistency,
    setIsCheckingConsistency,
    isApplyingRepairs,
    setIsApplyingRepairs,
    lastConsistencyCheck,
    setLastConsistencyCheck,
    consistencyFilter,
    setConsistencyFilter,
    expandedIssueId,
    setExpandedIssueId,
    filteredIssues,
    getIssueTypeLabel,
    getSeverityLabel,
    getSeverityColor,
    performConsistencyCheck,
    generateRepairPlanPreview,
    toggleRepairPlanSelection,
    selectAllRepairPlans,
    deselectAllRepairPlans,
    applySelectedRepairs,
  };
}
