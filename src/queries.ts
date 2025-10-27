import { query } from "./db";
import { formatDateOnly } from "./utils/date";

interface QueryParams {
  cinemaId: number;
  movieId?: number | null;
  dayName?: string | string[] | null | undefined;
  targetDate?: Date | Date[] | null;
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
    targetDate: rawTargetDate = new Date(),
    status = null,
  } = params;

  const targetDate = Array.isArray(rawTargetDate)
    ? rawTargetDate[0]
    : rawTargetDate;

  // Se dayName for um array, busca resultados para cada dia e concatena
  if (Array.isArray(dayName) && dayName.length > 0) {
    const results = [];
    for (const day of dayName) {
      const dayResults = await getMovieShowtimes({
        ...params,
        dayName: day,
        targetDate: Array.isArray(targetDate)
          ? targetDate[dayName.indexOf(day)] || targetDate[0]
          : targetDate,
      });
      results.push(...dayResults);
    }
    return results;
  }

  const targetDateStr =
    formatDateOnly(Array.isArray(targetDate) ? targetDate[0] : targetDate) ||
    formatDateOnly(new Date());

  console.log("params", params);

  // Construir a query SQL
  let sql = "";

  // Função auxiliar para construir a parte de seleção dos dias
  const buildDaySelection = (days: string[] | string): string => {
    if (Array.isArray(days)) {
      return days.map((day) => `p.${day}`).join(", ");
    }
    return `p.${days}`;
  };

  // Função auxiliar para construir a parte WHERE dos dias
  const buildDayFilter = (days: string[] | string): string => {
    if (Array.isArray(days)) {
      return days.map((day) => `p.${day} IS NOT NULL`).join(" OR ");
    }
    return `p.${days} IS NOT NULL`;
  };

  if (dayName === null) {
    // Semana completa: busca todos os dias
    sql = `SELECT f.nome, p.status, p.data_estreia, p.semana_inicio, p.semana_fim, p.segunda, p.terca, p.quarta, p.quinta, p.sexta, p.sabado, p.domingo
      FROM programacao p
      JOIN filmes f ON p.id_filme = f.id
      JOIN cinemas c ON p.id_cinema = c.id
      WHERE c.id = $1
      ${
        status !== null
          ? status === "em cartaz"
            ? "AND (p.status = $2 OR p.status = 'pre venda')"
            : "AND p.status = $2"
          : "AND p.status != 'inativo'"
      }
      ${movieId ? "AND p.id_filme = $" + (status !== null ? "3" : "2") : ""}
      AND p.semana_fim >= CURRENT_DATE
    `;
  } else if (Array.isArray(dayName)) {
    // Múltiplos dias específicos
    const validDays = dayName.filter((day) => daysWeek.includes(day));
    if (validDays.length > 0) {
      sql = `SELECT f.nome, p.status, p.data_estreia, p.semana_inicio, p.semana_fim, ${buildDaySelection(
        validDays
      )}
        FROM programacao p
        JOIN filmes f ON p.id_filme = f.id
        JOIN cinemas c ON p.id_cinema = c.id
        WHERE c.id = $1
        ${
          status !== null
            ? status === "em cartaz"
              ? "AND (p.status = $2 OR p.status = 'pre venda')"
              : "AND p.status = $2"
            : "AND p.status != 'inativo'"
        }
        ${movieId ? "AND p.id_filme = $" + (status !== null ? "3" : "2") : ""}
        AND (${buildDayFilter(validDays)})
        AND $${
          status !== null ? (movieId ? "4" : "3") : movieId ? "3" : "2"
        }::date 
          BETWEEN p.semana_inicio::date AND p.semana_fim::date
        AND p.semana_fim >= CURRENT_DATE
      `;
    }
  } else if (typeof dayName === "string" && daysWeek.includes(dayName)) {
    // Dia específico
    sql = `SELECT f.nome, p.status, p.data_estreia, p.semana_inicio, p.semana_fim, p.${dayName}
      FROM programacao p
      JOIN filmes f ON p.id_filme = f.id
      JOIN cinemas c ON p.id_cinema = c.id
      WHERE c.id = $1
      ${
        status !== null
          ? status === "em cartaz"
            ? "AND (p.status = $2 OR p.status = 'pre venda')"
            : "AND p.status = $2"
          : "AND p.status != 'inativo'"
      }
      ${movieId ? "AND p.id_filme = $" + (status !== null ? "3" : "2") : ""}
      AND $${
        status !== null ? (movieId ? "4" : "3") : movieId ? "3" : "2"
      }::date 
        BETWEEN p.semana_inicio::date AND p.semana_fim::date
      AND p.semana_fim >= CURRENT_DATE
    `;
  }

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
    if (Array.isArray(dayName)) {
      dayName.forEach((day) => {
        if (daysWeek.includes(day)) {
          queryParams.push(targetDateStr);
        }
      });
    } else if (typeof dayName === "string" && daysWeek.includes(dayName)) {
      queryParams.push(targetDateStr);
    }
  }

  // Executar a query
  const results = await query(sql, queryParams);
  return results;
};

