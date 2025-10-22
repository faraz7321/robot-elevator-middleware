import { IsString, IsArray, IsOptional, IsNotEmpty } from 'class-validator';
import { DeviceBaseRequestDTO } from '../DeviceBaseRequestDTO';

export class BindDeviceRequestDTO extends DeviceBaseRequestDTO {
  @IsArray()
  @IsOptional()
  liftNos: number[];

  @IsString()
  @IsNotEmpty()
  placeId: string;
}
