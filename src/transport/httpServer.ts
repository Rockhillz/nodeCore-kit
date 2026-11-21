/** The parts of `http.Server` / `https.Server` that closing needs */
export interface ClosableServer {
  close(callback?: (err?: Error) => void): unknown;
  closeIdleConnections?(): void;
  closeAllConnections?(): void;
  listening?: boolean;
}

export interface CloseHttpServerOptions {
  /**
   * How long in-flight requests may take to finish before their connections
   * are forcibly closed, in ms (default: 10000).
   */
  timeout?: number;
}

/**
 * Stops an HTTP(S) server cleanly:
 * 1. Stops accepting new connections
 * 2. Closes idle keep-alive connections right away
 * 3. Lets in-flight requests finish, up to `timeout`, then closes what's left
 *
 * Resolves once the server is fully closed. Safe to call on a server that
 * isn't listening.
 *
 * @example
 * const server = app.listen(3000);
 * gracefulShutdown({ steps: [{ name: "http", stop: () => closeHttpServer(server) }] });
 */
export const closeHttpServer = (
  server: ClosableServer,
  { timeout = 10_000 }: CloseHttpServerOptions = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (server.listening === false) return resolve();

    const forceTimer = setTimeout(() => server.closeAllConnections?.(), timeout);
    forceTimer.unref?.();

    // Keep-alive connections with no request in progress would hold the
    // server open until they time out. Connections whose request finishes
    // after this point become idle later, so keep closing idle ones until done.
    const idleTimer = setInterval(() => server.closeIdleConnections?.(), 50);
    idleTimer.unref?.();

    server.close((err?: Error & { code?: string }) => {
      clearTimeout(forceTimer);
      clearInterval(idleTimer);
      if (err && err.code !== "ERR_SERVER_NOT_RUNNING") return reject(err);
      resolve();
    });

    server.closeIdleConnections?.();
  });
