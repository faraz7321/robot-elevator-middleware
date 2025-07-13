import { Injectable } from '@nestjs/common';
import {LiftStatusRequestDTO} from "../dtos/status/LiftStatusRequestDTO";
import {LiftStatusResponseDTO} from "../dtos/status/LiftStatusResponseDTO";
import {CallElevatorRequestDTO} from "../dtos/CallElevatorRequestDTO";
import {BaseResponseDTO} from "../../baseDtos/BaseResponseDTO";

@Injectable()
export class ElevatorService {


    getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
        return new LiftStatusResponseDTO();
    }

    callElevator(request: CallElevatorRequestDTO): BaseResponseDTO {
        return new BaseResponseDTO();
    }


}
