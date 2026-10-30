# Correção da aba vazia

A condição de nível das gravações consultava `_thaneInfo`, que vale null quando `ArmyFrameII.showTattoo` constrói `new TattooView()` para o próprio personagem. O erro #1009 interrompia o construtor durante refresh, antes de adicionar a view ao painel. O teste anterior usava um objeto artificial nesse campo e ocultava o problema.

O gate agora usa `ArmyManager.instance.thane.grades`. O ramo de inspeção foi preservado. Apenas `TattooView.setImprintState` difere do módulo anteriormente publicado; Modas e demais classes, métodos e recursos seguem protegidos pelo auditor.

O probe AIR agora exige `_thaneInfo=null`, verifica os níveis 79/80 e o ramo de inspeção. O baseline defeituoso reproduz #1009; o candidato passa sem exceção. São 12 testes de contrato SWF e nove funcionais aprovados. O TypeScript compilou e o HTTP foi conferido com o novo hash. Backup e verificação constam em blank-tab-backup.json e blank-tab-deployment.json.

A confirmação visual do painel completo no launcher continua sendo necessária após reabrir o cliente. Nenhum estado de tatuagem, recurso, email, nível ou missão foi editado por esta correção de interface.
