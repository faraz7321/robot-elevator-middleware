import { Body, Controller, Post } from '@nestjs/common';
import { DeviceService } from '../service/device.service';
import { RegisterDeviceRequestDTO } from '../dto/register/RegisterDeviceRequestDTO';
import { RegisterDeviceResponseDTO } from '../dto/register/RegisterDeviceResponseDTO';
import { BindDeviceRequestDTO } from '../dto/bind/BindDeviceRequestDTO';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import {
  validateSignedRequest,
  validateRegisterRequest,
} from '../../common/verify-signature';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('register')
  registerDevice(
    @Body() request: RegisterDeviceRequestDTO,
  ): RegisterDeviceResponseDTO {
    validateRegisterRequest(request);
    return this.deviceService.registerDevice(request);
  }

  @Post('binding')
  bindDevice(@Body() request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    validateSignedRequest(request);
    return this.deviceService.bindDevice(request);
  }

  @Post('unbinding')
  unbindDevice(@Body() request: BindDeviceRequestDTO): BindDeviceResponseDTO {
    validateSignedRequest(request);
    return this.deviceService.unbindDevice(request);
  }
}
