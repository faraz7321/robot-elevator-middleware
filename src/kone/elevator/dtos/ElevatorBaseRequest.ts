import { IsNotEmpty, IsNumber, IsString, Length } from 'class-validator';

export class ElevatorBaseRequest {
  get appname(): string {
    return this._appname;
  }

  set appname(value: string) {
    this._appname = value;
  }
  get check(): string {
    return this._check;
  }

  set check(value: string) {
    this._check = value;
  }
  get sign(): string {
    return this._sign;
  }

  set sign(value: string) {
    this._sign = value;
  }
  get ts(): number {
    return this._ts;
  }

  set ts(value: number) {
    this._ts = value;
  }
  get placeId(): string {
    return this._placeId;
  }

  set placeId(value: string) {
    this._placeId = value;
  }

  get liftNo(): number {
    return this._liftNo;
  }

  set liftNo(value: number) {
    this._liftNo = value;
  }

  get deviceUuid(): string {
    return this._deviceUuid;
  }

  set deviceUuid(value: string) {
    this._deviceUuid = value;
  }

  @IsString()
  @Length(24, 24)
  @IsNotEmpty()
  private _deviceUuid: string;

  @IsNumber()
  @IsNotEmpty()
  private _liftNo: number;

  @IsString()
  @IsNotEmpty()
  private _placeId: string;

  @IsString()
  @IsNotEmpty()
  private _appname: string;

  @IsString()
  @IsNotEmpty()
  private _check: string;

  @IsString()
  @IsNotEmpty()
  private _sign: string;

  @IsNumber()
  @IsNotEmpty()
  private _ts: number;
}
