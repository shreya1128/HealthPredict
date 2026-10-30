/** Tiny pub/sub so the (non-React) API client can tell the React auth layer "the session is gone". */
type Listener = () => void;
const listeners = new Set<Listener>();

export const sessionEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emitExpired(): void {
    listeners.forEach((l) => l());
  },
};
