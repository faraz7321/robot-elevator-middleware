import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LiftStatusResultDTO } from './LiftStatusResultDTO';

export class LiftStatusResponseDTO extends BaseResponseDTO {
  @ValidateNested()
  @Type(() => LiftStatusResultDTO)
  result: LiftStatusResultDTO;
}
