import { IsString, IsArray } from 'class-validator';
import { DeviceBaseRequestDTO } from '../DeviceBaseRequestDTO';

export class BindDeviceRequestDTO extends DeviceBaseRequestDTO {
  @IsArray()
  liftNos: number[];

  @IsString()
  placeId: string;
}
