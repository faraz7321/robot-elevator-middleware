export function getLiftNumber(lift: any): number {
  if (lift == null) return NaN;
  const direct = lift.lift_id ?? lift.liftNo ?? lift.id;
  if (typeof direct !== 'undefined') {
    const n = Number(direct);
    if (!isNaN(n)) return n;
  }
  const raw = lift.liftId ?? lift.lift_id_str ?? lift.identifier;
  if (raw != null) {
    const tail = String(raw).split(':').pop();
    const n = Number(tail);
    if (!isNaN(n)) return n;
  }
  return NaN;
}
