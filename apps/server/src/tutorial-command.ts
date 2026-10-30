import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { compileTutorial, loadScenario } from "./tutorial.js";
import { randomBytes } from "node:crypto";
const config = loadConfig();
const store = new Store(config.dataDir);
try {
  const [command, argument, connection] = process.argv.slice(2);
  if (command === "compile") {
    const scenario = compileTutorial(store, Number(argument), connection);
    console.log(
      JSON.stringify(
        {
          userId: scenario.userId,
          steps: scenario.steps.length,
          lastProcess: scenario.lastProcess,
          registration: scenario.registration,
        },
        null,
        2,
      ),
    );
  } else if (command === "account") {
    const scenario = loadScenario(store);
    const password = randomBytes(18).toString("base64url");
    const uid =
      config.tutorialEngine === "capture"
        ? scenario.userId
        : Number(
            store.db.prepare("SELECT MAX(id) AS id FROM users").get()!.id ??
              scenario.userId,
          ) + 1;
    await store.createUser(argument ?? "pirata_local", password, uid);
    store.initTutorialProfile(uid);
    console.log(
      `Conta local: ${argument ?? "pirata_local"}\nSenha: ${password}\nID: ${uid}\nTutorial dinâmico: escolha qualquer uma das seis opções iniciais.`,
    );
  } else if (command === "reset-all") {
    const username = argument ?? "pirata_teste";
    const password = randomBytes(18).toString("base64url");
    const result = await store.resetTutorialAccounts(username, password);
    console.log(
      `Contas locais reiniciadas: ${result.accounts}\nConta padrão: ${username}\nSenha: ${password}\nID: ${result.userId}\nTodas as contas voltaram à criação. Senhas antigas foram preservadas; a senha da conta padrão foi renovada. Reinicie o servidor e faça login novamente.`,
    );
  } else if (command === "reset") {
    const scenario = loadScenario(store);
    const user = store.user(argument ?? "");
    if (
      !user ||
      (config.tutorialEngine === "capture" && user.id !== scenario.userId)
    )
      throw new Error("Conta local não corresponde ao percurso");
    store.db
      .prepare(
        "UPDATE tutorial_profiles SET active=0,process=0,nickname='',sex=0,icon=0 WHERE user_id=?",
      )
      .run(user.id);
    store.db
      .prepare("DELETE FROM tutorial_worlds WHERE user_id=?")
      .run(user.id);
    store.db.prepare("DELETE FROM city_worlds WHERE user_id=?").run(user.id);
    console.log(
      "Perfil local voltou à criação do personagem. A senha foi preservada; feche e abra a sessão do jogo.",
    );
  } else {
    throw new Error(
      "Uso: npm run tutorial -- compile <userId> [connection] | account <username> | reset <username> | reset-all [username padrão]",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha no tutorial");
  process.exitCode = 1;
} finally {
  store.close();
}
