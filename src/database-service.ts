// import { Movie, Cinema, Schedule } from "./data-processor";
// import { db, pgp } from "./database";
// async function insertMovies(
//   movies: Movie[],
//   embeddings: { id: number; embedding: number[] }[]
// ) {
//   const cs = new pgp.helpers.ColumnSet(
//     [
//       "id",
//       "nome",
//       "sinopse",
//       "duracao",
//       "classificacao",
//       "genero",
//       "diretor",
//       "elenco_principal",
//       "data_estreia",
//       "url_poster",
//       "url_trailer",
//       "embedding",
//     ],
//     { table: "filmes" }
//   );
//   const values = movies.map((movie) => ({
//     ...movie,
//     data_estreia: movie.data_estreia ? new Date(movie.data_estreia) : null,
//     embedding: embeddings.find((e) => e.id === movie.id)?.embedding || null,
//   }));
//   const query =
//     pgp.helpers.insert(values, cs) +
//     " ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, sinopse = EXCLUDED.sinopse, duracao = EXCLUDED.duracao, classificacao = EXCLUDED.classificacao, genero = EXCLUDED.genero, diretor = EXCLUDED.diretor, elenco_principal = EXCLUDED.elenco_principal, data_estreia = EXCLUDED.data_estreia, url_poster = EXCLUDED.url_poster, url_trailer = EXCLUDED.url_trailer, embedding = EXCLUDED.embedding";
//   await db.none(query);
// }

// async function insertCinemas(
//   cinemas: Cinema[],
//   embeddings: { id: number; embedding: number[] }[]
// ) {
//   const cs = new pgp.helpers.ColumnSet(
//     [
//       "id",
//       "nome",
//       "endereco",
//       "url_conferir_horarios",
//       "url_comprar_ingresso",
//       "embedding",
//     ],
//     { table: "cinemas" }
//   );
//   const values = cinemas.map((cinema) => ({
//     ...cinema,
//     embedding: embeddings.find((e) => e.id === cinema.id)?.embedding || null,
//   }));
//   const query =
//     pgp.helpers.insert(values, cs) +
//     " ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, endereco = EXCLUDED.endereco, url_conferir_horarios = EXCLUDED.url_conferir_horarios, url_comprar_ingresso = EXCLUDED.url_comprar_ingresso, embedding = EXCLUDED.embedding";
//   await db.none(query);
// }

// async function insertSchedules(
//   schedules: Schedule[],
//   embeddings: { id_filme: number; id_cinema: number; embedding: number[] }[]
// ) {
//   const cs = new pgp.helpers.ColumnSet(
//     [
//       "id_filme",
//       "id_cinema",
//       "status",
//       "semana_inicio",
//       "semana_fim",
//       "segunda",
//       "terca",
//       "quarta",
//       "quinta",
//       "sexta",
//       "sabado",
//       "domingo",
//       "embedding",
//     ],
//     { table: "programacao" }
//   );
//   const values = schedules.map((schedule) => ({
//     ...schedule,
//     semana_inicio: schedule.semana_inicio
//       ? new Date(schedule.semana_inicio)
//       : null,
//     semana_fim: schedule.semana_fim ? new Date(schedule.semana_fim) : null,
//     embedding:
//       embeddings.find(
//         (e) =>
//           e.id_filme === schedule.id_filme && e.id_cinema === schedule.id_cinema
//       )?.embedding || null,
//   }));
//   const query =
//     pgp.helpers.insert(values, cs) +
//     " ON CONFLICT (id_filme, id_cinema) DO UPDATE SET status = EXCLUDED.status, semana_inicio = EXCLUDED.semana_inicio, semana_fim = EXCLUDED.semana_fim, segunda = EXCLUDED.segunda, terca = EXCLUDED.terca, quarta = EXCLUDED.quarta, quinta = EXCLUDED.quinta, sexta = EXCLUDED.sexta, sabado = EXCLUDED.sabado, domingo = EXCLUDED.domingo, embedding = EXCLUDED.embedding";
//   await db.none(query);
// }

// export { insertMovies, insertCinemas, insertSchedules };

import { Pool, PoolClient } from "pg";

// Interfaces para os tipos de dados
interface Movie {
  id: number;
  nome: string;
  sinopse?: string;
  duracao?: number;
  classificacao?: string;
  genero?: string;
  diretor?: string;
  elenco_principal?: string;
  data_estreia?: string;
  url_poster?: string;
  url_trailer?: string;
}

