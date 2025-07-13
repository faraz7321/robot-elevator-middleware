import {IsNumber, IsString} from "class-validator";


export class BindDeviceResultDTO {

    @IsString()
    bindingStatus: string;

    @IsNumber()
    liftNo: number;

}