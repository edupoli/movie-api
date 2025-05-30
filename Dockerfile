FROM pgvector/pgvector:pg17

# Instalar dependências e pg_cron
RUN apt-get update && apt-get install -y \
  build-essential \
  git \
  postgresql-server-dev-17 \
  && git clone https://github.com/citusdata/pg_cron.git /tmp/pg_cron \
  && cd /tmp/pg_cron \
  && make && make install \
  && rm -rf /tmp/pg_cron \
  && apt-get remove -y build-essential git postgresql-server-dev-17 \
  && apt-get autoremove -y \
  && apt-get clean