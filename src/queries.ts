import { query } from "./db";

interface QueryParams {
  cinemaId: number;
  movieId?: number;
  currentDate: Date;
  targetDate?: Date;
  status?: string;
  dayColumn?: string;
  tipo_necessidade: "lista" | "detalhes";
}

const dayNameMap: { [key: string]: string } = {
  "segunda-feira": "segunda",
  "terça-feira": "terca",
  "quarta-feira": "quarta",
  "quinta-feira": "quinta",
  "sexta-feira": "sexta",
  sábado: "sabado",
  domingo: "domingo",
};

export async function getMoviesInTheaters(params: QueryParams) {
  const { cinemaId, movieId, currentDate, tipo_necessidade } = params;
  const sql = `
    SELECT ${
      tipo_necessidade === "lista"
        ? "f.nome"
        : "f.nome, f.sinopse, f.duracao, f.classificacao, f.genero, f.diretor, f.elenco_principal, f.data_estreia"
    }
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status = 'em cartaz'
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $2
    ${movieId ? "AND p.id_filme = $3" : ""}
  `;
  const queryParams = movieId
    ? [cinemaId, currentDate, movieId]
    : [cinemaId, currentDate];
  return await query(sql, queryParams);
}

export async function getShowtimesToday(params: QueryParams) {
  const { cinemaId, movieId, currentDate, tipo_necessidade } = params;
  const fullDayName = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(currentDate)
    .toLowerCase();
  const dayColumn = dayNameMap[fullDayName];
  if (!dayColumn)
    throw new Error(`Invalid day column for date ${currentDate.toISOString()}`);

  const sql = `
    SELECT f.nome, p.${dayColumn}
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em cartaz', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $2
    AND p.${dayColumn} IS NOT NULL
    ${movieId ? "AND p.id_filme = $3" : ""}
  `;
  const queryParams = movieId
    ? [cinemaId, currentDate, movieId]
    : [cinemaId, currentDate];
  const results = await query(sql, queryParams);
  return results.map((r: any) => ({
    ...r,
    [dayColumn + "_date"]: currentDate.toISOString().split("T")[0],
  }));
}

export async function getShowtimesSpecificDay(params: QueryParams) {
  const { cinemaId, movieId, targetDate, tipo_necessidade } = params;
  if (!targetDate) throw new Error("Target date required");
  const fullDayName = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(targetDate)
    .toLowerCase();
  const dayColumn = dayNameMap[fullDayName];
  if (!dayColumn)
    throw new Error(`Invalid day column for date ${targetDate.toISOString()}`);

  const sql = `
    SELECT f.nome, p.${dayColumn}
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em cartaz', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $2
    AND p.${dayColumn} IS NOT NULL
    ${movieId ? "AND p.id_filme = $3" : ""}
  `;
  const queryParams = movieId
    ? [cinemaId, targetDate, movieId]
    : [cinemaId, targetDate];
  const results = await query(sql, queryParams);
  return results.map((r: any) => ({
    ...r,
    [dayColumn + "_date"]: targetDate.toISOString().split("T")[0],
  }));
}

function extractDateFromShowtimes(showtimes: string): string | null {
  const match = showtimes.match(/^\d{2}\/\d{2}\/\d{4}/);
  if (!match) return null;
  const [day, month, year] = match[0].split("/");
  return `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
}

export async function getMoviesWithShowtimes(params: QueryParams) {
  const { cinemaId, movieId, currentDate, tipo_necessidade } = params;
  const dayColumns = [
    "sabado",
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
  ];
  const sql = `
    SELECT f.nome, ${dayColumns.map((day) => `p.${day}`).join(", ")}
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em cartaz', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $2
    ${movieId ? "AND p.id_filme = $3" : ""}
  `;
  const queryParams = movieId
    ? [cinemaId, currentDate, movieId]
    : [cinemaId, currentDate];
  const results = await query(sql, queryParams);

  const output: any[] = [];
  results.forEach((r: any) => {
    const movieOutput: any = { nome: r.nome };
    dayColumns.forEach((day) => {
      if (r[day]) {
        const extractedDate = extractDateFromShowtimes(r[day]);
        if (extractedDate) {
          const date = new Date(extractedDate);
          if (date >= new Date(currentDate.setHours(0, 0, 0, 0))) {
            // Exclude past dates
            movieOutput[day] = r[day]; // Preserve original showtimes with date
            movieOutput[day + "_date"] = extractedDate;
          }
        }
      }
    });
    if (Object.keys(movieOutput).length > 1) {
      output.push(movieOutput);
    }
  });
  return output;
}

export async function getMovieShowtimesAllDays(params: QueryParams) {
  const { cinemaId, movieId, currentDate, tipo_necessidade } = params;
  if (!movieId) throw new Error("Movie ID required");
  const dayColumns = [
    "sabado",
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
  ];
  const sql = `
    SELECT f.nome, ${dayColumns.map((day) => `p.${day}`).join(", ")}
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em cartaz', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $2
    AND p.id_filme = $3
  `;
  const queryParams = [cinemaId, currentDate, movieId];
  const results = await query(sql, queryParams);

  const output: any[] = [];
  results.forEach((r: any) => {
    const movieOutput: any = { nome: r.nome };
    dayColumns.forEach((day) => {
      if (r[day]) {
        const extractedDate = extractDateFromShowtimes(r[day]);
        if (extractedDate) {
          const date = new Date(extractedDate);
          if (date >= new Date(currentDate.setHours(0, 0, 0, 0))) {
            // Exclude past dates
            movieOutput[day] = r[day]; // Preserve original showtimes with date
            movieOutput[day + "_date"] = extractedDate;
          }
        }
      }
    });
    if (Object.keys(movieOutput).length > 1) {
      output.push(movieOutput);
    }
  });
  return output;
}

export async function getUpcomingMovies(params: QueryParams) {
  const { cinemaId, movieId, currentDate, targetDate, tipo_necessidade } =
    params;
  const sql = `
    SELECT ${
      tipo_necessidade === "lista"
        ? "f.nome"
        : "f.nome, f.sinopse, f.duracao, f.classificacao, f.genero, f.diretor, f.elenco_principal, f.data_estreia"
    }
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em breve', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $3
    ${movieId ? "AND p.id_filme = $4" : ""}
  `;
  const nextWeekStart = targetDate || new Date(currentDate);
  nextWeekStart.setDate(currentDate.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
  const queryParams = movieId
    ? [cinemaId, nextWeekStart, nextWeekEnd, movieId]
    : [cinemaId, nextWeekStart, nextWeekEnd];
  return await query(sql, queryParams);
}

export async function getMovieDetails(params: QueryParams) {
  const { movieId, tipo_necessidade } = params;
  if (!movieId) throw new Error("Movie ID required");
  const sql = `
    SELECT ${
      tipo_necessidade === "lista"
        ? "nome"
        : "nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia"
    }
    FROM filmes
    WHERE id = $1
  `;
  return await query(sql, [movieId]);
}
