function normalizeLiftNumber(input: number): number | null {
  if (!Number.isFinite(input)) {
    return null;
  }
  const normalized = Math.trunc(input);
  return normalized >= 0 ? normalized : null;
}

export class DeviceBinding {
  private readonly liftNos: Set<number>;

  constructor(
    public readonly deviceUuid: string,
    initialLiftNos: Iterable<number> = [],
  ) {
    this.liftNos = new Set<number>();
    for (const liftNo of initialLiftNos) {
      const normalized = normalizeLiftNumber(liftNo);
      if (normalized !== null) {
        this.liftNos.add(normalized);
      }
    }
  }

  bind(liftNo: number): boolean {
    const normalized = normalizeLiftNumber(liftNo);
    if (normalized === null) {
      return false;
    }
    if (this.liftNos.has(normalized)) {
      return false;
    }
    this.liftNos.add(normalized);
    return true;
  }

  unbind(liftNo: number): boolean {
    const normalized = normalizeLiftNumber(liftNo);
    if (normalized === null) {
      return false;
    }
    return this.liftNos.delete(normalized);
  }

  has(liftNo: number): boolean {
    const normalized = normalizeLiftNumber(liftNo);
    if (normalized === null) {
      return false;
    }
    return this.liftNos.has(normalized);
  }

  toArray(): number[] {
    return Array.from(this.liftNos).sort((a, b) => a - b);
  }
}
