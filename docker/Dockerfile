FROM pgvector/pgvector:pg17

USER root
RUN apt-get update && apt-get install -y postgresql-17-cron \
  build-essential git postgresql-server-dev-17 \
  ssl-cert \
  && git clone https://github.com/citusdata/pg_cron.git /tmp/pg_cron \
  && cd /tmp/pg_cron \
  && make && make install \
  && rm -rf /tmp/pg_cron \
  && apt-get remove -y build-essential git postgresql-server-dev-17 \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Copiar scripts SQL para inicialização
COPY ./init.sql /docker-entrypoint-initdb.d/00-init.sql
COPY ./insert-cinemas.sql /docker-entrypoint-initdb.d/01-insert-cinemas.sql
COPY ./insert-ingressos.sql /docker-entrypoint-initdb.d/02-insert-ingressos.sql

USER postgres