import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListElevatorsResultDTO } from '../list/ListElevatorsResultDTO';

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
}
