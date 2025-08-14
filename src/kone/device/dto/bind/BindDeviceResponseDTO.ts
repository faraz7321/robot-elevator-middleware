import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BindDeviceResultDTO } from './BindDeviceResultDTO';
import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';

export class BindDeviceResponseDTO extends BaseResponseDTO {
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => BindDeviceResultDTO)
  result: BindDeviceResultDTO[];
}
