FROM mirror.gcr.io/library/python:3.12-slim
RUN pip install --no-cache-dir python-snap7==2.0.2
COPY server.py /server.py
CMD ["python", "-u", "/server.py"]
