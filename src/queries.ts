import { query } from "./db";

interface QueryParams {
  cinemaId: number;
  movieId?: number;
  currentDate: Date;
  targetDate?: Date;
  status?: string;
  timeFilter?: { before?: string; after?: string };
}

const dayNameMap: { [key: string]: string } = {
  "segunda-feira": "segunda",
  "terça-feira": "terca",
  "quarta-feira": "quarta",
  "quinta-feira": "quinta",
  "sexta-feira": "sexta",
  sábado: "sabado",
  domingo: "domingo",
  sunday: "domingo",
  monday: "segunda",
  tuesday: "terca",
  wednesday: "quarta",
  thursday: "quinta",
  friday: "sexta",
  saturday: "sabado",
};

// Helper function to extract date from showtimes string (e.g., "14/06/2025 ...")
function extractDateFromShowtimes(showtimes: string): string | null {
  const match = showtimes.match(/^\d{2}\/\d{2}\/\d{4}/);
  if (!match) return null;
  const [day, month, year] = match[0].split("/");
  return `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
}

// Helper function to filter showtimes by time (e.g., before 21:30)
function filterShowtimesByTime(
  showtimes: string,
  before?: string,
  after?: string
): string {
  if (!before && !after) return showtimes;
  const times = showtimes
    .replace(/^\d{2}\/\d{2}\/\d{4}\s*/, "") // Remove date prefix
    .split(", ")
    .filter((time) => {
      const match = time.match(/^(\d{2}:\d{2})/);
      if (!match) return false;
      const [hours, minutes] = match[1].split(":").map(Number);
      const timeInMinutes = hours * 60 + minutes;
      let keep = true;
      if (before) {
        const [bHours, bMinutes] = before.split(":").map(Number);
        const beforeInMinutes = bHours * 60 + bMinutes;
        keep = keep && timeInMinutes < beforeInMinutes;
      }
      if (after) {
        const [aHours, aMinutes] = after.split(":").map(Number);
        const afterInMinutes = aHours * 60 + aMinutes;
        keep = keep && timeInMinutes >= afterInMinutes;
      }
      return keep;
    });
  return times.length ? times.join(", ") : "";
}

export async function getMoviesInTheaters(params: QueryParams) {
  const { cinemaId, movieId, currentDate } = params;
  const sql = `
    SELECT f.nome, f.sinopse, f.duracao, f.classificacao, f.genero, f.diretor, f.elenco_principal, f.data_estreia
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
  const { cinemaId, movieId, currentDate, timeFilter } = params;
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
  return results
    .map((r: any) => {
      const cleanShowtimes = filterShowtimesByTime(
        r[dayColumn],
        timeFilter?.before,
        timeFilter?.after
      );
      return cleanShowtimes
        ? {
            ...r,
            [dayColumn]: cleanShowtimes,
            [dayColumn + "_date"]: currentDate.toISOString().split("T")[0],
          }
        : null;
    })
    .filter((r: any) => r);
}

export async function getShowtimesSpecificDay(params: QueryParams) {
  const { cinemaId, movieId, targetDate, timeFilter } = params;
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
  return results
    .map((r: any) => {
      const cleanShowtimes = filterShowtimesByTime(
        r[dayColumn],
        timeFilter?.before,
        timeFilter?.after
      );
      return cleanShowtimes
        ? {
            ...r,
            [dayColumn]: cleanShowtimes,
            [dayColumn + "_date"]: targetDate.toISOString().split("T")[0],
          }
        : null;
    })
    .filter((r: any) => r);
}

export async function getMovieShowtimesAllDays(params: QueryParams) {
  const { cinemaId, movieId, currentDate, timeFilter } = params;
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
            const cleanShowtimes = filterShowtimesByTime(
              r[day],
              timeFilter?.before,
              timeFilter?.after
            );
            if (cleanShowtimes) {
              movieOutput[day] = cleanShowtimes;
              movieOutput[day + "_date"] = extractedDate;
            }
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

export async function getMoviesWithShowtimes(params: QueryParams) {
  const { cinemaId, movieId, currentDate, timeFilter } = params;
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
            const cleanShowtimes = filterShowtimesByTime(
              r[day],
              timeFilter?.before,
              timeFilter?.after
            );
            if (cleanShowtimes) {
              movieOutput[day] = cleanShowtimes;
              movieOutput[day + "_date"] = extractedDate;
            }
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
  const { cinemaId, movieId, currentDate, targetDate } = params;
  const nextWeekStart = targetDate || new Date(currentDate);
  nextWeekStart.setDate(currentDate.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
  const sql = `
    SELECT f.nome, f.sinopse, f.duracao, f.classificacao, f.genero, f.diretor, f.elenco_principal, f.data_estreia
    FROM programacao p
    JOIN filmes f ON p.id_filme = f.id
    JOIN cinemas c ON p.id_cinema = c.id
    WHERE c.id = $1
    AND p.status IN ('em breve', 'pre venda')
    AND p.semana_inicio <= $2
    AND p.semana_fim >= $3
    ${movieId ? "AND p.id_filme = $4" : ""}
  `;
  const queryParams = movieId
    ? [cinemaId, nextWeekStart, nextWeekEnd, movieId]
    : [cinemaId, nextWeekStart, nextWeekEnd];
  return await query(sql, queryParams);
}

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
