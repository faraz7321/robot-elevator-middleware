import { RegisterDeviceResultDTO } from './RegisterDeviceResultDTO';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';

export class RegisterDeviceResponseDTO extends BaseResponseDTO {
  @ValidateNested()
  @Type(() => RegisterDeviceResultDTO)
  result: RegisterDeviceResultDTO;
}
