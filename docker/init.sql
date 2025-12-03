-- ======================================
-- TABELAS
-- ======================================

CREATE TABLE IF NOT EXISTS cinemas (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  endereco TEXT,
  telefone VARCHAR(255),
  url_conferir_horarios VARCHAR(255),
  url_comprar_ingresso VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS filmes (
  id BIGSERIAL PRIMARY KEY,
  id_cinema BIGINT REFERENCES cinemas(id),
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
  movieIdentifier INTEGER,
  codigo_filme INTEGER,
  id_filme_ingresso_com INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP 
);

CREATE TABLE IF NOT EXISTS programacao (
  id BIGSERIAL PRIMARY KEY,
  id_filme BIGINT REFERENCES filmes(id),
  id_cinema BIGINT REFERENCES cinemas(id),
  status VARCHAR(50),
  data_estreia DATE,
  semana_inicio DATE,
  semana_fim DATE,
  segunda TEXT,
  terca TEXT,
  quarta TEXT,
  quinta TEXT,
  sexta TEXT,
  sabado TEXT,
  domingo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingressos (
  id BIGSERIAL PRIMARY KEY,
  id_cinema BIGINT NOT NULL REFERENCES cinemas(id),
  nome TEXT NOT NULL,
  observacoes TEXT,
  inteira_2d DECIMAL(10,2),
  meia_2d DECIMAL(10,2),
  inteira_2d_desconto DECIMAL(10,2),
  inteira_3d DECIMAL(10,2),
  meia_3d DECIMAL(10,2),
  inteira_3d_desconto DECIMAL(10,2),
  inteira_vip_2d DECIMAL(10,2),
  meia_vip_2d DECIMAL(10,2),
  inteira_vip_2d_desconto DECIMAL(10,2),
  inteira_vip_3d DECIMAL(10,2),
  meia_vip_3d DECIMAL(10,2),
  inteira_vip_3d_desconto DECIMAL(10,2),
  segunda TEXT,
  terca TEXT,
  quarta TEXT,
  quinta TEXT,
  sexta TEXT,
  sabado TEXT,
  domingo TEXT,
  feriados TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- ======================================
-- ÍNDICES
-- ======================================

CREATE INDEX IF NOT EXISTS idx_programacao_id_filme ON programacao (id_filme);
CREATE INDEX IF NOT EXISTS idx_programacao_id_cinema ON programacao (id_cinema);
CREATE INDEX IF NOT EXISTS idx_programacao_semana ON programacao (semana_inicio, semana_fim);

CREATE INDEX IF NOT EXISTS idx_ingressos_id_cinema ON ingressos (id_cinema);

CREATE INDEX IF NOT EXISTS idx_filmes_id_cinema ON filmes (id_cinema);
CREATE INDEX IF NOT EXISTS idx_filmes_ingresso_com ON filmes (id_filme_ingresso_com);
CREATE INDEX IF NOT EXISTS idx_filmes_codigo_filme ON filmes (codigo_filme);
CREATE INDEX IF NOT EXISTS idx_filmes_cinema_ingresso ON filmes (id_cinema, id_filme_ingresso_com);

CREATE INDEX IF NOT EXISTS idx_programacao_filme_cinema ON programacao (id_filme, id_cinema);
CREATE INDEX IF NOT EXISTS idx_filmes_cinema_codigo ON filmes (id_cinema, codigo_filme);

-- =============================================
-- Constraints únicas para evitar duplicidade por parceiro + cinema
-- Executar uma única vez (idempotente com DO $$ ... $$)
-- =============================================

DO $$
BEGIN
    -- 1. Programacao: uma programação por filme + cinema + semana
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_programacao_filme_cinema_semana'
    ) THEN
        ALTER TABLE programacao
        ADD CONSTRAINT uq_programacao_filme_cinema_semana
        UNIQUE (id_filme, id_cinema, semana_inicio);
    END IF;

    -- 2. Filmes - Ingresso.com
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_filmes_ingresso_com_cinema'
    ) THEN
        ALTER TABLE filmes
        ADD CONSTRAINT uq_filmes_ingresso_com_cinema
        UNIQUE (id_filme_ingresso_com, id_cinema);
    END IF;

    -- 3. Filmes - VendaBem
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_filmes_venda_bem_cinema'
    ) THEN
        ALTER TABLE filmes
        ADD CONSTRAINT uq_filmes_venda_bem_cinema
        UNIQUE (codigo_filme, id_cinema);
    END IF;

    -- 4. Filmes - Velox Tickets
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_filmes_velox_cinema'
    ) THEN
        ALTER TABLE filmes
        ADD CONSTRAINT uq_filmes_velox_cinema
        UNIQUE (movieIdentifier, id_cinema);
    END IF;

END $$;

-- ======================================
-- Usuário admin
-- ======================================
INSERT INTO users (nome, username, password)
SELECT 'Administrador', 'admin', '$2b$10$C253sJ9McqP7lnwOYJrkYutHUXPI9BJ3A6y.6IBbqus4GQXEgf37O'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
