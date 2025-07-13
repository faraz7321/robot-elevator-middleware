import {ElevatorBaseRequest} from "../ElevatorBaseRequest";
import {IsNotEmpty, IsNumber} from "class-validator";


export class ReserveAndCancelRequestDTO extends ElevatorBaseRequest{

    @IsNumber()
    @IsNotEmpty()
    locked: number;

}