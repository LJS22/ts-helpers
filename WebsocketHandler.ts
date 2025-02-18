// Utility Types
type Prettify<TObj> = {
    [TKey in keyof TObj]: TObj[TKey];
} & {};
type PartialProperty<TObj, K extends keyof TObj> = Prettify<Omit<TObj, K> & Partial<Pick<TObj, K>>>;

// EventMap holds all the events the WS can handle and the respective data types we expect to receive within the callback
type EventMap = {
    connect: void;
    disconnect: { reason: string };
    error: { message: string, code: number };
    message: unknown;
}

// Types consumed by EventListenerElement
type EventListenerSchema = {
    addEventListener<TData>(action: string, callback: (data: TData) => void): void;
    removeEventListener<TData>(action: string, callback: (data: TData) => void): void;
    dispatchEvent(event: Event): void;
}

// Class that handles adding & removing of event listeners and dispatching of events on a customWebSocket HTML element
class EventListenerElement implements EventListenerSchema {
    private element: HTMLElement;

    constructor() {
        this.element = document.createElement('customWebSocket');
    }

    addEventListener<TData>(action: string, callback: (data: TData) => void) {
        this.element.addEventListener(action, callback as EventListenerOrEventListenerObject);
    }

    removeEventListener<TData>(action: string, callback: (data: TData) => void) {
        this.element.removeEventListener(action, callback as EventListenerOrEventListenerObject);
    }

    dispatchEvent(event: Event) {
        this.element.dispatchEvent(event);
    }
}

// Types consumed by ListenerRegistry
type ListenerRegistrySchema = {
    set(listenerID: string, listener: Listener<keyof EventMap>): void;
    get(listenerID: string): Listener<keyof EventMap> | undefined;
    delete(listenerID: string): boolean;
    getListenersAndLength(): readonly [MapIterator<[string, Listener<keyof EventMap>]>, number];
}
type Listener<TKey extends keyof EventMap> = {
    action: TKey;
    callback: (data: EventMap[TKey]) => void;
};

// ListenerRegistry stores all custom event listeners we have registered, mapped to a listenerID
// Listeners are stored as generic types and cast back to their respective type when accessed
class ListenerRegistry implements ListenerRegistrySchema {
    private listeners: Map<string, { action: keyof EventMap; callback: (data: unknown) => void }>;

    constructor() {
        this.listeners = new Map();
    }

    set<TKey extends keyof EventMap>(listenerID: string, listener: Listener<TKey>) {
        this.listeners.set(listenerID, {
            action: listener.action,
            callback: listener.callback as (data: unknown) => void
        });
    }

    get<TKey extends keyof EventMap>(listenerID: string): Listener<TKey> | undefined {
        const entry = this.listeners.get(listenerID);
        if (entry) {
            return {
                action: entry.action as TKey,
                callback: entry.callback as (data: EventMap[TKey]) => void
            };
        }
        return undefined;
    }

    delete(listenerID: string): boolean {
        return this.listeners.delete(listenerID);
    }

    getListenersAndLength() {
      return [this.listeners.entries(), this.listeners.size] as const;
    }
}

// Types consumed by WebsocketWrapper
type WebSocketConfig = {
    url: string;
    queryStringParameters: string;
}
type WebSocketParameters = PartialProperty<WebSocketConfig, "queryStringParameters">
type KeepAliveConfig = {
    shouldSendKeepAlive: boolean;
    keepAliveIntervalTimeMs: number;
}
type ReconnectionConfig = {
  reconnectOnDisconnect: boolean;
  reconnectionTimeoutTimeMs: number;
}
type ListenerConfigType = {
  listenerRegistry: ListenerRegistry;
  eventListenerElement: EventListenerElement
}
type ConfigMapping = {
    websocket: WebSocketConfig,
    keepAlive: KeepAliveConfig,
    reconnection: ReconnectionConfig
};

/*
WebsocketWrapper provides the means to interact with a WebSocket, including:
 - adding and removing custom event listeners and callbacks
 - sending messages up the WebSocket
 - keep alive logic
 - reconnect logic
*/
class WebsocketWrapper {
    private websocket: WebSocket;
    private websocketConfig: WebSocketConfig;
    private keepAliveConfig: Prettify<KeepAliveConfig & { keepAliveInterval?: number}>;
    private reconnectionConfig: ReconnectionConfig;
    private listenerConfig: ListenerConfigType;

    constructor(websocketParameters: WebSocketParameters, keepAliveConfig?: KeepAliveConfig, reconnectionConfig?: ReconnectionConfig) {
        const { url, queryStringParameters = '' } = websocketParameters;
        this.websocketConfig = {
            url: url,
            queryStringParameters,
        };

        const { shouldSendKeepAlive = false, keepAliveIntervalTimeMs = 9 * 60 * 1000 } = keepAliveConfig ?? {};
        this.keepAliveConfig = {
          shouldSendKeepAlive,
          keepAliveIntervalTimeMs
        }

        const { reconnectOnDisconnect = false, reconnectionTimeoutTimeMs = 5000 } = reconnectionConfig ?? {};
        this.reconnectionConfig = {
          reconnectOnDisconnect,
          reconnectionTimeoutTimeMs
        }

        this.listenerConfig = {
          listenerRegistry: new ListenerRegistry(),
          eventListenerElement: new EventListenerElement()
        }

        this.websocket = new WebSocket(`${url}?${queryStringParameters}`);
        this.addBaseListeners();
    }

