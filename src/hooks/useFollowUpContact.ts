import React, { useState, useMemo } from "react";
import {
  FollowUpPlan,
  CaseBasicInfo,
  UserRole,
  ChangeEntityType,
  createOperationLog,
  ContactStatus,
} from "../db";

interface BatchCandidate {
  caseId: string;
  patientName: string;
  toothPosition: string;
  currentStep: string;
  followUpDate: string;
  contactStatus: string;
  phone: string;
  note: string;
}

interface UseFollowUpContactParams {
  currentRole: UserRole;
  currentUser: string;
  followUpPlans: FollowUpPlan[];
  setFollowUpPlans: React.Dispatch<React.SetStateAction<FollowUpPlan[]>>;
  caseInfos: CaseBasicInfo[];
  operationLogs: any[];
  setOperationLogs: React.Dispatch<React.SetStateAction<any[]>>;
  findCaseInfoById: (caseId: string) => CaseBasicInfo | undefined;
  getCurrentOperatorName: () => string;
  queueReplayableChange: (params: {
    caseId: string;
    entityType: ChangeEntityType;
    entityId: string;
    field: string;
    oldValue: string;
    newValue: string;
  }) => void;
}

interface UseFollowUpContactReturn {
  showBatchPanel: boolean;
  setShowBatchPanel: React.Dispatch<React.SetStateAction<boolean>>;
  batchFilterType: "overdue" | "within3days" | "pending";
  setBatchFilterType: React.Dispatch<React.SetStateAction<"overdue" | "within3days" | "pending">>;
  batchSelectedIds: Set<string>;
  setBatchSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  batchTargetStatus: string;
  setBatchTargetStatus: React.Dispatch<React.SetStateAction<string>>;
  batchNoteTemplate: string;
  setBatchNoteTemplate: React.Dispatch<React.SetStateAction<string>>;
  batchConfirmOpen: boolean;
  setBatchConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  batchCandidates: FollowUpPlan[];
  getBatchCandidates: () => FollowUpPlan[];
  toggleBatchSelect: (planId: string) => void;
  selectAllBatchCandidates: () => void;
  clearBatchSelection: () => void;
  getCancelledCount: () => number;
  executeBatchUpdate: () => void;
}

export function useFollowUpContact(params: UseFollowUpContactParams): UseFollowUpContactReturn {
  const {
    currentRole,
    currentUser,
    followUpPlans,
    setFollowUpPlans,
    caseInfos,
    operationLogs,
    setOperationLogs,
    findCaseInfoById,
    getCurrentOperatorName,
    queueReplayableChange,
  } = params;

  const [showBatchPanel, setShowBatchPanel] = useState<boolean>(false);
  const [batchFilterType, setBatchFilterType] = useState<"overdue" | "within3days" | "pending">("overdue");
  [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [batchTargetStatus, setBatchTargetStatus] = useState<string>("已联系");
  const [batchNoteTemplate, setBatchNoteTemplate] = useState<string>("电话通知复诊安排");
  const [batchConfirmOpen, setBatchConfirmOpen] = useState<boolean>(false);

  const getDaysUntil = (dateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getBatchCandidates = (): FollowUpPlan[] => {
    return followUpPlans.filter(plan => {
      const days = getDaysUntil(plan.nextDate);
      switch (batchFilterType) {
        case "overdue":
          return days < 0;
        case "within3days":
          return days >= 0 && days <= 3;
        case "pending":
          return plan.contactStatus === "待联系";
        default:
          return false;
      }
    });
  };

  const batchCandidates = useMemo(() => getBatchCandidates(), [followUpPlans, batchFilterType]);

  const toggleBatchSelect = (planId: string) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  };

  const selectAllBatchCandidates = () => {
    const candidates = getBatchCandidates();
    setBatchSelectedIds(new Set(candidates.map(c => c.id)));
  };

  const clearBatchSelection = () => {
    setBatchSelectedIds(new Set());
  };

  const getCancelledCount = (): number => {
    return Array.from(batchSelectedIds).filter(id => {
      const plan = followUpPlans.find(p => p.id === id);
      return plan?.contactStatus === "已取消";
    }).length;
  };

  const executeBatchUpdate = () => {
    const selectedPlans = Array.from(batchSelectedIds)
      .map(id => followUpPlans.find(p => p.id === id))
      .filter((p): p is FollowUpPlan => p !== null);

    const blockedPlans = selectedPlans.filter(p => p.contactStatus === "已取消" && batchTargetStatus === "已确认");
    if (blockedPlans.length > 0) {
      alert(`${blockedPlans.length} 条已取消的计划不能批量改为已确认，已自动跳过`);
    }

    const validPlans = selectedPlans.filter(p => !(p.contactStatus === "已取消" && batchTargetStatus === "已确认"));
    if (validPlans.length === 0) {
      setBatchConfirmOpen(false);
      return;
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const operatorName = getCurrentOperatorName();
    const newLogs: any[] = [];

    validPlans.forEach(plan => {
      if (plan.contactStatus !== batchTargetStatus) {
        queueReplayableChange({
          caseId: plan.caseId,
          entityType: "followUpPlan",
          entityId: plan.id,
          field: "contactStatus",
          oldValue: plan.contactStatus,
          newValue: batchTargetStatus,
        });
      }
      if (batchNoteTemplate.trim()) {
        const newNote = plan.contactNote
          ? `${plan.contactNote}\n【${now}】${batchNoteTemplate.trim()}`
          : `【${now}】${batchNoteTemplate.trim()}`;
        queueReplayableChange({
          caseId: plan.caseId,
          entityType: "followUpPlan",
          entityId: plan.id,
          field: "contactNote",
          oldValue: plan.contactNote,
          newValue: newNote,
        });
      }
      newLogs.push(createOperationLog(
        plan.caseId,
        operatorName,
        currentRole,
        "批量更新联系状态",
        `${plan.toothPosition} ${plan.patientName || ""}：${plan.contactStatus} → ${batchTargetStatus}${batchNoteTemplate.trim() ? "，备注：" + batchNoteTemplate.trim() : ""}`
      ));
    });

    setFollowUpPlans(prev => prev.map(plan => {
      if (!batchSelectedIds.has(plan.id)) return plan;
      if (plan.contactStatus === "已取消" && batchTargetStatus === "已确认") return plan;

      const updatedPlan = { ...plan };
      if (plan.contactStatus !== batchTargetStatus) {
        updatedPlan.contactStatus = batchTargetStatus as ContactStatus;
        updatedPlan.lastContactAt = now;
        updatedPlan.contactedBy = operatorName;
      }
      if (batchNoteTemplate.trim()) {
        updatedPlan.contactNote = plan.contactNote
          ? `${plan.contactNote}\n【${now}】${batchNoteTemplate.trim()}`
          : `【${now}】${batchNoteTemplate.trim()}`;
      }
      return updatedPlan;
    }));

    if (newLogs.length > 0) {
      setOperationLogs(prev => [...newLogs.reverse(), ...prev]);
    }

    setBatchConfirmOpen(false);
    setBatchSelectedIds(new Set());
  };

  return {
    showBatchPanel,
    setShowBatchPanel,
    batchFilterType,
    setBatchFilterType,
    batchSelectedIds,
    setBatchSelectedIds,
    batchTargetStatus,
    setBatchTargetStatus,
    batchNoteTemplate,
    setBatchNoteTemplate,
    batchConfirmOpen,
    setBatchConfirmOpen,
    batchCandidates,
    getBatchCandidates,
    toggleBatchSelect,
    selectAllBatchCandidates,
    clearBatchSelection,
    getCancelledCount,
    executeBatchUpdate,
  };
}
