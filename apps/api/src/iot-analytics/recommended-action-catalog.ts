// Static catalog resolving action codes (referenced by AnalyticsFinding.
// recommendedActions[]) to display metadata — centrally managed per spec
// section 21 ("Do not hardcode recommended actions inside UI components").
// Findings/rule definitions only ever store the actionCode string; the API
// layer resolves it to title/description/type here before returning to
// mobile/admin, so a copy change never touches a rule definition or the
// frontend.
export type ActionType = 'HOMEOWNER_ACTION' | 'SERVICE_REQUEST';

export interface RecommendedAction {
  actionCode: string;
  title: string;
  description: string;
  actionType: ActionType;
  serviceCategory: string | null;
  priority: number; // lower = more urgent, for sorting a finding's action list
}

export const RECOMMENDED_ACTION_CATALOG: RecommendedAction[] = [
  { actionCode: 'CHECK_HVAC', title: 'Check your HVAC system', description: 'Take a look at the unit and the area around it for anything obviously wrong.', actionType: 'HOMEOWNER_ACTION', serviceCategory: 'hvac', priority: 1 },
  { actionCode: 'CHECK_WASHER', title: 'Check your washer', description: 'Take a look at the washer and the area around it for anything obviously wrong.', actionType: 'HOMEOWNER_ACTION', serviceCategory: 'appliance', priority: 1 },
  { actionCode: 'CHECK_WATER_CONNECTIONS', title: 'Check water connections', description: 'Inspect hoses and fittings near the sensor for visible leaks or loose connections.', actionType: 'HOMEOWNER_ACTION', serviceCategory: null, priority: 2 },
  { actionCode: 'STOP_WATER_SOURCE_IF_SAFE', title: 'Stop the water source if safe to do so', description: 'If you can safely shut off the nearest water supply valve, do so until the issue is resolved.', actionType: 'HOMEOWNER_ACTION', serviceCategory: null, priority: 1 },
  { actionCode: 'GET_HELP', title: 'Get Attenteve help', description: 'Request an Attenteve specialist to look into this.', actionType: 'SERVICE_REQUEST', serviceCategory: null, priority: 3 },
  { actionCode: 'I_FIXED_IT', title: "I fixed it", description: 'Mark this resolved — you’ve already handled it.', actionType: 'HOMEOWNER_ACTION', serviceCategory: null, priority: 4 },
  { actionCode: 'GET_ATTENTEVE_HELP', title: 'Get Attenteve help', description: 'Request an Attenteve specialist to look into this.', actionType: 'SERVICE_REQUEST', serviceCategory: null, priority: 3 },
  { actionCode: 'REPLACE_BATTERY', title: 'Replace the sensor battery', description: 'Swap in a fresh battery so this sensor keeps reporting reliably.', actionType: 'HOMEOWNER_ACTION', serviceCategory: null, priority: 2 },
  { actionCode: 'CHECK_SENSOR_CONNECTIVITY', title: 'Check sensor connectivity', description: 'Confirm the sensor has power and is within range of your Yolink hub.', actionType: 'HOMEOWNER_ACTION', serviceCategory: null, priority: 2 },
  { actionCode: 'SCHEDULE_HVAC_INSPECTION', title: 'Schedule an HVAC inspection', description: 'Repeated water events suggest an underlying drainage issue worth a professional look.', actionType: 'SERVICE_REQUEST', serviceCategory: 'hvac', priority: 2 },
  { actionCode: 'SCHEDULE_CONTRACTOR_VISIT', title: 'Schedule a contractor visit', description: 'Request an Attenteve-vetted contractor to inspect and service the equipment.', actionType: 'SERVICE_REQUEST', serviceCategory: 'hvac', priority: 3 },
];

const BY_CODE = new Map(RECOMMENDED_ACTION_CATALOG.map((a) => [a.actionCode, a]));

export function resolveRecommendedActions(codes: string[]): RecommendedAction[] {
  return codes
    .map((code) => BY_CODE.get(code))
    .filter((a): a is RecommendedAction => !!a)
    .sort((a, b) => a.priority - b.priority);
}
