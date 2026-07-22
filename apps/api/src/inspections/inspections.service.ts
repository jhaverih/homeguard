import {
  Injectable, ForbiddenException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { InspectionNote } from './entities/inspection.entity';
import { InspectionTaskResult } from './entities/inspection-task-result.entity';
import { InspectionChecklistSection } from './entities/inspection-checklist-section.entity';
import { InspectionChecklistTask } from './entities/inspection-checklist-task.entity';
import { PropertyAcProfile } from './entities/property-ac-profile.entity';
import { UploadsService } from '../uploads/uploads.service';
import { NoteType, TaskStatus, ServiceRequestStatus } from '../common/enums/role.enum';
import { ServiceRequest, ServiceType } from '../service-requests/entities/service-request.entity';
import { getSectionKey, ChecklistSection } from './checklists';

// The one task this pass's carry-forward mechanism applies to — see
// PropertyAcProfile. Not generalized to other dynamicGroups-based tasks yet.
const AC_UNIT_TASK_KEY = 'hvac_visual.units_overview';

// Reads the unit_{n}_.../unit_{n}_filter_{m}_... prefixed keys the vendor
// app's dynamic-group renderer writes (active-job.tsx) into the normalized
// PropertyAcProfile shape. There's no stable identity in the source data, so
// this always assigns fresh ids — the profile is a wholesale snapshot of
// "what was true on the visit that last saved this task."
function extractAcUnitsFromStructuredData(sd: Record<string, any>): PropertyAcProfile['acUnits'] {
  const unitCount = Math.min(parseInt(sd?.num_units, 10) || 0, 10);
  const units: PropertyAcProfile['acUnits'] = [];
  for (let n = 1; n <= unitCount; n++) {
    const uPrefix = `unit_${n}`;
    const filterCount = Math.min(parseInt(sd?.[`${uPrefix}_num_filters`], 10) || 0, 20);
    const filters: PropertyAcProfile['acUnits'][number]['filters'] = [];
    for (let m = 1; m <= filterCount; m++) {
      const fPrefix = `${uPrefix}_filter_${m}`;
      filters.push({
        id: randomUUID(),
        filterLocation: sd?.[`${fPrefix}_filter_location`] ?? '',
        size: sd?.[`${fPrefix}_size`] ?? '',
        dirtLevel: sd?.[`${fPrefix}_dirt_level`] ?? '',
        merv: sd?.[`${fPrefix}_merv`] ?? '',
        airflowCorrect: !!sd?.[`${fPrefix}_airflow_correct`],
        nextReplacementDays: sd?.[`${fPrefix}_next_replacement_days`] ?? '',
      });
    }
    units.push({
      id: randomUUID(),
      location: sd?.[`${uPrefix}_location`] ?? '',
      makeModel: sd?.[`${uPrefix}_make_model`] ?? '',
      serial: sd?.[`${uPrefix}_serial`] ?? '',
      installDate: sd?.[`${uPrefix}_install_date`] ?? '',
      filters,
    });
  }
  return units;
}

// Reverse of extractAcUnitsFromStructuredData() — used to pre-fill a new
// inspection's taskStructured with the customer's last-known units/filters.
function flattenAcUnitsToStructuredData(acUnits: PropertyAcProfile['acUnits']): Record<string, any> {
  const sd: Record<string, any> = { num_units: acUnits.length };
  acUnits.forEach((unit, i) => {
    const uPrefix = `unit_${i + 1}`;
    sd[`${uPrefix}_location`] = unit.location;
    sd[`${uPrefix}_make_model`] = unit.makeModel;
    sd[`${uPrefix}_serial`] = unit.serial;
    sd[`${uPrefix}_install_date`] = unit.installDate;
    sd[`${uPrefix}_num_filters`] = unit.filters.length;
    unit.filters.forEach((filter, j) => {
      const fPrefix = `${uPrefix}_filter_${j + 1}`;
      sd[`${fPrefix}_filter_location`] = filter.filterLocation;
      sd[`${fPrefix}_size`] = filter.size;
      sd[`${fPrefix}_dirt_level`] = filter.dirtLevel;
      sd[`${fPrefix}_merv`] = filter.merv;
      sd[`${fPrefix}_airflow_correct`] = filter.airflowCorrect;
      sd[`${fPrefix}_next_replacement_days`] = filter.nextReplacementDays;
    });
  });
  return sd;
}

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
    @InjectRepository(InspectionTaskResult)
    private taskResultsRepo: Repository<InspectionTaskResult>,
    @InjectRepository(InspectionChecklistSection)
    private checklistSectionsRepo: Repository<InspectionChecklistSection>,
    @InjectRepository(InspectionChecklistTask)
    private checklistTasksRepo: Repository<InspectionChecklistTask>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(PropertyAcProfile)
    private propertyAcProfileRepo: Repository<PropertyAcProfile>,
    private uploadsService: UploadsService,
  ) {}

  // ── Legacy notes ─────────────────────────────────────────────────────────

  async addNote(
    serviceRequestId: string,
    vendorId: string,
    dto: { title: string; content: string; type?: NoteType; photoUrls?: string[] },
  ): Promise<InspectionNote> {
    const note = this.notesRepo.create({
      serviceRequestId,
      vendorId,
      type: dto.type ?? NoteType.OBSERVATION,
      title: dto.title,
      content: dto.content,
      photoUrls: dto.photoUrls || [],
    });
    return this.notesRepo.save(note);
  }

  async getNotes(serviceRequestId: string): Promise<any[]> {
    const notes = await this.notesRepo.find({
      where: { serviceRequestId },
      order: { createdAt: 'ASC' },
    });
    return this.resolveNotePhotos(notes);
  }

  async getHistory(customerId: string): Promise<any[]> {
    const notes = await this.notesRepo
      .createQueryBuilder('note')
      .innerJoin('note.serviceRequest', 'sr', 'sr.customerId = :customerId', { customerId })
      .orderBy('note.createdAt', 'DESC')
      .getMany();
    return this.resolveNotePhotos(notes);
  }

  // ── Task results ──────────────────────────────────────────────────────────

  // General Inspection Checklist — admin-configurable via the Inspection
  // Configurator (Group -> Subgroup -> Section -> Task). Shape returned here
  // matches the old hardcoded INSPECTION_CHECKLIST exactly (ChecklistSection[])
  // so the vendor app needs no changes. GUTTER_CHECKLIST/HVAC_SECTIONS in
  // ./checklists.ts are separate, unrelated checklists and stay hardcoded.
  private async loadChecklist(): Promise<ChecklistSection[]> {
    const sections = await this.checklistSectionsRepo.find({
      where: { isActive: true },
      relations: ['tasks', 'subgroup'],
    });
    return sections
      // Subgroup order first, then section order within it — sections
      // sharing a subgroup must be contiguous so the client can group by
      // "subgroupKey changed since the last item" on a flat array.
      .sort((a, b) => (a.subgroup?.sortOrder ?? 0) - (b.subgroup?.sortOrder ?? 0) || a.sortOrder - b.sortOrder)
      .map((section) => ({
        key: section.key,
        label: section.label,
        subgroupKey: section.subgroup?.key,
        subgroupLabel: section.subgroup?.label,
        tasks: (section.tasks || [])
          .filter((t) => t.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((t) => ({
            key: t.key,
            label: t.label,
            description: t.description ?? '',
            promptFields: t.promptFields,
            dynamicGroups: t.dynamicGroups ?? undefined,
            catalogLinks: t.catalogLinks ?? [],
          })),
      }));
  }

  async getChecklist(): Promise<ChecklistSection[]> {
    return this.loadChecklist();
  }

  async upsertTaskResult(
    serviceRequestId: string,
    vendorId: string,
    taskKey: string,
    dto: {
      status: TaskStatus;
      findings?: string;
      recommendation?: string;
      structuredData?: Record<string, any>;
      photoKeys?: string[];
      linkedAdditionalServiceId?: string;
    },
  ): Promise<InspectionTaskResult> {
    const taskDef = await this.checklistTasksRepo.findOne({ where: { key: taskKey } });
    const isSpecialKey = taskKey === 'hvac_report' || taskKey.startsWith('gutter_');
    if (!taskDef && !isSpecialKey) throw new NotFoundException(`Unknown task key: ${taskKey}`);

    if (taskDef && dto.status !== TaskStatus.OK && (!dto.photoKeys || dto.photoKeys.length === 0)) {
      throw new BadRequestException(
        'At least one photo is required when status is Needs Attention, Urgent, or Not Accessible.',
      );
    }

    const sectionKey = getSectionKey(taskKey);
    const existing = await this.taskResultsRepo.findOne({
      where: { serviceRequestId, taskKey },
    });

    let saved: InspectionTaskResult;
    if (existing) {
      existing.vendorId = vendorId;
      existing.sectionKey = sectionKey;
      existing.status = dto.status;
      existing.findings = dto.findings ?? existing.findings;
      existing.recommendation = dto.recommendation ?? existing.recommendation;
      existing.structuredData = dto.structuredData ?? existing.structuredData;
      existing.photoKeys = dto.photoKeys ?? existing.photoKeys;
      if (dto.linkedAdditionalServiceId !== undefined) {
        existing.linkedAdditionalServiceId = dto.linkedAdditionalServiceId;
      }
      saved = await this.taskResultsRepo.save(existing);
    } else {
      const result = this.taskResultsRepo.create({
        serviceRequestId,
        vendorId,
        sectionKey,
        taskKey,
        status: dto.status,
        findings: dto.findings,
        recommendation: dto.recommendation,
        structuredData: dto.structuredData,
        photoKeys: dto.photoKeys || [],
        linkedAdditionalServiceId: dto.linkedAdditionalServiceId,
      });
      saved = await this.taskResultsRepo.save(result);
    }

    if (taskKey === AC_UNIT_TASK_KEY && saved.structuredData) {
      await this.syncPropertyAcProfile(serviceRequestId, saved.structuredData);
    }

    return saved;
  }

  private async syncPropertyAcProfile(serviceRequestId: string, structuredData: Record<string, any>) {
    const request = await this.requestsRepo.findOne({ where: { id: serviceRequestId } });
    if (!request) return;

    let profile = await this.propertyAcProfileRepo.findOne({ where: { customerId: request.customerId } });
    if (!profile) profile = this.propertyAcProfileRepo.create({ customerId: request.customerId });
    profile.acUnits = extractAcUnitsFromStructuredData(structuredData);
    await this.propertyAcProfileRepo.save(profile);
  }

  // Pre-fill source for a new inspection's AC Unit task — flattened back
  // into the same prefixed-key shape the vendor app's dynamic-group
  // renderer already reads/writes, so no client-side format needs to
  // change. Takes requestId (not customerId directly) to match every other
  // request-scoped endpoint here — the mobile app already has the
  // serviceRequestId open, not the customer's id.
  async getPropertyAcProfilePrefill(serviceRequestId: string): Promise<Record<string, any> | null> {
    const request = await this.requestsRepo.findOne({ where: { id: serviceRequestId } });
    if (!request) return null;
    const profile = await this.propertyAcProfileRepo.findOne({ where: { customerId: request.customerId } });
    if (!profile || profile.acUnits.length === 0) return null;
    return flattenAcUnitsToStructuredData(profile.acUnits);
  }

  async getTaskResults(serviceRequestId: string): Promise<any[]> {
    const results = await this.taskResultsRepo.find({
      where: { serviceRequestId },
      order: { createdAt: 'ASC' },
    });
    return this.resolveTaskPhotos(results);
  }

  async getProgress(serviceRequestId: string): Promise<{
    total: number;
    completed: number;
    sections: { key: string; label: string; total: number; completed: number }[];
  }> {
    const results = await this.taskResultsRepo.find({ where: { serviceRequestId } });
    const doneKeys = new Set(results.map((r) => r.taskKey));
    const checklist = await this.loadChecklist();

    const sections = checklist.map((section) => ({
      key: section.key,
      label: section.label,
      total: section.tasks.length,
      completed: section.tasks.filter((t) => doneKeys.has(t.key)).length,
    }));

    return {
      total: checklist.reduce((sum, s) => sum + s.tasks.length, 0),
      completed: doneKeys.size,
      sections,
    };
  }

  async isChecklistComplete(serviceRequestId: string): Promise<boolean> {
    const count = await this.taskResultsRepo.count({ where: { serviceRequestId } });
    // If no tasks at all, allow completion (legacy job)
    if (count === 0) return true;
    const taskTotal = await this.checklistTasksRepo.count({ where: { isActive: true } });
    return count >= taskTotal;
  }

  async getTaskHistoryForCustomer(customerId: string): Promise<any[]> {
    const results = await this.taskResultsRepo
      .createQueryBuilder('r')
      // service_requests.id is uuid, inspection_task_results.serviceRequestId
      // is varchar — Postgres has no implicit uuid = varchar operator, so the
      // uuid side must be cast explicitly or every call errors.
      .innerJoin('service_requests', 'sr', 'sr.id::text = r.serviceRequestId AND sr.customerId = :customerId', { customerId })
      .orderBy('r.updatedAt', 'DESC')
      .getMany();
    return this.resolveTaskPhotos(results);
  }

  // Findings flagged NEEDS_ATTENTION/URGENT during an inspection, still
  // "open" because nothing in the schema marks a maintenance issue as
  // resolved — the closest available signal is whether the vendor-proposed
  // AdditionalService that would address it was ever approved.
  async getOpenIssuesForCustomer(customerId: string): Promise<{ taskKey: string; label: string; status: TaskStatus; findings: string | null; recommendation: string | null }[]> {
    const results = await this.taskResultsRepo
      .createQueryBuilder('r')
      .innerJoin('service_requests', 'sr', 'sr.id::text = r.serviceRequestId AND sr.customerId = :customerId', { customerId })
      .leftJoin('additional_services', 'a', 'a.id::text = r.linkedAdditionalServiceId')
      .where('r.status IN (:...statuses)', { statuses: [TaskStatus.NEEDS_ATTENTION, TaskStatus.URGENT] })
      .andWhere('(r.linkedAdditionalServiceId IS NULL OR a.approved IS NOT TRUE)')
      .orderBy('r.updatedAt', 'DESC')
      .getMany();

    const labelByTaskKey = await this.getTaskLabelsByKey(results.map((r) => r.taskKey));
    return results.map((r) => ({
      taskKey: r.taskKey,
      label: labelByTaskKey.get(r.taskKey) ?? r.taskKey,
      status: r.status,
      findings: r.findings ?? null,
      recommendation: r.recommendation ?? null,
    }));
  }

  // Most recent completed inspection, summarized for the AI assistant's
  // "explain my last inspection report" flow — deterministic facts computed
  // here, natural-language phrasing left to the model.
  async getLastInspectionSummary(customerId: string): Promise<
    | { found: false }
    | { found: true; serviceRequestId: string; completedAt: Date; summary: string }
  > {
    const request = await this.requestsRepo.findOne({
      where: { customerId, type: ServiceType.SCHEDULED_INSPECTION, status: ServiceRequestStatus.COMPLETED },
      order: { completedAt: 'DESC' },
    });
    if (!request) return { found: false };

    const results = await this.taskResultsRepo.find({ where: { serviceRequestId: request.id } });
    const labelByTaskKey = await this.getTaskLabelsByKey(results.map((r) => r.taskKey));
    const counts = { OK: 0, NEEDS_ATTENTION: 0, URGENT: 0, NOT_ACCESSIBLE: 0 };
    const flaggedLines: string[] = [];
    for (const r of results) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status === TaskStatus.NEEDS_ATTENTION || r.status === TaskStatus.URGENT) {
        const label = labelByTaskKey.get(r.taskKey) ?? r.taskKey;
        flaggedLines.push(`${label} (${r.status}): ${r.findings ?? 'no details recorded'}`);
      }
    }

    const summaryLines = [
      `Inspection completed ${request.completedAt ? new Date(request.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'recently'} at ${request.address}.`,
      `${results.length} items checked: ${counts.OK} OK, ${counts.NEEDS_ATTENTION} needing attention, ${counts.URGENT} urgent, ${counts.NOT_ACCESSIBLE} not accessible.`,
    ];
    if (flaggedLines.length > 0) {
      summaryLines.push('Flagged items:', ...flaggedLines.map((l) => `- ${l}`));
    }
    if (request.vendorNotes) summaryLines.push(`Vendor notes: ${request.vendorNotes}`);

    return {
      found: true,
      serviceRequestId: request.id,
      completedAt: request.completedAt,
      summary: summaryLines.join('\n'),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getTaskLabelsByKey(taskKeys: string[]): Promise<Map<string, string>> {
    const uniqueKeys = [...new Set(taskKeys)];
    if (uniqueKeys.length === 0) return new Map();
    const tasks = await this.checklistTasksRepo.find({ where: { key: In(uniqueKeys) } });
    return new Map(tasks.map((t) => [t.key, t.label]));
  }

  private async resolveNotePhotos(notes: InspectionNote[]): Promise<any[]> {
    return Promise.all(
      notes.map(async (note) => {
        const photoUrls = await Promise.all(
          (note.photoUrls || []).map((key) => this.uploadsService.getSignedUrl(key).catch(() => null)),
        );
        return { ...note, photoUrls: photoUrls.filter(Boolean) };
      }),
    );
  }

  private async resolveTaskPhotos(results: InspectionTaskResult[]): Promise<any[]> {
    return Promise.all(
      results.map(async (r) => {
        const photoUrls = await Promise.all(
          (r.photoKeys || []).map((key) => this.uploadsService.getSignedUrl(key).catch(() => null)),
        );
        return { ...r, photoUrls: photoUrls.filter(Boolean) };
      }),
    );
  }
}
