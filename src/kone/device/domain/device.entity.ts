import { MacAddress } from './mac-address.value';

export interface DeviceSnapshot {
  readonly deviceUuid: string;
  readonly deviceMac: string;
  readonly deviceSecret: string;
}

interface DeviceProps {
  readonly uuid: string;
  readonly mac: MacAddress;
  readonly secret: string;
}

export class Device {
  constructor(private readonly props: DeviceProps) {}

  static fromSnapshot(snapshot: DeviceSnapshot): Device {
    return new Device({
      uuid: snapshot.deviceUuid,
      mac: MacAddress.create(snapshot.deviceMac),
      secret: snapshot.deviceSecret,
    });
  }

  get uuid(): string {
    return this.props.uuid;
  }

  get mac(): MacAddress {
    return this.props.mac;
  }

  get secret(): string {
    return this.props.secret;
  }

  matchesMac(value: string | MacAddress): boolean {
    return this.props.mac.equals(value);
  }

  toSnapshot(): DeviceSnapshot {
    return {
      deviceUuid: this.uuid,
      deviceMac: this.mac.toString(),
      deviceSecret: this.secret,
    };
  }
}
