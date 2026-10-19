# Voz humana do próprio servidor (Chatterbox Multilingual, MIT). Ver app.py.
# Versões fixadas: as que rodaram na VPS de produção em 19/10/2026.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential && rm -rf /var/lib/apt/lists/*
# numpy antes: um pacote do Chatterbox (pkuseg) o importa na própria instalação.
RUN pip install --no-cache-dir numpy==1.26.4 setuptools wheel cython
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --no-build-isolation chatterbox-tts==0.1.4
RUN pip install --no-cache-dir fastapi==0.115.6 uvicorn==0.32.1
ENV HF_HOME=/dados/hf
COPY app.py /app/app.py
CMD ["uvicorn", "app:app", "--app-dir", "/app", "--host", "127.0.0.1", "--port", "8013"]
