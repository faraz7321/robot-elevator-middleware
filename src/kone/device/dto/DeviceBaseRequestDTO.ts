import { IsNotEmpty, IsNumber, IsString, Length } from 'class-validator';

export class DeviceBaseRequestDTO {
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
  @IsNotEmpty()
  check: string;

  @IsNumber()
  @IsNotEmpty()
  ts: number;
}
