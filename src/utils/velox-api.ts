import { Pool } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import fetch from "node-fetch";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

// Helpers copiados do multicine
function getCineSemana(dateStr: string) {
  const d = dayjs(dateStr, "YYYY-MM-DD");
  const semanaInicio = d.day(4).isAfter(d) ? d.day(-3) : d.day(4);
  const semanaFim = semanaInicio.add(6, "day");
  return {
    semanaInicio: semanaInicio.format("YYYY-MM-DD"),
    semanaFim: semanaFim.format("YYYY-MM-DD"),
  };
}

function groupSessionsByCineWeek(sessoes: any[]) {
  const groups: Record<string, any[]> = {};

  sessoes.forEach((sessao) => {
    const dateYYYYMMDD = dayjs(sessao.data, "DD/MM/YYYY").format("YYYY-MM-DD");
    const { semanaInicio } = getCineSemana(dateYYYYMMDD);
    if (!groups[semanaInicio]) {
      groups[semanaInicio] = [];
    }
    groups[semanaInicio].push(sessao);
  });

  return groups;
}

function mapSessionsByWeekDays(sessoes: any[]) {
  const dias: Record<string, Record<string, string[]>> = {
    segunda: {},
    terca: {},
    quarta: {},
    quinta: {},
    sexta: {},
    sabado: {},
    domingo: {},
  };
  sessoes.forEach((s) => {
    const data = dayjs(s.data, "DD/MM/YYYY");
    const horaFormatada = s.hora;
    const tipo = s.tipo;
    const diaSemana = [
      "domingo",
      "segunda",
      "terca",
      "quarta",
      "quinta",
      "sexta",
      "sabado",
    ][data.day()];
    if (!dias[diaSemana][s.data]) {
      dias[diaSemana][s.data] = [];
    }
    dias[diaSemana][s.data].push(`${horaFormatada} ${tipo}`);
  });
  const resultado: Record<string, string | null> = {};
  for (const [dia, datas] of Object.entries(dias)) {
    const partes: string[] = [];
    for (const [data, horarios] of Object.entries(datas)) {
      if (horarios.length > 0) {
        partes.push(`${data} ${horarios.join(", ")}`);
      }
    }
    resultado[dia] = partes.length > 0 ? partes.join(", ") : "(Sem Sessao)";
  }
  return resultado;
}

const pool = new Pool({
  host: process.env.DB_HOST || "5.161.113.232",
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "mooviai",
  password: process.env.DB_PASSWORD || "ServerMoovia123",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 30500,
});

