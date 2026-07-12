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

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "paired-devices.json");

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { devices: [] };
  }
}

export async function getPairedDevices(): Promise<PairedDevice[]> {
  const store = await readStore();
  return store.devices;
}

export async function savePairedDevice(device: PairedDevice): Promise<void> {
  const store = await readStore();
  const nextDevices = store.devices.filter((entry) => entry.deviceId !== device.deviceId);
  nextDevices.push(device);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify({ devices: nextDevices }, null, 2), "utf8");
}

