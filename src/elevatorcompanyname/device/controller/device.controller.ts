import {Body, Controller, Get, Post} from '@nestjs/common';
import {DeviceService} from "../service/device.service";
import {RegisterDeviceRequestDTO} from "../dto/register/RegisterDeviceRequestDTO";
import {RegisterDeviceResponseDTO} from "../dto/register/RegisterDeviceResponseDTO";
import {BindDeviceRequestDTO} from "../dto/bind/BindDeviceRequestDTO";
import {BindDeviceResponseDTO} from "../dto/bind/BindDeviceResponseDTO";


@Controller("device")
export class DeviceController {
    constructor(private readonly deviceService: DeviceService) {}

    @Post("register")
    registerDevice(@Body() device: RegisterDeviceRequestDTO): RegisterDeviceResponseDTO {
        return this.deviceService.registerDevice(device);
    }

    @Post("binding")
    bindDevice(@Body() device: BindDeviceRequestDTO): BindDeviceResponseDTO {
        return this.deviceService.bindDevice(device);
    }

    @Post("unbinding")
    unbindDevice(@Body() device: BindDeviceRequestDTO): BindDeviceResponseDTO {
        return this.deviceService.unbindDevice(device);
    }

}
