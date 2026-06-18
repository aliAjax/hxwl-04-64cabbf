import {
  AppData,
  CaseBasicInfo,
  FollowUpPlan,
  WorkingLengthRecord,
  TreatmentTimeline,
  TreatmentStep,
} from "./db";

export type ConsistencyIssueType =
  | "orphaned_follow_up"
  | "duplicate_tooth_position"
  | "missing_case_id"
  | "timeline_tooth_mismatch"
  | "current_step_mismatch"
  | "cross_table_tooth_mismatch"
  | "orphaned_working_length"
  | "orphaned_timeline"
  | "duplicate_case_id"
  | "missing_case_info";

export type ConsistencySeverity = "error" | "warning" | "info";

export interface ConsistencyIssue {
  id: string;
  type: ConsistencyIssueType;
  severity: ConsistencySeverity;
  title: string;
  description: string;
  affectedEntities: {
    caseId?: string;
    toothPosition?: string;
    sourceTable: string;
    recordId?: string;
  }[];
  autoFixable: boolean;
}

export interface FieldPreview {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface RepairAction {
  type: "update" | "delete" | "create";
  targetTable: string;
  targetId: string;
  targetCaseId?: string;
  fieldChanges: FieldPreview[];
}

export interface RepairPlan {
  issueId: string;
  issue: ConsistencyIssue;
  actions: RepairAction[];
  description: string;
  selected: boolean;
}

export interface RepairPreview {
  plans: RepairPlan[];
  summary: {
    totalIssues: number;
    fixableIssues: number;
    willDelete: number;
    willUpdate: number;
    willCreate: number;
  };
}

export interface RepairResult {
  success: boolean;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

const TREATMENT_STEPS: TreatmentStep[] = ["开髓", "测长", "根管预备", "冲洗", "封药", "充填"];

function createIssueId(): string {
  return `issue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildCaseIdMap(caseInfos: CaseBasicInfo[], records: string[][]): Set<string> {
  const ids = new Set<string>();
  caseInfos.forEach((c) => ids.add(c.id));
  records.forEach((r) => ids.add(r[0]));
  return ids;
}

function buildToothToCaseIdMap(
  caseInfos: CaseBasicInfo[],
  records: string[][]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  caseInfos.forEach((c) => {
    if (!c.toothPosition) return;
    const existing = map.get(c.toothPosition) || [];
    existing.push(c.id);
    map.set(c.toothPosition, existing);
  });
  records.forEach((r) => {
    const caseId = r[0];
    const toothPosition = r[1];
    if (!toothPosition) return;
    const existing = map.get(toothPosition) || [];
    if (!existing.includes(caseId)) {
      existing.push(caseId);
      map.set(toothPosition, existing);
    }
  });
  return map;
}

function buildCaseIdToToothMap(
  caseInfos: CaseBasicInfo[],
  records: string[][]
): Map<string, string> {
  const map = new Map<string, string>();
  caseInfos.forEach((c) => {
    if (c.id) map.set(c.id, c.toothPosition);
  });
  records.forEach((r) => {
    const caseId = r[0];
    const toothPosition = r[1];
    if (caseId && toothPosition && !map.has(caseId)) {
      map.set(caseId, toothPosition);
    }
  });
  return map;
}

export function checkConsistency(data: AppData): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const {
    records = [],
    caseInfos = [],
    followUpPlans = [],
    workingLengths = [],
    timelines = [],
  } = data;

  const validCaseIds = buildCaseIdMap(caseInfos, records);
  const toothToCaseIds = buildToothToCaseIdMap(caseInfos, records);
  const caseIdToTooth = buildCaseIdToToothMap(caseInfos, records);

  followUpPlans.forEach((plan) => {
    if (!plan.caseId) {
      issues.push({
        id: createIssueId(),
        type: "missing_case_id",
        severity: "error",
        title: "复诊计划缺少 caseId",
        description: `复诊计划（牙位：${plan.toothPosition || "未知"}）缺少关联的病例ID`,
        affectedEntities: [
          {
            toothPosition: plan.toothPosition,
            sourceTable: "followUpPlans",
            recordId: plan.id,
          },
        ],
        autoFixable: true,
      });
    } else if (!validCaseIds.has(plan.caseId)) {
      issues.push({
        id: createIssueId(),
        type: "orphaned_follow_up",
        severity: "error",
        title: "孤立复诊计划",
        description: `复诊计划（牙位：${plan.toothPosition || "未知"}）的 caseId「${plan.caseId}」不存在于病例基础信息或记录中`,
        affectedEntities: [
          {
            caseId: plan.caseId,
            toothPosition: plan.toothPosition,
            sourceTable: "followUpPlans",
            recordId: plan.id,
          },
        ],
        autoFixable: true,
      });
    }
  });

  workingLengths.forEach((wl) => {
    if (!wl.caseId) {
      issues.push({
        id: createIssueId(),
        type: "missing_case_id",
        severity: "error",
        title: "工作长度记录缺少 caseId",
        description: `工作长度记录（牙位：${wl.toothPosition || "未知"}）缺少关联的病例ID`,
        affectedEntities: [
          {
            toothPosition: wl.toothPosition,
            sourceTable: "workingLengths",
            recordId: wl.id,
          },
        ],
        autoFixable: true,
      });
    } else if (!validCaseIds.has(wl.caseId)) {
      issues.push({
        id: createIssueId(),
        type: "orphaned_working_length",
        severity: "error",
        title: "孤立工作长度记录",
        description: `工作长度记录（牙位：${wl.toothPosition || "未知"}）的 caseId「${wl.caseId}」不存在于病例基础信息或记录中`,
        affectedEntities: [
          {
            caseId: wl.caseId,
            toothPosition: wl.toothPosition,
            sourceTable: "workingLengths",
            recordId: wl.id,
          },
        ],
        autoFixable: true,
      });
    }
  });

  timelines.forEach((tl) => {
    if (!tl.caseId) {
      issues.push({
        id: createIssueId(),
        type: "missing_case_id",
        severity: "error",
        title: "治疗时间线缺少 caseId",
        description: `治疗时间线（牙位：${tl.toothPosition || "未知"}）缺少关联的病例ID`,
        affectedEntities: [
          {
            toothPosition: tl.toothPosition,
            sourceTable: "timelines",
            recordId: tl.id,
          },
        ],
        autoFixable: true,
      });
    } else if (!validCaseIds.has(tl.caseId)) {
      issues.push({
        id: createIssueId(),
        type: "orphaned_timeline",
        severity: "error",
        title: "孤立治疗时间线",
        description: `治疗时间线（牙位：${tl.toothPosition || "未知"}）的 caseId「${tl.caseId}」不存在于病例基础信息或记录中`,
        affectedEntities: [
          {
            caseId: tl.caseId,
            toothPosition: tl.toothPosition,
            sourceTable: "timelines",
            recordId: tl.id,
          },
        ],
        autoFixable: true,
      });
    }
  });

  toothToCaseIds.forEach((caseIds, toothPosition) => {
    if (caseIds.length > 1) {
      issues.push({
        id: createIssueId(),
        type: "duplicate_tooth_position",
        severity: "warning",
        title: "重复牙位",
        description: `牙位「${toothPosition}」对应了 ${caseIds.length} 个不同的 caseId：${caseIds.join("、")}`,
        affectedEntities: caseIds.map((cid) => ({
          caseId: cid,
          toothPosition,
          sourceTable: "caseInfos/records",
        })),
        autoFixable: false,
      });
    }
  });

  const caseIdCounts = new Map<string, number>();
  caseInfos.forEach((c) => {
    caseIdCounts.set(c.id, (caseIdCounts.get(c.id) || 0) + 1);
  });
  records.forEach((r) => {
    caseIdCounts.set(r[0], (caseIdCounts.get(r[0]) || 0) + 1);
  });
  caseIdCounts.forEach((count, caseId) => {
    if (count > 1) {
      const tooth = caseIdToTooth.get(caseId);
      issues.push({
        id: createIssueId(),
        type: "duplicate_case_id",
        severity: "error",
        title: "重复 caseId",
        description: `caseId「${caseId}」在多条记录中重复出现 ${count} 次`,
        affectedEntities: [
          {
            caseId,
            toothPosition: tooth,
            sourceTable: "caseInfos/records",
          },
        ],
        autoFixable: false,
      });
    }
  });

  records.forEach((record) => {
    const caseId = record[0];
    const recordStep = record[3];
    const caseInfo = caseInfos.find((c) => c.id === caseId);
    if (caseInfo && caseInfo.currentStep !== recordStep) {
      issues.push({
        id: createIssueId(),
        type: "current_step_mismatch",
        severity: "warning",
        title: "当前步骤不一致",
        description: `病例「${caseInfo.toothPosition || caseId}」当前步骤不一致：records 为「${recordStep}」，caseInfos 为「${caseInfo.currentStep}」`,
        affectedEntities: [
          {
            caseId,
            toothPosition: caseInfo.toothPosition,
            sourceTable: "records",
          },
          {
            caseId,
            toothPosition: caseInfo.toothPosition,
            sourceTable: "caseInfos",
          },
        ],
        autoFixable: true,
      });
    }
  });

  timelines.forEach((tl) => {
    if (!tl.caseId) return;
    const expectedTooth = caseIdToTooth.get(tl.caseId);
    if (expectedTooth && tl.toothPosition !== expectedTooth) {
      issues.push({
        id: createIssueId(),
        type: "timeline_tooth_mismatch",
        severity: "warning",
        title: "时间线牙位不一致",
        description: `时间线 caseId「${tl.caseId}」牙位不一致：timelines 为「${tl.toothPosition}」，caseInfos 为「${expectedTooth}」`,
        autoFixable: true,
        affectedEntities: [
          {
            caseId: tl.caseId,
            toothPosition: tl.toothPosition,
            sourceTable: "timelines",
            recordId: tl.id,
          },
        ],
      });
    }
  });

  followUpPlans.forEach((plan) => {
    if (!plan.caseId) return;
    const expectedTooth = caseIdToTooth.get(plan.caseId);
    if (expectedTooth && plan.toothPosition !== expectedTooth) {
      issues.push({
        id: createIssueId(),
        type: "cross_table_tooth_mismatch",
        severity: "warning",
        title: "复诊计划牙位不一致",
        description: `复诊计划 caseId「${plan.caseId}」牙位不一致：followUpPlans 为「${plan.toothPosition}」，caseInfos 为「${expectedTooth}」`,
        autoFixable: true,
        affectedEntities: [
          {
            caseId: plan.caseId,
            toothPosition: plan.toothPosition,
            sourceTable: "followUpPlans",
            recordId: plan.id,
          },
        ],
      });
    }
  });

  workingLengths.forEach((wl) => {
    if (!wl.caseId) return;
    const expectedTooth = caseIdToTooth.get(wl.caseId);
    if (expectedTooth && wl.toothPosition !== expectedTooth) {
      issues.push({
        id: createIssueId(),
        type: "cross_table_tooth_mismatch",
        severity: "warning",
        title: "工作长度记录牙位不一致",
        description: `工作长度记录 caseId「${wl.caseId}」牙位不一致：workingLengths 为「${wl.toothPosition}」，caseInfos 为「${expectedTooth}」`,
        autoFixable: true,
        affectedEntities: [
          {
            caseId: wl.caseId,
            toothPosition: wl.toothPosition,
            sourceTable: "workingLengths",
            recordId: wl.id,
          },
        ],
      });
    }
  });

  records.forEach((record) => {
    const caseId = record[0];
    const hasCaseInfo = caseInfos.some((c) => c.id === caseId);
    if (!hasCaseInfo) {
      issues.push({
        id: createIssueId(),
        type: "missing_case_info",
        severity: "warning",
        title: "缺少病例基础信息",
        description: `记录「${record[1]}」(caseId: ${caseId}) 在 caseInfos 中没有对应记录`,
        affectedEntities: [
          {
            caseId,
            toothPosition: record[1],
            sourceTable: "records",
          },
        ],
        autoFixable: true,
      });
    }
  });

  caseInfos.forEach((ci) => {
    const hasRecord = records.some((r) => r[0] === ci.id);
    if (!hasRecord) {
      issues.push({
        id: createIssueId(),
        type: "missing_case_info",
        severity: "warning",
        title: "缺少病例记录",
        description: `病例基础信息「${ci.toothPosition}」(caseId: ${ci.id}) 在 records 中没有对应记录`,
        affectedEntities: [
          {
            caseId: ci.id,
            toothPosition: ci.toothPosition,
            sourceTable: "caseInfos",
          },
        ],
        autoFixable: true,
      });
    }
  });

  return issues;
}

export function generateRepairPreview(
  issues: ConsistencyIssue[],
  data: AppData
): RepairPreview {
  const {
    records = data.records || [],
    caseInfos = data.caseInfos || [],
    followUpPlans = data.followUpPlans || [],
    workingLengths = data.workingLengths || [],
    timelines = data.timelines || [],
  } = data;

  const caseIdToTooth = buildCaseIdToToothMap(caseInfos, records);
  const toothToCaseIds = buildToothToCaseIdMap(caseInfos, records);

  const plans: RepairPlan[] = [];
  let willDelete = 0;
  let willUpdate = 0;
  let willCreate = 0;

  issues.forEach((issue) => {
    const planForIssue: RepairPlan = {
      issueId: issue.id,
      issue,
      actions: [],
      description: "",
      selected: issue.autoFixable,
    };

    switch (issue.type) {
      case "orphaned_follow_up": {
        const plan = followUpPlans.find(
          (p) => p.id === issue.affectedEntities[0]?.recordId
        );
        if (plan) {
          const toothPosition =
            plan.toothPosition || issue.affectedEntities[0]?.toothPosition;
          if (toothPosition) {
            const matchingCaseIds = toothToCaseIds.get(toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "followUpPlans",
                  targetId: plan.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: plan.caseId,
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `将复诊计划关联到匹配的 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            } else {
              planForIssue.selected = false;
              planForIssue.description =
                "无法自动修复：牙位对应多个 caseId，需要手动选择";
            }
          } else {
            planForIssue.selected = false;
            planForIssue.description =
              "无法自动修复：缺少牙位信息，无法匹配病例";
          }
        }
        break;
      }
      case "orphaned_working_length": {
        const wl = workingLengths.find(
          (w) => w.id === issue.affectedEntities[0]?.recordId
        );
        if (wl) {
          const toothPosition =
            wl.toothPosition || issue.affectedEntities[0]?.toothPosition;
          if (toothPosition) {
            const matchingCaseIds = toothToCaseIds.get(toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "workingLengths",
                  targetId: wl.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: wl.caseId,
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `将工作长度记录关联到匹配的 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            } else {
              planForIssue.selected = false;
              planForIssue.description =
                "无法自动修复：牙位对应多个 caseId，需要手动选择";
            }
          } else {
            planForIssue.selected = false;
            planForIssue.description =
              "无法自动修复：缺少牙位信息，无法匹配病例";
          }
        }
        break;
      }
      case "orphaned_timeline": {
        const tl = timelines.find(
          (t) => t.id === issue.affectedEntities[0]?.recordId
        );
        if (tl) {
          const toothPosition =
            tl.toothPosition || issue.affectedEntities[0]?.toothPosition;
          if (toothPosition) {
            const matchingCaseIds = toothToCaseIds.get(toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "timelines",
                  targetId: tl.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: tl.caseId,
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `将治疗时间线关联到匹配的 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            } else {
              planForIssue.selected = false;
              planForIssue.description =
                "无法自动修复：牙位对应多个 caseId，需要手动选择";
            }
          } else {
            planForIssue.selected = false;
            planForIssue.description =
              "无法自动修复：缺少牙位信息，无法匹配病例";
          }
        }
        break;
      }
      case "missing_case_id": {
        const entity = issue.affectedEntities[0];
        if (!entity) break;

        if (entity.sourceTable === "followUpPlans") {
          const plan = followUpPlans.find((p) => p.id === entity.recordId);
          if (plan?.toothPosition) {
            const matchingCaseIds =
              toothToCaseIds.get(plan.toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "followUpPlans",
                  targetId: plan.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: "",
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `为复诊计划补充 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            }
          }
        } else if (entity.sourceTable === "workingLengths") {
          const wl = workingLengths.find((w) => w.id === entity.recordId);
          if (wl?.toothPosition) {
            const matchingCaseIds =
              toothToCaseIds.get(wl.toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "workingLengths",
                  targetId: wl.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: "",
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `为工作长度记录补充 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            }
          }
        } else if (entity.sourceTable === "timelines") {
          const tl = timelines.find((t) => t.id === entity.recordId);
          if (tl?.toothPosition) {
            const matchingCaseIds =
              toothToCaseIds.get(tl.toothPosition) || [];
            if (matchingCaseIds.length === 1) {
              planForIssue.actions = [
                {
                  type: "update",
                  targetTable: "timelines",
                  targetId: tl.id,
                  targetCaseId: matchingCaseIds[0],
                  fieldChanges: [
                    {
                      field: "caseId",
                      oldValue: "",
                      newValue: matchingCaseIds[0],
                    },
                  ],
                },
              ];
              planForIssue.description = `为治疗时间线补充 caseId「${matchingCaseIds[0]}」`;
              willUpdate++;
            }
          }
        }
        break;
      }
      case "current_step_mismatch": {
        const caseId = issue.affectedEntities[0]?.caseId;
        if (!caseId) break;

        const caseInfo = caseInfos.find((c) => c.id === caseId);
        const record = records.find((r) => r[0] === caseId);

        if (caseInfo && record) {
          const timeline = timelines.find((t) => t.caseId === caseId);
          const timelineStep = timeline
            ? deriveStepFromTimeline(timeline)
            : null;

          const sourceOfTruth = timelineStep || caseInfo.currentStep;

          planForIssue.actions = [
            {
              type: "update",
              targetTable: "records",
              targetId: caseId,
              targetCaseId: caseId,
              fieldChanges: [
                {
                  field: "currentStep",
                  oldValue: record[3],
                  newValue: sourceOfTruth,
                },
              ],
            },
          ];

          if (caseInfo.currentStep !== sourceOfTruth) {
            planForIssue.actions.push({
              type: "update",
              targetTable: "caseInfos",
              targetId: caseId,
              targetCaseId: caseId,
              fieldChanges: [
                {
                  field: "currentStep",
                  oldValue: caseInfo.currentStep,
                  newValue: sourceOfTruth,
                },
              ],
            });
          }

          planForIssue.description = `以${
            timelineStep ? "时间线" : "病例基础信息"
          }为基准，将当前步骤统一为「${sourceOfTruth}」`;
          willUpdate += planForIssue.actions.length;
        }
        break;
      }
      case "timeline_tooth_mismatch": {
        const tlId = issue.affectedEntities[0]?.recordId;
        const caseId = issue.affectedEntities[0]?.caseId;
        if (!tlId || !caseId) break;

        const expectedTooth = caseIdToTooth.get(caseId);
        const tl = timelines.find((t) => t.id === tlId);
        if (expectedTooth && tl) {
          planForIssue.actions = [
            {
              type: "update",
              targetTable: "timelines",
              targetId: tlId,
              targetCaseId: caseId,
              fieldChanges: [
                {
                  field: "toothPosition",
                  oldValue: tl.toothPosition,
                  newValue: expectedTooth,
                },
              ],
            },
          ];
          planForIssue.description = `将时间线牙位修正为「${expectedTooth}」，与病例基础信息一致`;
          willUpdate++;
        }
        break;
      }
      case "cross_table_tooth_mismatch": {
        const entity = issue.affectedEntities[0];
        if (!entity) break;

        const caseId = entity.caseId;
        const recordId = entity.recordId;
        const sourceTable = entity.sourceTable;
        if (!caseId || !recordId) break;

        const expectedTooth = caseIdToTooth.get(caseId);
        if (!expectedTooth) break;

        if (sourceTable === "followUpPlans") {
          const plan = followUpPlans.find((p) => p.id === recordId);
          if (plan) {
            planForIssue.actions = [
              {
                type: "update",
                targetTable: "followUpPlans",
                targetId: recordId,
                targetCaseId: caseId,
                fieldChanges: [
                  {
                    field: "toothPosition",
                    oldValue: plan.toothPosition,
                    newValue: expectedTooth,
                  },
                ],
              },
            ];
            planForIssue.description = `将复诊计划牙位修正为「${expectedTooth}」，与病例基础信息一致`;
            willUpdate++;
          }
        } else if (sourceTable === "workingLengths") {
          const wl = workingLengths.find((w) => w.id === recordId);
          if (wl) {
            planForIssue.actions = [
              {
                type: "update",
                targetTable: "workingLengths",
                targetId: recordId,
                targetCaseId: caseId,
                fieldChanges: [
                  {
                    field: "toothPosition",
                    oldValue: wl.toothPosition,
                    newValue: expectedTooth,
                  },
                ],
              },
            ];
            planForIssue.description = `将工作长度记录牙位修正为「${expectedTooth}」，与病例基础信息一致`;
            willUpdate++;
          }
        }
        break;
      }
      case "missing_case_info": {
        const entity = issue.affectedEntities[0];
        if (!entity) break;

        const caseId = entity.caseId;
        const sourceTable = entity.sourceTable;
        if (!caseId) break;

        if (sourceTable === "records") {
          const record = records.find((r) => r[0] === caseId);
          if (record) {
            const today = new Date().toISOString().split("T")[0];
            planForIssue.actions = [
              {
                type: "create",
                targetTable: "caseInfos",
                targetId: caseId,
                targetCaseId: caseId,
                fieldChanges: [
                  { field: "id", oldValue: "", newValue: caseId },
                  {
                    field: "toothPosition",
                    oldValue: "",
                    newValue: record[1],
                  },
                  { field: "patientName", oldValue: "", newValue: "" },
                  { field: "phone", oldValue: "", newValue: "" },
                  {
                    field: "diagnosis",
                    oldValue: "",
                    newValue: record[2],
                  },
                  {
                    field: "currentStep",
                    oldValue: "",
                    newValue: record[3],
                  },
                  { field: "workingLength", oldValue: "", newValue: "" },
                  { field: "mainFileNumber", oldValue: "", newValue: "" },
                  { field: "medication", oldValue: "", newValue: "" },
                  { field: "remark", oldValue: "", newValue: record[4] },
                  { field: "createdAt", oldValue: "", newValue: today },
                  { field: "updatedAt", oldValue: "", newValue: today },
                ],
              },
            ];
            planForIssue.description = `根据 records 中的记录创建病例基础信息`;
            willCreate++;
          }
        } else if (sourceTable === "caseInfos") {
          const caseInfo = caseInfos.find((c) => c.id === caseId);
          if (caseInfo) {
            const detailParts: string[] = [];
            if (caseInfo.workingLength)
              detailParts.push(`工作长度 ${caseInfo.workingLength}`);
            if (caseInfo.mainFileNumber)
              detailParts.push(`主尖锉${caseInfo.mainFileNumber}`);
            if (caseInfo.medication)
              detailParts.push(`封药：${caseInfo.medication}`);
            if (caseInfo.remark) detailParts.push(caseInfo.remark);

            const status =
              caseInfo.currentStep === "充填" ? "已充填" : "待复诊";

            planForIssue.actions = [
              {
                type: "create",
                targetTable: "records",
                targetId: caseId,
                targetCaseId: caseId,
                fieldChanges: [
                  { field: "caseId", oldValue: "", newValue: caseId },
                  {
                    field: "toothPosition",
                    oldValue: "",
                    newValue: caseInfo.toothPosition,
                  },
                  {
                    field: "diagnosis",
                    oldValue: "",
                    newValue: caseInfo.diagnosis,
                  },
                  {
                    field: "currentStep",
                    oldValue: "",
                    newValue: caseInfo.currentStep,
                  },
                  {
                    field: "detail",
                    oldValue: "",
                    newValue: detailParts.join("，") || "无附加信息",
                  },
                  { field: "status", oldValue: "", newValue: status },
                ],
              },
            ];
            planForIssue.description = `根据 caseInfos 中的记录创建 records 条目`;
            willCreate++;
          }
        }
        break;
      }
      default: {
        planForIssue.selected = false;
        planForIssue.description = "此问题需要手动处理";
        break;
      }
    }

    if (planForIssue.actions.length === 0 && planForIssue.selected) {
      planForIssue.selected = false;
      if (!planForIssue.description) {
        planForIssue.description = "无法自动修复，请手动处理";
      }
    }

    plans.push(planForIssue);
  });

  return {
    plans,
    summary: {
      totalIssues: issues.length,
      fixableIssues: plans.filter((p) => p.selected).length,
      willDelete,
      willUpdate,
      willCreate,
    },
  };
}

