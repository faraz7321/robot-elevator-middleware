import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsNumber } from 'class-validator';

export class CallElevatorResponseDTO extends BaseResponseDTO {
  @IsNumber()
  sessionId: number;

  @IsNumber()
  destination: number;
}
