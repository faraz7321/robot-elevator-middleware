import { DeviceBaseRequestDTO } from '../../../device/dto/DeviceBaseRequestDTO';
import { IsNotEmpty, IsNumber } from 'class-validator';
import { ElevatorBaseRequest } from '../ElevatorBaseRequest';

export class CallElevatorRequestDTO extends ElevatorBaseRequest {
  @IsNumber()
  @IsNotEmpty()
  private _toFloor: number;

  @IsNumber()
  @IsNotEmpty()
  private _fromFloor: number;

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;

  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }

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
