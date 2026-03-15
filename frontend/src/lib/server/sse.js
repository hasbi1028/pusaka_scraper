const subscribers = new Set();

export function subscribe(onMessage) {
    subscribers.add(onMessage);
    return () => subscribers.delete(onMessage);
}

export function notify() {
    for (const send of subscribers) {
        send('update');
    }
}
