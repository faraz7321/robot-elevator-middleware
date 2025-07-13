import {IsNotEmpty, IsString, Length} from "class-validator";


export class ListElevatorsRequestDTO {

    @IsString()
    @Length(24, 24)
    @IsNotEmpty()
    deviceUuid: string;

    @IsString()
    @IsNotEmpty()
    placeId: string;
}