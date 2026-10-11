// Spec §6.4 — three separate measures, all deterministic and transparent.
// The LLM explains these; it never assigns them. No numeric "probability"
// is produced: there are no labelled outcomes to calibrate one against.

export type StrengthLabel = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
export type CompletenessLabel = 'COMPLETE' | 'PARTIAL' | 'POOR';
export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'insufficient_evidence';

export interface ConfidenceInput {
  robustZs: (number | null)[];        // contributing anomalies' scores
  ruleFindings: number;               // contributing triggered rule findings
  independentSignals: number;         // distinct sensor roles + rule groups involved
  inputsOk: number;                   // relevant inputs with data-quality OK
  inputsTotal: number;
  sensorQualityProblem: boolean;      // a contributing sensor has a quality anomaly
  disagreement: boolean;
}

export interface ConfidenceResult {
  anomalyStrength: StrengthLabel;
  evidenceCompleteness: CompletenessLabel;
  confidence: ConfidenceLabel;
  rationale: string[];
}

export function assessConfidence(c: ConfidenceInput): ConfidenceResult {
  const zs = c.robustZs.filter((z): z is number => z != null).map(Math.abs);
  const maxZ = zs.length ? Math.max(...zs) : 0;
  const anomalyStrength: StrengthLabel = zs.length === 0 ? 'NONE' : maxZ >= 7 ? 'STRONG' : maxZ >= 3.5 ? 'MODERATE' : 'WEAK';
  const share = c.inputsTotal ? c.inputsOk / c.inputsTotal : 0;
  const evidenceCompleteness: CompletenessLabel = share >= 0.8 ? 'COMPLETE' : share >= 0.5 ? 'PARTIAL' : 'POOR';
  const rationale: string[] = [`${c.inputsOk} of ${c.inputsTotal} relevant inputs reporting valid, fresh data`];
  rationale.push(`${c.independentSignals} independent signal(s); ${c.ruleFindings} rule finding(s)`);

  let confidence: ConfidenceLabel;
  if (c.sensorQualityProblem) {
    confidence = 'insufficient_evidence';
    rationale.push('A contributing sensor shows a data-quality problem, so the readings cannot be relied on yet');
  } else if (evidenceCompleteness === 'POOR' || c.independentSignals === 0) {
    confidence = 'insufficient_evidence';
    rationale.push('Too few relevant measurements are available to assess a cause');
  } else if (c.independentSignals >= 3 && c.ruleFindings >= 1 && evidenceCompleteness === 'COMPLETE' && !c.disagreement) {
    confidence = 'high';
    rationale.push('Several independent measurements agree, including a deterministic rule');
  } else if (c.independentSignals >= 2) {
    confidence = c.disagreement ? 'low' : 'medium';
    rationale.push(c.disagreement ? 'Statistics and rules disagree about part of the evidence' : 'Two independent measurements point the same way');
  } else {
    confidence = 'low';
    rationale.push('Only one signal supports this condition');
  }
  if (anomalyStrength === 'STRONG' && confidence !== 'high') rationale.push('A large statistical deviation alone does not establish the cause');
  return { anomalyStrength, evidenceCompleteness, confidence, rationale };
}
