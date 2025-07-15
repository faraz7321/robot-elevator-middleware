import { IsNotEmpty, IsString, Length } from 'class-validator';

export class BaseRequestDTO {
  @IsNotEmpty()
  @IsString()
  @Length(24, 24)
  deviceUuid: string;

  @IsNotEmpty()
  @IsString()
  appname: string;

  @IsNotEmpty()
  @IsString()
  placeId: string;

  @IsNotEmpty()
  @IsString()
  sign: string;

  @IsNotEmpty()
  @IsString()
  check: string;

  ts: number;
}
