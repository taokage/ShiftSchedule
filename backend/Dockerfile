FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app.py ./app.py
COPY shift_schedule_loader.py shift_schedule_solver.py shift_schedule_constraints.py shift_schedule_objective.py shift_schedule_exporter.py ./

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
