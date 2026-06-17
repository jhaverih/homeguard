import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionNote } from './entities/inspection.entity';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
  ) {}

  async addNote(
    serviceRequestId: string,
    vendorId: string,
    dto: { title: string; content: string; photoUrls?: string[] },
  ): Promise<InspectionNote> {
    const note = this.notesRepo.create({
      serviceRequestId,
      vendorId,
      title: dto.title,
      content: dto.content,
      photoUrls: dto.photoUrls || [],
    });
    return this.notesRepo.save(note);
  }

  async getNotes(serviceRequestId: string): Promise<InspectionNote[]> {
    return this.notesRepo.find({
      where: { serviceRequestId },
      order: { createdAt: 'ASC' },
    });
  }

  async getHistory(customerId: string): Promise<InspectionNote[]> {
    return this.notesRepo
      .createQueryBuilder('note')
      .innerJoin('note.serviceRequest', 'sr', 'sr.customerId = :customerId', { customerId })
      .orderBy('note.createdAt', 'DESC')
      .getMany();
  }
}
