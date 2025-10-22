export class MacAddress {
  private constructor(private readonly value: string) {}

  static create(raw: string): MacAddress {
    if (!raw || typeof raw !== 'string') {
      throw new Error('Device MAC address is required');
    }
    const normalized = raw.trim().toUpperCase();
    if (!normalized) {
      throw new Error('Device MAC address is required');
    }
    return new MacAddress(normalized);
  }

  equals(other: MacAddress | string | null | undefined): boolean {
    if (other instanceof MacAddress) {
      return this.value === other.value;
    }
    if (typeof other === 'string') {
      return this.value === other.trim().toUpperCase();
    }
    return false;
  }

  toString(): string {
    return this.value;
  }
}