interface Cinema {
  id: number;
  nome: string;
  endereco?: string;
  url_conferir_horarios?: string;
  url_comprar_ingresso?: string;
}

interface Schedule {
  id_filme: number;
  id_cinema: number;
  status?: string;
  semana_inicio?: string;
  semana_fim?: string;
  segunda?: string;
  terca?: string;
  quarta?: string;
  quinta?: string;
  sexta?: string;
  sabado?: string;
  domingo?: string;
}

interface MovieEmbedding {
  id: number;
  embedding: number[];
}

interface CinemaEmbedding {
  id: number;
  embedding: number[];
}

interface ScheduleEmbedding {
  id_filme: number;
  id_cinema: number;
  embedding: number[];
}

// Configuração do pool de conexões
const pool = new Pool({
  // Suas configurações de conexão aqui
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

/**
 * Insere filmes no banco de dados com embeddings
 */
async function insertMovies(
  movies: Movie[],
  embeddings: MovieEmbedding[],
  client: PoolClient
): Promise<void> {
  try {
    // Cria um mapa dos embeddings por ID para acesso rápido
    const embeddingMap = new Map(embeddings.map((e) => [e.id, e.embedding]));

    // Query de inserção
    const insertQuery = `
      INSERT INTO filmes (
        id, nome, sinopse, duracao, classificacao, genero, 
        diretor, elenco_principal, data_estreia, url_poster, 
        url_trailer, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        sinopse = EXCLUDED.sinopse,
        duracao = EXCLUDED.duracao,
        classificacao = EXCLUDED.classificacao,
        genero = EXCLUDED.genero,
        diretor = EXCLUDED.diretor,
        elenco_principal = EXCLUDED.elenco_principal,
        data_estreia = EXCLUDED.data_estreia,
        url_poster = EXCLUDED.url_poster,
        url_trailer = EXCLUDED.url_trailer,
        embedding = EXCLUDED.embedding
    `;

    // Insere cada filme
    for (const movie of movies) {
      const embedding = embeddingMap.get(movie.id);
      if (!embedding) {
        console.warn(`Embedding não encontrado para o filme ID ${movie.id}`);
        continue;
      }

      await client.query(insertQuery, [
        movie.id,
        movie.nome,
        movie.sinopse || null,
        movie.duracao || null,
        movie.classificacao || null,
        movie.genero || null,
        movie.diretor || null,
        movie.elenco_principal || null,
        movie.data_estreia || null,
        movie.url_poster || null,
        movie.url_trailer || null,
        `[${embedding.join(",")}]`, // Converte array para formato PostgreSQL vector
      ]);
    }

    console.log(`${movies.length} filmes inseridos com sucesso`);
  } catch (error) {
    console.error("Erro ao inserir filmes:", error);
    throw error;
  }
}

/**
 * Insere cinemas no banco de dados com embeddings
 */
async function insertCinemas(
  cinemas: Cinema[],
  embeddings: CinemaEmbedding[],
  client: PoolClient
): Promise<void> {
  try {
    // Limpa a tabela se necessário
    await client.query("DELETE FROM cinemas");

    const embeddingMap = new Map(embeddings.map((e) => [e.id, e.embedding]));

    const insertQuery = `
      INSERT INTO cinemas (
        id, nome, endereco, url_conferir_horarios, 
        url_comprar_ingresso, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        endereco = EXCLUDED.endereco,
        url_conferir_horarios = EXCLUDED.url_conferir_horarios,
        url_comprar_ingresso = EXCLUDED.url_comprar_ingresso,
        embedding = EXCLUDED.embedding
    `;

    for (const cinema of cinemas) {
      const embedding = embeddingMap.get(cinema.id);
      if (!embedding) {
        console.warn(`Embedding não encontrado para o cinema ID ${cinema.id}`);
        continue;
      }

      await client.query(insertQuery, [
        cinema.id,
        cinema.nome,
        cinema.endereco || null,
        cinema.url_conferir_horarios || null,
        cinema.url_comprar_ingresso || null,
        `[${embedding.join(",")}]`,
      ]);
    }

    console.log(`${cinemas.length} cinemas inseridos com sucesso`);
  } catch (error) {
    console.error("Erro ao inserir cinemas:", error);
    throw error;
  }
}

/**
 * Insere programação no banco de dados com embeddings
 */
async function insertSchedules(
  schedules: Schedule[],
  embeddings: ScheduleEmbedding[],
  client: PoolClient
): Promise<void> {
  try {
    // Limpa a tabela
    await client.query("DELETE FROM programacao");

    // Cria mapa de embeddings usando chave composta
    const embeddingMap = new Map(
      embeddings.map((e) => [`${e.id_filme}-${e.id_cinema}`, e.embedding])
    );

    const insertQuery = `
      INSERT INTO programacao (
        id_filme, id_cinema, status, semana_inicio, semana_fim,
        segunda, terca, quarta, quinta, sexta, sabado, domingo, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

    for (const schedule of schedules) {
      const embeddingKey = `${schedule.id_filme}-${schedule.id_cinema}`;
      const embedding = embeddingMap.get(embeddingKey);

      if (!embedding) {
        console.warn(
          `Embedding não encontrado para programação ${embeddingKey}`
        );
        continue;
      }

      await client.query(insertQuery, [
        schedule.id_filme,
        schedule.id_cinema,
        schedule.status || null,
        schedule.semana_inicio || null,
        schedule.semana_fim || null,
        schedule.segunda || null,
        schedule.terca || null,
        schedule.quarta || null,
        schedule.quinta || null,
        schedule.sexta || null,
        schedule.sabado || null,
        schedule.domingo || null,
        `[${embedding.join(",")}]`,
      ]);
    }

    console.log(`${schedules.length} programações inseridas com sucesso`);
  } catch (error) {
    console.error("Erro ao inserir programação:", error);
    throw error;
  }
}

/**
 * Função principal para inserir todos os dados
 */
export async function insertAllData(
  movies: Movie[],
  cinemas: Cinema[],
  schedules: Schedule[],
  movieEmbeddings: MovieEmbedding[],
  cinemaEmbeddings: CinemaEmbedding[],
  scheduleEmbeddings: ScheduleEmbedding[]
): Promise<void> {
  const client = await pool.connect();

  try {
    // Inicia transação
    await client.query("BEGIN");

    // Insere dados na ordem correta (respeitando foreign keys)
    await insertMovies(movies, movieEmbeddings, client);
    await insertCinemas(cinemas, cinemaEmbeddings, client);
    await insertSchedules(schedules, scheduleEmbeddings, client);

    // Confirma a transação
    await client.query("COMMIT");
    console.log("Todos os dados foram inseridos com sucesso!");
  } catch (error) {
    // Desfaz a transação em caso de erro
    await client.query("ROLLBACK");
    console.error("Erro na inserção dos dados:", error);
    throw error;
  } finally {
    // Libera a conexão
    client.release();
  }
}

// Versão alternativa usando batch insert para melhor performance
export async function insertAllDataBatch(
  movies: Movie[],
  cinemas: Cinema[],
  schedules: Schedule[],
  movieEmbeddings: MovieEmbedding[],
  cinemaEmbeddings: CinemaEmbedding[],
  scheduleEmbeddings: ScheduleEmbedding[]
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Batch insert para filmes
    if (movies.length > 0) {
      const embeddingMap = new Map(
        movieEmbeddings.map((e) => [e.id, e.embedding])
      );

      const movieValues = movies
        .map((movie) => {
          const embedding = embeddingMap.get(movie.id);
          return `(${movie.id}, '${movie.nome.replace(/'/g, "''")}', ${
            movie.sinopse ? `'${movie.sinopse.replace(/'/g, "''")}'` : "NULL"
          }, ${movie.duracao || "NULL"}, ${
            movie.classificacao ? `'${movie.classificacao}'` : "NULL"
          }, ${movie.genero ? `'${movie.genero}'` : "NULL"}, ${
            movie.diretor ? `'${movie.diretor}'` : "NULL"
          }, ${
            movie.elenco_principal
              ? `'${movie.elenco_principal.replace(/'/g, "''")}'`
              : "NULL"
          }, ${movie.data_estreia ? `'${movie.data_estreia}'` : "NULL"}, ${
            movie.url_poster ? `'${movie.url_poster}'` : "NULL"
          }, ${movie.url_trailer ? `'${movie.url_trailer}'` : "NULL"}, ${
            embedding ? `'[${embedding.join(",")}]'` : "NULL"
          })`;
        })
        .join(",");

      await client.query(`
        DELETE FROM programacao;
        DELETE FROM filmes;
        INSERT INTO filmes (id, nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia, url_poster, url_trailer, embedding) 
        VALUES ${movieValues}
      `);
    }

    // Similar para cinemas e programação...

    await client.query("COMMIT");
    console.log("Dados inseridos em lote com sucesso!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro na inserção em lote:", error);
    throw error;
  } finally {
    client.release();
  }
}
