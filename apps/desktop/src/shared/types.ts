export interface ServerState {
  pairCode: string;
  connectedDevice?: string;
  addresses: string[];
  port: number;
  hostName: string;
}
