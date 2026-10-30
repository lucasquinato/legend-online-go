import { randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { CityWorld } from "./city-world.js";

const store = new Store(loadConfig().dataDir);
try {
  const username = process.argv[2] ?? "pirata_cidade";
  if (store.user(username))
    throw new Error(
      "Conta já existe; escolha outro nome para preservar o progresso.",
    );
  const uid =
    Math.max(
      1826,
      Number(
        store.db.prepare("SELECT MAX(id) AS id FROM users").get()!.id ?? 0,
      ),
    ) + 1;
  const password = randomBytes(18).toString("base64url");
  await store.createUser(username, password, uid);
  store.initTutorialProfile(uid);
  store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=4,sex=0,nickname=?,process=19500 WHERE user_id=?",
    )
    .run(username, uid);
  store.db
    .prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?)")
    .run(
      uid,
      JSON.stringify({
        version: 1,
        wins: [0, 1, 2],
        process: 19500,
        cityEntered: true,
        complete: true,
        rewardCount: 3,
      }),
    );
  new CityWorld(store, uid).persist();
  console.log(
    `Conta local: ${username}\nSenha: ${password}\nID: ${uid}\nGuerreira na cidade, antes do recrutamento. Sem repetir o tutorial.`,
  );
} finally {
  store.close();
}
