import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('yolink_homes')
export class YolinkHome {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customerId' }) customer: User;
  @Column() yolinkUAID: string;
  // Encrypted at rest (see common/crypto/encryption.util.ts) — this is the
  // customer's own Yolink Personal Access Credential secret, entered by the
  // installing vendor. Nullable only for rows that predate this column.
  @Column({ nullable: true }) yolinkSecretKey: string | null;
  @Column({ nullable: true }) yolinkHomeId: string;
  @Column() homeName: string;
  @Column({ nullable: true }) address: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
