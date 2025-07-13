import {IsBoolean, IsNumber} from "class-validator";

export class CallElevatorWebSocketResponseData {
    get session_id(): number {
        return this._session_id;
    }

    set session_id(value: number) {
        this._session_id = value;
    }
    get success(): boolean {
        return this._success;
    }

    set success(value: boolean) {
        this._success = value;
    }
    get request_id(): number {
        return this._request_id;
    }

    set request_id(value: number) {
        this._request_id = value;
    }

    @IsNumber() private _request_id: number;

    @IsBoolean() private _success: boolean;

    @IsNumber() private _session_id: number;

}