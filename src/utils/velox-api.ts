import { Pool, PoolClient } from "pg";
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
  const resultado: Record<string, string> = {};
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

async function upsertMovies(
  validMovies: { filme: any; details: any }[],
  idCinema: number,
  client: PoolClient
) {
  if (validMovies.length === 0) return new Map();

  const values: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const resultMap = new Map();

  validMovies.forEach(({ filme, details }) => {
    const movieIdentifier = parseInt(filme.movieIdentifier);
    if (isNaN(movieIdentifier)) return;

    const movieData = [
      details.name,
      details.abstract || "",
      parseDurationToMinutes(details.duration),
      formatClassificacao(details.typicalAgeRange),
      details.genre,
      details.director?.map((d: any) => d.name).join(", ") || null,
      dayjs(filme.releaseDate).format("YYYY-MM-DD"),
      filme.url || details.image?.[0]?.contentUrl,
      filme.trailerURL || details.trailer?.[0]?.contentUrl || null,
      movieIdentifier,
      idCinema,
    ];

    const placeholders = movieData.map(() => `$${paramIndex++}`).join(", ");
    values.push(`(${placeholders})`);
    params.push(...movieData);
  });

  if (values.length === 0) return resultMap;

  const upsertQuery = `
    INSERT INTO filmes (
      nome, sinopse, duracao, classificacao, genero, diretor, data_estreia, 
      url_poster, url_trailer, movieIdentifier, id_cinema
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (movieIdentifier, id_cinema) DO UPDATE SET
      nome = EXCLUDED.nome,
      sinopse = EXCLUDED.sinopse,
      duracao = EXCLUDED.duracao,
      classificacao = EXCLUDED.classificacao,
      genero = EXCLUDED.genero,
      diretor = EXCLUDED.diretor,
      data_estreia = EXCLUDED.data_estreia,
      url_poster = EXCLUDED.url_poster,
      url_trailer = EXCLUDED.url_trailer,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, data_estreia, movieIdentifier;
  `;

  const { rows } = await client.query(upsertQuery, params);

  rows.forEach((row) => {
    resultMap.set(row.movieidentifier.toString(), {
      id: row.id,
      data_estreia: row.data_estreia,
    });
  });

  return resultMap;
}

async function upsertProgramacao(
  sessoesPorFilme: Record<string, any[]>,
  filmeIdMap: Map<string, any>,
  idCinema: number,
  client: PoolClient
) {
  const values: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  Object.entries(sessoesPorFilme).forEach(([movieIdentifier, sessoes]) => {
    const filmeInfo = filmeIdMap.get(movieIdentifier);
    if (!filmeInfo || sessoes.length === 0) return;

    const { id: idFilme, data_estreia } = filmeInfo;
    const sessionsByWeek = groupSessionsByCineWeek(sessoes);

    Object.entries(sessionsByWeek).forEach(([semanaInicio, weekSessions]) => {
      const semanaInicioDate = dayjs(semanaInicio, "YYYY-MM-DD");
      const semanaFim = semanaInicioDate.add(6, "day").format("YYYY-MM-DD");
      const sessoesSemana = mapSessionsByWeekDays(weekSessions);

      const progData = [
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

      const placeholders = progData.map(() => `$${paramIndex++}`).join(", ");
      values.push(`(${placeholders})`);
      params.push(...progData);
    });
  });

  if (values.length === 0) return;

  const upsertQuery = `
    INSERT INTO programacao (
      id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
      segunda, terca, quarta, quinta, sexta, sabado, domingo
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (id_filme, id_cinema, semana_inicio) DO UPDATE SET
      status = EXCLUDED.status,
      data_estreia = EXCLUDED.data_estreia,
      semana_fim = EXCLUDED.semana_fim,
      segunda = EXCLUDED.segunda,
      terca = EXCLUDED.terca,
      quarta = EXCLUDED.quarta,
      quinta = EXCLUDED.quinta,
      sexta = EXCLUDED.sexta,
      sabado = EXCLUDED.sabado,
      domingo = EXCLUDED.domingo,
      updated_at = CURRENT_TIMESTAMP;
  `;

  await client.query(upsertQuery, params);
}

async function syncVelox() {
  let client: PoolClient | null = null;
  try {
    console.log("Iniciando sincronização Velox...");

    client = await pool.connect();
    await client.query("BEGIN");

    const idCinema = 10;

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

    const movieDetailsPromises = filmes.map((filme) =>
      fetchGraphQL(`{
        movies(where: {identifier: {eq: "${filme.movieIdentifier}"}}) {
          name, abstract, duration, typicalAgeRange, genre,
          director { name }, image { contentUrl }, trailer { contentUrl }
        }
      }`).then((detailsResp) => ({
        filme,
        details: detailsResp.data.movies?.[0],
      }))
    );

    const movieDetailsResults = await Promise.all(movieDetailsPromises);

    const validMovies = movieDetailsResults.filter((result) => result.details);

    const filmeIdMap = await upsertMovies(validMovies, idCinema, client);

    const eventos = eventsResp.data.events;

    const sessoesPorFilme: Record<string, any[]> = {};

    for (const ev of eventos) {
      const movieIdentifier = String(ev.workPresented.parentIdentifier);

      if (!filmeIdMap.has(movieIdentifier)) continue;

      const d = dayjs(ev.startDate);
      if (!sessoesPorFilme[movieIdentifier]) {
        sessoesPorFilme[movieIdentifier] = [];
      }

      sessoesPorFilme[movieIdentifier].push({
        data: d.format("DD/MM/YYYY"),
        hora: d.format("HH:mm"),
        tipo: `(${ev.generalFeatures?.replace(/,/g, " ") || ""})`,
      });
    }

    console.log(`Filmes com sessões: ${Object.keys(sessoesPorFilme).length}`);

    await upsertProgramacao(sessoesPorFilme, filmeIdMap, idCinema, client);

    await client.query("COMMIT");

    console.log("Sincronização Velox concluída!");
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Erro na sincronização Velox:", error);
  } finally {
    if (client) client.release();
  }
}

// Descomente para testar
//syncVelox();

// Export para uso via endpoint
export { syncVelox };
