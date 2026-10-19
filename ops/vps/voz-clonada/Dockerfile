# Voz clonada do próprio servidor (OpenVoice V2 sobre o Kokoro). Ver app.py.
# Versões fixadas: as que rodaram na VPS de produção em 19/10/2026.
FROM python:3.10-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch==2.3.1 torchaudio==2.3.1 --extra-index-url https://download.pytorch.org/whl/cpu
# Sem as dependências declaradas do OpenVoice: elas fixam um faster-whisper/av que não compila, e o
# serviço só usa o conversor de timbre.
RUN pip install --no-cache-dir --no-deps "git+https://github.com/myshell-ai/OpenVoice.git@74a1d147b17a8c3092dd5430504bd83ef6c7eb23"
RUN pip install --no-cache-dir numpy==1.26.4 librosa==0.10.2.post1 soundfile==0.14.0 resampy==0.4.3 wavmark==0.0.3 \
    pydub==0.25.1 unidecode==1.3.8 inflect==7.4.0 eng_to_ipa==0.0.2 pypinyin==0.53.0 jieba==0.42.1 cn2an==0.5.22 \
    huggingface_hub==0.26.2 fastapi==0.115.6 uvicorn==0.32.1 python-multipart==0.0.20 requests==2.32.3
COPY app.py /app/app.py
CMD ["uvicorn", "app:app", "--app-dir", "/app", "--host", "127.0.0.1", "--port", "8012"]
