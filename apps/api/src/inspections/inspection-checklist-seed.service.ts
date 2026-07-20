import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionChecklistGroup } from './entities/inspection-checklist-group.entity';
import { InspectionChecklistSubgroup } from './entities/inspection-checklist-subgroup.entity';
import { InspectionChecklistSection } from './entities/inspection-checklist-section.entity';
import { InspectionChecklistTask } from './entities/inspection-checklist-task.entity';
import { TaskPromptField, DynamicGroupDef } from './checklists';

type SeedTask = {
  key: string;
  label: string;
  description: string;
  promptFields: TaskPromptField[];
  dynamicGroups?: DynamicGroupDef;
  catalogLinks: string[];
};

// Every task below is transcribed verbatim from the pre-existing hardcoded
// INSPECTION_CHECKLIST in ./checklists.ts, so this migration changes nothing
// about what a vendor sees on day one — only where it's stored. Keep the
// `key` values identical to the old hardcoded ones (task keys are still
// namespaced `${sectionKey}.${suffix}`, relied on by getSectionKey()
// elsewhere in inspections.service.ts).
const HVAC_VISUAL_TASKS: SeedTask[] = [
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
];

const AHU_FILTERS_TASKS: SeedTask[] = [
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
];

const TOILETS_TASKS: SeedTask[] = [
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
];

const SINKS_TASKS: SeedTask[] = [
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
];

// Replaced 2026-07-20: the original 5 grouped-question tasks were superseded
// by this more granular 9-task version (one task per individual check,
// matching the Showers/Tub, Kitchen, and Water Heater checklists added the
// same day) — see InspectionConfigService.removeTask usage in the seed
// service's onModuleInit for the corresponding live-data cleanup.
const LAUNDRY_TASKS: SeedTask[] = [
  {
    key: 'washer_pan.hoses_cracks',
    label: 'No cracks or bulges',
    description: 'Washer Supply Hoses',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.hoses_wear',
    label: 'No signs of wear',
    description: 'Washer Supply Hoses',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.hoses_dry',
    label: 'Connections are dry',
    description: 'Washer Supply Hoses',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.valves_leaks',
    label: 'No leaks',
    description: 'Shutoff Valves',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.valves_operable',
    label: 'Valves appear operable',
    description: 'Shutoff Valves',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.valves_corrosion',
    label: 'No corrosion',
    description: 'Shutoff Valves',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.drain_secured',
    label: 'Drain hose properly secured',
    description: 'Drain Line',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.drain_leaks',
    label: 'No visible leaks',
    description: 'Drain Line',
    promptFields: [],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.drain_overflow',
    label: 'No signs of overflow',
    description: 'Drain Line',
    promptFields: [],
    catalogLinks: [],
  },
];

const SHOWER_TUB_TASKS: SeedTask[] = [
  { key: 'shower_tub_leak.fixtures_showerhead', label: 'No active leaks from showerhead', description: 'Fixtures', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.fixtures_spout', label: 'No leaks from tub spout', description: 'Fixtures', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.fixtures_handles', label: 'Faucet handles operate properly', description: 'Fixtures', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.fixtures_shutoff', label: 'Water shuts off completely (no dripping)', description: 'Fixtures', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.caulking_intact', label: 'Caulking is intact', description: 'Caulking', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.caulking_gaps', label: 'No gaps or separation', description: 'Caulking', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.caulking_mold', label: 'No mold or mildew present', description: 'Caulking', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.grout_intact', label: 'Grout is intact', description: 'Tile & Grout', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.grout_tiles', label: 'No cracked or loose tiles', description: 'Tile & Grout', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.grout_missing', label: 'No missing grout', description: 'Tile & Grout', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.damage_walls', label: 'No staining on surrounding walls', description: 'Water Damage', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.damage_ceiling', label: 'No staining on ceiling below (if applicable)', description: 'Water Damage', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.damage_floor', label: 'Floor is dry', description: 'Water Damage', promptFields: [], catalogLinks: [] },
  { key: 'shower_tub_leak.damage_drywall', label: 'No soft or swollen drywall', description: 'Water Damage', promptFields: [], catalogLinks: [] },
];

