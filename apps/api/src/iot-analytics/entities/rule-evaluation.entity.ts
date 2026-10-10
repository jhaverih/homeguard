import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

export enum RuleEvaluationOutcome {
  // Inputs were valid and the rule's condition is not met.
  CLEAR = 'CLEAR',
  TRIGGERED = 'TRIGGERED',
  // A required input is missing, stale, invalid, offline or unmapped.
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  // Inputs are fine but there isn't enough history to compare against yet.
  BASELINE_COLLECTING = 'BASELINE_COLLECTING',
}

// The LATEST evaluation of one rule for one scope (a zone's thermostat, or
// an equipment) — upserted on every evaluation, not appended, so it stays
// small. Findings already keep the history of everything that triggered;
// this is what lets health tell "evaluated and fine" apart from "never
// evaluated" or "couldn't evaluate", so a tile is never Healthy just
// because no alert exists.
@Entity('analytics_rule_evaluations')
@Index(['scopeKey', 'ruleId'], { unique: true })
export class RuleEvaluation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @Column() homeId: string;
  @Index() @Column({ nullable: true }) equipmentId: string | null;
  // "device:<deviceRegistryId>" or "equipment:<equipmentId>".
  @Column() scopeKey: string;
  @Column() ruleId: string;
  @Column({ type: 'int', default: 1 }) ruleVersion: number;
  @Column({ type: 'enum', enum: RuleEvaluationOutcome }) outcome: RuleEvaluationOutcome;
  // Human-readable "why" for INSUFFICIENT_DATA / BASELINE_COLLECTING.
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'jsonb', nullable: true }) inputs: Record<string, any> | null;
  @Column({ type: 'timestamp' }) evaluatedAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
