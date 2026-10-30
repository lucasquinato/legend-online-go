# Regras de manutenção do servidor

## Interfaces Flash e recursos SWF

Antes de criar, editar ou reconstruir módulos SWF, leia `scripts/swf/README.md`.
Use `reference/ui-compat/release-lock.json` como âncora de versão. Arquivos
canônicos antigos do cache não são bases válidas para os módulos atuais.

Preserve byte a byte as classes e recursos fora da lista explícita de alteração.
Modas já foi concluído; alterações em outros sistemas não podem modificar seu
comportamento. Verifique todas as interfaces compartilhadas no mesmo módulo.

Use o auditor de bytecode e o teste no AIR real antes de publicar um candidato.
Não aceitar ABC vazio, VerifyError ou módulos de versões misturadas. Validação de
hash e exportação AS3, sozinhas, não comprovam compatibilidade no runtime.

Não execute Prettier nem outro formatter neste projeto.
