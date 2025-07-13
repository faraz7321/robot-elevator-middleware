import {IsNotEmpty, IsNumber, IsString, Length} from "class-validator";


export class ElevatorBaseRequest {
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

}