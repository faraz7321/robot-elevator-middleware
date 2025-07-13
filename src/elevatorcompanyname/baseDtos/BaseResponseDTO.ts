import {IsNumber, IsString} from "class-validator";


export class BaseResponseDTO {
    @IsNumber()
    errcode: number;

    @IsString()
    errmsg: string;
}