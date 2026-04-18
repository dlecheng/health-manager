import type { InterpretationContextPayload } from './interpretationContext'

/**
 * 无大模型 API 时的后备报告：强调客观罗列与就医提示，避免像诊断结论。
 */
export function buildOfflineInterpretationReport(
  payload: InterpretationContextPayload,
): string {
  if (payload.recordCount === 0) {
    return `## 暂无数据

请先保存至少一条化验记录后再试。

---

**声明**：本应用不提供医疗诊断与治疗建议。`
  }

  return `## 解读报告（离线简析）

> 当前未配置或未启用大模型 API，以下为根据您已录入内容**自动整理的客观摘要**，语气为系统生成，不等同于医生面诊。

### 数据整理

${payload.summaryText}

### 通用建议（非个体化诊断）

- 携带**原始化验单**与用药清单就诊，由医生结合症状与体征综合判断。
- 若某项持续超出参考范围或短期内变化明显，建议按专科医生建议复查或调整随访间隔。
- 本应用内参考范围为**常见成人简化规则**，可能与检测机构或您的个体目标不一致。

---

**重要声明**：以上内容仅供健康信息整理与就诊准备参考，**不能替代执业医师的诊断、处方或处置**。`
}
