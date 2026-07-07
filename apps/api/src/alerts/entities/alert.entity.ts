import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum AlertStatus {
  NEW = 'NEW',
  READ = 'READ',
  RESOLVED = 'RESOLVED',
}

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @Column({ nullable: true }) yolinkHomeId: string;
  @Column({ nullable: true }) deviceId: string;
  @Column({ nullable: true }) deviceName: string;
  @Column({ nullable: true }) deviceType: string;
  @Column({ nullable: true }) event: string;
  @Column({ default: AlertSeverity.MEDIUM }) severity: AlertSeverity;
  @Column() message: string;
  @Column({ type: 'jsonb', nullable: true }) rawPayload: any;
  @Column({ default: AlertStatus.NEW }) status: AlertStatus;
  @Column({ nullable: true }) emergencyDispatchRequestedAt: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
