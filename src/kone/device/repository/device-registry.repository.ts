import { Injectable, Logger } from '@nestjs/common';
import { Datastore, Key } from '@google-cloud/datastore';

export interface DeviceRegistryRecord {
  deviceUuid: string;
  deviceMac: string;
  deviceSecret: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DeviceRegistryRepository {
  private readonly logger = new Logger(DeviceRegistryRepository.name);
  private readonly datastore: Datastore;
  private readonly kind: string;

  constructor() {
    const projectId =
      process.env.GCP_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT;

    const options: ConstructorParameters<typeof Datastore>[0] = {};
    if (projectId) {
      options.projectId = projectId;
    }

    this.datastore = new Datastore(options);

    this.kind = process.env.DEVICE_REGISTRY_COLLECTION || 'deviceRegistrations';
  }

  private mapEntity(
    entity: Record<string, any>,
    key: Key,
  ): DeviceRegistryRecord | null {
    if (!entity) {
      return null;
    }

    return {
      deviceUuid: key.name || entity.deviceUuid,
      deviceMac: entity.deviceMac,
      deviceSecret: entity.deviceSecret,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    } as DeviceRegistryRecord;
  }

  async findByUuid(deviceUuid: string): Promise<DeviceRegistryRecord | null> {
    const key = this.datastore.key([this.kind, deviceUuid]);

    try {
      const [entity] = await this.datastore.get(key);
      if (!entity) {
        return null;
      }
      return this.mapEntity(entity, key);
    } catch (error) {
      this.logger.error(
        `Failed to load device registry entry for UUID ${deviceUuid}: ${error}`,
      );
      throw error;
    }
  }

  async findByMac(deviceMac: string): Promise<DeviceRegistryRecord | null> {
    const query = this.datastore
      .createQuery(this.kind)
      .filter('deviceMac', '=', deviceMac)
      .limit(1);

    try {
      const [entities] = await this.datastore.runQuery(query);
      if (!entities || entities.length === 0) {
        return null;
      }
      const entity = entities[0];
      return this.mapEntity(entity, entity[Datastore.KEY]);
    } catch (error) {
      this.logger.error(
        `Failed to load device registry entry for MAC ${deviceMac}: ${error}`,
      );
      throw error;
    }
  }

  async save(
    record: Pick<
      DeviceRegistryRecord,
      'deviceUuid' | 'deviceMac' | 'deviceSecret'
    >,
  ): Promise<DeviceRegistryRecord> {
    const key = this.datastore.key([this.kind, record.deviceUuid]);
    const now = new Date().toISOString();

    const transaction = this.datastore.transaction();

    try {
      await transaction.run();
      const [existing] = await transaction.get(key);
      const createdAt =
        (existing && (existing.createdAt as string | undefined)) || now;

      const entity = {
        deviceUuid: record.deviceUuid,
        deviceMac: record.deviceMac,
        deviceSecret: record.deviceSecret,
        createdAt,
        updatedAt: now,
      } as DeviceRegistryRecord;

      transaction.save({ key, data: entity });
      await transaction.commit();

      return entity;
    } catch (error) {
      this.logger.error(
        `Failed to persist device registry entry for UUID ${record.deviceUuid}: ${error}`,
      );
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }
}
