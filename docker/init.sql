CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create filmes table
CREATE TABLE IF NOT EXISTS filmes (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  sinopse TEXT,
  duracao NUMERIC(5,1),
  classificacao VARCHAR(50),
  genero VARCHAR(255),
  diretor VARCHAR(255),
  elenco_principal TEXT,
  data_estreia DATE,
  url_poster VARCHAR(255),
  url_trailer VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create cinemas table
CREATE TABLE IF NOT EXISTS cinemas (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  endereco TEXT,
  url_conferir_horarios VARCHAR(255),
  url_comprar_ingresso VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create programacao table with foreign keys
CREATE TABLE IF NOT EXISTS programacao (
  id BIGSERIAL PRIMARY KEY,
  id_filme BIGINT REFERENCES filmes(id),
  id_cinema BIGINT REFERENCES cinemas(id),
  status VARCHAR(50),
  semana_inicio DATE,
  semana_fim DATE,
  segunda TEXT,
  terca TEXT,
  quarta TEXT,
  quinta TEXT,
  sexta TEXT,
  sabado TEXT,
  domingo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  username TEXT NOT NULL,
  password VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX ON filmes USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON cinemas USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX ON programacao (id_filme);
CREATE INDEX ON programacao (id_cinema);
CREATE INDEX ON programacao USING ivfflat (embedding vector_cosine_ops);