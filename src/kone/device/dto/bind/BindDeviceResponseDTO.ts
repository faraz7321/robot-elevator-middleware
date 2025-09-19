import { Type } from 'class-transformer';
import { BindDeviceResultDTO } from './BindDeviceResultDTO';
import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';

export class BindDeviceResponseDTO extends BaseResponseDTO {
  @Type(() => BindDeviceResultDTO)
  result: BindDeviceResultDTO | BindDeviceResultDTO[];
}
