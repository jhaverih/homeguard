import { Explanation } from './explanation';

// Homeowner AI panel (spec §6, behind HVAC_AI_CUSTOMER_VISIBLE): what the
// component drill-down may show a homeowner from the explanation layer.
// Deliberately narrow, because the statistical detector still runs in shadow:
//  - only ACTIVE equipment events for this component,
//  - only events backed by at least one ACTIVE rule finding the homeowner can
//    already see (an anomaly-only event never reaches a homeowner),
//  - only an explanation generated for the event's current evidence (a stale
//    one could describe readings that no longer apply),
//  - only the homeowner-facing fields (never technician text, causes or scores).
// Pure.

export interface CustomerAiSummary {
  eventId: string;
  // 'ai' = validated LLM text; 'standard' = the deterministic fallback.
  source: 'ai' | 'standard';
  message: string;
  recommendedActions: string[];
  confidence: string;
  safetyNote: string | null;
  generatedAt: string;
}

interface EventLike { id: string; status: string; category: string; components: string[]; findingIds: string[]; evidenceHash: string; lastOccurrenceAt: Date }
interface ExplanationLike { status: string; evidenceHash: string; output: Explanation | null; createdAt: Date }

export function customerAiSummary(
  componentId: string,
  events: EventLike[],
  visibleActiveFindingIds: Set<string>,
  explanationFor: (eventId: string) => ExplanationLike | null | undefined,
): CustomerAiSummary | null {
  const candidates = events
    .filter((e) => e.status === 'ACTIVE' && e.category === 'EQUIPMENT' && e.components.includes(componentId))
    .filter((e) => e.findingIds.some((id) => visibleActiveFindingIds.has(id)))
    .sort((a, b) => b.lastOccurrenceAt.getTime() - a.lastOccurrenceAt.getTime());
  for (const e of candidates) {
    const x = explanationFor(e.id);
    if (!x?.output || x.evidenceHash !== e.evidenceHash || (x.status !== 'OK' && x.status !== 'FALLBACK')) continue;
    return {
      eventId: e.id,
      source: x.status === 'OK' ? 'ai' : 'standard',
      message: x.output.customer_message,
      recommendedActions: x.output.recommended_actions ?? [],
      confidence: x.output.confidence_label,
      safetyNote: x.output.safety_note ?? null,
      generatedAt: x.createdAt.toISOString(),
    };
  }
  return null;
}
