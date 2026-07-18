import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// A full-catalog snapshot taken automatically after every pricing change
// (create/update/delete/bulk-category/CSV import, which itself goes through
// create/update) — recovery means picking a prior snapshot and downloading
// it as CSV to re-import, not diffing. Lives in Postgres (already covered by
// the nightly server backup) rather than the API container's filesystem,
// which has no persistent disk at all.
@Entity('pricing_catalog_backups')
export class PricingCatalogBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // What triggered this snapshot: 'create' | 'update' | 'delete' | 'bulk-category'.
  @Column()
  reason: string;

  // Human-readable detail (e.g. the affected item's name) shown in the admin
  // backups list so an admin can find the right snapshot without opening each one.
  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ type: 'int' })
  itemCount: number;

  @Column({ type: 'jsonb' })
  snapshot: any;

  @CreateDateColumn()
  createdAt: Date;
}
