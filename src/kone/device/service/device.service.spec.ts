import { DeviceService } from './device.service';
import { BindDeviceResponseDTO } from '../dto/bind/BindDeviceResponseDTO';
import { BindDeviceResultDTO } from '../dto/bind/BindDeviceResultDTO';
import { DeviceRegistryService } from './device-registry.service';
import { DeviceBindingService } from './device-binding.service';
import { LiftAuthorizationService } from './lift-authorization.service';
import { DeviceBindingRepository } from '../repository/device-binding.repository';

describe('DeviceService bindings', () => {
  let service: DeviceService;
  let deviceRegistryService: jest.Mocked<DeviceRegistryService>;
  let deviceBindingService: DeviceBindingService;
  let liftAuthorizationService: jest.Mocked<LiftAuthorizationService>;
  let bindingRepository: jest.Mocked<DeviceBindingRepository>;

  beforeEach(() => {
    bindingRepository = {
      findByUuid: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<DeviceBindingRepository>;

    bindingRepository.findByUuid.mockResolvedValue(null);
    bindingRepository.save.mockResolvedValue({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    deviceBindingService = new DeviceBindingService(bindingRepository);

    deviceRegistryService = {
      registerDevice: jest.fn(),
      getDeviceSecret: jest.fn(),
      isDeviceBound: jest.fn(),
      getBoundLifts: jest.fn(),
      findByUuid: jest.fn(),
      findByMac: jest.fn(),
      getIdentity: jest.fn().mockResolvedValue({
        deviceUuid: '123456789012345678901234',
        deviceMac: '112233445566',
      }),
    } as unknown as jest.Mocked<DeviceRegistryService>;

    liftAuthorizationService = {
      getAuthorizedLiftNumbers: jest.fn().mockResolvedValue(new Set([1, 2])),
    } as unknown as jest.Mocked<LiftAuthorizationService>;

    service = new DeviceService(
      deviceRegistryService,
      deviceBindingService,
      liftAuthorizationService,
    );
  });

  it('returns success errcode and errmsg when binding', async () => {
    const response = await service.bindDevice({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
      placeId: 'place-1',
    } as any);

    expect(response.errcode).toBe(0);
    expect(response.errmsg).toBe('SUCCESS');
    expect(response.result).toContainEqual(
      expect.objectContaining({ liftNo: 1, bindingStatus: '11' }),
    );
    expect(bindingRepository.save).toHaveBeenCalledWith({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
    });
  });

  it('returns success errcode and errmsg when unbinding without prior binding', async () => {
    bindingRepository.save.mockClear();
    const response = await service.unbindDevice({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
      placeId: 'place-1',
    } as any);

    expect(response.errcode).toBe(0);
    expect(response.errmsg).toBe('SUCCESS');
    expect(response.result).toContainEqual(
      expect.objectContaining({ liftNo: 1, bindingStatus: '00' }),
    );
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });

  it('persists binding removal when unbinding existing lift', async () => {
    bindingRepository.findByUuid.mockResolvedValueOnce({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    bindingRepository.save.mockClear();
    bindingRepository.save.mockResolvedValueOnce({
      deviceUuid: '123456789012345678901234',
      liftNos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await service.unbindDevice({
      deviceUuid: '123456789012345678901234',
      liftNos: [1],
      placeId: 'place-1',
    } as any);

    expect(response.errcode).toBe(0);
    expect(bindingRepository.save).toHaveBeenCalledWith({
      deviceUuid: '123456789012345678901234',
      liftNos: [],
    });
  });

  it('marks errcode and errmsg as failure when any bind result is not successful', () => {
    const response = new BindDeviceResponseDTO();
    const results: BindDeviceResultDTO[] = [
      { liftNo: 1, bindingStatus: '11' },
      { liftNo: 2, bindingStatus: '-1' },
    ];

    (service as any).populateResponseStatus(
      response,
      results,
      new Set(['11']),
      'NOT_AUTHORIZED',
    );

    expect(response.errcode).toBe(1);
    expect(response.errmsg).toBe('NOT_AUTHORIZED');
    expect(response.result).toEqual(results);
  });

  it('returns unauthorized status when binding lift outside entitlement', async () => {
    bindingRepository.save.mockClear();
    const response = await service.bindDevice({
      deviceUuid: '123456789012345678901234',
      liftNos: [999],
      placeId: 'place-1',
    } as any);

    expect(response.errcode).toBe(1);
    expect(response.errmsg).toBe('NOT_AUTHORIZED');
    expect(response.result).toContainEqual(
      expect.objectContaining({ liftNo: 999, bindingStatus: '-1' }),
    );
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });

  it('returns unauthorized status when unbinding lift outside entitlement', async () => {
    bindingRepository.save.mockClear();
    const response = await service.unbindDevice({
      deviceUuid: '123456789012345678901234',
      liftNos: [999],
      placeId: 'place-1',
    } as any);

    expect(response.errcode).toBe(1);
    expect(response.errmsg).toBe('NOT_AUTHORIZED');
    expect(response.result).toContainEqual(
      expect.objectContaining({ liftNo: 999, bindingStatus: '-1' }),
    );
    expect(bindingRepository.save).not.toHaveBeenCalled();
  });

  it('keeps errcode success when all unbind results are successful', () => {
    const response = new BindDeviceResponseDTO();
    const results: BindDeviceResultDTO[] = [
      { liftNo: 1, bindingStatus: '00' },
      { liftNo: 2, bindingStatus: '00' },
    ];

    (service as any).populateResponseStatus(
      response,
      results,
      new Set(['00']),
      'NOT_AUTHORIZED',
    );

    expect(response.errcode).toBe(0);
    expect(response.errmsg).toBe('SUCCESS');
    expect(response.result).toEqual(results);
  });

  it('flattens nested result arrays before setting response', () => {
    const response = new BindDeviceResponseDTO();
    const results: Array<BindDeviceResultDTO | BindDeviceResultDTO[]> = [
      [{ liftNo: 1, bindingStatus: '11' }],
      { liftNo: 2, bindingStatus: '11' },
    ];

    (service as any).populateResponseStatus(
      response,
      results,
      new Set(['11']),
      'NOT_AUTHORIZED',
    );

    expect(response.result).toEqual([
      { liftNo: 1, bindingStatus: '11' },
      { liftNo: 2, bindingStatus: '11' },
    ]);
    expect(response.errcode).toBe(0);
    expect(response.errmsg).toBe('SUCCESS');
  });
});
