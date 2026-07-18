import { IsArray, IsUUID } from 'class-validator';

export class SetCapabilitiesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  capabilityIds: string[];
}
