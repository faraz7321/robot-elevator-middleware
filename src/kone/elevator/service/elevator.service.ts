import { Injectable } from '@nestjs/common';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';

import * as dotenv from 'dotenv';

dotenv.config();
import { openWebSocketConnection } from '../../common/koneapi';
import { plainToInstance } from 'class-transformer';
import { AccessTokenService } from '../../auth/service/accessToken.service';

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */

@Injectable()
export class ElevatorService {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  private getRequestId() {
    return Math.floor(Math.random() * 1000000000);
  }

  listElevators(request: ListElevatorsRequestDTO): ListElevatorsResponseDTO {
    return new ListElevatorsResponseDTO();
  }

  getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
    return new LiftStatusResponseDTO();
  }

  async callElevator(
    request: CallElevatorRequestDTO,
  ): Promise<BaseResponseDTO> {
    const requestId = this.getRequestId();
    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );

    // Select the first available building
    const targetBuildingId = `building:${request.placeId}`;
    // Fetch the topology of the specific building

    // Open the WebSocket connection
    const webSocketConnection = await openWebSocketConnection(accessToken);
    console.log('WebSocket open ' + new Date());

    // Add handler for incoming messages
    // const response: BaseResponseDTO = await  webSocketConnection.on('message', this.onWebSocketMessage);

    const response: BaseResponseDTO = await new Promise((resolve, reject) => {
      // Listen once for message event
      webSocketConnection.on('message', (data: string) => {
        const res = new BaseResponseDTO();
        try {
          const parsed = JSON.parse(data);
          console.log(parsed);
          if (
            parsed.callType === 'action' &&
            parsed.data?.request_id === requestId
          ) {
            const res = new BaseResponseDTO();
            if (parsed.data?.success) {
              res.errcode = 0;
              res.errmsg = 'SUCCESS';
            } else {
              res.errcode = 1;
              res.errmsg = 'FAILURE';
            }
            resolve(res);
          }
        } catch (err) {
          reject(err);
        }
      });

      // Build the call payload using the areas previously generated
      const destinationCallPayload: any = {
        type: 'lift-call-api-v2',
        buildingId: targetBuildingId,
        callType: 'action',
        groupId: '1',
        payload: {
          request_id: requestId,
          area: request.fromFloor, //current floor
          time: new Date().toISOString(),
          terminal: 1,
          // terminal: 10011,
          call: {
            action: 3,
            destination: request.toFloor,
          },
        },
      };
      console.log(destinationCallPayload);

      // Send the request
      webSocketConnection.send(JSON.stringify(destinationCallPayload));
    });

    // execute the call within the open WebSocket connection
    // webSocketConnection.send(JSON.stringify(destinationCallPayload));

    return plainToInstance(BaseResponseDTO, response);
  }

  delayElevatorDoors(request: DelayDoorRequestDTO): BaseResponseDTO {
    return new BaseResponseDTO();
  }

  reserveOrCancelCall(request: ReserveAndCancelRequestDTO): BaseResponseDTO {
    return new BaseResponseDTO();
  }
}
