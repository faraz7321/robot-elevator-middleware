import {BaseRequestDTO} from "../../../baseDtos/BaseRequestDTO";
import {IsNotEmpty, IsNumber, IsString, Length} from "class-validator";


export class LiftStatusRequestDTO extends BaseRequestDTO{

    @IsString()
    @Length(24, 24)
    @IsNotEmpty()
    deviceUuid: string;

    @IsNumber()
    @IsNotEmpty()
    liftNo: number;

    @IsString()
    @IsNotEmpty()
    placeId: string;


}