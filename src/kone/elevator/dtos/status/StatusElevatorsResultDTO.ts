import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ListElevatorsResultDTO {
  @IsNumber()
  liftNo: number;

  @IsNumber()
  floor: number;

  @IsNumber()
  state: number;

  @IsNumber()
  prevDirection: number;

  @IsNumber()
  liftDoorStatus: number;

  // Lift mode as provided by lift-status payload
  @IsOptional()
  @IsString()
  mode?: string;
}
