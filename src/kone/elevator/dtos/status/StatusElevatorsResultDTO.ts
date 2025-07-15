import { IsNumber } from 'class-validator';

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
}
