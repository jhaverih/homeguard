import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionChecklistGroup } from './entities/inspection-checklist-group.entity';
import { InspectionChecklistSubgroup } from './entities/inspection-checklist-subgroup.entity';
import { InspectionChecklistSection } from './entities/inspection-checklist-section.entity';
import { InspectionChecklistTask } from './entities/inspection-checklist-task.entity';

// Admin CRUD for the Inspection Configurator page. v1 scope: label,
// description, isActive, sortOrder, and whole task/section create-remove.
// promptFields/dynamicGroups/catalogLinks are intentionally not editable
// here — they stay exactly as seeded (see InspectionChecklistSeedService).
@Injectable()
export class InspectionConfigService {
  constructor(
    @InjectRepository(InspectionChecklistGroup) private groupsRepo: Repository<InspectionChecklistGroup>,
    @InjectRepository(InspectionChecklistSubgroup) private subgroupsRepo: Repository<InspectionChecklistSubgroup>,
    @InjectRepository(InspectionChecklistSection) private sectionsRepo: Repository<InspectionChecklistSection>,
    @InjectRepository(InspectionChecklistTask) private tasksRepo: Repository<InspectionChecklistTask>,
  ) {}

  async getTree(): Promise<InspectionChecklistGroup[]> {
    const groups = await this.groupsRepo.find({
      relations: ['subgroups', 'subgroups.sections', 'subgroups.sections.tasks'],
    });
    // TypeORM's find() with nested relations doesn't guarantee child array
    // order, so sort each level by sortOrder explicitly.
    groups.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const g of groups) {
      g.subgroups = (g.subgroups || []).sort((a, b) => a.sortOrder - b.sortOrder);
      for (const sg of g.subgroups) {
        sg.sections = (sg.sections || []).sort((a, b) => a.sortOrder - b.sortOrder);
        for (const sec of sg.sections) {
          sec.tasks = (sec.tasks || []).sort((a, b) => a.sortOrder - b.sortOrder);
        }
      }
    }
    return groups;
  }

  async updateSection(id: string, data: Partial<Pick<InspectionChecklistSection, 'label' | 'description' | 'isActive' | 'sortOrder'>>) {
    await this.sectionsRepo.update(id, data);
    return this.sectionsRepo.findOneOrFail({ where: { id } });
  }

  async updateTask(id: string, data: Partial<Pick<InspectionChecklistTask, 'label' | 'description' | 'isActive' | 'sortOrder'>>) {
    await this.tasksRepo.update(id, data);
    return this.tasksRepo.findOneOrFail({ where: { id } });
  }

  async createSection(subgroupId: string, label: string) {
    const count = await this.sectionsRepo.count({ where: { subgroupId } });
    const key = this.uniqueKey(label);
    return this.sectionsRepo.save(this.sectionsRepo.create({
      subgroupId, key, label, description: null, sortOrder: count, isActive: true,
    }));
  }

  // FK is `onDelete: 'CASCADE'` at the database level, so this removes the
  // section's tasks too — no need to delete them explicitly first.
  async removeSection(id: string): Promise<void> {
    await this.sectionsRepo.delete(id);
  }

  async createTask(sectionId: string, label: string) {
    const section = await this.sectionsRepo.findOneOrFail({ where: { id: sectionId } });
    const count = await this.tasksRepo.count({ where: { sectionId } });
    const key = `${section.key}.${this.uniqueKey(label)}`;
    return this.tasksRepo.save(this.tasksRepo.create({
      sectionId, key, label, description: null, promptFields: [], dynamicGroups: null, catalogLinks: [], sortOrder: count, isActive: true,
    }));
  }

  async removeTask(id: string): Promise<void> {
    await this.tasksRepo.delete(id);
  }

  // Task/section `key` isn't shown to admins — it's an internal identifier
  // (task keys are still namespaced `${sectionKey}.${suffix}`, relied on by
  // getSectionKey() in inspections.service.ts) — a slug plus a short
  // timestamp suffix is simplest way to guarantee the unique constraint
  // without surfacing UUIDs as the "key".
  private uniqueKey(label: string): string {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
    return `${slug}_${Date.now().toString(36)}`;
  }
}
