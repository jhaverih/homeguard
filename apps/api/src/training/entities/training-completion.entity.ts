import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

// One row per vendor user per training module version they finished — the
// record of completion (who, which module and version, when, and the name
// they confirmed with), modelled on the terms acceptance stamp. A new module
// version needs a new row, so an older completion shows as "update needed".
@Entity('training_completions')
@Unique(['userId', 'moduleKey', 'moduleVersion'])
export class TrainingCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  companyId: string | null;

  @Column()
  moduleKey: string;

  @Column()
  moduleVersion: number;

  // How many questions they got right on the first try, and how many
  // answer attempts they made in total (wrong answers are retried).
  @Column({ default: 0 })
  answersCorrectFirstTry: number;

  @Column({ default: 0 })
  attempts: number;

  // The name they typed on "I completed this training and will follow it."
  @Column()
  confirmedName: string;

  @CreateDateColumn()
  completedAt: Date;
}
