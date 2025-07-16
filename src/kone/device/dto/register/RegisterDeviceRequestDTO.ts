import { IsString, Length, IsNotEmpty, IsNumber } from 'class-validator';

export class RegisterDeviceRequestDTO {
  @IsString()
  @Length(24, 24)
  @IsNotEmpty()
  deviceUuid: string;

  @IsString()
  @IsNotEmpty()
  appname: string;

  @IsString()
  @IsNotEmpty()
  sign: string;

  @IsString()
  @Length(12, 12)
  @IsNotEmpty()
  deviceMac: string;

  @IsNumber()
  ts: number;
}
