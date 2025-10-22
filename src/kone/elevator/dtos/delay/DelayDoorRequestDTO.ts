import { ElevatorBaseRequest } from '../ElevatorBaseRequest';
import { IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class DelayDoorRequestDTO extends ElevatorBaseRequest {
  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(9)
  seconds: number;

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;
}
