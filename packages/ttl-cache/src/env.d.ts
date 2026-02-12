// Ambient declarations for globals used by the library.
// This avoids pulling in DOM or @types/node as dependencies.

declare function setInterval(callback: () => void, ms: number): unknown;
declare function clearInterval(handle: unknown): void;

declare class DOMException extends Error {
  constructor(message?: string, name?: string);
  readonly name: string;
}

declare class AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
  addEventListener(
    type: string,
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(type: string, listener: () => void): void;
}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
