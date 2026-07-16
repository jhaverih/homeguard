import {
  Injectable, ForbiddenException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionNote } from './entities/inspection.entity';
import { InspectionTaskResult } from './entities/inspection-task-result.entity';
import { UploadsService } from '../uploads/uploads.service';
import { NoteType, TaskStatus, ServiceRequestStatus } from '../common/enums/role.enum';
import { ServiceRequest, ServiceType } from '../service-requests/entities/service-request.entity';
import {
  INSPECTION_CHECKLIST, ALL_TASK_KEYS, TASK_TOTAL, getTaskDef, getSectionKey,
} from './checklists';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
    @InjectRepository(InspectionTaskResult)
    private taskResultsRepo: Repository<InspectionTaskResult>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
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

  getChecklist() {
    return INSPECTION_CHECKLIST;
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
    const taskDef = getTaskDef(taskKey);
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
      return this.taskResultsRepo.save(existing);
    }

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
    return this.taskResultsRepo.save(result);
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

    const sections = INSPECTION_CHECKLIST.map((section) => ({
      key: section.key,
      label: section.label,
      total: section.tasks.length,
      completed: section.tasks.filter((t) => doneKeys.has(t.key)).length,
    }));

    return {
      total: TASK_TOTAL,
      completed: doneKeys.size,
      sections,
    };
  }

  async isChecklistComplete(serviceRequestId: string): Promise<boolean> {
    const count = await this.taskResultsRepo.count({ where: { serviceRequestId } });
    // If no tasks at all, allow completion (legacy job)
    if (count === 0) return true;
    return count >= TASK_TOTAL;
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

    return results.map((r) => ({
      taskKey: r.taskKey,
      label: getTaskDef(r.taskKey)?.label ?? r.taskKey,
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
    const counts = { OK: 0, NEEDS_ATTENTION: 0, URGENT: 0, NOT_ACCESSIBLE: 0 };
    const flaggedLines: string[] = [];
    for (const r of results) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status === TaskStatus.NEEDS_ATTENTION || r.status === TaskStatus.URGENT) {
        const label = getTaskDef(r.taskKey)?.label ?? r.taskKey;
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
