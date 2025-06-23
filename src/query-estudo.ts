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
    status = null, // Alterado para null como padrão
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
        ? "AND p.status = $2" // Filtra pelo status específico quando fornecido
        : "AND p.status != 'inativo'" // Filtra tudo exceto 'inativo' quando status é null
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
    queryParams.push(status);
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
    SELECT nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia
    FROM filmes
    WHERE id = $1
  `;
  return await query(sql, [movieId]);
}

// import { query } from "./db";

// interface QueryParams {
//   cinemaId: number;
//   movieId?: number | null;
//   dayName?: string | null;
//   targetDate?: Date | null;
//   status?: string | null;
// }

// const daysWeek = [
//   "segunda",
//   "terca",
//   "quarta",
//   "quinta",
//   "sexta",
//   "sabado",
//   "domingo",
// ];

// export const getMovieShowtimes = async (params: QueryParams) => {
//   const {
//     cinemaId,
//     movieId,
//     dayName,
//     targetDate,
//     status = "em cartaz",
//   } = params;

//   // Default to current date if targetDate is not provided
//   const effectiveDate = targetDate || new Date();
//   effectiveDate.setHours(0, 0, 0, 0); // Normalize to start of day

//   // Use dayName if provided and valid, otherwise derive from targetDate
//   const effectiveDayName =
//     dayName && daysWeek.includes(dayName.toLowerCase())
//       ? dayName.toLowerCase()
//       : daysWeek[effectiveDate.getDay()];

//   // Format date for SQL query (YYYY-MM-DD)
//   const formattedDate = effectiveDate.toISOString().split("T")[0];

//   // Build SQL query
//   const sql = `
//     SELECT f.nome, p.status, p.semana_inicio, p.semana_fim, p.${effectiveDayName}
//     FROM programacao p
//     JOIN filmes f ON p.id_filme = f.id
//     JOIN cinemas c ON p.id_cinema = c.id
//     WHERE c.id = $1
//       AND p.status = $2
//       AND p.semana_inicio <= $3
//       AND p.semana_fim >= $3
//        ${movieId ? "AND p.id_filme = $4" : ""}
//   `;

//   // Prepare query parameters
//   const queryParams: any[] = [cinemaId, status, formattedDate];
//   if (movieId) {
//     queryParams.splice(2, 0, movieId);
//   }

//   // Execute query
//   const results = await query(sql, queryParams);
//   return results;
// };

// export async function getMovieDetails(params: QueryParams) {
//   const { movieId } = params;
//   if (!movieId) throw new Error("Movie ID required");
//   const sql = `
//     SELECT nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia
//     FROM filmes
//     WHERE id = $1
//   `;
//   return await query(sql, [movieId]);
// }
