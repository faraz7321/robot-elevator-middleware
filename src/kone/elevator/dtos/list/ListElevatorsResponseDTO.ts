import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListElevatorsResultDTO } from './ListElevatorsResultDTO';

export class ListElevatorsResponseDTO extends BaseResponseDTO {
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => ListElevatorsResultDTO)
  result: ListElevatorsResultDTO[];
}
