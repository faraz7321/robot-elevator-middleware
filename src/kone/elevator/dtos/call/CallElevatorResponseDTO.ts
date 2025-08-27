import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsNumber, IsString } from 'class-validator';

export class CallElevatorResponseDTO extends BaseResponseDTO {
  @IsNumber()
  sessionId: number;

  @IsNumber()
  destination: number;

  @IsString()
  connectionId: string;

  @IsNumber()
  requestId: number;

  @IsNumber()
  statusCode: number;
}
