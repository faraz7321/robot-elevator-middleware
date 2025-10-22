import { Injectable } from '@nestjs/common';
import { appLogger } from '../../../logger/gcp-logger.service';
import { AccessTokenService } from '../../auth/service/accessToken.service';
import { fetchBuildingTopology } from '../../common/koneapi';
import { getLiftNumber } from '../../elevator/utils/lift-utils';
import { EnvironmentService } from '../../../core/config/environment.service';
import { BuildingTopology } from '../../common/types';

interface PlaceIdentifier {
  buildingId: string;
  groupId: string;
}

interface CachedLiftGroup {
  readonly lifts: number[];
  readonly expiresAt: number;
}

@Injectable()
export class LiftAuthorizationService {
  private readonly logger = appLogger.forContext(
    LiftAuthorizationService.name,
  );
  private readonly liftCache = new Map<string, CachedLiftGroup>();

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async getAuthorizedLiftNumbers(placeId?: string): Promise<Set<number>> {
    const identifier = this.parsePlaceId(placeId);
    if (!identifier) {
      return new Set();
    }

    const cacheKey = this.buildCacheKey(identifier);
    const cached = this.liftCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return new Set(cached.lifts);
    }

    try {
      const lifts = await this.fetchLiftNumbers(identifier);
      const expiresAt = now + this.environmentService.koneLiftCacheTtlMs;
      this.liftCache.set(cacheKey, { lifts, expiresAt });
      return new Set(lifts);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Unable to fetch lift numbers from KONE: ${message}`,
      );
      return new Set();
    }
  }

  private buildCacheKey(identifier: PlaceIdentifier): string {
    return `${identifier.buildingId}|${identifier.groupId}`;
  }

  private parsePlaceId(placeId?: string): PlaceIdentifier | null {
    if (!placeId) {
      return null;
    }

    let buildingPart = placeId;
    let groupId = '1';
    const parts = String(placeId).split(':');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        groupId = last;
        buildingPart = parts.slice(0, parts.length - 1).join(':');
      }
    }

    const buildingId = this.formatBuildingId(buildingPart);
    return { buildingId, groupId };
  }

  private formatBuildingId(id: string): string {
    return id.startsWith('building:') ? id : `building:${id}`;
  }

  private async fetchLiftNumbers(
    identifier: PlaceIdentifier,
  ): Promise<number[]> {
    const { buildingId, groupId } = identifier;
    const accessToken = await this.accessTokenService.getAccessToken(
      buildingId,
      groupId,
    );
    const topology = await fetchBuildingTopology(
      accessToken,
      buildingId,
      groupId,
    );
    return this.extractLiftNumbers(topology, groupId);
  }

  private extractLiftNumbers(
    topology: BuildingTopology | any,
    targetGroupId: string,
  ): number[] {
    const groups = (topology as any)?.groups;
    if (!Array.isArray(groups)) {
      return [];
    }

    const normalizedTarget = String(targetGroupId ?? '').trim();
    const group =
      groups.find((item: any) => {
        const raw = item?.groupId ?? item?.group_id ?? item?.id;
        if (!raw) return false;
        const suffix = String(raw).split(':').pop();
        return suffix === normalizedTarget;
      }) || groups[0];

    if (!group || !Array.isArray(group.lifts)) {
      return [];
    }

    const numbers = group.lifts
      .map((lift: any) => getLiftNumber(lift))
      .filter((n) => Number.isFinite(n)) as number[];

    return Array.from(new Set(numbers));
  }
}
