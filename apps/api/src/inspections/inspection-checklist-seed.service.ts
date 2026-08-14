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
    description: 'Enter the number of AC units in the home, then complete visual inspection, nameplate, and filter details for each unit. AHU Filters is now part of this per-unit inspection rather than its own checklist.',
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
        { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Carrier 24ACC636A003' },
        { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
        { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
        { key: 'num_filters', label: 'Number of filters in this unit', type: 'number', placeholder: 'e.g. 1' },
      ],
      subGroups: {
        countKey: 'num_filters',
        prefix: 'filter',
        label: 'AHU Filter',
        fields: [
          { key: 'filter_location', label: 'Filter Location', type: 'text', placeholder: 'e.g. return air grille, air handler front' },
          { key: 'size', label: 'Filter size', type: 'text', placeholder: 'e.g. 20x25x1' },
          { key: 'dirt_level', label: 'Filter Dirt/clog level', type: 'select', options: ['Light', 'Moderate', 'Heavy', 'Severely clogged'] },
          { key: 'merv', label: 'New Filter MERV Rating', type: 'number', placeholder: 'e.g. 11' },
          { key: 'airflow_correct', label: 'Airflow direction correct (arrow toward unit)', type: 'boolean' },
          { key: 'next_replacement_days', label: 'Recommended next replacement (in days)', type: 'number', placeholder: 'e.g. 75' },
          { key: 'finding_notes', label: 'Finding Notes', type: 'text', placeholder: 'Any issues noted' },
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
];

// Consolidated 2026-07-20: the original 7 separate tasks (one per check)
// were folded into this single repeating per-toilet task so a vendor with
// N toilets fills out N complete toggle sets in one flow instead of
// repeating a full status+photo submission per check per toilet.
const TOILETS_TASKS: SeedTask[] = [
  {
    key: 'toilet_leak.count',
    label: 'Toilet Inspection',
    description: 'Enter the number of toilets in the home, then for each one check the base, wax ring seal, supply line, tank components, run a dye test, and inspect surrounding flooring for signs of a leak.',
    promptFields: [
      { key: 'num_toilets', label: 'Number of toilets in home', type: 'number', placeholder: 'e.g. 2' },
    ],
    dynamicGroups: {
      countKey: 'num_toilets',
      prefix: 'toilet',
      label: 'Toilet',
      fields: [
        { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. master bath, hall bath, half bath' },
        { key: 'water_found', label: 'Water or staining found at base', type: 'boolean' },
        { key: 'toilet_rocks', label: 'Toilet rocks / moves', type: 'boolean' },
        { key: 'seal_damage', label: 'Seal damage visible', type: 'boolean' },
        { key: 'supply_drips', label: 'Active drips at supply line', type: 'boolean' },
        { key: 'supply_corrosion', label: 'Corrosion present at supply line/valve', type: 'boolean' },
        { key: 'bolt_leak', label: 'Tank bolt leak', type: 'boolean' },
        { key: 'flapper_leak', label: 'Flapper not sealing', type: 'boolean' },
        { key: 'fill_valve_ok', label: 'Fill valve functioning normally', type: 'boolean' },
        { key: 'dye_test_leak', label: 'Silent leak detected (dye test)', type: 'boolean' },
        { key: 'soft_spots', label: 'Soft spots in flooring', type: 'boolean' },
        { key: 'discoloration', label: 'Discoloration / staining on flooring', type: 'boolean' },
        { key: 'mold_risk', label: 'Mold / rot risk — further inspection needed', type: 'boolean' },
        { key: 'overall_status', label: 'Overall Status', type: 'select', options: ['Pass', 'Needs Attention'] },
        { key: 'notes', label: 'Notes / observations', type: 'text', placeholder: 'Any issues noted' },
      ],
    },
    catalogLinks: [],
  },
];

// Consolidated 2026-07-20: same treatment as Toilets above.
const SINKS_TASKS: SeedTask[] = [
  {
    key: 'sink_leak.count',
    label: 'Sink Inspection',
    description: 'Enter the number of sinks in the home, then for each one check supply lines, the P-trap, faucet connections, cabinet condition, and water pressure for signs of a leak.',
    promptFields: [
      { key: 'num_sinks', label: 'Number of sinks in home', type: 'number', placeholder: 'e.g. 3' },
    ],
    dynamicGroups: {
      countKey: 'num_sinks',
      prefix: 'sink',
      label: 'Sink',
      fields: [
        { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. kitchen, master bath, laundry' },
        { key: 'supply_corrosion', label: 'Corrosion present at supply lines/valves', type: 'boolean' },
        { key: 'supply_drips', label: 'Active drips at supply lines/valves', type: 'boolean' },
        { key: 'ptrap_leak', label: 'Leak found at P-trap or drain joints', type: 'boolean' },
        { key: 'faucet_seepage', label: 'Seepage at faucet base', type: 'boolean' },
        { key: 'sprayer_leak', label: 'Sprayer connection leak', type: 'boolean' },
        { key: 'cabinet_staining', label: 'Water staining in cabinet', type: 'boolean' },
        { key: 'cabinet_swelling', label: 'Cabinet base swelling / warping', type: 'boolean' },
        { key: 'cabinet_mold', label: 'Mold observed in cabinet', type: 'boolean' },
        { key: 'active_vs_residual', label: 'Active leak or residual staining', type: 'select', options: ['Active leak', 'Residual staining only', 'None'] },
        { key: 'pressure_ok', label: 'Water pressure normal', type: 'boolean' },
        { key: 'pressure_note', label: 'Pressure observation', type: 'text', placeholder: 'e.g. low hot, normal cold' },
        { key: 'overall_status', label: 'Overall Status', type: 'select', options: ['Pass', 'Needs Attention'] },
        { key: 'notes', label: 'Notes / observations', type: 'text', placeholder: 'Any issues noted' },
      ],
    },
    catalogLinks: [],
  },
];

// Replaced 2026-07-20: the original 5 grouped-question tasks were superseded
// by this more granular 9-task version (one task per individual check,
// matching the Showers/Tub, Kitchen, and Water Heater checklists added the
// same day) — see InspectionConfigService.removeTask usage in the seed
// service's onModuleInit for the corresponding live-data cleanup.
// Consolidated 2026-07-20: one task per subsection (each with a toggle per
// individual check) instead of one task per individual check — see the
// TOILETS_TASKS/SINKS_TASKS comment above for why.
const LAUNDRY_TASKS: SeedTask[] = [
  {
    key: 'washer_pan.hoses',
    label: 'Washer Supply Hoses',
    description: 'Check the washer supply hoses for cracking or bulging, general wear, and confirm the connections are dry.',
    promptFields: [
      { key: 'no_cracks_bulges', label: 'No cracks or bulges', type: 'boolean' },
      { key: 'no_wear', label: 'No signs of wear', type: 'boolean' },
      { key: 'connections_dry', label: 'Connections are dry', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.valves',
    label: 'Shutoff Valves',
    description: 'Check the washer’s shutoff valves for leaks, corrosion, and confirm they operate properly.',
    promptFields: [
      { key: 'no_leaks', label: 'No leaks', type: 'boolean' },
      { key: 'operable', label: 'Valves appear operable', type: 'boolean' },
      { key: 'no_corrosion', label: 'No corrosion', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'washer_pan.drain',
    label: 'Drain Line',
    description: 'Check the washer’s drain line is properly secured and free of leaks or overflow.',
    promptFields: [
      { key: 'secured', label: 'Drain hose properly secured', type: 'boolean' },
      { key: 'no_leaks', label: 'No visible leaks', type: 'boolean' },
      { key: 'no_overflow', label: 'No signs of overflow', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const SHOWER_TUB_TASKS: SeedTask[] = [
  {
    key: 'shower_tub_leak.fixtures',
    label: 'Fixtures',
    description: 'Check the showerhead, tub spout, and faucet handles for active leaks and proper operation.',
    promptFields: [
      { key: 'no_showerhead_leak', label: 'No active leaks from showerhead', type: 'boolean' },
      { key: 'no_spout_leak', label: 'No leaks from tub spout', type: 'boolean' },
      { key: 'handles_operate', label: 'Faucet handles operate properly', type: 'boolean' },
      { key: 'shuts_off_completely', label: 'Water shuts off completely (no dripping)', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'shower_tub_leak.caulking',
    label: 'Caulking',
    description: 'Check the caulking around the shower/tub for intactness, gaps or separation, and mold or mildew.',
    promptFields: [
      { key: 'caulking_intact', label: 'Caulking is intact', type: 'boolean' },
      { key: 'no_gaps', label: 'No gaps or separation', type: 'boolean' },
      { key: 'no_mold', label: 'No mold or mildew present', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'shower_tub_leak.tile_grout',
    label: 'Tile & Grout',
    description: 'Check the tile and grout for intactness, cracked or loose tiles, and missing grout.',
    promptFields: [
      { key: 'grout_intact', label: 'Grout is intact', type: 'boolean' },
      { key: 'no_cracked_tiles', label: 'No cracked or loose tiles', type: 'boolean' },
      { key: 'no_missing_grout', label: 'No missing grout', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'shower_tub_leak.water_damage',
    label: 'Water Damage',
    description: 'Check surrounding walls, ceiling below, floor, and drywall for signs of water damage.',
    promptFields: [
      { key: 'no_wall_staining', label: 'No staining on surrounding walls', type: 'boolean' },
      { key: 'no_ceiling_staining', label: 'No staining on ceiling below (if applicable)', type: 'boolean' },
      { key: 'floor_dry', label: 'Floor is dry', type: 'boolean' },
      { key: 'no_soft_drywall', label: 'No soft or swollen drywall', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const KITCHEN_TASKS: SeedTask[] = [
  {
    key: 'kitchen_leak.faucet',
    label: 'Faucet',
    description: 'Check the kitchen faucet for dripping and confirm handles and sprayer operate correctly.',
    promptFields: [
      { key: 'no_dripping', label: 'No dripping from faucet', type: 'boolean' },
      { key: 'handles_operate', label: 'Handles operate properly', type: 'boolean' },
      { key: 'sprayer_functions', label: 'Spray nozzle functions correctly (if applicable)', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'kitchen_leak.plumbing',
    label: 'Sink Plumbing',
    description: 'Check under the sink for leaks at supply lines, shutoff valves, and the P-trap, and confirm the cabinet floor is dry.',
    promptFields: [
      { key: 'no_supply_leaks', label: 'No leaks from supply lines', type: 'boolean' },
      { key: 'no_shutoff_leaks', label: 'No leaks from shutoff valves', type: 'boolean' },
      { key: 'no_ptrap_leaks', label: 'No leaks from P-trap', type: 'boolean' },
      { key: 'cabinet_dry', label: 'Cabinet floor is dry', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'kitchen_leak.disposal',
    label: 'Garbage Disposal',
    description: 'Run the garbage disposal and check for proper operation, visible leaks, and unusual vibration or noise.',
    promptFields: [
      { key: 'operates_properly', label: 'Disposal operates properly', type: 'boolean' },
      { key: 'no_leaks', label: 'No visible leaks', type: 'boolean' },
      { key: 'no_unusual_noise', label: 'No unusual vibration or noise', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'kitchen_leak.dishwasher',
    label: 'Dishwasher',
    description: 'Check the dishwasher’s under-sink connections, drain hose, and water supply for leaks.',
    promptFields: [
      { key: 'no_connection_leaks', label: 'No leaks under sink connections', type: 'boolean' },
      { key: 'hose_secure', label: 'Drain hose appears secure', type: 'boolean' },
      { key: 'supply_dry', label: 'Water supply connection is dry', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const WATER_HEATER_TASKS: SeedTask[] = [
  {
    key: 'water_heater_leak.pan',
    label: 'Drain Pan',
    description: 'Check the drain pan is dry, free of standing water, and not rusted or damaged.',
    promptFields: [
      { key: 'pan_dry', label: 'Pan is dry', type: 'boolean' },
      { key: 'no_standing_water', label: 'No standing water', type: 'boolean' },
      { key: 'pan_condition_ok', label: 'Pan not rusted or damaged', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'water_heater_leak.fittings',
    label: 'Supply Fittings',
    description: 'Check the hot and cold water supply fittings are dry and free of corrosion.',
    promptFields: [
      { key: 'hot_dry', label: 'Hot water connection dry', type: 'boolean' },
      { key: 'cold_dry', label: 'Cold water connection dry', type: 'boolean' },
      { key: 'no_corrosion', label: 'No visible corrosion', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    // "Do not test or operate the T&P valve — visual inspection only" is a
    // real safety caveat from the source checklist, carried here.
    key: 'water_heater_leak.tp_valve',
    label: 'Temperature & Pressure Relief (T&P) Valve',
    description: 'Visual inspection only — do not test or operate the T&P valve. Confirm the discharge pipe is present, points downward, and shows no visible leaks.',
    promptFields: [
      { key: 'pipe_present', label: 'Discharge pipe present', type: 'boolean' },
      { key: 'pipe_points_down', label: 'Pipe points downward', type: 'boolean' },
      { key: 'no_leaks', label: 'No visible leaks', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'water_heater_leak.tank',
    label: 'Tank Condition',
    description: 'Check the tank for rust, water stains, and signs of leaking, and confirm the surrounding area is dry.',
    promptFields: [
      { key: 'no_rust', label: 'No visible rust', type: 'boolean' },
      { key: 'no_stains', label: 'No water stains', type: 'boolean' },
      { key: 'no_leaking', label: 'No signs of leaking', type: 'boolean' },
      { key: 'area_dry', label: 'Area around heater is dry', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

// Exterior Inspection subgroup — 9 checklists, added 2026-07-20.
const FOUNDATION_TASKS: SeedTask[] = [
  {
    key: 'foundation.visible',
    label: 'Visible Foundation',
    description: 'Check the visible foundation for cracks larger than 1/8", significant separation, and signs of shifting or settlement.',
    promptFields: [
      { key: 'no_large_cracks', label: 'No visible cracks larger than 1/8"', type: 'boolean' },
      { key: 'no_separation', label: 'No significant foundation separation', type: 'boolean' },
      { key: 'no_shifting', label: 'No signs of shifting or settlement', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'foundation.grading',
    label: 'Grading & Drainage',
    description: 'Check that the ground slopes away from the foundation and there’s no standing water or erosion nearby.',
    promptFields: [
      { key: 'slopes_away', label: 'Ground slopes away from foundation', type: 'boolean' },
      { key: 'no_standing_water', label: 'No standing water near foundation', type: 'boolean' },
      { key: 'no_erosion', label: 'No erosion around foundation', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const SIDING_TASKS: SeedTask[] = [
  {
    key: 'siding.walls',
    label: 'Exterior Walls',
    description: 'Check the siding for cracked panels, missing pieces, and looseness.',
    promptFields: [
      { key: 'no_cracked_panels', label: 'No cracked siding panels', type: 'boolean' },
      { key: 'no_missing_pieces', label: 'No missing siding pieces', type: 'boolean' },
      { key: 'no_loose_siding', label: 'No loose siding', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'siding.moisture',
    label: 'Moisture Damage',
    description: 'Check the siding for soft spots, water stains, and mold or mildew.',
    promptFields: [
      { key: 'no_soft_spots', label: 'No soft spots', type: 'boolean' },
      { key: 'no_water_stains', label: 'No water stains', type: 'boolean' },
      { key: 'no_mold_mildew', label: 'No visible mold or mildew', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'siding.paint',
    label: 'Paint Condition',
    description: 'Check the siding’s paint condition, looking for excessive peeling and exposed wood.',
    promptFields: [
      { key: 'paint_good', label: 'Paint in good condition', type: 'boolean' },
      { key: 'no_excessive_peeling', label: 'No excessive peeling', type: 'boolean' },
      { key: 'no_exposed_wood', label: 'No exposed wood', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const TRIM_FASCIA_TASKS: SeedTask[] = [
  {
    key: 'trim_fascia.trim',
    label: 'Exterior Trim',
    description: 'Check exterior trim for wood rot, secure attachment, and gaps at joints.',
    promptFields: [
      { key: 'no_wood_rot', label: 'No visible wood rot', type: 'boolean' },
      { key: 'securely_attached', label: 'Trim securely attached', type: 'boolean' },
      { key: 'no_joint_gaps', label: 'No significant gaps at joints', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'trim_fascia.paint',
    label: 'Paint',
    description: 'Check the trim’s paint condition for intactness and peeling.',
    promptFields: [
      { key: 'paint_intact', label: 'Paint intact', type: 'boolean' },
      { key: 'no_peeling', label: 'No peeling paint', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'trim_fascia.fascia',
    label: 'Fascia',
    description: 'Check the fascia for visible damage and signs of water intrusion.',
    promptFields: [
      { key: 'no_damage', label: 'No visible damage', type: 'boolean' },
      { key: 'no_water_intrusion', label: 'No signs of water intrusion', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const ROOF_EXTERIOR_TASKS: SeedTask[] = [
  {
    key: 'roof_exterior.covering',
    label: 'Roof Covering',
    description: 'Ground/binocular inspection only — do not access the roof. Check for missing or damaged shingles and confirm the roofline appears straight.',
    promptFields: [
      { key: 'no_missing_shingles', label: 'No missing shingles visible', type: 'boolean' },
      { key: 'no_damaged_shingles', label: 'No curling or damaged shingles visible', type: 'boolean' },
      { key: 'roofline_straight', label: 'Roofline appears straight', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'roof_exterior.flashing',
    label: 'Flashing',
    description: 'Check the flashing appears secure and free of rust or separation.',
    promptFields: [
      { key: 'flashing_secure', label: 'Flashing appears secure', type: 'boolean' },
      { key: 'no_rust_separation', label: 'No visible rust or separation', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'roof_exterior.debris',
    label: 'Roof Debris',
    description: 'Check that roof valleys are free of debris and there are no excessive branches on the roof.',
    promptFields: [
      { key: 'valleys_clear', label: 'Valleys free of debris', type: 'boolean' },
      { key: 'no_excessive_branches', label: 'No excessive branches on roof', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const GUTTERS_TASKS: SeedTask[] = [
  {
    key: 'gutters.gutters',
    label: 'Gutters',
    description: 'Check the gutters are free of major debris, properly aligned, and not separating from the fascia.',
    promptFields: [
      { key: 'no_major_debris', label: 'Gutters appear free of major debris', type: 'boolean' },
      { key: 'properly_aligned', label: 'Gutters properly aligned', type: 'boolean' },
      { key: 'no_fascia_separation', label: 'No visible separation from fascia', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'gutters.downspouts',
    label: 'Downspouts',
    description: 'Check downspouts are securely attached, direct water away from the foundation, and have extensions where needed.',
    promptFields: [
      { key: 'securely_attached', label: 'Downspouts securely attached', type: 'boolean' },
      { key: 'water_directed_away', label: 'Water directed away from foundation', type: 'boolean' },
      { key: 'extensions_present', label: 'Extensions present where needed', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'gutters.water_indicators',
    label: 'Water Indicators',
    description: 'Check for staining below the gutters or signs of overflow.',
    promptFields: [
      { key: 'no_staining', label: 'No staining below gutters', type: 'boolean' },
      { key: 'no_overflow_marks', label: 'No overflow marks', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const WINDOWS_DOORS_TASKS: SeedTask[] = [
  {
    key: 'windows_doors.caulking',
    label: 'Caulking',
    description: 'Check the caulking around windows and exterior doors is intact and free of visible gaps.',
    promptFields: [
      { key: 'sealant_intact', label: 'Sealant intact', type: 'boolean' },
      { key: 'no_gaps', label: 'No visible gaps', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'windows_doors.trim',
    label: 'Trim',
    description: 'Check window and door trim for rot and paint condition.',
    promptFields: [
      { key: 'trim_no_rot', label: 'Trim free of rot', type: 'boolean' },
      { key: 'paint_good', label: 'Paint in good condition', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'windows_doors.moisture',
    label: 'Moisture',
    description: 'Check for water stains or mold/mildew around windows and doors.',
    promptFields: [
      { key: 'no_water_stains', label: 'No visible water stains', type: 'boolean' },
      { key: 'no_mold', label: 'No mold or mildew', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const DECK_PORCH_TASKS: SeedTask[] = [
  {
    key: 'deck_porch.safety',
    label: 'Safety',
    description: 'Check railings, stairs, and deck boards for secure, stable, safe condition.',
    promptFields: [
      { key: 'railings_secure', label: 'Railings secure', type: 'boolean' },
      { key: 'stairs_stable', label: 'Stairs stable', type: 'boolean' },
      { key: 'no_loose_boards', label: 'No loose deck boards', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'deck_porch.wood',
    label: 'Wood Condition',
    description: 'Check the deck/porch wood for rot, major cracking, or splitting.',
    promptFields: [
      { key: 'no_rot', label: 'No visible rot', type: 'boolean' },
      { key: 'no_cracking_splitting', label: 'No major cracking or splitting', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'deck_porch.hardware',
    label: 'Hardware',
    description: 'Check fasteners are secure and no hardware is missing.',
    promptFields: [
      { key: 'fasteners_secure', label: 'Fasteners secure', type: 'boolean' },
      { key: 'no_missing_hardware', label: 'No missing hardware', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const CONCRETE_TASKS: SeedTask[] = [
  {
    key: 'concrete.walkways',
    label: 'Walkways/Driveways',
    description: 'Check walkways and driveways for trip hazards, major cracks, and significant settlement.',
    promptFields: [
      { key: 'no_trip_hazards', label: 'No trip hazards', type: 'boolean' },
      { key: 'no_major_cracks', label: 'No major cracks', type: 'boolean' },
      { key: 'no_significant_settlement', label: 'No significant settlement', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'concrete.joints',
    label: 'Expansion Joints',
    description: 'Check expansion joints are intact and not excessively deteriorated.',
    promptFields: [
      { key: 'joints_intact', label: 'Joints intact', type: 'boolean' },
      { key: 'no_excessive_deterioration', label: 'No excessive deterioration', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

const VEGETATION_TASKS: SeedTask[] = [
  {
    key: 'vegetation.trees',
    label: 'Trees',
    description: 'Check for tree branches touching the roof or contacting the siding.',
    promptFields: [
      { key: 'no_branches_roof', label: 'No branches touching roof', type: 'boolean' },
      { key: 'no_branches_siding', label: 'No branches contacting siding', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'vegetation.shrubs',
    label: 'Shrubs',
    description: 'Check that shrubs are trimmed away from the house and not blocking vents.',
    promptFields: [
      { key: 'shrubs_trimmed', label: 'Shrubs trimmed away from house', type: 'boolean' },
      { key: 'vents_clear', label: 'No vegetation blocking vents', type: 'boolean' },
    ],
    catalogLinks: [],
  },
  {
    key: 'vegetation.drainage',
    label: 'Drainage',
    description: 'Check that drainage paths and downspouts are unobstructed by vegetation.',
    promptFields: [
      { key: 'paths_unobstructed', label: 'Drainage paths unobstructed', type: 'boolean' },
      { key: 'downspouts_clear', label: 'No vegetation blocking downspouts', type: 'boolean' },
    ],
    catalogLinks: [],
  },
];

// Every task below is transcribed verbatim from the pre-existing hardcoded
// HVAC_SECTIONS in apps/mobile/app/(vendor)/active-job.tsx (the old bespoke
// "HVAC Inspection Report" form) — replacing it with real, admin-editable
// checklist sections/tasks under the new HVAC_FULL_INSPECTION group. Each
// section's free-form infoFields become one ".info" task; each fixed
// equipment identification row becomes its own task; each PASS/FAIL/N/A
// check becomes its own task using the same generic status/findings/photo
// mechanism every other checklist task already uses — this is what makes
// each check individually admin-editable (label/description/enable-disable).
const HVAC_FULL_SYSTEM_ID_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_system_id.info',
    label: 'System Information',
    description: 'Equipment location, unit age, warranty status, and prior service history.',
    promptFields: [
      { key: 'equipment_location', label: 'Equipment Location', type: 'text', placeholder: 'e.g. Basement, attic' },
      { key: 'unit_age', label: 'Unit Age (years)', type: 'number', placeholder: 'e.g. 8' },
      { key: 'warranty_status', label: 'Warranty Status', type: 'select', options: ['Under warranty', 'Out of warranty', 'Unknown'] },
      { key: 'service_history', label: 'Service History / Notes', type: 'text', placeholder: 'Prior service records...' },
    ],
    catalogLinks: [],
  },
  {
    key: 'hvac_full_system_id.equip_air_handler',
    label: 'Air Handler / Furnace — Equipment ID',
    description: 'Record the make, model, serial number, and install date of the air handler or furnace.',
    promptFields: [
      { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Carrier 24ACC636A003' },
      { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
      { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
    ],
    catalogLinks: [],
  },
  {
    key: 'hvac_full_system_id.equip_condenser',
    label: 'Condenser / Heat Pump — Equipment ID',
    description: 'Record the make, model, serial number, and install date of the condenser or heat pump.',
    promptFields: [
      { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Carrier 24ACC636A003' },
      { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
      { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
    ],
    catalogLinks: [],
  },
  {
    key: 'hvac_full_system_id.equip_thermostat',
    label: 'Thermostat — Equipment ID',
    description: 'Record the make, model, serial number, and install date of the thermostat.',
    promptFields: [
      { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Ecobee SmartThermostat' },
      { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
      { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
    ],
    catalogLinks: [],
  },
  {
    key: 'hvac_full_system_id.equip_humidifier',
    label: 'Humidifier / Dehumidifier — Equipment ID',
    description: 'Record the make, model, serial number, and install date of the humidifier or dehumidifier, if present.',
    promptFields: [
      { key: 'make_model', label: 'Make / Model', type: 'text', placeholder: 'e.g. Aprilaire 600' },
      { key: 'serial', label: 'Serial number', type: 'text', placeholder: 'e.g. 1234A12345' },
      { key: 'install_date', label: 'Install / manufacture date', type: 'text', placeholder: 'e.g. 2018 or not visible' },
    ],
    catalogLinks: [],
  },
];

const HVAC_FULL_THERMOSTAT_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_thermostat.info',
    label: 'Thermostat Details',
    description: 'Thermostat type, brand/model, and location.',
    promptFields: [
      { key: 'type', label: 'Thermostat Type', type: 'select', options: ['Manual', 'Programmable', 'Smart/WiFi'] },
      { key: 'brand_model', label: 'Brand / Model', type: 'text', placeholder: 'e.g. Ecobee SmartThermostat' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Main hallway' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_thermostat.display', label: 'Thermostat display functional', description: 'Confirm the thermostat display is legible and functioning.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.temp_response', label: 'Temperature setting responds correctly', description: 'Confirm the setpoint responds correctly when adjusted.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.heat_mode', label: 'Heating mode tested', description: 'Test heating mode engages correctly.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.cool_mode', label: 'Cooling mode tested', description: 'Test cooling mode engages correctly.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.fan_mode', label: 'Fan mode tested (Auto/On)', description: 'Test fan mode in both Auto and On settings.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.schedule', label: 'Schedule / programming verified', description: 'Verify programmed schedule, if applicable.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.smart_features', label: 'Smart features connected (if applicable)', description: 'Confirm WiFi/smart features are connected and functioning.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_thermostat.wiring', label: 'Wiring connections secure', description: 'Inspect thermostat wiring connections for security and condition.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_AIR_FILTER_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_air_filter.info',
    label: 'Filter Details',
    description: 'Filter size, type, and MERV rating.',
    promptFields: [
      { key: 'filter_size', label: 'Filter Size', type: 'text', placeholder: 'e.g. 16x20x1' },
      { key: 'filter_type', label: 'Filter Type', type: 'text', placeholder: 'e.g. Pleated, HEPA' },
      { key: 'filter_merv', label: 'MERV Rating', type: 'number', placeholder: 'e.g. 8' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_air_filter.filter_clean', label: 'Filter in clean / acceptable condition', description: 'Inspect the filter for dirt/clog level.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_air_filter.airflow_normal', label: 'Airflow normal — no restriction', description: 'Confirm airflow is not restricted at the filter.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_air_filter.filter_access', label: 'Filter slot accessible and sealed', description: 'Confirm the filter slot is accessible and properly sealed.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_air_filter.return_air', label: 'Return air registers unobstructed', description: 'Confirm return air registers are unobstructed.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_HEATING_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_heating.info',
    label: 'Heating System Details',
    description: 'Fuel type and measured temperature rise.',
    promptFields: [
      { key: 'fuel_type', label: 'Fuel Type', type: 'select', options: ['Natural gas', 'Propane', 'Electric', 'Heat pump', 'Oil'] },
      { key: 'temp_rise', label: 'Temperature Rise', type: 'text', placeholder: 'e.g. 45°F (normal 35–70°F)' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_heating.heat_exchanger', label: 'Heat exchanger — no cracks or corrosion', description: 'Inspect the heat exchanger for cracks or corrosion.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.burner_flame', label: 'Burner flame — blue, stable (N/A: heat pump)', description: 'Confirm burner flame is blue and stable; not applicable for heat pumps.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.ignition', label: 'Ignition sequence normal', description: 'Confirm the ignition sequence operates normally.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.flue_venting', label: 'Flue / venting — no damage or improper clearance', description: 'Inspect flue/venting for damage or improper clearance.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.gas_valve', label: 'Gas valve and supply line — no corrosion or leaks', description: 'Inspect gas valve and supply line for corrosion or leaks.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.blower_operation', label: 'Blower operates normally — no noise', description: 'Confirm the blower operates normally with no unusual noise.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_heating.combustion_residue', label: 'No soot or scorch marks observed', description: 'Inspect for soot or scorch marks around the combustion area.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_COOLING_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_cooling.info',
    label: 'Cooling System Details',
    description: 'Refrigerant type and measured temperature differential.',
    promptFields: [
      { key: 'refrigerant_type', label: 'Refrigerant Type', type: 'select', options: ['R-22', 'R-410A', 'R-32', 'Unknown'] },
      { key: 'temp_diff', label: 'Temperature Differential', type: 'text', placeholder: 'e.g. 18°F (normal 14–22°F)' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_cooling.condenser_unit', label: 'Condenser unit — clean, no damage', description: 'Inspect the condenser unit for cleanliness and physical damage.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_cooling.evap_coil', label: 'Evaporator coil — clean, no frost', description: 'Inspect the evaporator coil for cleanliness and frost buildup.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_cooling.compressor_op', label: 'Compressor operates normally', description: 'Confirm the compressor operates normally.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_cooling.refrigerant_level', label: 'Refrigerant level — normal (no signs of leak)', description: 'Confirm refrigerant level is normal with no signs of a leak.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_cooling.line_insulation', label: 'Refrigerant line insulation — intact', description: 'Inspect refrigerant line insulation for damage.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_cooling.condenser_fan', label: 'Condenser fan operates normally', description: 'Confirm the condenser fan operates normally.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_ELECTRICAL_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_electrical.info',
    label: 'Electrical Readings',
    description: 'Voltage and amperage readings.',
    promptFields: [
      { key: 'voltage', label: 'Voltage Reading', type: 'text', placeholder: 'e.g. 240V' },
      { key: 'amperage', label: 'Amperage Reading', type: 'text', placeholder: 'e.g. 14A' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_electrical.wiring_condition', label: 'Wiring — no loose connections or corrosion', description: 'Inspect wiring for loose connections or corrosion.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_electrical.disconnect_box', label: 'Disconnect box accessible and in good condition', description: 'Confirm the disconnect box is accessible and in good condition.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_electrical.breaker_sizing', label: 'Breaker correctly sized for equipment', description: 'Confirm the breaker is correctly sized for the equipment.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_electrical.safety_switches', label: 'Safety shutoffs functional', description: 'Confirm safety shutoff switches are functional.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_electrical.control_board', label: 'Control board — no error codes or burn marks', description: 'Inspect the control board for error codes or burn marks.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_DUCTWORK_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_ductwork.info',
    label: 'Ductwork Details',
    description: 'Duct material.',
    promptFields: [
      { key: 'duct_material', label: 'Duct Material', type: 'select', options: ['Flex duct', 'Sheet metal', 'Fiberglass board', 'Mixed'] },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_ductwork.duct_condition', label: 'Ducts — no significant leakage or disconnection', description: 'Inspect ducts for significant leakage or disconnection.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_ductwork.duct_insulation', label: 'Duct insulation intact in unconditioned areas', description: 'Confirm duct insulation is intact in unconditioned areas.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_ductwork.airflow_balance', label: 'Supply / return balance acceptable', description: 'Confirm supply/return airflow balance is acceptable.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_ductwork.supply_registers', label: 'Supply registers unobstructed and functional', description: 'Confirm supply registers are unobstructed and functional.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_ductwork.duct_noise', label: 'No unusual duct noise or vibration', description: 'Confirm no unusual duct noise or vibration during operation.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_CONDENSATE_TASKS: SeedTask[] = [
  { key: 'hvac_full_condensate.drain_line', label: 'Condensate drain line — clear, draining properly', description: 'Confirm the condensate drain line is clear and draining properly.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_condensate.condensate_pump', label: 'Condensate pump functional (if present)', description: 'Confirm the condensate pump is functional, if present.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_condensate.drip_pan', label: 'Drip pan — clean, no rust or standing water', description: 'Inspect the drip pan for cleanliness, rust, or standing water.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_condensate.safety_float', label: 'Safety float switch installed and functional', description: 'Confirm the safety float switch is installed and functional.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_SAFETY_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_safety.info',
    label: 'Safety Details',
    description: 'Emergency shutoff location.',
    promptFields: [
      { key: 'emergency_shutoff', label: 'Emergency Shutoff Location', type: 'text', placeholder: 'Describe location' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_safety.co_detector', label: 'CO detector present near equipment', description: 'Confirm a CO detector is present near the equipment.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_safety.high_limit', label: 'High-limit safety controls functional', description: 'Confirm high-limit safety controls are functional.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_safety.clearances', label: 'Equipment clearances adequate', description: 'Confirm equipment clearances are adequate.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_safety.combustion_air', label: 'Combustion air supply adequate (N/A: electric)', description: 'Confirm combustion air supply is adequate; not applicable for electric systems.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_safety.pressure_relief', label: 'Pressure relief devices in place', description: 'Confirm pressure relief devices are in place.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_PERFORMANCE_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_performance.info',
    label: 'Defects & Findings Summary',
    description: 'Summarize all findings from the inspection.',
    promptFields: [
      { key: 'summary_notes', label: 'Defects & Findings Summary', type: 'text', placeholder: 'Summarize all findings...' },
    ],
    catalogLinks: [],
  },
  { key: 'hvac_full_performance.heating_cycle', label: 'Heating cycle completes normally', description: 'Confirm the heating cycle completes normally.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_performance.cooling_cycle', label: 'Cooling cycle completes normally', description: 'Confirm the cooling cycle completes normally.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_performance.noise_level', label: 'System noise — within normal range', description: 'Confirm system noise is within the normal range.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_performance.no_odors', label: 'No unusual odors during operation', description: 'Confirm no unusual odors are present during operation.', promptFields: [], catalogLinks: [] },
  { key: 'hvac_full_performance.system_functional', label: 'System fully functional at time of inspection', description: 'Confirm the system is fully functional at the time of inspection.', promptFields: [], catalogLinks: [] },
];

const HVAC_FULL_PHOTOS_TASKS: SeedTask[] = [
  {
    key: 'hvac_full_photos.info',
    label: 'Photo Documentation',
    description: 'Describe what each photo shows (data plate, filter, heat exchanger, condenser, electrical, ductwork issues).',
    promptFields: [
      { key: 'photo_notes', label: 'Photo Notes', type: 'text', placeholder: 'Describe what each photo shows (data plate, filter, heat exchanger, condenser, electrical, ductwork issues)' },
    ],
    catalogLinks: [],
  },
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
    const group = await this.ensureGroup('GENERAL_HOME_INSPECTION', 'Preventative Home Assessment', 0);

    const hvacVisualSub = await this.ensureSubgroup(group.id, 'HVAC_VISUAL_INSPECTION', 'HVAC', 0);
    const leakSub = await this.ensureSubgroup(group.id, 'LEAK_INSPECTION', 'Leak Inspection', 2);
    const exteriorSub = await this.ensureSubgroup(group.id, 'EXTERIOR_INSPECTION', 'Exterior Visual Inspection', 3);

    const hvacVisualSection = await this.ensureSection(hvacVisualSub.id, 'hvac_visual', 'HVAC Visual Inspection', 0);
    // Leak Inspection: Toilet Inspection, Sinks, Showers/Tub, Kitchen, Laundry, Water Heater
    // (Siding belongs to Exterior Visual Inspection, not here — corrected 2026-07-21 after
    // an earlier, mistaken move; Foundation stays exterior-only too, confirmed with the user)
    const toiletsSection = await this.ensureSection(leakSub.id, 'toilet_leak', 'Toilet Inspection', 0);
    const sinksSection = await this.ensureSection(leakSub.id, 'sink_leak', 'Sinks', 1);
    const showerTubSection = await this.ensureSection(leakSub.id, 'shower_tub_leak', 'Showers/Tub', 2,
      'Recommended photos if an issue is found: shower fixture leak, failed caulking, damaged grout, water damage.');
    const kitchenSection = await this.ensureSection(leakSub.id, 'kitchen_leak', 'Kitchen', 3,
      'Recommended photos if an issue is found: under-sink plumbing, disposal leak, dishwasher connection, cabinet water damage.');
    const laundrySection = await this.ensureSection(leakSub.id, 'washer_pan', 'Laundry', 4,
      'Recommended photos if an issue is found: washer connections, shutoff valves, drain hose.');
    const waterHeaterSection = await this.ensureSection(leakSub.id, 'water_heater_leak', 'Water heater (visual only)', 5,
      'Visual inspection only — do not operate the water heater or its valves. Recommended photos if an issue is found: full water heater, supply connections, drain pan, any signs of corrosion or leaks.');

    // Exterior Visual Inspection: Trim & Fascia, Gutters, Roof, Deck/Porch, Concrete Surfaces, Foundation, Vegetation, Windows & Exterior Doors, Siding
    const trimFasciaSection = await this.ensureSection(exteriorSub.id, 'trim_fascia', 'Trim & Fascia', 0,
      'Recommended photos if an issue is found: rot, loose trim, peeling paint.');
    const guttersSection = await this.ensureSection(exteriorSub.id, 'gutters', 'Gutters', 1,
      'Recommended photos if an issue is found: debris, sagging gutters, downspout discharge.');
    const roofExteriorSection = await this.ensureSection(exteriorSub.id, 'roof_exterior', 'Roof (Ground/Binocular Inspection Only)', 2,
      'Ground/binocular inspection only — do not access the roof. Recommended photos if an issue is found: missing shingles, debris accumulation, flashing issues.');
    const deckPorchSection = await this.ensureSection(exteriorSub.id, 'deck_porch', 'Deck / Porch', 3,
      'Recommended photos if an issue is found: loose railings, rot, damaged stairs.');
    const concreteSection = await this.ensureSection(exteriorSub.id, 'concrete', 'Concrete Surfaces', 4,
      'Recommended photos if an issue is found: trip hazards, settlement, cracked concrete.');
    const foundationSection = await this.ensureSection(exteriorSub.id, 'foundation', 'Foundation', 5,
      'Recommended photos if an issue is found: front foundation, any cracks, drainage concerns.');
    const vegetationSection = await this.ensureSection(exteriorSub.id, 'vegetation', 'Vegetation', 6,
      'Recommended photos if an issue is found: trees over roof, vegetation against siding, drainage issues.');
    const windowsDoorsSection = await this.ensureSection(exteriorSub.id, 'windows_doors', 'Windows & Exterior Doors', 7,
      'Recommended photos if an issue is found: failed caulking, damaged trim, moisture stains.');
    const sidingSection = await this.ensureSection(exteriorSub.id, 'siding', 'Siding', 8,
      'Recommended photos if an issue is found: damaged siding, paint deterioration, moisture damage.');

    await this.ensureTasks(hvacVisualSection.id, HVAC_VISUAL_TASKS);
    await this.ensureTasks(toiletsSection.id, TOILETS_TASKS);
    await this.ensureTasks(sinksSection.id, SINKS_TASKS);
    await this.ensureTasks(showerTubSection.id, SHOWER_TUB_TASKS);
    await this.ensureTasks(kitchenSection.id, KITCHEN_TASKS);
    await this.ensureTasks(laundrySection.id, LAUNDRY_TASKS);
    await this.ensureTasks(waterHeaterSection.id, WATER_HEATER_TASKS);
    await this.ensureTasks(foundationSection.id, FOUNDATION_TASKS);
    await this.ensureTasks(sidingSection.id, SIDING_TASKS);
    await this.ensureTasks(trimFasciaSection.id, TRIM_FASCIA_TASKS);
    await this.ensureTasks(roofExteriorSection.id, ROOF_EXTERIOR_TASKS);
    await this.ensureTasks(guttersSection.id, GUTTERS_TASKS);
    await this.ensureTasks(windowsDoorsSection.id, WINDOWS_DOORS_TASKS);
    await this.ensureTasks(deckPorchSection.id, DECK_PORCH_TASKS);
    await this.ensureTasks(concreteSection.id, CONCRETE_TASKS);
    await this.ensureTasks(vegetationSection.id, VEGETATION_TASKS);

    // HVAC Full Inspection — replaces the old hardcoded HVAC_SECTIONS form in
    // active-job.tsx. Flat structure (one subgroup) matching the old form's
    // flat 11-tab layout, no invented sub-grouping.
    const hvacFullGroup = await this.ensureGroup('HVAC_FULL_INSPECTION', 'HVAC Full Inspection', 1);
    const hvacFullSub = await this.ensureSubgroup(hvacFullGroup.id, 'HVAC_FULL_CHECKLIST', 'HVAC Full Inspection', 0);

    const hvacSystemIdSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_system_id', 'System Identification', 0);
    const hvacThermostatSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_thermostat', 'Thermostat & Controls', 1);
    const hvacAirFilterSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_air_filter', 'Air Filter & Airflow', 2);
    const hvacHeatingSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_heating', 'Heating System', 3);
    const hvacCoolingSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_cooling', 'Cooling System', 4);
    const hvacElectricalSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_electrical', 'Electrical System', 5);
    const hvacDuctworkSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_ductwork', 'Air Distribution & Ductwork', 6);
    const hvacCondensateSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_condensate', 'Condensate Management', 7);
    const hvacSafetySection = await this.ensureSection(hvacFullSub.id, 'hvac_full_safety', 'Safety & Compliance', 8);
    const hvacPerformanceSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_performance', 'Operational Performance', 9);
    const hvacPhotosSection = await this.ensureSection(hvacFullSub.id, 'hvac_full_photos', 'Photo Documentation', 10);

    await this.ensureTasks(hvacSystemIdSection.id, HVAC_FULL_SYSTEM_ID_TASKS);
    await this.ensureTasks(hvacThermostatSection.id, HVAC_FULL_THERMOSTAT_TASKS);
    await this.ensureTasks(hvacAirFilterSection.id, HVAC_FULL_AIR_FILTER_TASKS);
    await this.ensureTasks(hvacHeatingSection.id, HVAC_FULL_HEATING_TASKS);
    await this.ensureTasks(hvacCoolingSection.id, HVAC_FULL_COOLING_TASKS);
    await this.ensureTasks(hvacElectricalSection.id, HVAC_FULL_ELECTRICAL_TASKS);
    await this.ensureTasks(hvacDuctworkSection.id, HVAC_FULL_DUCTWORK_TASKS);
    await this.ensureTasks(hvacCondensateSection.id, HVAC_FULL_CONDENSATE_TASKS);
    await this.ensureTasks(hvacSafetySection.id, HVAC_FULL_SAFETY_TASKS);
    await this.ensureTasks(hvacPerformanceSection.id, HVAC_FULL_PERFORMANCE_TASKS);
    await this.ensureTasks(hvacPhotosSection.id, HVAC_FULL_PHOTOS_TASKS);

    // Comprehensive Inspection — no content specified yet; seeded as an empty,
    // ready-to-build skeleton. Admin populates it via the Configurator's
    // existing "+ New Checklist" / "+ Add Task" UI, same as any other group.
    // Label matches the real bookable catalog item's name ("Comprehensive Home
    // Inspection", pre-existing since 2026-07-18) — the group KEY is what
    // resolution logic actually keys off, this is purely for admin-UI clarity.
    const comprehensiveGroup = await this.ensureGroup('COMPREHENSIVE_INSPECTION', 'Comprehensive Home Inspection', 2);
    await this.ensureSubgroup(comprehensiveGroup.id, 'COMPREHENSIVE_INSPECTION_MAIN', 'Comprehensive Home Inspection', 0);
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
