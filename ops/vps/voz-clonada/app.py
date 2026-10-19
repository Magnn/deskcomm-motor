"""
VOZ CLONADA DO PRÓPRIO SERVIDOR — fala com a voz de uma pessoa a partir de uma gravação dela, sem
pagar por caractere a um provedor.

Como funciona (medido na VPS de produção em 19/10/2026, 4 núcleos, sem GPU):
  1. a fala sai do Kokoro (o mesmo `speaches` que transcreve, em 127.0.0.1:8011), na voz base do
     gênero da pessoa — ~25 s de fala em ~6 s;
  2. o OpenVoice V2 (MIT) troca o TIMBRE da fala pelo da gravação — ~25 s de fala em ~13 s.
  O Chatterbox (mais humano) foi medido também: 4x mais lento que a própria fala — não serve ao vivo.

O OpenVoice grava uma marca d'água inaudível em todo áudio gerado (wavmark): a voz clonada fica
identificável como sintética. Fica LIGADA de propósito.

API (só em 127.0.0.1:8012; quem chega é o Caddy, pelo caminho /_clonar/, com a chave):
  POST   /v1/vozes          multipart: nome, genero (feminina|masculina), arquivos[] -> {id, nome, genero}
  GET    /v1/vozes          -> {data: [{id, nome, genero, criada}]}
  DELETE /v1/vozes/{id}
  POST   /v1/audio/speech   JSON {voice, input, speed?, response_format: mp3|wav} -> áudio
  GET    /saude
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

import requests
import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from openvoice.api import ToneColorConverter

torch.set_num_threads(int(os.environ.get("VOZ_THREADS", "4")))
DADOS = Path(os.environ.get("VOZ_DADOS", "/dados"))
VOZES = DADOS / "vozes"
BASES_DIR = DADOS / "bases"
VOZES.mkdir(parents=True, exist_ok=True)
BASES_DIR.mkdir(parents=True, exist_ok=True)
CHAVE = os.environ.get("VOZ_CLONADA_API_KEY", "")
KOKORO = os.environ.get("KOKORO_URL", "http://127.0.0.1:8011").rstrip("/")
MODELO = os.environ.get("KOKORO_MODELO", "speaches-ai/Kokoro-82M-v1.0-ONNX")
# A voz base que o Kokoro fala antes da troca de timbre: a troca fica mais fiel quando o gênero bate.
BASES = {"feminina": "pf_dora", "masculina": "pm_santa"}
MAX_ENTRADA = 4000
MAX_AMOSTRAS_BYTES = 20 * 1024 * 1024

ckpt = snapshot_download("myshell-ai/OpenVoiceV2", allow_patterns=["converter/*"], local_dir=str(DADOS / "ckpt"))
conversor = ToneColorConverter(f"{ckpt}/converter/config.json", device="cpu")
conversor.load_ckpt(f"{ckpt}/converter/checkpoint.pth")
# Uma conversão por vez: são os mesmos núcleos, e duas juntas terminam as duas mais tarde.
TRAVA = threading.Lock()
app = FastAPI()


def autorizar(authorization: str | None) -> None:
    if not CHAVE or authorization != f"Bearer {CHAVE}":
        raise HTTPException(status_code=401, detail="sem autorização")


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *args], check=True, timeout=120)


def kokoro(texto: str, voz: str, velocidade: float | None, destino: Path) -> None:
    corpo = {"model": MODELO, "voice": voz, "input": texto, "response_format": "wav"}
    if velocidade:
        corpo["speed"] = velocidade
    r = requests.post(f"{KOKORO}/v1/audio/speech", json=corpo, timeout=120)
    if r.status_code != 200 or len(r.content) < 1000:
        raise HTTPException(status_code=502, detail=f"voz base respondeu {r.status_code}")
    destino.write_bytes(r.content)


def timbre_da_base(voz: str):
    """O timbre da voz base, calculado uma vez e guardado."""
    arquivo = BASES_DIR / f"{voz}.pth"
    if arquivo.exists():
        return torch.load(arquivo, map_location="cpu")
    with tempfile.TemporaryDirectory() as d:
        amostra = Path(d) / "base.wav"
        kokoro(
            "Boa noite. Hoje eu quero conversar com você com calma, sem pressa nenhuma. "
            "Respira fundo, olha para dentro, e me conta o que está pesando no seu coração. "
            "Cada caminho tem o seu tempo, e o seu também vai se abrir.",
            voz,
            None,
            amostra,
        )
        se = conversor.extract_se([str(amostra)])
    torch.save(se, arquivo)
    return se


def ler_meta(voz_id: str) -> dict:
    if not voz_id.startswith("clone_") or "/" in voz_id or ".." in voz_id:
        raise HTTPException(status_code=404, detail="voz inexistente")
    meta = VOZES / voz_id / "meta.json"
    if not meta.exists():
        raise HTTPException(status_code=404, detail="voz inexistente")
    return json.loads(meta.read_text())


@app.get("/saude")
def saude():
    return {"ok": True, "vozes": len(list(VOZES.glob("clone_*")))}


@app.get("/v1/vozes")
def listar(authorization: str | None = Header(default=None)):
    autorizar(authorization)
    metas = [json.loads(p.read_text()) for p in sorted(VOZES.glob("clone_*/meta.json"))]
    return {"data": metas}


@app.post("/v1/vozes")
async def criar(
    nome: str = Form(...),
    genero: str = Form("feminina"),
    arquivos: list[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    autorizar(authorization)
    nome = nome.strip()[:120] or "Voz clonada"
    genero = genero if genero in BASES else "feminina"
    voz_id = "clone_" + uuid.uuid4().hex[:12]
    pasta = VOZES / voz_id
    pasta.mkdir(parents=True)
    try:
        total = 0
        caminhos = []
        for i, arquivo in enumerate(arquivos[:5]):
            dados = await arquivo.read()
            total += len(dados)
            if total > MAX_AMOSTRAS_BYTES:
                raise HTTPException(status_code=413, detail="amostras grandes demais")
            bruto = pasta / f"bruto-{i}"
            bruto.write_bytes(dados)
            wav = pasta / f"amostra-{i}.wav"
            try:
                ffmpeg("-i", str(bruto), "-vn", "-ac", "1", "-ar", "22050", str(wav))
            except subprocess.CalledProcessError:
                raise HTTPException(status_code=422, detail="amostra ilegível")
            bruto.unlink()
            caminhos.append(str(wav))
        if not caminhos:
            raise HTTPException(status_code=422, detail="sem amostra")
        with TRAVA:
            se = conversor.extract_se(caminhos)
        torch.save(se, pasta / "se.pth")
        meta = {"id": voz_id, "nome": nome, "genero": genero, "criada": int(time.time())}
        (pasta / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
        return meta
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        raise


@app.delete("/v1/vozes/{voz_id}")
def apagar(voz_id: str, authorization: str | None = Header(default=None)):
    autorizar(authorization)
    ler_meta(voz_id)
    shutil.rmtree(VOZES / voz_id, ignore_errors=True)
    return {"ok": True}


@app.post("/v1/audio/speech")
def falar(corpo: dict, authorization: str | None = Header(default=None)):
    autorizar(authorization)
    meta = ler_meta(str(corpo.get("voice", "")))
    texto = str(corpo.get("input", "")).strip()[:MAX_ENTRADA]
    if not texto:
        raise HTTPException(status_code=422, detail="texto vazio")
    velocidade = corpo.get("speed")
    formato = "wav" if corpo.get("response_format") == "wav" else "mp3"
    base = BASES[meta["genero"]]
    alvo = torch.load(VOZES / meta["id"] / "se.pth", map_location="cpu")
    with tempfile.TemporaryDirectory() as d:
        fonte = Path(d) / "fonte.wav"
        saida = Path(d) / "saida.wav"
        kokoro(texto, base, float(velocidade) if velocidade else None, fonte)
        with TRAVA:
            conversor.convert(audio_src_path=str(fonte), src_se=timbre_da_base(base), tgt_se=alvo, output_path=str(saida))
        if formato == "wav":
            return Response(saida.read_bytes(), media_type="audio/wav")
        mp3 = Path(d) / "saida.mp3"
        ffmpeg("-i", str(saida), "-ac", "1", "-b:a", "64k", str(mp3))
        return Response(mp3.read_bytes(), media_type="audio/mpeg")
