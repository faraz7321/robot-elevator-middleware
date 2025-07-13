import {IsString, IsArray, IsOptional, IsNumber, Length, IsNotEmpty} from 'class-validator';
import {BaseRequestDTO} from "../../../baseDtos/BaseRequestDTO";

export class BindDeviceRequestDTO extends BaseRequestDTO{
    @IsString()
    @Length(24, 24)
    @IsNotEmpty()
    deviceUuid: string;

    @IsArray()
    liftNos: number[];

    @IsString()
    placeId: string;
}
