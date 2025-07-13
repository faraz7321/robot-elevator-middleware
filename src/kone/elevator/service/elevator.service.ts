import { Injectable } from '@nestjs/common';
import {LiftStatusRequestDTO} from "../dtos/status/LiftStatusRequestDTO";
import {LiftStatusResponseDTO} from "../dtos/status/LiftStatusResponseDTO";
import {CallElevatorRequestDTO} from "../dtos/call/CallElevatorRequestDTO";
import {BaseResponseDTO} from "../../baseDtos/BaseResponseDTO";
import {DelayDoorRequestDTO} from "../dtos/delay/DelayDoorRequestDTO";
import {ReserveAndCancelRequestDTO} from "../dtos/reserve/ReserveAndCancelRequestDTO";
import {ListElevatorsRequestDTO} from "../dtos/list/ListElevatorsRequestDTO";
import {ListElevatorsResponseDTO} from "../dtos/list/ListElevatorsResponseDTO";

@Injectable()
export class ElevatorService {

    listElevators(request: ListElevatorsRequestDTO): ListElevatorsResponseDTO {
        return new ListElevatorsResponseDTO();
    }

    getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
        return new LiftStatusResponseDTO();
    }

    callElevator(request: CallElevatorRequestDTO): BaseResponseDTO {
        return new BaseResponseDTO();
    }

    delayElevator(request: DelayDoorRequestDTO): BaseResponseDTO {
        return new BaseResponseDTO();
    }

    reserveOrCancelCall(request: ReserveAndCancelRequestDTO): BaseResponseDTO {
        return new BaseResponseDTO();
    }

}
