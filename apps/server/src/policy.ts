import { createServer, type Server } from "node:net";
export function policyXml(gamePort: number): string {
  return `<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*" to-ports="${gamePort}" /></cross-domain-policy>`;
}
export function createPolicyServer(gamePort: number): Server {
  return createServer((socket) => {
    let input = "";
    socket.setTimeout(5000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      if (input.includes("<policy-file-request/>"))
        socket.end(policyXml(gamePort) + "\0");
      else if (input.length > 256) socket.destroy();
    });
  });
}
