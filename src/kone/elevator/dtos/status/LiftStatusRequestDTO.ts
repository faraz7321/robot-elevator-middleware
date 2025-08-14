import { IsNotEmpty, IsNumber } from 'class-validator';
import { ElevatorBaseRequest } from '../ElevatorBaseRequest';

export class LiftStatusRequestDTO extends ElevatorBaseRequest {
  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;
}
