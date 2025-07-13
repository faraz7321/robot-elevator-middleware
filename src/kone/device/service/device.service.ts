import { Injectable } from '@nestjs/common';
import {RegisterDeviceRequestDTO} from "../dto/register/RegisterDeviceRequestDTO";
import {RegisterDeviceResponseDTO} from "../dto/register/RegisterDeviceResponseDTO";
import {BindDeviceRequestDTO} from "../dto/bind/BindDeviceRequestDTO";
import {BindDeviceResponseDTO} from "../dto/bind/BindDeviceResponseDTO";

@Injectable()
export class DeviceService {
    registerDevice(device: RegisterDeviceRequestDTO): RegisterDeviceResponseDTO {
        return new RegisterDeviceResponseDTO();
    }

    bindDevice(device: BindDeviceRequestDTO): BindDeviceResponseDTO {
        return new BindDeviceResponseDTO();
    }

    unbindDevice(device: BindDeviceRequestDTO): BindDeviceResponseDTO {
        return new BindDeviceResponseDTO();
    }

}
