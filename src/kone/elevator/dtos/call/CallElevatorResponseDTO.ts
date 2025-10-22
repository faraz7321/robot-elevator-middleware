 import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CallElevatorResponseDTO extends BaseResponseDTO {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsNumber()
  destination?: number;

  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsOptional()
  @IsNumber()
  requestId?: number;

  @IsOptional()
  @IsNumber()
  statusCode?: number;
}