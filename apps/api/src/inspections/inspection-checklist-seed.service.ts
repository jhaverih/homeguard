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

const LAUNDRY_TASKS: SeedTask[] = [
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
];

const BULB_REPLACEMENT_TASKS: SeedTask[] = [
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
    const otherSub = await this.ensureSubgroup(group.id, 'OTHER', 'Other', 3);

    const hvacVisualSection = await this.ensureSection(hvacVisualSub.id, 'hvac_visual', 'HVAC Visual Inspection', 0);
    const ahuFiltersSection = await this.ensureSection(ahuFiltersSub.id, 'hvac_filter', 'AHU Filters', 0);
    const toiletsSection = await this.ensureSection(leakSub.id, 'toilet_leak', 'Toilets', 0);
    const sinksSection = await this.ensureSection(leakSub.id, 'sink_leak', 'Sinks', 1);
    await this.ensureSection(leakSub.id, 'shower_tub_leak', 'Showers/Tub', 2); // new, starts empty
    await this.ensureSection(leakSub.id, 'kitchen_leak', 'Kitchen', 3); // new, starts empty
    const laundrySection = await this.ensureSection(leakSub.id, 'washer_pan', 'Laundry', 4);
    await this.ensureSection(leakSub.id, 'water_heater_leak', 'Water heater (visual only)', 5); // new, starts empty
    const bulbSection = await this.ensureSection(otherSub.id, 'bulb_replacement', 'Bulb Replacement', 0);

    await this.ensureTasks(hvacVisualSection.id, HVAC_VISUAL_TASKS);
    await this.ensureTasks(ahuFiltersSection.id, AHU_FILTERS_TASKS);
    await this.ensureTasks(toiletsSection.id, TOILETS_TASKS);
    await this.ensureTasks(sinksSection.id, SINKS_TASKS);
    await this.ensureTasks(laundrySection.id, LAUNDRY_TASKS);
    await this.ensureTasks(bulbSection.id, BULB_REPLACEMENT_TASKS);
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

  private async ensureSection(subgroupId: string, key: string, label: string, sortOrder: number) {
    let s = await this.sectionsRepo.findOne({ where: { key } });
    if (!s) {
      s = await this.sectionsRepo.save(this.sectionsRepo.create({ subgroupId, key, label, sortOrder }));
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
