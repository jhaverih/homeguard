import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum AiRecommendationStatus {
  SUGGESTED = 'SUGGESTED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

@Entity('ai_recommendations')
export class AiRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column()
  sessionId: string;

  // The assistant ChatMessage whose reply text named this catalog item.
  @Column()
  messageId: string;

  @Column()
  servicePriceId: string;

  @Column({ type: 'enum', enum: AiRecommendationStatus, default: AiRecommendationStatus.SUGGESTED })
  status: AiRecommendationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt: Date | null;
}
