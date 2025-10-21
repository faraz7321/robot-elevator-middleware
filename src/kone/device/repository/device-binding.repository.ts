import { Injectable } from '@nestjs/common';
import { Datastore, Key } from '@google-cloud/datastore';
import { appLogger } from '../../../logger/gcp-logger.service';

export interface DeviceBindingRecord {
  deviceUuid: string;
  liftNos: number[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DeviceBindingRepository {
  private readonly logger = appLogger.forContext(DeviceBindingRepository.name);
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
    this.kind =
      process.env.DEVICE_BINDING_COLLECTION ||
      process.env.DEVICE_BINDINGS_COLLECTION ||
      'deviceBindings';
  }

  private mapEntity(
    entity: Record<string, any>,
    key: Key,
  ): DeviceBindingRecord | null {
    if (!entity) {
      return null;
    }

    const rawLiftNos = Array.isArray(entity.liftNos)
      ? entity.liftNos
      : typeof entity.liftNos === 'string'
        ? entity.liftNos
            .split(',')
            .map((value: string) => Number(value.trim()))
            .filter((value: number) => Number.isFinite(value))
        : [];

    const liftNos = rawLiftNos
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value));

    return {
      deviceUuid: key.name || entity.deviceUuid,
      liftNos,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    } as DeviceBindingRecord;
  }

  async findByUuid(deviceUuid: string): Promise<DeviceBindingRecord | null> {
    const key = this.datastore.key([this.kind, deviceUuid]);

    try {
      const [entity] = await this.datastore.get(key);
      if (!entity) {
        return null;
      }
      return this.mapEntity(entity, key);
    } catch (error) {
      this.logger.error(
        `Failed to load device binding entry for UUID ${deviceUuid}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async save(
    record: Pick<DeviceBindingRecord, 'deviceUuid' | 'liftNos'>,
  ): Promise<DeviceBindingRecord> {
    const key = this.datastore.key([this.kind, record.deviceUuid]);
    const now = new Date().toISOString();

    const transaction = this.datastore.transaction();

    try {
      await transaction.run();
      const [existing] = await transaction.get(key);
      const createdAt =
        (existing && (existing.createdAt as string | undefined)) || now;

      const entity: DeviceBindingRecord = {
        deviceUuid: record.deviceUuid,
        liftNos: Array.from(new Set(record.liftNos)).sort((a, b) => a - b),
        createdAt,
        updatedAt: now,
      };

      transaction.save({ key, data: entity });
      await transaction.commit();

      return entity;
    } catch (error) {
      this.logger.error(
        `Failed to persist device binding entry for UUID ${record.deviceUuid}`,
        error instanceof Error ? error.stack : undefined,
      );
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }
}
