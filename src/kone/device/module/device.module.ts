import { Module } from '@nestjs/common';
import { DeviceService } from '../service/device.service';
import { DeviceController } from '../controller/device.controller';
import { DeviceRegistryRepository } from '../repository/device-registry.repository';
import { DeviceBindingRepository } from '../repository/device-binding.repository';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { DeviceRegistryService } from '../service/device-registry.service';
import { DeviceBindingService } from '../service/device-binding.service';
import { LiftAuthorizationService } from '../service/lift-authorization.service';

@Module({
  imports: [],
  controllers: [DeviceController],
  providers: [
    DeviceService,
    DeviceRegistryService,
    DeviceBindingService,
    LiftAuthorizationService,
    DeviceRegistryRepository,
    DeviceBindingRepository,
    AccessTokenService,
  ],
  exports: [DeviceService],
})
export class DeviceModule {}
