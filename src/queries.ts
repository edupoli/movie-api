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
  let sql = `
    SELECT nome, observacoes, 
           inteira_2d, meia_2d, inteira_2d_desconto, 
           inteira_3d, meia_3d, inteira_3d_desconto,
           inteira_vip_2d, meia_vip_2d, inteira_vip_2d_desconto,
           inteira_vip_3d, meia_vip_3d, inteira_vip_3d_desconto,
           ${
             dayName
               ? `${dayName}`
               : "segunda, terca, quarta, quinta, sexta, sabado, domingo"
           }
    FROM ingressos
    WHERE id_cinema = $1
    AND (
      inteira_2d IS NOT NULL OR meia_2d IS NOT NULL OR inteira_2d_desconto IS NOT NULL OR
      inteira_3d IS NOT NULL OR meia_3d IS NOT NULL OR inteira_3d_desconto IS NOT NULL OR
      inteira_vip_2d IS NOT NULL OR meia_vip_2d IS NOT NULL OR inteira_vip_2d_desconto IS NOT NULL OR
      inteira_vip_3d IS NOT NULL OR meia_vip_3d IS NOT NULL OR inteira_vip_3d_desconto IS NOT NULL
    )
    ${dayName ? "AND " + dayName + " IS NOT NULL" : ""}
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
      if (result[dayName] !== null) formattedResult[dayName] = result[dayName];
    } else {
      daysWeek.forEach((day) => {
        if (result[day] !== null) formattedResult[day] = result[day];
      });
    }
    return formattedResult;
  });
}