function deriveStepFromTimeline(
  timeline: TreatmentTimeline
): TreatmentStep | null {
  const nodes = timeline.nodes;
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].isCompleted) continue;
    return nodes[i].step;
  }
  return nodes[nodes.length - 1]?.step || null;
}

export function applyRepairs(
  preview: RepairPreview,
  data: AppData
): { data: AppData; result: RepairResult } {
  const newData = JSON.parse(JSON.stringify(data)) as AppData;

  const result: RepairResult = {
    success: true,
    appliedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const selectedPlans = preview.plans.filter(
    (p) => p.selected && p.actions.length > 0
  );

  selectedPlans.forEach((plan) => {
    try {
      plan.actions.forEach((action) => {
        applyAction(action, newData);
      });
      result.appliedCount++;
    } catch (err) {
      result.failedCount++;
      result.errors.push(
        `修复问题「${plan.issue.title}」失败: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  });

  const skippedPlans = preview.plans.filter(
    (p) => !p.selected || p.actions.length === 0
  );
  result.skippedCount = skippedPlans.length;

  if (result.failedCount > 0) {
    result.success = false;
  }

  return { data: newData, result };
}

function applyAction(action: RepairAction, data: AppData): void {
  switch (action.targetTable) {
    case "records": {
      if (action.type === "update") {
        const recordIndex = data.records.findIndex(
          (r) => r[0] === action.targetCaseId
        );
        if (recordIndex >= 0) {
          const record = [...data.records[recordIndex]];
          action.fieldChanges.forEach((change) => {
            switch (change.field) {
              case "currentStep":
                record[3] = change.newValue;
                record[5] = change.newValue === "充填" ? "已充填" : "待复诊";
                break;
              case "toothPosition":
                record[1] = change.newValue;
                break;
              case "diagnosis":
                record[2] = change.newValue;
                break;
              case "detail":
                record[4] = change.newValue;
                break;
            }
          });
          data.records[recordIndex] = record;
        }
      } else if (action.type === "create") {
        const newRecord: string[] = ["", "", "", "", "", ""];
        action.fieldChanges.forEach((change) => {
          switch (change.field) {
            case "caseId":
              newRecord[0] = change.newValue;
              break;
            case "toothPosition":
              newRecord[1] = change.newValue;
              break;
            case "diagnosis":
              newRecord[2] = change.newValue;
              break;
            case "currentStep":
              newRecord[3] = change.newValue;
              break;
            case "detail":
              newRecord[4] = change.newValue;
              break;
            case "status":
              newRecord[5] = change.newValue;
              break;
          }
        });
        data.records.unshift(newRecord);
      }
      break;
    }
    case "caseInfos": {
      if (action.type === "update") {
        const caseInfo = data.caseInfos.find(
          (c) => c.id === action.targetId
        );
        if (caseInfo) {
          action.fieldChanges.forEach((change) => {
            if (change.field in caseInfo) {
              (caseInfo as any)[change.field] = change.newValue;
            }
            if (change.field === "toothPosition") {
              caseInfo.updatedAt = new Date().toISOString().split("T")[0];
            }
          });
        }
      } else if (action.type === "create") {
        const newCaseInfo: CaseBasicInfo = {
          id: action.targetCaseId || action.targetId,
          toothPosition: "",
          patientName: "",
          phone: "",
          diagnosis: "",
          currentStep: "开髓",
          workingLength: "",
          mainFileNumber: "",
          medication: "",
          remark: "",
          createdAt: new Date().toISOString().split("T")[0],
          updatedAt: new Date().toISOString().split("T")[0],
        };
        action.fieldChanges.forEach((change) => {
          if (change.field in newCaseInfo) {
            (newCaseInfo as any)[change.field] = change.newValue;
          }
        });
        data.caseInfos.unshift(newCaseInfo);
      }
      break;
    }
    case "followUpPlans": {
      const plan = data.followUpPlans.find(
        (p) => p.id === action.targetId
      );
      if (plan) {
        action.fieldChanges.forEach((change) => {
          if (change.field in plan) {
            (plan as any)[change.field] = change.newValue;
          }
        });
      }
      break;
    }
    case "workingLengths": {
      const wl = data.workingLengths.find(
        (w) => w.id === action.targetId
      );
      if (wl) {
        action.fieldChanges.forEach((change) => {
          if (change.field in wl) {
            (wl as any)[change.field] = change.newValue;
          }
        });
      }
      break;
    }
    case "timelines": {
      const tl = data.timelines.find(
        (t) => t.id === action.targetId
      );
      if (tl) {
        action.fieldChanges.forEach((change) => {
          if (change.field in tl) {
            (tl as any)[change.field] = change.newValue;
          }
        });
      }
      break;
    }
  }
}

export function getIssueTypeLabel(type: ConsistencyIssueType): string {
  const labels: Record<ConsistencyIssueType, string> = {
    orphaned_follow_up: "孤立复诊计划",
    duplicate_tooth_position: "重复牙位",
    missing_case_id: "缺失 caseId",
    timeline_tooth_mismatch: "时间线牙位不一致",
    current_step_mismatch: "当前步骤不一致",
    cross_table_tooth_mismatch: "跨表牙位不一致",
    orphaned_working_length: "孤立工作长度记录",
    orphaned_timeline: "孤立治疗时间线",
    duplicate_case_id: "重复 caseId",
    missing_case_info: "缺少对应记录",
  };
  return labels[type] || type;
}

export function getSeverityColor(severity: ConsistencySeverity): string {
  const colors: Record<ConsistencySeverity, string> = {
    error: "#dc2626",
    warning: "#ea580c",
    info: "#0369a1",
  };
  return colors[severity];
}

export function getSeverityLabel(severity: ConsistencySeverity): string {
  const labels: Record<ConsistencySeverity, string> = {
    error: "错误",
    warning: "警告",
    info: "提示",
  };
  return labels[severity];
}
