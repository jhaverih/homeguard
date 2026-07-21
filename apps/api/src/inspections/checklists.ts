export interface TaskPromptField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  options?: string[];
  placeholder?: string;
}

export interface DynamicSubGroupDef {
  countKey: string;   // field key within parent group that holds the sub-count
  prefix: string;     // e.g. 'filter' → keys become 'unit_1_filter_1_size'
  label: string;      // e.g. 'Filter'
  fields: TaskPromptField[];
}

export interface DynamicGroupDef {
  countKey: string;   // promptField key that drives how many groups to render
  prefix: string;     // e.g. 'unit' → keys become 'unit_1_visual_ok'
  label: string;      // e.g. 'AC Unit'
  fields: TaskPromptField[];
  subGroups?: DynamicSubGroupDef;
}

export interface ChecklistTask {
  key: string;
  label: string;
  description: string;
  promptFields: TaskPromptField[];
  dynamicGroups?: DynamicGroupDef;
  catalogLinks: string[]; // pricing catalog names for upsell
}

export interface ChecklistSection {
  key: string;
  label: string;
  tasks: ChecklistTask[];
  // Admin-organizational grouping (Inspection Configurator's Group ->
  // Subgroup -> Section hierarchy) — optional since the hardcoded
  // GUTTER_CHECKLIST/HVAC_SECTIONS below don't have one. Sections sharing
  // the same subgroupKey are always contiguous in the returned array, so
  // the client can group by "subgroupKey changed since the last item"
  // without needing a nested response shape.
  subgroupKey?: string;
  subgroupLabel?: string;
}

