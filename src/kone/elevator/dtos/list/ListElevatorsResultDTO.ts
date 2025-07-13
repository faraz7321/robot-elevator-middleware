import {IsArray, IsNumber, IsString} from "class-validator";


export class ListElevatorsResultDTO {

    @IsNumber()
    liftNo: number;

    @IsArray()
    accessibleFloors: number[];

    @IsString()
    bindingStatus: string;

}