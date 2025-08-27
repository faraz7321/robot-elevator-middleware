import { IsString, IsNumber, IsOptional } from 'class-validator';

export class LiftDoorDTO {
  @IsString()
  time: string;

  @IsNumber()
  area: number;

  @IsOptional()
  @IsNumber()
  landing?: number;

  @IsOptional()
  @IsNumber()
  lift_side?: number;

  @IsString()
  state: string;
}