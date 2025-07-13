import {Body, Controller, Get, Post} from '@nestjs/common';
import {ElevatorService} from "../service/elevator.service";
import {LiftStatusRequestDTO} from "../dtos/status/LiftStatusRequestDTO";
import {LiftStatusResponseDTO} from "../dtos/status/LiftStatusResponseDTO";
import {CallElevatorRequestDTO} from "../dtos/CallElevatorRequestDTO";
import {BaseResponseDTO} from "../../baseDtos/BaseResponseDTO";

@Controller("lift")
export class DeviceController {
    constructor(private readonly elevatorService: ElevatorService) {}

    @Post("status")
    getLiftStatus(@Body() request: LiftStatusRequestDTO): LiftStatusResponseDTO {
        return this.elevatorService.getLiftStatus(request);
    }

    @Post("call")
    callElevator(@Body() request: CallElevatorRequestDTO): BaseResponseDTO {
        return this.elevatorService.callElevator(request);
    }
}
