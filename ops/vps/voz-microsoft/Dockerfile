# Voz da Microsoft do próprio servidor (edge-tts). Ver app.py.
# Versões fixadas: as que rodaram na VPS de produção em 30/10/2026.
FROM python:3.11-slim
RUN pip install --no-cache-dir edge-tts==7.3.1 fastapi==0.115.6 uvicorn==0.32.1
COPY app.py /app/app.py
CMD ["uvicorn", "app:app", "--app-dir", "/app", "--host", "127.0.0.1", "--port", "8014"]
