export interface GameEventMap {
  [key: string]: any;
}

export type EventKey = string;
export type EventPayload<K extends EventKey> = GameEventMap[K];
export type EventCallback<K extends EventKey> = (payload: EventPayload<K>) => void;
export type UnsubscribeFn = () => void;
