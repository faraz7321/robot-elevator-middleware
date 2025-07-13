import {ElevatorBaseRequest} from "../ElevatorBaseRequest";
import {IsNotEmpty, IsNumber} from "class-validator";


export class DelayDoorRequestDTO extends ElevatorBaseRequest {

    @IsNumber()
    @IsNotEmpty()
    seconds: number;


}