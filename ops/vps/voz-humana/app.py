"""
VOZ HUMANA DO PRÓPRIO SERVIDOR — o Chatterbox Multilingual (Resemble AI, MIT), a voz aberta mais
expressiva que fala português com licença comercial, para o que NÃO tem pressa: a leitura narrada, a
carta do dia, as boas-vindas.

Por que uma fila e não uma resposta na hora (medido na VPS de produção em 19/10/2026, sem GPU): o
Chatterbox leva ~4x o tempo da própria fala (15,6 s de fala em 66 s com 6 núcleos). Ao vivo, quem fala
é o serviço `voz-clonada` (OpenVoice, ~10 s por nota); aqui o pedido entra na fila, é gerado um por vez,
com prioridade baixa (nice), e quem pediu volta para buscar.

A voz: a MESMA gravação que o Voice Studio mandou para o serviço `voz-clonada` (o volume dele é
montado aqui só para leitura, em /vozes). `voice` vazio = a voz padrão do Chatterbox.

API (só em 127.0.0.1:8013; quem chega é o Caddy, pelo caminho /_humana/, com a chave):
  POST /v1/trabalhos           JSON {id, input, voice?, exaggeration?} -> {id, status, posicao}
                               (idempotente pelo id: pedir de novo devolve o trabalho que já existe)
  GET  /v1/trabalhos/{id}      -> {id, status: na_fila|gerando|pronto|falhou, posicao, segundos?}
  GET  /v1/trabalhos/{id}/audio -> mp3 (só quando pronto)
  GET  /saude
"""
import json
import os
import queue
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import torch
import torchaudio
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response

torch.set_num_threads(int(os.environ.get("VOZ_THREADS", "4")))
# O Chatterbox salva os pesos como tensores de GPU; nesta máquina não há GPU.
_carregar = torch.load
torch.load = lambda *a, **k: _carregar(*a, **{**k, "map_location": torch.device("cpu")})
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402

DADOS = Path(os.environ.get("VOZ_DADOS", "/dados"))
SAIDAS = DADOS / "saidas"
SAIDAS.mkdir(parents=True, exist_ok=True)
VOZES = Path(os.environ.get("VOZES_CLONADAS", "/vozes"))
CHAVE = os.environ.get("VOZ_HUMANA_API_KEY", "")
MAX_ENTRADA = 6000
# Trechos curtos soam melhor no Chatterbox e não estouram a memória: frases agrupadas até isto.
TRECHO = 260
ID_VALIDO = re.compile(r"^[A-Za-z0-9_-]{1,80}$")

modelo = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
fila: "queue.Queue[str]" = queue.Queue()
estado: dict[str, dict] = {}
trava = threading.Lock()
app = FastAPI()


def autorizar(authorization: str | None) -> None:
    if not CHAVE or authorization != f"Bearer {CHAVE}":
        raise HTTPException(status_code=401, detail="sem autorização")


def trechos(texto: str) -> list[str]:
    frases = re.split(r"(?<=[.!?…])\s+|\n+", texto)
    saida: list[str] = []
    atual = ""
    for f in (f.strip() for f in frases):
        if not f:
            continue
        if atual and len(atual) + len(f) + 1 > TRECHO:
            saida.append(atual)
            atual = f
        else:
            atual = f"{atual} {f}".strip()
    if atual:
        saida.append(atual)
    return saida


def referencia(voz: str) -> str | None:
    if not voz:
        return None
    if not voz.startswith("clone_") or not ID_VALIDO.match(voz):
        raise ValueError("voz inválida")
    amostras = sorted((VOZES / voz).glob("amostra-*.wav"))
    if not amostras:
        raise ValueError("voz inexistente")
    return str(amostras[0])


