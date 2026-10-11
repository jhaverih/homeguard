import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// One explanation attempt for one version of an event's evidence. OK =
// LLM output that passed validation; FALLBACK = deterministic text used
// because the LLM was off/unavailable/rejected (reasons kept for review).
@Entity('analytics_explanations')
@Index(['eventId', 'evidenceHash'])
export class AnalyticsExplanation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() eventId: string;
  @Column() evidenceHash: string;
  // OK | FALLBACK
  @Column() status: string;
  @Column({ type: 'jsonb' }) output: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) rejectionReasons: string[] | null;
  @Column({ type: 'jsonb' }) evidence: Record<string, any>;
  @Column({ type: 'varchar', nullable: true }) model: string | null;
  @Column() promptVersion: string;
  @Column() detectorVersion: string;
  @Column() configVersion: string;
  @Column({ type: 'int', nullable: true }) latencyMs: number | null;
  @CreateDateColumn() createdAt: Date;
}