async function fetchGraphQL(query: string, variables?: any): Promise<any> {
  const response = await fetch("https://partnerapi.veloxtickets.com/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from("cine14bis:Rot1WUhaab2Q").toString("base64"),
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

function parseDurationToMinutes(duration: string): number | null {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  return hours * 60 + minutes;
}

function formatClassificacao(typicalAgeRange: string | number): string {
  if (!typicalAgeRange) return "LIVRE";

  const idade = parseInt(String(typicalAgeRange));

  // Se for 0, -1 ou NaN, considera como livre
  if (idade <= 0 || isNaN(idade)) {
    return "LIVRE";
  }

  return `${idade} ANOS`;
}

async function fetchAllMovies() {
  const scheduledQuery = `{
    homeScheduledMovies(cityIdentifier: "GUAXUPE"){
      items {
        genre, movieIdentifier, name, releaseDate, trailerURL, type, url
      }
    }
  }`;
  const comingSoonQuery = `{
    homeComingSoonMovies(cityIdentifier: "GUAXUPE"){
      items {
        genre, movieIdentifier, name, releaseDate, trailerURL, type, url
      }
    }
  }`;
  const [scheduledResp, comingSoonResp] = await Promise.all([
    fetchGraphQL(scheduledQuery),
    fetchGraphQL(comingSoonQuery),
  ]);
  return [
    ...(scheduledResp.data.homeScheduledMovies?.[0]?.items || []),
    ...(comingSoonResp.data.homeComingSoonMovies?.[0]?.items || []),
  ];
}

async function fetchMovieDetails(movieIdentifier: string) {
  const detailsQuery = `{
    movies(where: {identifier: {eq: "${movieIdentifier}"}}) {
      name, abstract, duration, typicalAgeRange, genre,
      director { name }, image { contentUrl }, trailer { contentUrl }
    }
  }`;
  const detailsResp = await fetchGraphQL(detailsQuery);
  return detailsResp.data.movies?.[0];
}

async function insertOrUpdateMovie(
  movie: any,
  details: any,
  idCinema: number = 10
) {
  const movieIdentifier = parseInt(movie.movieIdentifier);

  // Validar se o movieIdentifier existe
  if (!movieIdentifier || isNaN(movieIdentifier)) {
    console.log(
      `Velox - Filme ${details.name} não possui movieIdentifier válido, pulando...`
    );
    return null;
  }

  // Primeiro verifica se o filme já existe pelo movieIdentifier e id_cinema
  const checkQuery = `
    SELECT id, data_estreia 
    FROM filmes 
    WHERE movieIdentifier = $1 AND id_cinema = $2
    AND movieIdentifier IS NOT NULL
  `;

  const { rows: existingRows } = await pool.query(checkQuery, [
    movieIdentifier,
    idCinema,
  ]);

  console.log(
    `Velox - Verificando filme ${movieIdentifier} no cinema ${idCinema}: ${existingRows.length} encontrados`
  );

  const values = [
    details.name,
    details.abstract || "",
    parseDurationToMinutes(details.duration),
    formatClassificacao(details.typicalAgeRange),
    details.genre,
    details.director?.map((d: any) => d.name).join(", ") || null,
    dayjs(movie.releaseDate).format("YYYY-MM-DD"),
    movie.url || details.image?.[0]?.contentUrl,
    movie.trailerURL || details.trailer?.[0]?.contentUrl || null,
    movieIdentifier,
    idCinema,
  ];

  if (existingRows.length > 0) {
    // Atualiza filme existente
    const updateQuery = `
      UPDATE filmes SET
        nome = $1,
        sinopse = $2,
        duracao = $3,
        classificacao = $4,
        genero = $5,
        diretor = $6,
        data_estreia = $7,
        url_poster = $8,
        url_trailer = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE movieIdentifier = $10 AND id_cinema = $11
      RETURNING id, data_estreia;
    `;

    return await pool.query(updateQuery, values);
  } else {
    // Insere novo filme
    const insertQuery = `
      INSERT INTO filmes
        (nome, sinopse, duracao, classificacao, genero, diretor, data_estreia, 
         url_poster, url_trailer, movieIdentifier, id_cinema)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, data_estreia;
    `;

    return await pool.query(insertQuery, values);
  }
}

async function processMovie(movie: any, details: any, idCinema: number = 10) {
  try {
    console.log(
      `Processando filme: ${details.name} (ID: ${movie.movieIdentifier})`
    );

    const result = await insertOrUpdateMovie(movie, details, idCinema);

    if (!result) {
      console.log(`Filme ${details.name} não foi processado (ID inválido)`);
      return null;
    }

    return {
      id: result.rows[0].id,
      data_estreia: result.rows[0].data_estreia,
      movieIdentifier: movie.movieIdentifier,
    };
  } catch (error) {
    console.error(`Erro ao processar filme ${details.name}:`, error);
    throw error;
  }
}

// ================== PROGRAMMING PROCESSING ==================
async function processProgramacao(
  movieIdentifier: string,
  sessoes: any[],
  filmeInfo: any,
  idCinema: number
) {
  const { id: idFilme, data_estreia } = filmeInfo;

  // Agrupa sessões por cine-semana
  const sessionsByWeek = groupSessionsByCineWeek(sessoes);

  for (const [semanaInicio, weekSessions] of Object.entries(sessionsByWeek)) {
    const semanaInicioDate = dayjs(semanaInicio, "YYYY-MM-DD");
    const semanaFim = semanaInicioDate.add(6, "day").format("YYYY-MM-DD");

    const sessoesSemana = mapSessionsByWeekDays(weekSessions);

    const progValues = [
      idFilme,
      idCinema,
      "em cartaz",
      data_estreia,
      semanaInicio,
      semanaFim,
      sessoesSemana.segunda,
      sessoesSemana.terca,
      sessoesSemana.quarta,
      sessoesSemana.quinta,
      sessoesSemana.sexta,
      sessoesSemana.sabado,
      sessoesSemana.domingo,
    ];

    // Verifica se já existe programação para este filme e cinema
    const checkProgQuery = `
      SELECT id FROM programacao 
      WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $3
    `;
    const { rows: progRows } = await pool.query(checkProgQuery, [
      idFilme,
      idCinema,
      semanaInicio,
    ]);

    if (progRows.length > 0) {
      // Atualiza programação existente
      const updateProgQuery = `
        UPDATE programacao SET
          status = $3, data_estreia = $4, semana_inicio = $5, semana_fim = $6,
          segunda = $7, terca = $8, quarta = $9, quinta = $10,
          sexta = $11, sabado = $12, domingo = $13, updated_at = CURRENT_TIMESTAMP
        WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $5
      `;
      await pool.query(updateProgQuery, progValues);
      console.log(
        `Programação atualizada para filme ${movieIdentifier} (id_filme=${idFilme}, Semana: ${semanaInicio})`
      );
    } else {
      // Insere nova programação
      const insertProgQuery = `
        INSERT INTO programacao
          (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
           segunda, terca, quarta, quinta, sexta, sabado, domingo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `;
      await pool.query(insertProgQuery, progValues);
      console.log(
        `Programação inserida para filme ${movieIdentifier} (id_filme=${idFilme}, Semana: ${semanaInicio})`
      );
    }
  }
}

async function syncVelox() {
  console.log("Iniciando sincronização Velox...");

  const idCinema = 10; // ID fixo do cinema

  // 1. Buscar filmes e eventos em paralelo
  const eventsQuery = `{
    events(placeIdentifier: "GXP") {
      startDate
      generalFeatures
      workPresented { name parentIdentifier }
    }
  }`;

  const [filmes, eventsResp] = await Promise.all([
    fetchAllMovies(),
    fetchGraphQL(eventsQuery),
  ]);

  console.log(`Encontrados ${filmes.length} filmes para processar`);

  // 2. Buscar detalhes de todos os filmes em paralelo
  const movieDetailsPromises = filmes.map((filme) =>
    fetchMovieDetails(filme.movieIdentifier)
      .then((details) => ({ filme, details }))
      .catch((error) => {
        console.error(`Erro ao buscar detalhes do filme ${filme.name}:`, error);
        return null;
      })
  );

  const movieDetailsResults = await Promise.all(movieDetailsPromises);

  // Filtrar resultados válidos
  const validMovies = movieDetailsResults.filter(
    (result) => result && result.details
  );

  // 3. Processar todos os filmes em paralelo
  const movieProcessPromises = validMovies.map(({ filme, details }) =>
    processMovie(filme, details, idCinema)
      .then((result) => ({
        movieIdentifier: filme.movieIdentifier,
        ...result,
      }))
      .catch((error) => {
        console.error(`Erro ao processar filme ${details.name}:`, error);
        return null;
      })
  );

  const processedMovies = await Promise.all(movieProcessPromises);

  // 4. Criar mapa de filmes
  const filmeIdMap = new Map<string, { id: number; data_estreia: string }>();

  processedMovies.forEach((result) => {
    if (result) {
      filmeIdMap.set(result.movieIdentifier, {
        id: result.id,
        data_estreia: result.data_estreia.toISOString().split("T")[0],
      });
      console.log(`Filme processado: ID BD ${result.id}`);
    }
  });

  // 5. Processar eventos (sessões)
  const eventos = eventsResp.data.events;

  // 6. Agrupar sessões por filme
  const sessoesPorFilme: Record<string, any[]> = {};

  for (const ev of eventos) {
    const movieIdentifier = String(ev.workPresented.parentIdentifier);

    if (!filmeIdMap.has(movieIdentifier)) {
      console.log(`Filme não encontrado no mapa: ${movieIdentifier}`);
      continue;
    }

    const d = dayjs(ev.startDate);
    if (!sessoesPorFilme[movieIdentifier]) {
      sessoesPorFilme[movieIdentifier] = [];
    }

    sessoesPorFilme[movieIdentifier].push({
      data: d.format("DD/MM/YYYY"),
      hora: d.format("HH:mm"),
      tipo: `(${ev.generalFeatures})`,
    });
  }

  console.log(`Filmes com sessões: ${Object.keys(sessoesPorFilme).length}`);

  // 7. Processar programação em paralelo
  const progPromises = Object.entries(sessoesPorFilme)
    .filter(([_, sessoes]) => sessoes.length > 0)
    .map(([movieIdentifier, sessoes]) => {
      const filmeInfo = filmeIdMap.get(movieIdentifier);
      if (filmeInfo) {
        return processProgramacao(
          movieIdentifier,
          sessoes,
          filmeInfo,
          idCinema
        );
      }
      return Promise.resolve();
    });

  await Promise.all(progPromises);

  console.log("Sincronização Velox concluída!");
}

// Descomente para testar
//syncVelox();

// Export para uso via endpoint
export { syncVelox };
