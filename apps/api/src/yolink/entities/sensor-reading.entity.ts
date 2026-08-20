import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// One row per analytics-relevant sensor report — the time-series history
// nothing in the Yolink integration captured before this (YolinkDevice only
// ever kept the LATEST lastState/lastReportedAt, overwritten on every
// report). Only written for devices that are analytics-tagged (see
// HvacAnalyticsService.recordReading) to keep this table's growth bounded to
// what the analytics/baseline engine actually needs — not every raw MQTT
// message for every device.
@Entity('sensor_readings')
@Index(['yolinkDeviceId', 'recordedAt'])
export class SensorReading {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() yolinkDeviceId: string;
  // Denormalized off YolinkDevice at write time so a chart/baseline query
  // never needs a join — cheap since these never change after tagging.
  @Column() analyticsRole: string;
  // The single primary numeric reading for this role (°F for temp roles,
  // battery 0-4 for a leak sensor's periodic check-in, etc.) — nullable
  // since a water-leak "reading" is a state change, not a number.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) value: number | null;
  @Column({ type: 'jsonb', nullable: true }) rawState: Record<string, any> | null;
  @Column({ type: 'timestamp' }) recordedAt: Date;
  @CreateDateColumn() createdAt: Date;
}
