import {Injectable} from '@nestjs/common';
import {LiftStatusRequestDTO} from '../dtos/status/LiftStatusRequestDTO';
import {LiftStatusResponseDTO} from '../dtos/status/LiftStatusResponseDTO';
import {CallElevatorRequestDTO} from '../dtos/call/CallElevatorRequestDTO';
import {BaseResponseDTO} from '../../baseDtos/BaseResponseDTO';
import {DelayDoorRequestDTO} from '../dtos/delay/DelayDoorRequestDTO';
import {ReserveAndCancelRequestDTO} from '../dtos/reserve/ReserveAndCancelRequestDTO';
import {ListElevatorsRequestDTO} from '../dtos/list/ListElevatorsRequestDTO';
import {ListElevatorsResponseDTO} from '../dtos/list/ListElevatorsResponseDTO';

import * as dotenv from 'dotenv';

dotenv.config();
import {v4 as uuidv4} from 'uuid';
import _ from 'lodash';

import {
    fetchAccessToken,
    openWebSocketConnection,
    validateClientIdAndClientSecret,
} from '../../common/koneapi';
import {CallElevatorWebSocketResponseDTO} from "../dtos/call/CallElevatorWebSocketResponseDTO";
import {plainToInstance} from "class-transformer";

/**
 * Update these two variables with your own credentials or set them up as environment variables.
 */
const CLIENT_ID: string = process.env.CLIENT_ID || 'YOUR_CLIENT_ID'; // eg. 'dcf48ab0-a902-4b52-8c53-1a9aede716e5'
const CLIENT_SECRET: string = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET'; // eg. '31d1329f8344fc12b1a960c8b8e0fc6a22ea7c35774c807a4fcabec4ffc8ae5b'
const BUILDING_ID: string = process.env.BUILDING_ID || '4TFxWRCv23D';


@Injectable()
export class ElevatorService {


    /**
     * Function is used to log out incoming WebSocket messages
     *
     * @param {string} data data string from WebSocket
     */
    private onWebSocketMessage = (data: string): void => {
        const parsedData = JSON.parse(data);

        switch (parsedData.callType) {
            case 'action':
                this.handleOnLiftCallResponse(parsedData);
        }
        console.log('Incoming WebSocket message', parsedData);
        console.log('timing ' + new Date());

    };

    private handleOnLiftCallResponse(data: CallElevatorWebSocketResponseDTO) {
        console.log(data);
    }


    private getRequestId() {
        return Math.floor(Math.random() * 1000000000);
    }

    listElevators(request: ListElevatorsRequestDTO): ListElevatorsResponseDTO {
        return new ListElevatorsResponseDTO();
    }

    getLiftStatus(request: LiftStatusRequestDTO): LiftStatusResponseDTO {
        return new LiftStatusResponseDTO();
    }

    async callElevator(request: CallElevatorRequestDTO): Promise<BaseResponseDTO> {
        validateClientIdAndClientSecret(CLIENT_ID, CLIENT_SECRET);
        let requestId = this.getRequestId();
        let accessToken = await fetchAccessToken(CLIENT_ID, CLIENT_SECRET, [
            'application/inventory',
            `callgiving/group:${request.placeId}:1`,
        ]);
        console.log('AccessToken successfully fetched');

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
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.callType === 'action' && parsed.data?.request_id === requestId) {
                        const res = new BaseResponseDTO();
                        if (parsed.data?.success) {
                            res.errcode = 0
                            res.errmsg = "SUCCESS"
                        } else {
                            res.errcode = 1
                            res.errmsg = "FAILURE"
                        }
                        resolve(res);
                    } else {
                        console.log(parsed)
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
                    area: 7000, //current floor
                    time: '2020-10-10T07:17:33.298515Z',
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
