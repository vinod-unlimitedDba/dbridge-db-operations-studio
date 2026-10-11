import { resolveSshLocalForward } from "./ssh-terminal.mjs";

export const DATABASE_TUNNEL_ENGINES = new Set(["oracle", "postgres", "redshift", "mysql", "mariadb", "sqlserver", "synapse", "mongodb"]);

export function databaseTransport(engine, source, target, resolveForward = resolveSshLocalForward) {
  const requested = source.connectionMode === "ssh" || Boolean(source.sshTunnel);
  if (!requested) return { host: target.host, port: target.port, destinationHost: target.host, sshTunnel: null, oracleServerDN: "" };
  if (!DATABASE_TUNNEL_ENGINES.has(engine)) throw new Error("SSH database connections require a supported bundled driver. Choose Oracle, PostgreSQL, MySQL, MariaDB, SQL Server, MongoDB, Redshift, or Synapse.");
  if (!source.sshTunnel?.sessionId || !source.sshTunnel?.forwardId) throw new Error("Choose a connected SSH jump server and open the database tunnel first.");
  const route = resolveForward(source.sshTunnel.sessionId, source.sshTunnel.forwardId);
  if (route.remoteHost.toLowerCase() !== target.host.toLowerCase() || Number(route.remotePort) !== Number(target.port)) throw new Error("The database target changed. Close the old tunnel and open one for this host and port.");
  const oracleServerDN = String(source.oracleServerDN || "").trim();
  if (oracleServerDN.length > 2048 || /[\r\n\0]/.test(oracleServerDN)) throw new Error("Enter a valid Oracle server certificate DN.");
  if (engine === "oracle" && source.tlsMode === "require" && !oracleServerDN) throw new Error("Oracle TCPS through a tunnel requires the server certificate DN for identity verification. Enter the DN supplied by your DBA.");
  return { host: route.bindHost, port: String(route.localPort), destinationHost: target.host, sshTunnel: route, oracleServerDN };
}

export function mongodbTunnelOptions(connection) {
  if (!connection.sshTunnel) return {};
  // A single forward cannot route topology discovery to other replica members.
  return { directConnection: true, ...(connection.tlsMode === "require" ? { servername: connection.destinationHost } : {}) };
}