def gerar(trabalho_id: str) -> None:
    t = estado[trabalho_id]
    t["status"] = "gerando"
    inicio = time.time()
    try:
        ref = referencia(t["voice"])
        pausa = torch.zeros(1, int(modelo.sr * 0.35))
        partes = []
        for trecho in trechos(t["input"]):
            wav = modelo.generate(
                trecho,
                language_id="pt",
                audio_prompt_path=ref,
                exaggeration=t["exaggeration"],
                cfg_weight=0.4,
            )
            partes += [wav, pausa]
        with tempfile.TemporaryDirectory() as d:
            wav_path = Path(d) / "saida.wav"
            torchaudio.save(str(wav_path), torch.cat(partes, dim=-1), modelo.sr)
            subprocess.run(
                ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", "-b:a", "64k", str(SAIDAS / f"{trabalho_id}.mp3")],
                check=True,
                timeout=120,
            )
        t["status"] = "pronto"
    except Exception as erro:  # o motivo fica no estado; quem pediu cai para a voz rápida
        t["status"] = "falhou"
        t["motivo"] = str(erro)[:200]
    t["segundos"] = round(time.time() - inicio, 1)


def trabalhador() -> None:
    os.nice(19)  # o atendimento ao vivo (transcrição, notas de voz) vem antes
    while True:
        trabalho_id = fila.get()
        gerar(trabalho_id)


threading.Thread(target=trabalhador, daemon=True).start()


def resumo(trabalho_id: str) -> dict:
    t = estado[trabalho_id]
    posicao = list(fila.queue).index(trabalho_id) + 1 if t["status"] == "na_fila" and trabalho_id in fila.queue else 0
    r = {"id": trabalho_id, "status": t["status"], "posicao": posicao}
    for campo in ("segundos", "motivo"):
        if campo in t:
            r[campo] = t[campo]
    return r


@app.get("/saude")
def saude():
    return {"ok": True, "na_fila": fila.qsize()}


@app.post("/v1/trabalhos")
def pedir(corpo: dict, authorization: str | None = Header(default=None)):
    autorizar(authorization)
    trabalho_id = str(corpo.get("id", ""))
    if not ID_VALIDO.match(trabalho_id):
        raise HTTPException(status_code=422, detail="id inválido")
    texto = str(corpo.get("input", "")).strip()[:MAX_ENTRADA]
    if not texto:
        raise HTTPException(status_code=422, detail="texto vazio")
    with trava:
        if (SAIDAS / f"{trabalho_id}.mp3").exists():
            estado.setdefault(trabalho_id, {"status": "pronto"})["status"] = "pronto"
            return resumo(trabalho_id)
        atual = estado.get(trabalho_id)
        if atual and atual["status"] in ("na_fila", "gerando"):
            return resumo(trabalho_id)
        estado[trabalho_id] = {
            "status": "na_fila",
            "input": texto,
            "voice": str(corpo.get("voice", "") or ""),
            "exaggeration": min(1.0, max(0.25, float(corpo.get("exaggeration", 0.55)))),
        }
        fila.put(trabalho_id)
        return resumo(trabalho_id)


@app.get("/v1/trabalhos/{trabalho_id}")
def ver(trabalho_id: str, authorization: str | None = Header(default=None)):
    autorizar(authorization)
    if not ID_VALIDO.match(trabalho_id):
        raise HTTPException(status_code=404, detail="trabalho inexistente")
    if trabalho_id not in estado:
        if (SAIDAS / f"{trabalho_id}.mp3").exists():
            estado[trabalho_id] = {"status": "pronto"}
        else:
            raise HTTPException(status_code=404, detail="trabalho inexistente")
    return resumo(trabalho_id)


@app.get("/v1/trabalhos/{trabalho_id}/audio")
def audio(trabalho_id: str, authorization: str | None = Header(default=None)):
    autorizar(authorization)
    arquivo = SAIDAS / f"{trabalho_id}.mp3"
    if not ID_VALIDO.match(trabalho_id) or not arquivo.exists():
        raise HTTPException(status_code=404, detail="áudio inexistente")
    return Response(arquivo.read_bytes(), media_type="audio/mpeg")
