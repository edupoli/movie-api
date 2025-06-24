import { query } from "./db";

interface QueryParams {
  cinemaId: number;
  movieId?: number;
  dayName?: string | null | undefined;
  targetDate?: Date;
  status?: string | null;
}

const daysWeek = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
];

export const getMovieShowtimes = async (params: QueryParams) => {
  const {
    cinemaId,
    movieId,
    dayName,
    targetDate = new Date(),
    status = null,
  } = params;

  console.log("params", params);

  // Construir a query SQL
  const sql = `SELECT ${
    dayName && daysWeek.includes(dayName)
      ? `f.nome, p.status, p.semana_inicio, p.semana_fim, p.${dayName}`
      : "f.nome, p.status, p.semana_inicio, p.semana_fim, p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo"
  }
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    ${
      status !== null
        ? status === "em cartaz"
          ? "AND (p.status = $2 OR p.status = 'pre venda')" // Lógica especial para "em cartaz"
          : "AND p.status = $2" // Filtro normal para outros status
        : "AND p.status != 'inativo'" // Filtro quando status é null
    }
    ${movieId ? "AND p.id_filme = $" + (status !== null ? "3" : "2") : ""}
    ${
      dayName
        ? `AND $${
            status !== null ? (movieId ? "4" : "3") : movieId ? "3" : "2"
          } 
          BETWEEN p.semana_inicio AND p.semana_fim`
        : ""
    }
    AND p.semana_fim >= CURRENT_DATE
  `;

  // Preparar os parâmetros
  const queryParams: any[] = [cinemaId];

  // Adiciona status aos parâmetros apenas se não for null
  if (status !== null) {
    queryParams.push(status); // Continua enviando apenas "em cartaz" como parâmetro
  }

  if (movieId) {
    queryParams.push(movieId);
  }

  if (dayName) {
    queryParams.push(targetDate);
  }

  // Executar a query
  const results = await query(sql, queryParams);
  return results;
};
export async function getMovieDetails(params: QueryParams) {
  const { movieId } = params;
  if (!movieId) throw new Error("Movie ID required");
  const sql = `
    SELECT nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia, url_poster, url_trailer
    FROM filmes
    WHERE id = $1
  `;
  return await query(sql, [movieId]);
}
