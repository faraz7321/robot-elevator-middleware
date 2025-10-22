import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class BindDeviceResultDTO {
  @IsOptional()
  @IsString()
  @Length(12, 12)
  deviceMac?: string;

  @IsOptional()
  @IsString()
  @Length(24, 24)
  deviceUuid?: string;

  @IsString()
  bindingStatus: string;

  @IsNumber()
  liftNo: number;
}
