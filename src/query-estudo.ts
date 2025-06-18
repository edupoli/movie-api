import { query } from "./db";

interface QueryParams {
  cinemaId: number;
  movieId?: number;
  daySearch?: string | null | undefined;
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
    status = "em cartaz",
    targetDate = new Date(),
    movieId,
    daySearch,
  } = params;

  // Definir o status padrão se não fornecido
  const statusValue = status || "em cartaz";
  // Verificar se deve incluir os filtros de semana
  const shouldIncludeWeekFilters = ![
    "em breve",
    "pré venda",
    "pre venda",
  ].includes(statusValue.toLowerCase());

  // Construir a query SQL
  const sql = `SELECT ${
    daySearch && daysWeek.includes(daySearch)
      ? `f.nome, p.status, p.semana_inicio, p.semana_fim, p.${daySearch}`
      : "f.nome, p.status, p.semana_inicio, p.semana_fim, p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo"
  }
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status = $2
        ${
          shouldIncludeWeekFilters
            ? "AND p.semana_inicio <= $3 AND p.semana_fim >= $3"
            : ""
        }

    ${movieId ? "AND p.id_filme = $4" : ""}
  `;

  // Preparar os parâmetros da query
  const queryParams: any[] = [cinemaId, statusValue];
  if (shouldIncludeWeekFilters) {
    queryParams.push(targetDate);
  }
  if (movieId) {
    queryParams.push(movieId);
  }

  // Executar a query
  const results = await query(sql, queryParams);
  return results;
};

export async function getMovieDetails(params: QueryParams) {
  const { movieId } = params;
  if (!movieId) throw new Error("Movie ID required");
  const sql = `
    SELECT nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia
    FROM filmes
    WHERE id = $1
  `;
  return await query(sql, [movieId]);
}
