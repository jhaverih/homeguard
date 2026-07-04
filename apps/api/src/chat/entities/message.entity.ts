import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @Column({ nullable: true })
  senderId: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  attachmentUrl: string;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
