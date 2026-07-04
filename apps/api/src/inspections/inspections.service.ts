import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionNote } from './entities/inspection.entity';
import { UploadsService } from '../uploads/uploads.service';
import { NoteType } from '../common/enums/role.enum';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
    private uploadsService: UploadsService,
  ) {}

  async addNote(
    serviceRequestId: string,
    vendorId: string,
    dto: { title: string; content: string; type?: NoteType; photoUrls?: string[] },
  ): Promise<InspectionNote> {
    const photoKeys = dto.photoUrls || [];
    if (photoKeys.length === 0) {
      throw new BadRequestException('At least one photo is required for every inspection note');
    }

    const note = this.notesRepo.create({
      serviceRequestId,
      vendorId,
      type: dto.type ?? NoteType.OBSERVATION,
      title: dto.title,
      content: dto.content,
      photoUrls: photoKeys,
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
}
