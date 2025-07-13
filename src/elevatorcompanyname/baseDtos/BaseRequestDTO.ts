import {IsNumber, IsString} from "class-validator";

export class BaseRequestDTO {

    @IsString()
    appname: string;

    @IsString()
    sign: string;

    @IsString()
    check: string;

    @IsNumber()
    ts: number;

}