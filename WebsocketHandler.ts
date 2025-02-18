// Utility Types
type Prettify<TObj> = {
    [TKey in keyof TObj]: TObj[TKey];
} & {};
type PartialProperty<T, K extends keyof T> = Prettify<Omit<T, K> & Partial<Pick<T, K>>>;

// Types consumed by EventListenerElement
type EventListenerSchema = {
    addEventListener(action: string, callback: EventListenerOrEventListenerObject): void;
    removeEventListener(action: string, callback: EventListenerOrEventListenerObject): void;
    dispatchEvent(event: Event): void;
}

// Class that handles adding & removing of event listeners and dispatching of events on a customWebSocket HTML element
class EventListenerElement implements EventListenerSchema {
    private element: HTMLElement;

    constructor() {
        this.element = document.createElement('customWebSocket');
    }

    addEventListener(action: string, callback: EventListenerOrEventListenerObject) {
        this.element.addEventListener(action, callback);
    }

    removeEventListener(action: string, callback: EventListenerOrEventListenerObject) {
        this.element.removeEventListener(action, callback);
    }

    dispatchEvent(event: Event) {
        this.element.dispatchEvent(event);
    }
}

// Types consumed by ListenerRegistry
type ListenerRegistrySchema = {
    set(listenerID: string, listener: Listener): void;
    get(listenerID: string): Listener | undefined;
    getListenersAndLength: () => readonly [MapIterator<[string, Listener]>, number];
    delete(listenerID: string): boolean;
}
type Listener = {
    action: string;
    callback: EventListenerOrEventListenerObject;
}

// ListenerRegistry stores all custom event listeners we have registered, mapped to a listenerID
class ListenerRegistry implements ListenerRegistrySchema {
    private listeners: Map<string, Listener>;

    constructor() {
        this.listeners = new Map();
    }

    set(listenerID: string, listener: Listener) {
        this.listeners.set(listenerID, listener);
    }

    get(listenerID: string): Listener | undefined {
        return this.listeners.get(listenerID);
    }

    getListenersAndLength() {
      return [this.listeners.entries(), this.listeners.size] as const;
    }

    delete(listenerID: string): boolean {
        return this.listeners.delete(listenerID);
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
            const disconnectEvent: Event = new CustomEvent('disconnect', { detail: event });
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
            const errorEvent: Event = new CustomEvent('error', { detail: event });
            eventListenerElement.dispatchEvent(errorEvent);
        });

        this.websocket.addEventListener('message', ({ data }) => {
            const message = JSON.parse(data);
            const dynamicMessageEvent: Event = new CustomEvent(message.action, { detail: message.data });
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

    updateWebsocketConfig(newConfig: Partial<WebSocketConfig>, triggerReconnect: boolean = false): WebSocketConfig {
        this.websocketConfig = { ...this.websocketConfig, ...newConfig };
        if (triggerReconnect) {
            this.reconnect();
        }
        return this.websocketConfig;
    }

    updateKeepAliveConfig(newConfig: Partial<KeepAliveConfig>, triggerReconnect: boolean = false): KeepAliveConfig {
        this.keepAliveConfig = { ...this.keepAliveConfig, ...newConfig };
        if (triggerReconnect) {
            this.reconnect();
        }
        return this.keepAliveConfig;
    }

    updateReconnectionConfig(newConfig: Partial<ReconnectionConfig>, triggerReconnect: boolean = false): ReconnectionConfig {
        this.reconnectionConfig = { ...this.reconnectionConfig, ...newConfig };
        if (triggerReconnect) {
            this.reconnect();
        }
        return this.reconnectionConfig;
    }

    send(action: string, data?: any) {
        if (this.websocket.readyState !== WebSocket.OPEN) {
            console.warn(
                `A send event for ${action} was received while WebSocket is in an incompatible readyState: ${this.websocket.readyState}`
            );
            return;
        }

        let messageToSend: any;

        if (typeof data === 'object') {
            messageToSend = { ...data, action: action };
        } else {
            messageToSend = {
                action,
                data,
            };
        }

        this.websocket.send(JSON.stringify(messageToSend));
    }

    addListener(action: string, callback: EventListenerOrEventListenerObject): string {
        const { eventListenerElement, listenerRegistry } = this.listenerConfig;

        eventListenerElement.addEventListener(action, callback);

        const listenerID = "UniqueID";

        listenerRegistry.set(listenerID, { action, callback });

        return listenerID;
    }

    removeListener(listenerID: string): boolean {
        const { eventListenerElement, listenerRegistry } = this.listenerConfig;

        const { action, callback } = listenerRegistry.get(listenerID) || {};

        if (!action || !callback) return false;

        eventListenerElement.removeEventListener(action, callback);

        return listenerRegistry.delete(listenerID);
    }
}
