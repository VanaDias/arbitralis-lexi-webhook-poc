# Arbitralis Lexi Webhook PoC

PoC de uma API para receber webhooks do WhatsApp sem bloquear a requisicao HTTP enquanto um LLM externo demora ou falha.

## Problema simulado

No fluxo sincrono, o webhook espera a resposta do LLM dentro da mesma chamada HTTP. Quando o LLM fica lento, a Meta pode encerrar a conexao por timeout e a mensagem se perde.

Nesta PoC, o endpoint `POST /webhook` responde rapidamente com `202 Accepted`, coloca o trabalho em uma fila em memoria e deixa um worker local processar o LLM em background. Ao final, um gateway mockado registra o envio da resposta ao usuario.

## Stack

- Node.js 20+
- TypeScript
- Fastify
- Vitest
- Estado em memoria

## Como rodar

Instale as dependencias:

```bash
npm install
```

Rode em modo desenvolvimento:

```bash
npm run dev
```

A API sobe por padrao em:

```text
http://localhost:3000
```

## Testar manualmente

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-001",
    "userId": "5511999999999",
    "message": "Quero negociar meu acordo",
    "metadata": {
      "channel": "whatsapp"
    }
  }'
```

Resposta esperada:

```json
{
  "status": "accepted",
  "jobId": "uuid-do-job",
  "message": "Webhook recebido. Processamento continuara em background."
}
```

Consultar status do job:

```bash
curl http://localhost:3000/jobs/uuid-do-job
```

## Testes

```bash
npm test
```

Tambem e possivel validar o build TypeScript:

```bash
npm run build
```

## Decisoes de arquitetura

- **Fila em memoria:** suficiente para a PoC e deixa claro o desacoplamento. Em producao, eu trocaria por SQS, RabbitMQ, Kafka, BullMQ/Redis ou outro mecanismo duravel.
- **Resposta HTTP 202:** comunica que o webhook foi aceito, mas ainda sera processado.
- **LLM simulado:** usa atraso aleatorio e taxa de falha para representar instabilidade de uma API externa.
- **Gateway WhatsApp mockado:** apenas loga o envio final, sem integrar com a Meta.
- **Privacidade nos logs:** identificadores sao mascarados ou resumidos. A mensagem original nao e logada em texto claro.
- **Testabilidade:** LLM, fila, logger e gateway de saida sao injetaveis, permitindo testar sucesso, falha e validacao sem sleeps reais.

## O que ficou fora

- Persistencia duravel de jobs.
- Retry com backoff e dead-letter queue.
- Idempotencia por `messageId` do WhatsApp.
- Autenticacao/validacao real da assinatura do webhook da Meta.
- Observabilidade estruturada com traces, metricas e alertas.
- Controle de concorrencia e rate limit para proteger o LLM.

Esses pontos seriam os proximos passos naturais para transformar a PoC em um servico de producao.
