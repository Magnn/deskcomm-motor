# Experiência diária da área — 03/11/2026

Destino: evolução da superfície da área já distribuída no núcleo. Não cria módulo, rota, banco, plano ou preço. A operação comum continua com a área desligada. Recursos opcionais conservam seus controles atuais.

## Referências e decisão

CHANI: hierarquia editorial e rotina pessoal, pela captura oficial em https://www.chani.com/app. Labyrinthos: ilustração, diário e navegação constante; a captura visual de aulas consultada é de 2024, não comprova a versão atual: https://www.bustle.com/life/labyrinthos-tarot-reading-app-review. A oferta atual foi conferida na Google Play: https://play.google.com/store/apps/details?id=com.labyrinthos.app. Co–Star: referência de frase pessoal e baixa densidade, em https://www.costarastrology.com/; o download direto do material visual retornou HTML e não foi tratado como captura válida.

Notas nas lojas não isolam o efeito do design. A contribuição comercial das mudanças ainda exige medir retorno, renovação e satisfação por coorte. Não se afirma aumento comprovado de vendas.

Hoje apresenta a data no fuso da organização, o cumprimento, a frase e detalhes expansíveis do número e da lua. O anel mede carta e diário, ou apenas diário sem carta habilitada. Conversa é opcional; nenhum temporizador interrompe a leitura. É possível reler passos concluídos.

Leituras apresenta os recursos habilitados em cartões antes dos demais serviços. Guia conserva o chat. Você acrescenta memórias recentes e grimório ao histórico existente. As chaves de URL hoje/explorar/conversa/trabalho continuam válidas. A barra suporta setas, Home e End.

A carta aguarda a confirmação do POST existente. Na falha, apresenta erro e retentativa sem completar o passo. A anotação aceita pelo servidor alimenta as memórias no mesmo acesso. Dez reflexões recentes são uma janela, não uma contagem de toda a história da cliente.

## Living System Checklist

1. Entrada: `page.tsx`, sessão, `dados.diario` e estado do ritual calculado no servidor.
2. Saída: `RitualDeHoje`, `MemoriasDaArea`, `ChatDaArea` e destinos das abas.
3. Registro: endpoints existentes de eventos, diário e chat; eventos locais não substituem persistência.
4. Tela: anel, conclusão, erro da carta e memórias na aba Você.
5. Porta: barra e atalhos da área; nenhuma rota nova, links anteriores preservados.
6. Anti-morte: retentativa da carta; diário preserva texto na falha; avanço explícito.
7. Configuração: controles atuais da área para carta, leituras e guia. Sem opções novas de cobrança.
8. Continuidade: mesmo `ChatDaArea`; roteamento IA/humano preservado.
9. Retorno: confirmação atualiza progresso e memória; falha não contabiliza sucesso. Nenhuma decisão nova de recomendação ou cobrança.
10. Mapa: `docs/architecture/area-experiencia.architecture.json`.

## Validação e limites

Testes de componente cobrem avanço manual, conclusão sem conversa, retentativa, memória e teclado. A bancada `.prova/` usa a `VistaDaArea` real com dados sintéticos e APIs interceptadas, em 320/390/768/1440 px. Não comprova autenticação, banco, cobrança ou deploy. Não equivale à jornada com banco fresco exigida para declarar publicação em produção.

Capturas e resultado da bancada: `C:/projetos_magno/IA/reports/misterio-visual/`.
