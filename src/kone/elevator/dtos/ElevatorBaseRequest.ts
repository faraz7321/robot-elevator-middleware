import {IsNotEmpty, IsNumber, IsString, Length} from "class-validator";


export class ElevatorBaseRequest {

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