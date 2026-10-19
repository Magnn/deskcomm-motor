---
impacto: capacidade_nova
secao: adicionado
titulo: Leitura narrada na voz humana (Chatterbox, em fila)
---

A leitura narrada da Mesa pode sair na voz humana: em CRM › Área do cliente › Configuração › Leitura
narrada em voz, escolha "Voz humana — pronta em alguns minutos" e, se quiser, uma voz gravada no Voice
Studio. A leitura aparece escrita na hora; o áudio, mais expressivo, é gerado numa fila no próprio
servidor (Chatterbox, licença MIT, `ops/vps/voz-humana`) e a tela avisa "fica pronta em alguns minutos"
até ele chegar. Se a voz humana falhar, a leitura sai na voz rápida. Configuração da instalação:
`VOZ_HUMANA_BASE_URL` e `VOZ_HUMANA_API_KEY`.
