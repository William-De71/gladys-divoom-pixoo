// -----------------------------------------------------------------------------
// Finding the Pixoo displays.
//
//   cloud     the official Divoom "Find device" service
//             (`POST https://app.divoom-gz.com/Device/ReturnSameLANDevice`,
//             no account, no body) lists the Divoom devices that reach the
//             Divoom cloud from the same public IP address as the caller,
//             with their local address, their Divoom id and their MAC. It is
//             how the Divoom app finds them; the Pixoo announces nothing on
//             the LAN (no mDNS, no SSDP).
//   typed     the addresses of the configuration, for a network where the
//             cloud search is off or cannot work (several public addresses,
//             a VPN, a Pixoo with no Internet access).
//
// The MAC (or the Divoom id) is the stable identity of a display; a typed
// address the cloud does not know keeps its address as identity.
// -----------------------------------------------------------------------------

export const CLOUD_DISCOVERY_URL = 'https://app.divoom-gz.com/Device/ReturnSameLANDevice';
const CLOUD_TIMEOUT_MS = 8000;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * @description The IPv4 addresses typed in the configuration.
 * @param {string} raw - `192.168.1.50, 192.168.1.51`.
 * @returns {string[]} Valid addresses, without duplicates, in order.
 */
export function parseHosts(raw) {
  const hosts = String(raw ?? '')
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter((value) => IPV4.test(value));
  return [...new Set(hosts)];
}

/**
 * @description A MAC address as 12 lowercase hex digits.
 * @param {*} value - `A8:03:2A:FF:46:B1`, `a8032aff46b1`…
 * @returns {string} `a8032aff46b1`, or '' when it is not a MAC address.
 */
export function normalizeMac(value) {
  const hex = String(value ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return hex.length === 12 && hex !== '000000000000' ? hex : '';
}

/**
 * @description Read the answer of the Divoom "Find device" service.
 * @param {object} body - `{ ReturnCode, DeviceList: [{ DeviceName, DeviceId, DevicePrivateIP, DeviceMac }] }`.
 * @returns {Array<{ name: string, divoomId: string, host: string, mac: string }>} The devices with a valid address.
 */
export function parseCloudDevices(body) {
  if (!body || typeof body !== 'object') {
    return [];
  }
  if (body.ReturnCode !== undefined && Number(body.ReturnCode) !== 0) {
    throw new Error(`Divoom answered ReturnCode ${body.ReturnCode}`);
  }
  const list = Array.isArray(body.DeviceList) ? body.DeviceList : [];
  return list
    .map((device) => ({
      name: String(device?.DeviceName ?? '').trim(),
      divoomId: /^\d{1,15}$/.test(String(device?.DeviceId ?? '')) ? String(device.DeviceId) : '',
      host: String(device?.DevicePrivateIP ?? '').trim(),
      mac: normalizeMac(device?.DeviceMac),
    }))
    .filter((device) => IPV4.test(device.host));
}

/**
 * @description Ask the Divoom "Find device" service.
 * @param {Function} fetch - fetch.
 * @returns {Promise<Array<object>>} See parseCloudDevices.
 */
export async function cloudDiscovery(fetch) {
  const response = await fetch(CLOUD_DISCOVERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new Error('the answer is not JSON');
  }
  return parseCloudDevices(body);
}

/**
 * @description The platform id of a display: its MAC, else its Divoom id,
 * else its address (typed address the cloud does not know).
 * @param {{ mac?: string, divoomId?: string, host: string }} device - The display.
 * @returns {string} `a8032aff46b1`, `divoom-300000020` or `ip-192-168-1-50`.
 */
export function platformId({ mac, divoomId, host }) {
  if (normalizeMac(mac)) {
    return normalizeMac(mac);
  }
  if (/^\d{1,15}$/.test(String(divoomId ?? ''))) {
    return `divoom-${divoomId}`;
  }
  return `ip-${String(host).replace(/\./g, '-')}`;
}