const KITCHEN_TASKS: SeedTask[] = [
  { key: 'kitchen_leak.faucet_dripping', label: 'No dripping from faucet', description: 'Faucet', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.faucet_handles', label: 'Handles operate properly', description: 'Faucet', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.faucet_sprayer', label: 'Spray nozzle functions correctly (if applicable)', description: 'Faucet', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.plumbing_supply', label: 'No leaks from supply lines', description: 'Sink Plumbing', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.plumbing_shutoff', label: 'No leaks from shutoff valves', description: 'Sink Plumbing', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.plumbing_ptrap', label: 'No leaks from P-trap', description: 'Sink Plumbing', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.plumbing_cabinet', label: 'Cabinet floor is dry', description: 'Sink Plumbing', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.disposal_operates', label: 'Disposal operates properly', description: 'Garbage Disposal', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.disposal_leaks', label: 'No visible leaks', description: 'Garbage Disposal', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.disposal_noise', label: 'No unusual vibration or noise', description: 'Garbage Disposal', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.dishwasher_connections', label: 'No leaks under sink connections', description: 'Dishwasher', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.dishwasher_hose', label: 'Drain hose appears secure', description: 'Dishwasher', promptFields: [], catalogLinks: [] },
  { key: 'kitchen_leak.dishwasher_supply', label: 'Water supply connection is dry', description: 'Dishwasher', promptFields: [], catalogLinks: [] },
];

// "Do not test or operate the T&P valve — this is a visual inspection only"
// is a real safety caveat from the source checklist, carried in the
// description of each Temperature & Pressure Relief Valve task below.
const WATER_HEATER_TASKS: SeedTask[] = [
  { key: 'water_heater_leak.pan_dry', label: 'Pan is dry', description: 'Drain Pan', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.pan_standing_water', label: 'No standing water', description: 'Drain Pan', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.pan_condition', label: 'Pan not rusted or damaged', description: 'Drain Pan', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.fittings_hot', label: 'Hot water connection dry', description: 'Supply Fittings', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.fittings_cold', label: 'Cold water connection dry', description: 'Supply Fittings', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.fittings_corrosion', label: 'No visible corrosion', description: 'Supply Fittings', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tp_pipe_present', label: 'Discharge pipe present', description: 'Temperature & Pressure Relief (T&P) Valve — visual only, do not test or operate the valve', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tp_pipe_direction', label: 'Pipe points downward', description: 'Temperature & Pressure Relief (T&P) Valve — visual only, do not test or operate the valve', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tp_leaks', label: 'No visible leaks', description: 'Temperature & Pressure Relief (T&P) Valve — visual only, do not test or operate the valve', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tank_rust', label: 'No visible rust', description: 'Tank Condition', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tank_stains', label: 'No water stains', description: 'Tank Condition', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tank_leaking', label: 'No signs of leaking', description: 'Tank Condition', promptFields: [], catalogLinks: [] },
  { key: 'water_heater_leak.tank_area_dry', label: 'Area around heater is dry', description: 'Tank Condition', promptFields: [], catalogLinks: [] },
];

@Injectable()
export class InspectionChecklistSeedService implements OnModuleInit {
  private readonly logger = new Logger(InspectionChecklistSeedService.name);

  constructor(
    @InjectRepository(InspectionChecklistGroup) private groupsRepo: Repository<InspectionChecklistGroup>,
    @InjectRepository(InspectionChecklistSubgroup) private subgroupsRepo: Repository<InspectionChecklistSubgroup>,
    @InjectRepository(InspectionChecklistSection) private sectionsRepo: Repository<InspectionChecklistSection>,
    @InjectRepository(InspectionChecklistTask) private tasksRepo: Repository<InspectionChecklistTask>,
  ) {}

  async onModuleInit() {
    const group = await this.ensureGroup('GENERAL_HOME_INSPECTION', 'General Home Inspection', 0);

    const hvacVisualSub = await this.ensureSubgroup(group.id, 'HVAC_VISUAL_INSPECTION', 'HVAC Visual Inspection', 0);
    const ahuFiltersSub = await this.ensureSubgroup(group.id, 'AHU_FILTERS', 'AHU Filters', 1);
    const leakSub = await this.ensureSubgroup(group.id, 'LEAK_INSPECTION', 'Leak Inspection', 2);

    const hvacVisualSection = await this.ensureSection(hvacVisualSub.id, 'hvac_visual', 'HVAC Visual Inspection', 0);
    const ahuFiltersSection = await this.ensureSection(ahuFiltersSub.id, 'hvac_filter', 'AHU Filters', 0);
    const toiletsSection = await this.ensureSection(leakSub.id, 'toilet_leak', 'Toilets', 0);
    const sinksSection = await this.ensureSection(leakSub.id, 'sink_leak', 'Sinks', 1);
    const showerTubSection = await this.ensureSection(leakSub.id, 'shower_tub_leak', 'Showers/Tub', 2,
      'Recommended photos if an issue is found: shower fixture leak, failed caulking, damaged grout, water damage.');
    const kitchenSection = await this.ensureSection(leakSub.id, 'kitchen_leak', 'Kitchen', 3,
      'Recommended photos if an issue is found: under-sink plumbing, disposal leak, dishwasher connection, cabinet water damage.');
    const laundrySection = await this.ensureSection(leakSub.id, 'washer_pan', 'Laundry', 4,
      'Recommended photos if an issue is found: washer connections, shutoff valves, drain hose.');
    const waterHeaterSection = await this.ensureSection(leakSub.id, 'water_heater_leak', 'Water heater (visual only)', 5,
      'Visual inspection only — do not operate the water heater or its valves. Recommended photos if an issue is found: full water heater, supply connections, drain pan, any signs of corrosion or leaks.');

    await this.ensureTasks(hvacVisualSection.id, HVAC_VISUAL_TASKS);
    await this.ensureTasks(ahuFiltersSection.id, AHU_FILTERS_TASKS);
    await this.ensureTasks(toiletsSection.id, TOILETS_TASKS);
    await this.ensureTasks(sinksSection.id, SINKS_TASKS);
    await this.ensureTasks(showerTubSection.id, SHOWER_TUB_TASKS);
    await this.ensureTasks(kitchenSection.id, KITCHEN_TASKS);
    await this.ensureTasks(laundrySection.id, LAUNDRY_TASKS);
    await this.ensureTasks(waterHeaterSection.id, WATER_HEATER_TASKS);
  }

  private async ensureGroup(key: string, label: string, sortOrder: number) {
    let g = await this.groupsRepo.findOne({ where: { key } });
    if (!g) {
      g = await this.groupsRepo.save(this.groupsRepo.create({ key, label, sortOrder }));
      this.logger.log(`Seeded inspection checklist group "${label}".`);
    }
    return g;
  }

  private async ensureSubgroup(groupId: string, key: string, label: string, sortOrder: number) {
    let s = await this.subgroupsRepo.findOne({ where: { key } });
    if (!s) {
      s = await this.subgroupsRepo.save(this.subgroupsRepo.create({ groupId, key, label, sortOrder }));
      this.logger.log(`Seeded inspection checklist subgroup "${label}".`);
    }
    return s;
  }

  private async ensureSection(subgroupId: string, key: string, label: string, sortOrder: number, description: string | null = null) {
    let s = await this.sectionsRepo.findOne({ where: { key } });
    if (!s) {
      s = await this.sectionsRepo.save(this.sectionsRepo.create({ subgroupId, key, label, sortOrder, description }));
      this.logger.log(`Seeded inspection checklist section "${label}" (${key}).`);
    }
    return s;
  }

  private async ensureTasks(sectionId: string, tasks: SeedTask[]) {
    for (const [i, t] of tasks.entries()) {
      const existing = await this.tasksRepo.findOne({ where: { key: t.key } });
      if (existing) continue;
      await this.tasksRepo.save(this.tasksRepo.create({
        sectionId,
        key: t.key,
        label: t.label,
        description: t.description,
        promptFields: t.promptFields,
        dynamicGroups: t.dynamicGroups ?? null,
        catalogLinks: t.catalogLinks ?? [],
        sortOrder: i,
      }));
    }
  }
}
