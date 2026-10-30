import { randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
const username = process.argv[2];
if (!username) {
  console.error("Uso: npm run account -- pirata");
  process.exitCode = 1;
} else {
  const store = new Store(loadConfig().dataDir);
  try {
    const password = randomBytes(18).toString("base64url");
    await store.createUser(username, password);
    console.log(
      `Conta local de replay: ${username}\nSenha gerada: ${password}\nGuarde a senha. Ela não é uma credencial do servidor online.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Falha ao criar conta",
    );
    process.exitCode = 1;
  } finally {
    store.close();
  }
}
