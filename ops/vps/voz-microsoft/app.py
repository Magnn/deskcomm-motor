"""
VOZ DA MICROSOFT DO PRÓPRIO SERVIDOR — as vozes neurais de português do Brasil do "Ler em voz alta"
do Edge, pelo pacote aberto `edge-tts`, sem custo por caractere.

Não é um serviço contratado: é a mesma chamada que o navegador faz, sem garantia nenhuma. A Microsoft
pode limitar ou mudar sem aviso. Por isso fica fora do app (atualiza o pacote sem publicar o sistema)
e por isso a agente precisa de uma reserva em "Se a voz principal falhar".

Medido da VPS de produção em 30/10/2026, 20 pedidos de cada, sem repetir:
  Francisca -10%/-2Hz: 20/20, mediana 0,3 s
  Thalita    -6%/0Hz:  18/20, mediana 0,4 s
  Thalita  -14%/-3Hz:   8/20, mediana 0,5 s
A falha vem como "nenhum áudio recebido", ao acaso, às vezes depois de ~8 s. Daí as tentativas, com
limite curto em cada uma.

API (só em 127.0.0.1:8014; quem chega é o Caddy, pelo caminho /_microsoft/, com a chave):
  POST /v1/audio/speech   JSON {voice, input, speed?} -> mp3
  GET  /saude
"""
import asyncio
import os

import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

CHAVE = os.environ.get("VOZ_MICROSOFT_API_KEY", "")
MAX_ENTRADA = 6000
TENTATIVAS = 4
LIMITE_POR_TENTATIVA_S = 8
ESPERA_ENTRE_TENTATIVAS_S = 0.3

# Velocidade e tom de base de cada voz: os das amostras que o dono ouviu.
VOZES = {
    "ms_francisca": ("pt-BR-FranciscaNeural", -10, "-2Hz"),
    "ms_thalita": ("pt-BR-ThalitaMultilingualNeural", -6, "+0Hz"),
}

app = FastAPI()


class Pedido(BaseModel):
    voice: str
    input: str
    speed: float | None = None


def ritmo(base: int, velocidade: float | None) -> str:
    total = base + round(((velocidade or 1) - 1) * 100)
    return f"{total:+d}%"


async def uma_tentativa(texto: str, voz: str, rate: str, pitch: str) -> bytes:
    pedacos = []
    async for parte in edge_tts.Communicate(texto, voz, rate=rate, pitch=pitch).stream():
        if parte["type"] == "audio":
            pedacos.append(parte["data"])
    return b"".join(pedacos)


@app.get("/saude")
def saude():
    return {"ok": True}


@app.post("/v1/audio/speech")
async def falar(p: Pedido, authorization: str = Header(default="")):
    if not CHAVE or authorization != f"Bearer {CHAVE}":
        raise HTTPException(status_code=401)
    voz = VOZES.get(p.voice)
    texto = p.input.strip()[:MAX_ENTRADA]
    if not voz or not texto:
        raise HTTPException(status_code=400)
    nome, base, pitch = voz
    rate = ritmo(base, p.speed)
    ultimo = "sem tentativa"
    for tentativa in range(TENTATIVAS):
        if tentativa:
            await asyncio.sleep(ESPERA_ENTRE_TENTATIVAS_S)
        try:
            audio = await asyncio.wait_for(uma_tentativa(texto, nome, rate, pitch), LIMITE_POR_TENTATIVA_S)
            if audio:
                return Response(content=audio, media_type="audio/mpeg")
            ultimo = "vazio"
        except Exception as e:  # noqa: BLE001 - toda falha do serviço externo vira nova tentativa
            ultimo = type(e).__name__
    print(f"[voz-microsoft] sem áudio depois de {TENTATIVAS} tentativas: {ultimo}", flush=True)
    raise HTTPException(status_code=503)
