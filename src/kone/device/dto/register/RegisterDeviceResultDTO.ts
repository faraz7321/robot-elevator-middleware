import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RegisterDeviceResultDTO {
  @IsString()
  @Length(12, 12)
  @IsNotEmpty()
  deviceMac: string;

  @IsString()
  @Length(24, 24)
  @IsNotEmpty()
  deviceUuid: string;

  @IsString()
  @IsNotEmpty()
  deviceSecret: string;
}
