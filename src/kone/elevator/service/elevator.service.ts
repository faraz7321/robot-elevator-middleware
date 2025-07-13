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
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';

import {
  fetchAccessToken,
  openWebSocketConnection,
  validateClientIdAndClientSecret,
} from '../../common/koneapi';

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */
const CLIENT_ID: string = process.env.CLIENT_ID || 'YOUR_CLIENT_ID'; // eg. 'dcf48ab0-a902-4b52-8c53-1a9aede716e5'
const CLIENT_SECRET: string = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET'; // eg. '31d1329f8344fc12b1a960c8b8e0fc6a22ea7c35774c807a4fcabec4ffc8ae5b'
const BUILDING_ID: string = process.env.BUILDING_ID || '4TFxWRCv23D';

/**
 * Function is used to log out incoming WebSocket messages
 *
 * @param {string} data data string from WebSocket
 */
const onWebSocketMessage = (data: string): void => {
  let dataBlob = JSON.parse(data);

  console.log('Incoming WebSocket message', dataBlob);
  console.log('timing ' + new Date());
};
function getRequestId() {
  return Math.floor(Math.random() * 1000000000);
}
@Injectable()
export class ElevatorService {
  listElevators(request: ListElevatorsRequestDTO): ListElevatorsResponseDTO {
    return new ListElevatorsResponseDTO();
  }

  getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
    return new LiftStatusResponseDTO();
  }

  async callElevator(
    request: CallElevatorRequestDTO,
  ): Promise<BaseResponseDTO> {
    validateClientIdAndClientSecret(CLIENT_ID, CLIENT_SECRET);
    let accessToken = await fetchAccessToken(CLIENT_ID, CLIENT_SECRET, [
      'application/inventory',
      `callgiving/group:${BUILDING_ID}:1`,
    ]);
    console.log('AccessToken successfully fetched');

    // Select the first available building
    const targetBuildingId = `building:${BUILDING_ID}`;
    // Fetch the topology of the specific building

    // Open the WebSocket connection
    const webSocketConnection = await openWebSocketConnection(accessToken);
    console.log('WebSocket open ' + new Date());

    // Add handler for incoming messages
    webSocketConnection.on('message', (data: any) => onWebSocketMessage(data));

    // Build the call payload using the areas previously generated
    const destinationCallPayload: any = {
      type: 'lift-call-api-v2',
      buildingId: targetBuildingId,
      callType: 'action',
      groupId: '1',
      payload: {
        request_id: getRequestId(),
        area: 7000, //current floor
        time: '2020-10-10T07:17:33.298515Z',
        terminal: 1,
        // terminal: 10011,
        call: {
          action: 3,
          destination: 8000,
        },
      },
    };

    console.log(destinationCallPayload);
    // execute the call within the open WebSocket connection
    webSocketConnection.send(JSON.stringify(destinationCallPayload));

    return new BaseResponseDTO();
  }

  delayElevator(request: DelayDoorRequestDTO): BaseResponseDTO {
    return new BaseResponseDTO();
  }

  reserveOrCancelCall(request: ReserveAndCancelRequestDTO): BaseResponseDTO {
    return new BaseResponseDTO();
  }
}
