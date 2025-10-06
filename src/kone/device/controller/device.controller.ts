import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
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
  async registerDevice(
    @Body() request: RegisterDeviceRequestDTO,
  ): Promise<RegisterDeviceResponseDTO> {
    validateRegisterRequest(request);
    return this.deviceService.registerDevice(request);
  }

  @Post('binding')
  async bindDevice(
    @Body() request: BindDeviceRequestDTO,
  ): Promise<BindDeviceResponseDTO> {
    const deviceSecret = await this.deviceService.getDeviceSecret(
      request.deviceUuid,
    );
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    return this.deviceService.bindDevice(request);
  }

  @Post('unbinding')
  async unbindDevice(
    @Body() request: BindDeviceRequestDTO,
  ): Promise<BindDeviceResponseDTO> {
    const deviceSecret = await this.deviceService.getDeviceSecret(
      request.deviceUuid,
    );
    if (!deviceSecret) {
      throw new UnauthorizedException('Device not registered');
    }
    validateSignedRequest(request, deviceSecret);
    return this.deviceService.unbindDevice(request);
  }
}
