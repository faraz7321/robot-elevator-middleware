import { IsNumber, IsString } from 'class-validator';

export class ListElevatorsResultDTO {
  @IsNumber()
  liftNo: number;

  @IsString()
  accessibleFloors: string;

  @IsString()
  bindingStatus: string;
}
