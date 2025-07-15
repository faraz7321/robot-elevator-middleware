import * as crypto from 'crypto';

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

export function generateCheck(
  deviceUuid: string,
  ts: number,
  deviceSecret: string,
): string {
  const payload = `${deviceUuid}|${ts}|${deviceSecret}`;
  console.log('CHECK PAYLOAD:', payload);
  return md5(payload);
}

export function generateSign(
  payload: Record<string, any>,
  appname: string,
  appSecret: string,
  ts: number,
): string {
  const keys = Object.keys(payload).filter(
    (key) =>
      !['sign', 'ts', 'appname', 'secret', 'check'].includes(key) &&
      payload[key] !== '',
  );

  const kvs = keys.sort().map((key) => `${key}:${payload[key]}`);

  kvs.push(`appname:${appname}`);
  kvs.push(`secret:${appSecret}`);
  kvs.push(`ts:${ts}`);

  const signPayload = kvs.join('|');
  console.log('SIGN PAYLOAD:', signPayload);
  return md5(signPayload);
}

export function isValidRequest(
  body: Record<string, any>,
  appSecret: string,
  deviceSecret: string,
): boolean {
  const { sign, check, ts, appname, deviceUuid } = body;
  console.log('Incoming Payload Check:', {
    sign,
    check,
    ts,
    appname,
    deviceUuid,
    appSecret,
    deviceSecret,
  });

  if (
    !sign ||
    !check ||
    !ts ||
    !appname ||
    !deviceUuid ||
    !appSecret ||
    !deviceSecret
  ) {
    console.warn('Missing required fields or secrets');
    return false;
  }

  const calculatedCheck = generateCheck(deviceUuid, ts, deviceSecret);
  const calculatedSign = generateSign(body, appname, appSecret, ts);

  console.log('CALCULATED CHECK:', calculatedCheck);
  console.log('RECEIVED CHECK:', check);
  console.log('CALCULATED SIGN:', calculatedSign);
  console.log('RECEIVED SIGN:', sign);

  return calculatedCheck === check && calculatedSign === sign;
}
