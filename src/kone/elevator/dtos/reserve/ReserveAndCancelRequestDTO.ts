import { ElevatorBaseRequest } from '../ElevatorBaseRequest';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class ReserveAndCancelRequestDTO extends ElevatorBaseRequest {
  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }

  @IsNumber()
  @IsNotEmpty()
  locked: number;

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;
}