export const INSPECTION_CHECKLIST: ChecklistSection[] = [
  {
    key: 'hvac_visual',
    label: 'HVAC Visual Inspection',
    tasks: [
      {
        key: 'hvac_visual.units_overview',
        label: 'AC Unit Count & Per-Unit Inspection',
        description: 'Enter the number of AC units in the home, then complete visual inspection and filter details for each unit.',
        promptFields: [
          { key: 'num_units', label: 'Number of AC units in home', type: 'number', placeholder: 'e.g. 2' },
        ],
        dynamicGroups: {
          countKey: 'num_units',
          prefix: 'unit',
          label: 'AC Unit',
          fields: [
            { key: 'location', label: 'Unit location', type: 'text', placeholder: 'e.g. garage, attic, closet' },
            { key: 'visual_ok', label: 'Visual inspection passed', type: 'boolean' },
            { key: 'filter_replaced', label: 'Filter replaced', type: 'boolean' },
            { key: 'filter_location', label: 'Filter slot location', type: 'text', placeholder: 'e.g. return air grille, air handler front' },
            { key: 'num_filters', label: 'Number of filters in this unit', type: 'number', placeholder: 'e.g. 1' },
          ],
          subGroups: {
            countKey: 'num_filters',
            prefix: 'filter',
            label: 'Filter',
            fields: [
              { key: 'size', label: 'Filter size (L×W×D)', type: 'text', placeholder: 'e.g. 20x25x1' },
              { key: 'brand', label: 'Brand / model', type: 'text', placeholder: 'e.g. Filtrete 1500' },
              { key: 'merv', label: 'MERV rating', type: 'number', placeholder: 'e.g. 11' },
            ],
          },
        },
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.condenser',
        label: 'Outdoor condenser unit',
        description: 'Check for debris, vegetation clearance (2 ft min), physical damage, and level mounting',
        promptFields: [
          { key: 'clearance_ok', label: '2 ft clearance maintained', type: 'boolean' },
          { key: 'physical_damage', label: 'Physical damage observed', type: 'boolean' },
          { key: 'level_mounted', label: 'Unit level mounted', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.air_handler',
        label: 'Indoor air handler / furnace',
        description: 'Inspect for rust, corrosion, unusual noise, or vibration',
        promptFields: [
          { key: 'rust_corrosion', label: 'Rust or corrosion present', type: 'boolean' },
          { key: 'unusual_noise', label: 'Unusual noise or vibration', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.refrigerant_lines',
        label: 'Refrigerant lines',
        description: 'Check for insulation damage or visible leaks (oil residue)',
        promptFields: [
          { key: 'insulation_damage', label: 'Insulation damage', type: 'boolean' },
          { key: 'oil_residue', label: 'Oil residue / leak evidence', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.electrical',
        label: 'Electrical connections / disconnect box',
        description: 'Inspect for scorching or loose wiring',
        promptFields: [
          { key: 'scorching', label: 'Scorching observed', type: 'boolean' },
          { key: 'loose_wiring', label: 'Loose wiring found', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.condensate_drain',
        label: 'Condensate drain line and pan',
        description: 'Check for clogs, standing water, or mold',
        promptFields: [
          { key: 'clog_found', label: 'Clog found', type: 'boolean' },
          { key: 'standing_water', label: 'Standing water present', type: 'boolean' },
          { key: 'mold_found', label: 'Mold observed', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.thermostat',
        label: 'Thermostat operation',
        description: 'Test heating/cooling cycle triggers correctly',
        promptFields: [
          { key: 'set_temp', label: 'Set temperature (°F)', type: 'number', placeholder: 'e.g. 72' },
          { key: 'actual_temp', label: 'Actual temperature (°F)', type: 'number', placeholder: 'e.g. 71' },
          { key: 'cycle_triggers', label: 'Cycle triggers correctly', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.ductwork',
        label: 'Ductwork (visible sections)',
        description: 'Check for disconnection, damage, or excessive dust',
        promptFields: [
          { key: 'disconnection', label: 'Disconnection found', type: 'boolean' },
          { key: 'damage', label: 'Damage observed', type: 'boolean' },
          { key: 'excessive_dust', label: 'Excessive dust buildup', type: 'boolean' },
        ],
        catalogLinks: ['HVAC Full Inspection'],
      },
      {
        key: 'hvac_visual.unit_age',
        label: 'Unit age / nameplate',
        description: 'Note age and manufacture date from unit nameplate',
        promptFields: [
          { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Carrier 24ACC636A003' },
          { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
          { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
        ],
        catalogLinks: [],
      },
    ],
  },
  {
    key: 'hvac_filter',
    label: 'HVAC Filter Replacement',
    tasks: [
      {
        key: 'hvac_filter.locate_remove',
        label: 'Locate and remove old filter',
        description: 'Find filter location, remove old filter for inspection',
        promptFields: [
          { key: 'filter_location', label: 'Filter location', type: 'text', placeholder: 'e.g. return air grille, utility closet' },
        ],
        catalogLinks: [],
      },
      {
        key: 'hvac_filter.record_size',
        label: 'Record filter size',
        description: 'Note dimensions printed on filter frame',
        promptFields: [
          { key: 'filter_size', label: 'Filter size (L×W×D)', type: 'text', placeholder: 'e.g. 20x25x1' },
        ],
        catalogLinks: [],
      },
      {
        key: 'hvac_filter.inspect_old',
        label: 'Inspect old filter condition',
        description: 'Assess dirt/clog level before disposal',
        promptFields: [
          { key: 'dirt_level', label: 'Dirt/clog level', type: 'select', options: ['Light', 'Moderate', 'Heavy', 'Severely clogged'] },
        ],
        catalogLinks: [],
      },
      {
        key: 'hvac_filter.install_new',
        label: 'Install new filter',
        description: 'Install with correct airflow direction (arrow toward unit)',
        promptFields: [
          { key: 'filter_size', label: 'Filter size installed', type: 'text', placeholder: 'e.g. 20x25x1' },
          { key: 'merv_rating', label: 'MERV rating', type: 'number', placeholder: 'e.g. 11' },
          { key: 'airflow_correct', label: 'Airflow direction correct (arrow toward unit)', type: 'boolean' },
          { key: 'next_replacement', label: 'Recommended next replacement', type: 'text', placeholder: 'e.g. 60–90 days' },
        ],
        catalogLinks: [],
      },
      {
        key: 'hvac_filter.verify_seat',
        label: 'Verify filter seating',
        description: 'Confirm filter seats properly with no gaps',
        promptFields: [
          { key: 'gaps_found', label: 'Gaps found around filter', type: 'boolean' },
        ],
        catalogLinks: [],
      },
    ],
  },
  {
    key: 'toilet_leak',
    label: 'Toilet Water Leak',
    tasks: [
      {
        key: 'toilet_leak.count',
        label: 'Number of Toilets',
        description: 'Enter the total number of toilets in the home, then complete a quick leak summary for each.',
        promptFields: [
          { key: 'num_toilets', label: 'Number of toilets in home', type: 'number', placeholder: 'e.g. 2' },
        ],
        dynamicGroups: {
          countKey: 'num_toilets',
          prefix: 'toilet',
          label: 'Toilet',
          fields: [
            { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. master bath, hall bath, half bath' },
            { key: 'leak_detected', label: 'Leak detected', type: 'boolean' },
            { key: 'notes', label: 'Notes / observations', type: 'text', placeholder: 'Any issues noted' },
          ],
        },
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.base_check',
        label: 'Check base for water pooling / staining',
        description: 'Look for water pooling or staining on floor around toilet base',
        promptFields: [
          { key: 'water_found', label: 'Water or staining found at base', type: 'boolean' },
          { key: 'location', label: 'Location (e.g. hall bath, master)', type: 'text', placeholder: 'e.g. hall bathroom' },
        ],
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.wax_ring',
        label: 'Wax ring seal area',
        description: 'Rocking test — toilet should not move; inspect seal area',
        promptFields: [
          { key: 'toilet_rocks', label: 'Toilet rocks / moves', type: 'boolean' },
          { key: 'seal_damage', label: 'Seal damage visible', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.supply_line',
        label: 'Supply line and shutoff valve',
        description: 'Check for drips or corrosion on supply line and shutoff valve',
        promptFields: [
          { key: 'drips', label: 'Active drips found', type: 'boolean' },
          { key: 'corrosion', label: 'Corrosion present', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.tank_bolts',
        label: 'Tank bolts / fill valve / flapper',
        description: 'Check tank-to-bowl bolts and fill valve/flapper for leaks',
        promptFields: [
          { key: 'bolt_leak', label: 'Tank bolt leak', type: 'boolean' },
          { key: 'flapper_leak', label: 'Flapper not sealing', type: 'boolean' },
          { key: 'fill_valve_ok', label: 'Fill valve functioning normally', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.dye_test',
        label: 'Dye tablet / food coloring test',
        description: 'Drop dye in tank, wait 10 min — color in bowl = silent flapper leak',
        promptFields: [
          { key: 'leak_detected', label: 'Silent leak detected (color in bowl)', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'toilet_leak.flooring',
        label: 'Flooring / subfloor around base',
        description: 'Check for soft spots or discoloration indicating long-term leak',
        promptFields: [
          { key: 'soft_spots', label: 'Soft spots found', type: 'boolean' },
          { key: 'discoloration', label: 'Discoloration / staining', type: 'boolean' },
          { key: 'mold_risk', label: 'Mold / rot risk — further inspection needed', type: 'boolean' },
        ],
        catalogLinks: [],
      },
    ],
  },
  {
    key: 'sink_leak',
    label: 'Sink Water Leakage',
    tasks: [
      {
        key: 'sink_leak.count',
        label: 'Number of Sinks',
        description: 'Enter the total number of sinks in the home, then record a leak summary for each.',
        promptFields: [
          { key: 'num_sinks', label: 'Number of sinks in home', type: 'number', placeholder: 'e.g. 3' },
        ],
        dynamicGroups: {
          countKey: 'num_sinks',
          prefix: 'sink',
          label: 'Sink',
          fields: [
            { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. kitchen, master bath, laundry' },
            { key: 'leak_detected', label: 'Leak detected', type: 'boolean' },
            { key: 'notes', label: 'Notes / observations', type: 'text', placeholder: 'Any issues noted' },
          ],
        },
        catalogLinks: [],
      },
      {
        key: 'sink_leak.supply_lines',
        label: 'Supply lines and shutoff valves',
        description: 'Inspect under sink for corrosion or drips on supply lines and valves',
        promptFields: [
          { key: 'corrosion', label: 'Corrosion present', type: 'boolean' },
          { key: 'drips', label: 'Active drips', type: 'boolean' },
          { key: 'location', label: 'Sink location', type: 'text', placeholder: 'e.g. kitchen, master bath' },
        ],
        catalogLinks: [],
      },
      {
        key: 'sink_leak.p_trap',
        label: 'P-trap and drain slip joints',
        description: 'Run water and observe P-trap and drain joints for leaks',
        promptFields: [
          { key: 'leaking', label: 'Leak found at P-trap or joints', type: 'boolean' },
          { key: 'leak_location', label: 'Leak location', type: 'text', placeholder: 'e.g. P-trap joint, drain gasket' },
        ],
        catalogLinks: [],
      },
      {
        key: 'sink_leak.faucet',
        label: 'Faucet base and sprayer connections',
        description: 'Check faucet base and sprayer connections for seepage',
        promptFields: [
          { key: 'faucet_seepage', label: 'Seepage at faucet base', type: 'boolean' },
          { key: 'sprayer_leak', label: 'Sprayer connection leak', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'sink_leak.cabinet',
        label: 'Cabinet floor / base condition',
        description: 'Check for water staining, swelling, or mold in cabinet',
        promptFields: [
          { key: 'staining', label: 'Water staining found', type: 'boolean' },
          { key: 'swelling', label: 'Cabinet base swelling / warping', type: 'boolean' },
          { key: 'mold', label: 'Mold observed', type: 'boolean' },
          { key: 'active_vs_residual', label: 'Active leak or residual staining', type: 'select', options: ['Active leak', 'Residual staining only', 'None'] },
        ],
        catalogLinks: [],
      },
      {
        key: 'sink_leak.pressure',
        label: 'Hot and cold water pressure',
        description: 'Test pressure at faucet — note if low or unbalanced',
        promptFields: [
          { key: 'pressure_ok', label: 'Pressure normal', type: 'boolean' },
          { key: 'pressure_note', label: 'Pressure observation', type: 'text', placeholder: 'e.g. low hot, normal cold' },
        ],
        catalogLinks: [],
      },
    ],
  },
  {
    key: 'washer_pan',
    label: 'Washer Pan (Drain Pan)',
    tasks: [
      {
        key: 'washer_pan.pan_condition',
        label: 'Pan cracks / corrosion / standing water',
        description: 'Check pan material and condition',
        promptFields: [
          { key: 'pan_material', label: 'Pan material', type: 'select', options: ['Plastic', 'Metal', 'Unknown'] },
          { key: 'cracks', label: 'Cracks present', type: 'boolean' },
          { key: 'corrosion', label: 'Corrosion present', type: 'boolean' },
          { key: 'standing_water', label: 'Standing water in pan', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'washer_pan.drain_line',
        label: 'Pan drain line',
        description: 'Verify drain line is connected and unobstructed',
        promptFields: [
          { key: 'connected', label: 'Drain line connected', type: 'boolean' },
          { key: 'unobstructed', label: 'Drain line unobstructed', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'washer_pan.hoses',
        label: 'Supply and drain hoses',
        description: 'Check hoses for bulging, cracking, or leaks at connections',
        promptFields: [
          { key: 'bulging', label: 'Bulging observed on hoses', type: 'boolean' },
          { key: 'cracking', label: 'Cracking on hose surface', type: 'boolean' },
          { key: 'connection_leaks', label: 'Leaks at hose connections', type: 'boolean' },
          { key: 'hose_age_known', label: 'Hose age known (recommend replace every 5 yrs)', type: 'text', placeholder: 'e.g. 2018 or unknown' },
        ],
        catalogLinks: [],
      },
      {
        key: 'washer_pan.position',
        label: 'Pan positioning',
        description: 'Confirm pan is properly positioned under washer with no gaps',
        promptFields: [
          { key: 'properly_positioned', label: 'Pan properly positioned', type: 'boolean' },
          { key: 'gaps', label: 'Gaps allowing water escape', type: 'boolean' },
        ],
        catalogLinks: [],
      },
      {
        key: 'washer_pan.flooring',
        label: 'Surrounding flooring',
        description: 'Check for water damage or staining around washer area',
        promptFields: [
          { key: 'water_damage', label: 'Water damage / staining found', type: 'boolean' },
          { key: 'warped_flooring', label: 'Warped or soft flooring', type: 'boolean' },
        ],
        catalogLinks: [],
      },
    ],
  },
  {
    key: 'bulb_replacement',
    label: 'Bulb Replacement',
    tasks: [
      {
        key: 'bulb_replacement.test_fixtures',
        label: 'Test all fixtures for functionality',
        description: 'Test every fixture/light switch in scope',
        promptFields: [
          { key: 'fixtures_tested', label: 'Number of fixtures tested', type: 'number', placeholder: 'e.g. 12' },
          { key: 'non_functioning', label: 'Number of non-functioning fixtures', type: 'number', placeholder: 'e.g. 3' },
        ],
        catalogLinks: ['Replace Bulbs (included in inspection)', 'Replace Bulbs (not included)'],
      },
      {
        key: 'bulb_replacement.identify_type',
        label: 'Identify bulb type / wattage / base',
        description: 'Record bulb specifications before replacement',
        promptFields: [
          { key: 'bulb_type', label: 'Bulb type', type: 'select', options: ['LED', 'CFL', 'Incandescent', 'Halogen', 'Fluorescent', 'Mixed'] },
          { key: 'wattage', label: 'Wattage (or equivalent)', type: 'text', placeholder: 'e.g. 60W equiv.' },
          { key: 'base_type', label: 'Base type', type: 'text', placeholder: 'e.g. E26, GU10, MR16' },
        ],
        catalogLinks: ['Replace Bulbs (included in inspection)', 'Replace Bulbs (not included)'],
      },
      {
        key: 'bulb_replacement.replace_bulbs',
        label: 'Replace non-functioning / damaged bulbs',
        description: 'Replace flickering, blackened, or broken bulbs',
        promptFields: [
          { key: 'bulbs_replaced', label: 'Number of bulbs replaced', type: 'number', placeholder: 'e.g. 3' },
          { key: 'fixture_locations', label: 'Fixture locations', type: 'text', placeholder: 'e.g. hallway ceiling, garage exterior' },
          { key: 'bulb_type_installed', label: 'Bulb type installed', type: 'select', options: ['LED', 'CFL', 'Incandescent', 'Halogen', 'Same as existing'] },
        ],
        catalogLinks: ['Replace Bulbs (included in inspection)', 'Replace Bulbs (not included)'],
      },
      {
        key: 'bulb_replacement.verify_socket',
        label: 'Verify socket / wiring if bulb replacement fails',
        description: 'If a new bulb still does not work, flag as wiring/socket issue',
        promptFields: [
          { key: 'socket_issue_found', label: 'Socket or wiring issue (not just bulb)', type: 'boolean' },
          { key: 'fixtures_flagged', label: 'Fixtures flagged for electrician', type: 'text', placeholder: 'e.g. kitchen pendant, garage switch' },
        ],
        catalogLinks: [],
      },
      {
        key: 'bulb_replacement.dispose',
        label: 'Dispose of old bulbs',
        description: 'Note if CFL/fluorescent requiring special disposal',
        promptFields: [
          { key: 'special_disposal_needed', label: 'CFL/fluorescent bulbs requiring special disposal', type: 'boolean' },
        ],
        catalogLinks: [],
      },
    ],
  },
];

export const ALL_TASK_KEYS: string[] = INSPECTION_CHECKLIST.flatMap((s) => s.tasks.map((t) => t.key));

export const TASK_TOTAL = ALL_TASK_KEYS.length;

export function getTaskDef(taskKey: string): ChecklistTask | undefined {
  for (const section of INSPECTION_CHECKLIST) {
    const task = section.tasks.find((t) => t.key === taskKey);
    if (task) return task;
  }
  return undefined;
}

export function getSectionKey(taskKey: string): string | undefined {
  return taskKey.split('.')[0];
}
