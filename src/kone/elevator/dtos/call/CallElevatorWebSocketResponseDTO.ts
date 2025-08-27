import { IsString, ValidateNested } from 'class-validator';
import { CallElevatorWebSocketResponseData } from './CallElevatorWebSocketResponseData';

export class CallElevatorWebSocketResponseDTO {
  get groupId(): string {
    return this._groupId;
  }

  set groupId(value: string) {
    this._groupId = value;
  }
  get buildingId(): string {
    return this._buildingId;
  }

  set buildingId(value: string) {
    this._buildingId = value;
  }
  get callType(): string {
    return this._callType;
  }

  set callType(value: string) {
    this._callType = value;
  }
  get data(): CallElevatorWebSocketResponseData {
    return this._data;
  }

  set data(value: CallElevatorWebSocketResponseData) {
    this._data = value;
  }

  @ValidateNested({ each: true })
  private _data: CallElevatorWebSocketResponseData;

  @IsString() private _callType: string;

  @IsString() private _buildingId: string;

  @IsString() private _groupId: string;
}
