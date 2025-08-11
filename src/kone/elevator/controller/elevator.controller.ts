import { Body, Controller, Get, Post } from '@nestjs/common';
import { ElevatorService } from '../service/elevator.service';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';
import { validateSignedRequest } from '../../common/verify-signature';
import * as dotenv from 'dotenv';

dotenv.config();

@Controller('lift')
export class ElevatorController {
  constructor(private readonly elevatorService: ElevatorService) {}

  @Post('list')
  async listElevators(
    @Body() request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    validateSignedRequest(request);
    return this.elevatorService.listElevators(request);
  }

  @Post('status')
  getLiftStatus(@Body() request: LiftStatusRequestDTO): LiftStatusResponseDTO {
    validateSignedRequest(request);
    return this.elevatorService.getLiftStatus(request);
  }

  @Post('call')
  async call(
    @Body() request: CallElevatorRequestDTO,
  ): Promise<BaseResponseDTO> {
    validateSignedRequest(request);

    return this.elevatorService.callElevator(request);
  }

  @Post('open')
  delayElevatorDoors(@Body() request: DelayDoorRequestDTO): BaseResponseDTO {
    validateSignedRequest(request);

    return this.elevatorService.delayElevatorDoors(request);
  }

  @Post('lock')
  reserveOrCancelElevator(
    @Body() request: ReserveAndCancelRequestDTO,
  ): BaseResponseDTO {
    validateSignedRequest(request);

    return this.elevatorService.reserveOrCancelCall(request);
  }
}
