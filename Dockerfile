FROM python:3.12-slim

WORKDIR /app

# Cai dat dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toan bo code nguon
COPY . .

# Port mac dinh (Render, Railway, Koyeb se override qua bien PORT)
ENV PORT=8000
EXPOSE 8000

CMD ["python", "app.py"]
