import type { TitleConditionDefinition, TitleRequirement } from "./types.js";

const definitions: TitleConditionDefinition[] = [];
function define(type: number, key: string, domain: string, description: string, parameters: TitleConditionDefinition["parameters"] = "opaque"): void {
  definitions.push({ type, key, domain, description, parameters });
}

define(-1, "vip.membership", "vip", "Ativação vinculada à condição VIP; duração e manutenção dependem do sistema VIP.");
define(1, "altar.monsters", "altar", "Monstros eliminados no Altar Divino.");
define(2, "arena.wins", "arena", "Vitórias acumuladas na arena.");
define(3, "battlefield.kills", "battlefield", "Adversários eliminados no campo de batalha.");
define(4, "guild.battle-wins", "guild", "Primeiras colocações acumuladas em batalhas de guilda.");
define(5, "soul-seal.level", "soul-seal", "Nível do Selo das Almas.");
define(6, "cosmos.collection", "cosmos", "Posse de cosmo com o nível descrito; Para não é assumido como nível.");
define(7, "honor.points", "honor", "Fama acumulada.");
define(8, "labyrinth.floor", "labyrinth", "Conclusão do piso exigido do labirinto normal.", "target");
define(9, "abyss.floor", "labyrinth", "Conclusão do piso exigido do abismo.", "target");
define(11, "world-boss.last-hit", "world-boss", "Último golpe em um dos chefes globais associados.");
define(12, "guild.champion-president", "guild", "Presidência da guilda vencedora.");
define(13, "ranking.honor", "ranking", "Colocação no ranking de fama.");
define(14, "ranking.arena", "ranking", "Colocação no ranking do coliseu.");
define(15, "ranking.combat-power", "ranking", "Colocação no ranking de poder pessoal.");
define(16, "ranking.archer", "ranking", "Colocação no ranking de poder da classe arqueiro.");
define(17, "ranking.warrior", "ranking", "Colocação no ranking de poder da classe guerreiro.");
define(18, "ranking.mage", "ranking", "Colocação no ranking de poder da classe mago.");
define(19, "ranking.beasts", "ranking", "Colocação no ranking de feras.");
define(20, "ranking.charm", "ranking", "Colocação no ranking de charme.");
define(21, "ranking.cross-server", "ranking", "Colocação no ranking entre servidores.");
define(22, "items.glory-emblem", "items", "Condição associada ao Emblema de Glória; gatilho exato pendente.");
define(24, "gods-battle.class-winner", "gods-battle", "Resultado por classe na Batalha dos Deuses.");
define(25, "ranking.einherjar", "ranking", "Colocação no ranking de Einherjar.");
define(26, "einherjar.arena-weekly", "einherjar", "Resultado semanal por grupo na arena de Einherjar.");
define(27, "events.returning-hero", "events", "Participação no Retorno do Herói.");
define(29, "guild.cross-server-winner", "guild", "Resultado da disputa de guildas entre servidores.");
define(30, "battlefield.win-streak", "battlefield", "Vitórias consecutivas no campo de batalha.");
define(31, "trial.participation", "trial", "Participações no Julgamento TM.");
define(32, "trial.completion", "trial", "Conclusão da Torre de Julgamento.");
define(33, "einherjar.island-monsters", "einherjar", "Monstros eliminados na Ilha de Einherjar.");
define(34, "dragon-lair.floor", "dragon-lair", "Piso concluído na Toca dos Dragões.");
define(35, "hero-portal.completion", "hero-portal", "Dificuldade e avaliação de conclusão do Portal dos Heróis.");
define(36, "einherjar.quality-collection", "einherjar", "Quantidade de Einherjares por qualidade.");
define(37, "treasure-map.excavations", "treasure-map", "Mapas escavados, respeitando a qualidade mínima.");
define(38, "farm.maintenance", "farm", "Contadores independentes de vermes eliminados e ervas removidas.");
define(39, "items.title-award", "items", "Título associado a item de premiação; posse e consumo não são considerados equivalentes.");
define(44, "einherjar.equipment-refinement", "einherjar", "Atributos refinados e estrelas em equipamento de Einherjar.");
define(47, "einherjar.equipment-quality", "einherjar", "Coleção de equipamentos de Einherjar por qualidade.");
define(48, "titan.battle-placement", "titan", "Colocação na Batalha de Titã.");
define(52, "elemental-forest.completion", "elemental-forest", "Conclusão da Floresta Elemental na dificuldade exigida.");
define(53, "iron-battle.streak-rewards", "iron-battle", "Recompensas de vitórias consecutivas da Batalha de Ferro.");
define(55, "eternity.battle-placement", "eternity", "Colocação na Batalha da Eternidade.");
define(69, "peak-league.placement", "peak-league", "Colocação por grupo da Liga do Pico.");
define(100, "outskirts.monsters", "outskirts", "Tipo, nível e quantidade de monstros dos arredores.");
define(101, "planes.domination", "planes", "Domínios de planos por categoria associada.");
define(102, "fashion.level", "fashion", "Nível alcançado pelo sistema de modas.", "target");
define(103, "archaeology.level", "archaeology", "Categoria de nível de arqueologia.");
define(104, "marriage.perfection", "marriage", "Nível de perfeição do casamento.");
define(202, "mounts.ownership", "mounts", "Ativação da montaria especificada.", "mount-id");
define(203, "fashion.collection", "fashion", "Ativação de todas as peças de moda especificadas.", "fashion-ids");
define(204, "guardians.collection", "guardians", "Coleção dos guardiões especificados.");

export const titleConditions: readonly TitleConditionDefinition[] = Object.freeze(
  definitions.map(row => Object.freeze(row)),
);
const clientProgressConditions = new Set([1, 2, 3, 4, 10, 28, 30, 31, 33, 37, 38, 100, 101]);

export function describeTitleRequirement(type: number, rawParameters: string, registry: readonly TitleConditionDefinition[] = titleConditions): TitleRequirement {
  const definition = registry.find(row => row.type === type);
  const groups = rawParameters === "" ? [] : rawParameters.split("|").map(group => group === "" ? [] : group.split(",").map(value => value.trim()));
  const positiveId = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  if (definition?.parameters === "target" || definition?.parameters === "mount-id") {
    if (groups.length !== 1 || groups[0]?.length !== 1 || !positiveId(groups[0][0]!))
      throw new Error(`Condição ${type} exige um identificador/alvo positivo`);
  }
  if (definition?.parameters === "fashion-ids" && (groups.length !== 1 || !groups[0]?.length || groups[0].some(id => !positiveId(id)) || new Set(groups[0]).size !== groups[0].length))
    throw new Error(`Condição ${type} exige peças distintas e positivas`);
  return {
    conditionType: type,
    key: definition?.key ?? `unmapped:${type}`,
    domain: definition?.domain ?? "unmapped",
    description: definition?.description ?? "Condição preservada; integração e semântica ainda não identificadas.",
    definitionStatus: definition ? "documented" : "unmapped",
    evaluation: "pending-integration",
    parameterLayout: definition?.parameters ?? "opaque",
    rawParameters,
    groups,
    clientShowsProgress: clientProgressConditions.has(type),
  };
}
