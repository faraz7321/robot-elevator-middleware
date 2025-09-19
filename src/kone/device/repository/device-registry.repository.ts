import { Injectable, Logger } from '@nestjs/common';
import {
  Firestore,
  CollectionReference,
  DocumentData,
  QueryDocumentSnapshot,
} from '@google-cloud/firestore';

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
  private readonly firestore: Firestore;
  private readonly collection: CollectionReference<DocumentData>;

  constructor() {
    const projectId =
      process.env.GCP_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT;

    const options: ConstructorParameters<typeof Firestore>[0] = {};
    if (projectId) {
      options.projectId = projectId;
    }

    this.firestore = new Firestore(options);

    const collectionName =
      process.env.DEVICE_REGISTRY_COLLECTION || 'deviceRegistrations';
    this.collection = this.firestore.collection(collectionName);
  }

  private mapSnapshot(
    snapshot: QueryDocumentSnapshot<DocumentData>,
  ): DeviceRegistryRecord | null {
    const data = snapshot.data();
    if (!data) {
      return null;
    }

    const {
      deviceUuid,
      deviceMac,
      deviceSecret,
      createdAt,
      updatedAt,
    } = data as DeviceRegistryRecord;

    return {
      deviceUuid,
      deviceMac,
      deviceSecret,
      createdAt,
      updatedAt,
    };
  }

  async findByUuid(deviceUuid: string): Promise<DeviceRegistryRecord | null> {
    try {
      const doc = await this.collection.doc(deviceUuid).get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data() as DeviceRegistryRecord | undefined;
      return data
        ? {
            deviceUuid: data.deviceUuid,
            deviceMac: data.deviceMac,
            deviceSecret: data.deviceSecret,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          }
        : null;
    } catch (error) {
      this.logger.error(
        `Failed to load device registry entry for UUID ${deviceUuid}: ${error}`,
      );
      throw error;
    }
  }

  async findByMac(deviceMac: string): Promise<DeviceRegistryRecord | null> {
    try {
      const snapshot = await this.collection
        .where('deviceMac', '==', deviceMac)
        .limit(1)
        .get();
      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return this.mapSnapshot(doc);
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
    const docRef = this.collection.doc(record.deviceUuid);
    const now = new Date().toISOString();

    try {
      const existing = await docRef.get();
      const createdAt = existing.exists
        ? (existing.data()?.createdAt as string | undefined) || now
        : now;

      const payload: DeviceRegistryRecord = {
        deviceUuid: record.deviceUuid,
        deviceMac: record.deviceMac,
        deviceSecret: record.deviceSecret,
        createdAt,
        updatedAt: now,
      };

      await docRef.set(payload, { merge: false });
      return payload;
    } catch (error) {
      this.logger.error(
        `Failed to persist device registry entry for UUID ${record.deviceUuid}: ${error}`,
      );
      throw error;
    }
  }
}
