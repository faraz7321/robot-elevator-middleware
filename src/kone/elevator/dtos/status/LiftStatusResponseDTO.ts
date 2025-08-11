import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListElevatorsResultDTO } from './StatusElevatorsResultDTO';

export class LiftStatusResponseDTO extends BaseResponseDTO {
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => ListElevatorsResultDTO)
  result: ListElevatorsResultDTO[];

  @IsNumber()
  liftNo: number;

  @IsNumber()
  floor: number;

  @IsNumber()
  state: number;

  @IsNumber()
  prevDirection: number;

  @IsNumber()
  liftDoorStatus: number;

  @IsOptional()
  @IsString()
  mode?: string;
}