export async function getMovieDetails(params: QueryParams) {
  const { movieId, cinemaId } = params;
  if (!movieId) throw new Error("Movie ID required");
  if (!cinemaId) throw new Error("Cinema ID required");

  const sql = `
    SELECT f.nome, f.sinopse, f.duracao, f.classificacao, f.genero, 
           f.diretor, f.elenco_principal, f.data_estreia, 
           f.url_poster, f.url_trailer
    FROM filmes f
    JOIN programacao p ON f.id = p.id_filme
    WHERE f.id = $1 AND p.id_cinema = $2
  `;

  return await query(sql, [movieId, cinemaId]);
}

export async function getTicketPrices(params: QueryParams) {
  const { cinemaId, dayName } = params;

  // Helper function to build day selection
  const getDaySelection = (
    days: string | string[] | null | undefined
  ): string => {
    if (!days) return "segunda, terca, quarta, quinta, sexta, sabado, domingo";
    if (Array.isArray(days)) return days.join(", ");
    return days;
  };

  // Helper function to build day filter
  const getDayFilter = (days: string | string[] | null | undefined): string => {
    if (!days) return "";
    if (Array.isArray(days)) {
      return (
        "AND (" + days.map((day) => `${day} IS NOT NULL`).join(" OR ") + ")"
      );
    }
    return `AND ${days} IS NOT NULL`;
  };

  let sql = `
    SELECT nome, observacoes, 
           inteira_2d, meia_2d, inteira_2d_desconto, 
           inteira_3d, meia_3d, inteira_3d_desconto,
           inteira_vip_2d, meia_vip_2d, inteira_vip_2d_desconto,
           inteira_vip_3d, meia_vip_3d, inteira_vip_3d_desconto,
           ${getDaySelection(dayName)}
    FROM ingressos
    WHERE id_cinema = $1
    AND (
      inteira_2d IS NOT NULL OR meia_2d IS NOT NULL OR inteira_2d_desconto IS NOT NULL OR
      inteira_3d IS NOT NULL OR meia_3d IS NOT NULL OR inteira_3d_desconto IS NOT NULL OR
      inteira_vip_2d IS NOT NULL OR meia_vip_2d IS NOT NULL OR inteira_vip_2d_desconto IS NOT NULL OR
      inteira_vip_3d IS NOT NULL OR meia_vip_3d IS NOT NULL OR inteira_vip_3d_desconto IS NOT NULL
    )
    ${getDayFilter(dayName)}
  `;

  const queryParams: any[] = [cinemaId];

  const results = await query(sql, queryParams);
  return results.map((result) => {
    const formattedResult = {
      nome: result.nome,
      observacoes: result.observacoes,
    };
    // Include all price columns
    [
      "inteira_2d",
      "meia_2d",
      "inteira_2d_desconto",
      "inteira_3d",
      "meia_3d",
      "inteira_3d_desconto",
      "inteira_vip_2d",
      "meia_vip_2d",
      "inteira_vip_2d_desconto",
      "inteira_vip_3d",
      "meia_vip_3d",
      "inteira_vip_3d_desconto",
    ].forEach((key) => {
      if (result[key] !== null) formattedResult[key] = result[key];
    });

    // Include day-specific data if requested or all days if not
    if (dayName) {
      if (Array.isArray(dayName)) {
        dayName.forEach((day) => {
          if (result[day] !== null) formattedResult[day] = result[day];
        });
      } else if (typeof dayName === "string" && result[dayName] !== null) {
        formattedResult[dayName] = result[dayName];
      }
    } else {
      daysWeek.forEach((day) => {
        if (result[day] !== null) formattedResult[day] = result[day];
      });
    }
    return formattedResult;
  });
}

export async function getCinemaInfo(params: QueryParams) {
  const { cinemaId } = params;
  if (!cinemaId) throw new Error("Cinema ID required");
  const sql = `
    SELECT id, nome, endereco, url_conferir_horarios, url_comprar_ingresso
    FROM cinemas
    WHERE id = $1
  `;
  const result = await query(sql, [cinemaId]);
  return result;
}
