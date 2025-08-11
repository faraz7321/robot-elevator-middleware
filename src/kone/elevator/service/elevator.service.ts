import { Injectable } from '@nestjs/common';
import { LiftStatusRequestDTO } from '../dtos/status/LiftStatusRequestDTO';
import { LiftStatusResponseDTO } from '../dtos/status/LiftStatusResponseDTO';
import { CallElevatorRequestDTO } from '../dtos/call/CallElevatorRequestDTO';
import { BaseResponseDTO } from '../../baseDtos/BaseResponseDTO';
import { DelayDoorRequestDTO } from '../dtos/delay/DelayDoorRequestDTO';
import { ReserveAndCancelRequestDTO } from '../dtos/reserve/ReserveAndCancelRequestDTO';
import { ListElevatorsRequestDTO } from '../dtos/list/ListElevatorsRequestDTO';
import { ListElevatorsResponseDTO } from '../dtos/list/ListElevatorsResponseDTO';

import {
  fetchBuildingTopology,
  openWebSocketConnection,
} from '../../common/koneapi';
import { plainToInstance } from 'class-transformer';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { BuildingTopology } from '../../common/types';

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */

@Injectable()
export class ElevatorService {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  private getRequestId() {
    return Math.floor(Math.random() * 1000000000);
  }

  //TODO: Get elevator list (logic needs to be implemented in middleware)
  private buildingTopologyCache: Map<string, BuildingTopology> = new Map();

  async listElevators(
    request: ListElevatorsRequestDTO,
  ): Promise<ListElevatorsResponseDTO> {
    console.log(
      'Requested: /openapi/v5/lift/list on ' + new Date().toISOString(),
    );
    console.log(request);

    const response = new ListElevatorsResponseDTO();

    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );

    let topology = this.buildingTopologyCache.get(request.placeId);
    if (!topology) {
      topology = await fetchBuildingTopology(accessToken, request.placeId);
      this.buildingTopologyCache.set(request.placeId, topology);
    }

    const areaNameMap = new Map(
      topology.areas.map((area) => [area.areaId, area.shortName]),
    );

    response.result = topology.groups.flatMap((group) =>
      group.lifts.map((lift) => {
        const floorNames = new Set<string>();
        lift.floors.forEach((floor) => {
          floor.areasServed.forEach((areaId) => {
            const name = areaNameMap.get(areaId);
            if (name) floorNames.add(name);
          });
        });
        const liftNo = Number(lift.liftId.split(':').pop());
        return {
          liftNo,
          accessibleFloors: Array.from(floorNames).join(','),
          bindingStatus: '11',
        };
      }),
    );

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }

  //TODO: Get lift Status
  getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
    console.log(
      'Requested: /openapi/v5/lift/status on ' + new Date().toISOString(),
    );
    console.log(request);

    const response = new LiftStatusResponseDTO();
    response.result = [
      {
        liftNo: 1,
        floor: 4, //need to implement this
        state: 0,
        prevDirection: 2,
        liftDoorStatus: 2,
      },
    ];

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }

  async callElevator(
    request: CallElevatorRequestDTO,
  ): Promise<BaseResponseDTO> {
    console.log(
      'Requested: /openapi/v5/lift/call on ' + new Date().toISOString(),
    );
    console.log(request);

    const requestId = this.getRequestId();
    const accessToken = await this.accessTokenService.getAccessToken(
      request.placeId,
    );

    const targetBuildingId = request.placeId;
    let topology = this.buildingTopologyCache.get(targetBuildingId);
    if (!topology) {
      topology = await fetchBuildingTopology(accessToken, targetBuildingId);
      this.buildingTopologyCache.set(targetBuildingId, topology);
    }
    const targetGroupId =
      topology.groups?.[0]?.groupId.split(':').pop() || '1';

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
        groupId: targetGroupId,
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

  //TODO: Delay opening of elevator doors
  delayElevatorDoors(request: DelayDoorRequestDTO): BaseResponseDTO {
    console.log(
      'Requested: /openapi/v5/lift/open on ' + new Date().toISOString(),
    );
    console.log(request);

    const response = new BaseResponseDTO();

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }

  //TODO: Reserve or Cancel call
  reserveOrCancelCall(request: ReserveAndCancelRequestDTO): BaseResponseDTO {
    console.log(
      'Requested: /openapi/v5/lift/lock on ' + new Date().toISOString(),
    );
    console.log(request);

    const response = new BaseResponseDTO();

    response.errcode = 0;
    response.errmsg = 'SUCCESS';

    return response;
  }
}
