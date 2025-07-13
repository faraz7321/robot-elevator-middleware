import {BaseResponseDTO} from "../../../baseDtos/BaseResponseDTO";
import {IsNumber} from "class-validator";


export class LiftStatusResponseDTO extends BaseResponseDTO {

    @IsNumber()
    liftNo: number;

    @IsNumber()
    floor: number;

    @IsNumber()
    state: number;

    @IsNumber()
    prevDirection: number;

    @IsNumber()
    liftDoorStatus: number;

}