import { Body, Controller, Post } from '@nestjs/common';
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
import { CallElevatorResponseDTO } from '../dtos/call/CallElevatorResponseDTO';
import { logIncoming, logOutgoing } from '../../common/logger';
dotenv.config();

@Controller('lift')
export class ElevatorController {
  constructor(private readonly elevatorService: ElevatorService) {}

  @Post('list')
  async listElevators(
    @Body() request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    logIncoming('robot /openapi/v5/lift/list', request);
    validateSignedRequest(request);
    const response = await this.elevatorService.listElevators(request);
    logOutgoing('robot /openapi/v5/lift/list', response);
    return response;
  }

  @Post('status')
  async getLiftStatus(
    @Body() request: LiftStatusRequestDTO,
  ): Promise<LiftStatusResponseDTO> {
    logIncoming('robot /openapi/v5/lift/status', request);
    validateSignedRequest(request);
    const response = await this.elevatorService.getLiftStatus(request);
    logOutgoing('robot /openapi/v5/lift/status', response);
    return response;
  }

  @Post('call')
  async call(
    @Body() request: CallElevatorRequestDTO,
  ): Promise<CallElevatorResponseDTO> {
    logIncoming('robot /openapi/v5/lift/call', request);
    validateSignedRequest(request);
    const response = await this.elevatorService.callElevator(request);
    logOutgoing('robot /openapi/v5/lift/call', response);
    return response;
  }

  @Post('open')
  delayElevatorDoors(@Body() request: DelayDoorRequestDTO): BaseResponseDTO {
    logIncoming('robot /openapi/v5/lift/open', request);
    validateSignedRequest(request);
    const response = this.elevatorService.delayElevatorDoors(request);
    logOutgoing('robot /openapi/v5/lift/open', response);
    return response;
  }

  @Post('lock')
  reserveOrCancelElevator(
    @Body() request: ReserveAndCancelRequestDTO,
  ): BaseResponseDTO {
    logIncoming('robot /openapi/v5/lift/lock', request);
    validateSignedRequest(request);
    const response = this.elevatorService.reserveOrCancelCall(request);
    logOutgoing('robot /openapi/v5/lift/lock', response);
    return response;
  }
}
