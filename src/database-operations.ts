import { db } from "./database";
import { IDatabase } from "pg-promise"; // Importar tipos necessários do pg-promise

// Definir as interfaces para os dados
// Assumindo que as interfaces Movie, Cinema e Schedule são usadas aqui
// Se elas forem definidas em outro lugar e precisar importar, ajuste o caminho
interface Movie {
  nome: string;
  sinopse?: string;
  duracao?: number; // NUMERIC(5,1)
  classificacao?: string;
  genero?: string;
  diretor?: string;
  elenco_principal?: string;
  data_estreia?: Date; // TIMESTAMP
  url_poster?: string;
  url_trailer?: string;
  // Assumimos que o ID é gerado pelo banco de dados (BIGSERIAL)
}

interface Cinema {
  nome: string;
  endereco: string;
  url_conferir_horarios: string;
  url_comprar_ingresso: string;
  // Assumimos que o ID é gerado pelo banco de dados (BIGSERIAL)
}

interface Schedule {
  id_filme: number;
  id_cinema: number;
  status: string;
  semana_inicio: Date; // DATE
  semana_fim: Date; // DATE
  segunda: string;
  terca: string;
  quarta: string;
  sexta: string;
  sabado: string;
  domingo: string;
  // Assumimos que o ID é gerado pelo banco de dados (BIGSERIAL)
}

// Tipos para dados com embeddings
interface MovieWithEmbedding extends Movie {
  embedding: number[];
}

interface CinemaWithEmbedding extends Cinema {
  embedding: number[];
}

interface ScheduleWithEmbedding extends Schedule {
  embedding: number[];
}

/**
 * Insere filmes no banco de dados com seus embeddings.
 * @param movies - Array de objetos de filme.
 * @param movieEmbeddings - Array de objetos contendo o ID e o embedding correspondente a cada filme.
 */
export async function insertMovies(
  movies: Movie[],
  movieEmbeddings: { id: number; embedding: number[] }[]
): Promise<void> {
  if (movies.length === 0) return;

  const cs = new db.helpers.ColumnSet(
    [
      "nome",
      "sinopse",
      "duracao",
      "classificacao",
      "genero",
      "diretor",
      "elenco_principal",
      { name: "data_estreia", cast: "TIMESTAMP" },
      "url_poster",
      "url_trailer",
      { name: "embedding", mod: ":json" },
    ],
    { table: "filmes" }
  );

  const data = movies
    .map((movie) => {
      const embeddingData = movieEmbeddings.find((emb) => emb.id === movie.id);
      return {
        ...movie,
        data_estreia: movie.data_estreia ? new Date(movie.data_estreia) : null,
        embedding: embeddingData ? embeddingData.embedding : null,
      };
    })
    .filter((item) => item.embedding !== null);

  if (data.length > 0) {
    await db.none(db.helpers.insert(data, cs));
  }
}

/**
 * Insere cinemas no banco de dados com seus embeddings.
 * @param cinemas - Array de objetos de cinema.
 * @param cinemaEmbeddings - Array de objetos contendo o ID e o embedding correspondente a cada cinema.
 */
export async function insertCinemas(
  cinemas: Cinema[],
  cinemaEmbeddings: { id: number; embedding: number[] }[]
): Promise<void> {
  if (cinemas.length === 0) return;

  const cs = new db.helpers.ColumnSet(
    [
      "nome",
      "endereco",
      "url_conferir_horarios",
      "url_comprar_ingresso",
      { name: "embedding", mod: ":json" },
    ],
    { table: "cinemas" }
  );

  const data = cinemas
    .map((cinema) => {
      const embeddingData = cinemaEmbeddings.find(
        (emb) => emb.id === cinema.id
      );
      return {
        ...cinema,
        embedding: embeddingData ? embeddingData.embedding : null,
      };
    })
    .filter((item) => item.embedding !== null);

  if (data.length > 0) {
    await db.none(db.helpers.insert(data, cs));
  }
}

/**
 * Insere programações no banco de dados com seus embeddings.
 * Antes de inserir a programação, precisamos garantir que os filmes e cinemas referenciados já existam
 * e obter seus respectivos IDs. Isso pode exigir consultas adicionais ou que a ordem de inserção seja controlada.
 * Para simplificar, esta função assume que os IDs dos filmes e cinemas nos dados de entrada
 * correspondem a IDs já existentes no banco de dados. Se os dados de entrada vierem de um Excel
 * que não contém os IDs do banco, será necessário um passo adicional para mapear nomes para IDs.
 * @param schedules - Array de objetos de programação.
 * @param scheduleEmbeddings - Array de objetos contendo o ID do filme, o ID do cinema e o embedding correspondente a cada programação.
 */
export async function insertSchedules(
  schedules: Schedule[],
  scheduleEmbeddings: {
    id_filme: number;
    id_cinema: number;
    embedding: number[];
  }[]
): Promise<void> {
  if (schedules.length === 0) return;

  const cs = new db.helpers.ColumnSet(
    [
      "id_filme",
      "id_cinema",
      "status",
      { name: "semana_inicio", cast: "DATE" },
      { name: "semana_fim", cast: "DATE" },
      "segunda",
      "terca",
      "quarta",
      "quinta",
      "sexta",
      "sabado",
      "domingo",
      { name: "embedding", mod: ":json" },
    ],
    { table: "programacao" }
  );

  const data = schedules
    .map((schedule) => {
      const embeddingData = scheduleEmbeddings.find(
        (emb) =>
          emb.id_filme === schedule.id_filme &&
          emb.id_cinema === schedule.id_cinema
      );
      return {
        ...schedule,
        semana_inicio: schedule.semana_inicio
          ? new Date(schedule.semana_inicio)
          : null,
        semana_fim: schedule.semana_fim ? new Date(schedule.semana_fim) : null,
        embedding: embeddingData ? embeddingData.embedding : null,
      };
    })
    .filter((item) => item.embedding !== null);

  if (data.length > 0) {
    await db.none(db.helpers.insert(data, cs));
  }
}
