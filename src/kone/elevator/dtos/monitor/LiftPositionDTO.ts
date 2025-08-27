import { IsString, IsNumber, IsOptional } from 'class-validator';

export class LiftPositionDTO {
  @IsString()
  time: string;

  @IsString()
  dir: string;

  @IsString()
  coll: string;

  @IsString()
  moving_state: string;

  @IsOptional()
  @IsString()
  drive_mode?: string;

  @IsOptional()
  @IsString()
  serving_mode?: string;

  @IsNumber()
  area: number;

  @IsNumber()
  cur: number;

  @IsNumber()
  adv: number;
}
