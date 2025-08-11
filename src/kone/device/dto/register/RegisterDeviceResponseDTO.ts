import { RegisterDeviceResultDTO } from './RegisterDeviceResultDTO';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseResponseDTO } from '../../../baseDtos/BaseResponseDTO';

export class RegisterDeviceResponseDTO extends BaseResponseDTO {
  @ValidateNested({ each: true })
  @IsArray()
  @Type(() => RegisterDeviceResultDTO)
  result: RegisterDeviceResultDTO[];
}
