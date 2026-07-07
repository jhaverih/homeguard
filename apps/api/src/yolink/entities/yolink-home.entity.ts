import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('yolink_homes')
export class YolinkHome {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customerId' }) customer: User;
  @Column() yolinkUAID: string;
  @Column() homeName: string;
  @Column({ nullable: true }) address: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