    private addBaseListeners() {
        const { eventListenerElement } = this.listenerConfig;

        this.websocket.addEventListener('open', () => {
            const connectedEvent: Event = new Event('connect');
            eventListenerElement.dispatchEvent(connectedEvent);

            const { shouldSendKeepAlive, keepAliveIntervalTimeMs } = this.keepAliveConfig;
            if (shouldSendKeepAlive) {
                this.keepAliveConfig.keepAliveInterval = setInterval(() => {
                    this.send('keepAlive');
                }, keepAliveIntervalTimeMs);
            }
        });

        this.websocket.addEventListener('close', (event) => {
            const disconnectEvent: CustomEvent = new CustomEvent('disconnect', { detail: event });
            eventListenerElement.dispatchEvent(disconnectEvent);

            clearInterval(this.keepAliveConfig.keepAliveInterval);

            const { reconnectOnDisconnect, reconnectionTimeoutTimeMs } = this.reconnectionConfig;
            if (reconnectOnDisconnect) {
                setTimeout(() => {
                    this.reconnect();
                }, reconnectionTimeoutTimeMs);
            }
        });

        this.websocket.addEventListener('error', (event) => {
            const errorEvent: CustomEvent = new CustomEvent('error', { detail: event });
            eventListenerElement.dispatchEvent(errorEvent);
        });

        this.websocket.addEventListener('message', ({ data }) => {
            const message = JSON.parse(data);
            const dynamicMessageEvent: CustomEvent = new CustomEvent(message.action, { detail: message.data });
            eventListenerElement.dispatchEvent(dynamicMessageEvent);
        });
    }

    get config() {
        return { 
            websocketConfig: this.websocketConfig,
            keepAliveConfig: this.keepAliveConfig,
            reconnectionConfig: this.reconnectionConfig,
            listenerConfig: this.listenerConfig
        } as const;
    }

    private reconnect() {
        this.removeAllEventListeners();
        this.listenerConfig.eventListenerElement = new EventListenerElement();
        this.listenerConfig.listenerRegistry = new ListenerRegistry();
        
        const { url, queryStringParameters } = this.websocketConfig;
        this.websocket = new WebSocket(`${url}?${queryStringParameters}`);
        this.addBaseListeners();
    }

    private removeAllEventListeners() {
      const { eventListenerElement, listenerRegistry } = this.listenerConfig;

        const [allListeners, numberOfListeners] = listenerRegistry.getListenersAndLength();
        for (let i = 0; i < numberOfListeners; i++) {
            const listener = allListeners.next().value;
            if (listener) {
                eventListenerElement.removeEventListener(listener[1].action, listener[1].callback)
            }
        }
    }

    updateConfig<K extends keyof ConfigMapping>(configType: K, newConfig: Partial<ConfigMapping[K]>, triggerReconnect: boolean = false) {
        let updatedConfig;

        switch(configType) {
            case "websocket":
                updatedConfig = { ...this.websocketConfig, ...newConfig };
                this.websocketConfig = updatedConfig;
                break;
            case "keepAlive":
                updatedConfig = { ...this.keepAliveConfig, ...newConfig };
                this.keepAliveConfig = updatedConfig;
                break;
            case "reconnection":
                updatedConfig = { ...this.reconnectionConfig, ...newConfig };
                this.reconnectionConfig = updatedConfig;
                break; 
            default:
                console.error(`Invalid ConfigType ${configType}`);
                break
        }

        if (triggerReconnect) {
            this.reconnect();
        }

        return updatedConfig;   
    }

    send(action: string, data?: unknown) {
        if (this.websocket.readyState !== WebSocket.OPEN) {
            console.warn(`A send event for ${action} was received while WebSocket is in an incompatible readyState: ${this.websocket.readyState}`);
            return;
        }

        const message = data ? { action, data } : { action };
        this.websocket.send(JSON.stringify(message));
    }

    addListener<TKey extends keyof EventMap>(action: TKey, callback: (data: EventMap[TKey]) => void) {
        const { eventListenerElement, listenerRegistry } = this.listenerConfig;

        eventListenerElement.addEventListener<EventMap[TKey]>(action, callback);

        const listenerID = `listener-${Math.random().toString(36).slice(2)}`;

        listenerRegistry.set<TKey>(listenerID, { action, callback });

        return listenerID;
    }

    removeListener<TKey extends keyof EventMap>(listenerID: string) {
        const { eventListenerElement, listenerRegistry } = this.listenerConfig;

        const { action, callback } = listenerRegistry.get<TKey>(listenerID) || {};

        if (!action || !callback) return false;

        eventListenerElement.removeEventListener(action, callback);

        return listenerRegistry.delete(listenerID);
    }
}
