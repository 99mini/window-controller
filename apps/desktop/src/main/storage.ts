import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type PairedDevice = {
  deviceId: string;
  deviceName: string;
  token: string;
  pairedAt: string;
};

type StoreShape = {
  devices: PairedDevice[];
};

async function readStore(storePath: string): Promise<StoreShape> {
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { devices: [] };
  }
}

export async function getPairedDevices(dataDir: string): Promise<PairedDevice[]> {
  const store = await readStore(path.join(dataDir, "paired-devices.json"));
  return store.devices;
}

export async function savePairedDevice(
  device: PairedDevice,
  dataDir: string,
): Promise<void> {
  const storePath = path.join(dataDir, "paired-devices.json");
  const store = await readStore(storePath);
  const nextDevices = store.devices.filter((e) => e.deviceId !== device.deviceId);
  nextDevices.push(device);
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify({ devices: nextDevices }, null, 2), "utf8");
}
