import { ElevatorBaseRequest } from '../ElevatorBaseRequest';
import { IsIn, IsNotEmpty, IsNumber } from 'class-validator';

export class ReserveAndCancelRequestDTO extends ElevatorBaseRequest {
  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }

  @IsNumber()
  @IsNotEmpty()
  @IsIn([0, 1])
  locked: number;

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;

  @IsNumber()
  @IsNotEmpty()
  private _fromFloor: number;

  @IsNumber()
  @IsNotEmpty()
  private _toFloor: number;

  get fromFloor(): number {
    return this._fromFloor;
  }

  set fromFloor(value: number) {
    this._fromFloor = value;
  }

  get toFloor(): number {
    return this._toFloor;
  }

  set toFloor(value: number) {
    this._toFloor = value;
  }
}
