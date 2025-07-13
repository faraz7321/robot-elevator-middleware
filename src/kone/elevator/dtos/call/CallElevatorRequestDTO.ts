import {DeviceBaseRequestDTO} from "../../../device/dto/DeviceBaseRequestDTO";
import {IsNotEmpty, IsNumber} from "class-validator";
import {ElevatorBaseRequest} from "../ElevatorBaseRequest";


export class CallElevatorRequestDTO extends ElevatorBaseRequest {
    get toFloor(): number {
        return this._toFloor;
    }

    set toFloor(value: number) {
        this._toFloor = value;
    }

    @IsNumber()
    @IsNotEmpty()
    private _toFloor: number;


}