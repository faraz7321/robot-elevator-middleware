import {IsNotEmpty, IsNumber, IsString, Length} from "class-validator";

export class DeviceBaseRequestDTO {
    @IsString()
    @Length(24, 24)
    @IsNotEmpty()
    deviceUuid: string;

    @IsString()
    appname: string;

    @IsString()
    sign: string;

    @IsString()
    check: string;

    @IsNumber()
    ts: number;

}