import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class LiftStatusResultDTO {
  @IsNumber()
  liftNo: number;

  @IsNumber()
  floor: number;

  @IsNumber()
  state: number;

  @IsBoolean()
  locked: boolean;

  @IsNumber()
  prevDirection: number;

  @IsNumber()
  liftDoorStatus: number;

  // Lift mode as provided by lift-status payload
  @IsOptional()
  @IsString()
  mode?: string;
}
