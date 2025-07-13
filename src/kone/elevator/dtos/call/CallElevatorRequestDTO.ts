import {DeviceBaseRequestDTO} from "../../../device/dto/DeviceBaseRequestDTO";
import {IsNotEmpty, IsNumber} from "class-validator";
import {ElevatorBaseRequest} from "../ElevatorBaseRequest";


export class CallElevatorRequestDTO extends ElevatorBaseRequest {

    @IsNumber()
    @IsNotEmpty()
    toFloor: number;


}