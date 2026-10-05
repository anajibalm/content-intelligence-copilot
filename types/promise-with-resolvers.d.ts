interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

declare interface PromiseConstructor {
  withResolvers<T>(): PromiseWithResolvers<T>;
}
