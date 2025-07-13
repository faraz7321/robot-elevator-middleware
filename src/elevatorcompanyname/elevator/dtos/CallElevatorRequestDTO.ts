import {BaseRequestDTO} from "../../baseDtos/BaseRequestDTO";
import {IsNotEmpty, IsNumber} from "class-validator";


export class CallElevatorRequestDTO extends BaseRequestDTO {

    @IsNumber()
    @IsNotEmpty()
    liftNo: number;

    @IsNumber()
    @IsNotEmpty()
    toFloor: number;


}