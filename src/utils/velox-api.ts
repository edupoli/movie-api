import { Pool } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import fetch from "node-fetch";
import { findMovieIdByName } from "../fuzzyMatch";

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
    resultado[dia] = partes.length > 0 ? partes.join(", ") : null;
  }
  return resultado;
}

const pool = new Pool({
  user: "mooviai",
  host: "localhost",
  database: "cinemas",
  password: "ServerMoovia123",
  port: 30100,
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

async function insertOrUpdateMovie(movie: any, details: any) {
  const insertFilmeQuery = `
    INSERT INTO filmes
      (nome, sinopse, duracao, classificacao, genero, diretor, data_estreia, url_poster, url_trailer)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (nome) DO UPDATE SET
      sinopse = EXCLUDED.sinopse,
      duracao = EXCLUDED.duracao,
      classificacao = EXCLUDED.classificacao,
      genero = EXCLUDED.genero,
      diretor = EXCLUDED.diretor,
      data_estreia = EXCLUDED.data_estreia,
      url_poster = EXCLUDED.url_poster,
      url_trailer = EXCLUDED.url_trailer
    RETURNING id, data_estreia;
  `;

  const values = [
    details.name,
    details.abstract || "",
    parseDurationToMinutes(details.duration),
    details.typicalAgeRange,
    details.genre,
    details.director?.map((d: any) => d.name).join(", ") || null,
    dayjs(movie.releaseDate).format("YYYY-MM-DD"),
    movie.url || details.image?.[0]?.contentUrl,
    movie.trailerURL || details.trailer?.[0]?.contentUrl || null,
  ];

  return pool.query(insertFilmeQuery, values);
}

async function syncVelox() {
  // 1. Buscar e atualizar filmes em cartaz e em breve
  const filmes = await fetchAllMovies();

  for (const filme of filmes) {
    const det = await fetchMovieDetails(filme.movieIdentifier);
    if (!det) continue;
    await insertOrUpdateMovie(filme, det);
  }

  console.log("Iniciando sincronização Velox...");

  // 2. Buscar eventos (sessões) e processar filmes
  const eventsQuery = `{
    events(placeIdentifier: "GXP") {
      startDate
      generalFeatures
      workPresented { name parentIdentifier }
    }
  }`;

  const eventsResp = await fetchGraphQL(eventsQuery);
  const eventos = eventsResp.data.events;
  const filmeIdMap = new Map<string, { id: number; data_estreia: string }>();
  const filmesProcessados = new Set<string>();

  async function processMovie(nomeFilme: string, movieIdentifier: string) {
    try {
      const filmesEncontrados = await findMovieIdByName(nomeFilme);

      if (filmesEncontrados?.length > 0) {
        console.log(`Filme encontrado no banco: ${nomeFilme}`);
        filmeIdMap.set(movieIdentifier, {
          id: filmesEncontrados[0].id,
          data_estreia: filmesEncontrados[0].data_estreia
            .toISOString()
            .split("T")[0],
        });
        return;
      }

      console.log(`Buscando detalhes do filme: ${nomeFilme}`);
      const det = await fetchMovieDetails(movieIdentifier);

      if (!det) {
        console.log(`Não foi possível obter detalhes do filme: ${nomeFilme}`);
        return;
      }

      const { rows } = await insertOrUpdateMovie(
        { releaseDate: det.releaseDate },
        det
      );
      filmeIdMap.set(movieIdentifier, {
        id: rows[0].id,
        data_estreia: rows[0].data_estreia,
      });
      console.log(`Filme cadastrado: ${nomeFilme}`);
    } catch (error) {
      console.error(`Erro ao processar filme ${nomeFilme}:`, error);
    }
  }

  for (const evento of eventos) {
    const { name: nomeFilme, parentIdentifier } = evento.workPresented;
    const movieIdentifier = String(parentIdentifier);

    if (filmesProcessados.has(movieIdentifier)) continue;

    filmesProcessados.add(movieIdentifier);
    await processMovie(nomeFilme, movieIdentifier);
  }

  // 3. Agrupar sessões por filme
  const sessoesPorFilme: Record<string, any[]> = {};
  for (const ev of eventos) {
    const movieId = String(ev.workPresented.parentIdentifier);
    if (!filmeIdMap.has(movieId)) {
      continue;
    }
    const d = dayjs(ev.startDate);
    if (!sessoesPorFilme[movieId]) sessoesPorFilme[movieId] = [];
    sessoesPorFilme[movieId].push({
      data: d.format("DD/MM/YYYY"),
      hora: d.format("HH:mm"),
      tipo: `(${ev.generalFeatures})`,
    });
  }

  console.log("Filmes com sessões:", Object.keys(sessoesPorFilme));

  // 4. Persistir programação para cada filme
  for (const [movieIdentifier, sessoes] of Object.entries(sessoesPorFilme)) {
    if (!sessoes.length) continue;

    const filmeInfo = filmeIdMap.get(movieIdentifier);
    if (!filmeInfo) {
      console.log(`Filme não encontrado no filmeIdMap: ${movieIdentifier}`);
      continue;
    }

    const { id: idFilme, data_estreia } = filmeInfo;
    const qualquerData = sessoes[0].data;
    const { semanaInicio, semanaFim } = getCineSemana(
      dayjs(qualquerData, "DD/MM/YYYY").format("YYYY-MM-DD")
    );
    const sessoesSemana = mapSessionsByWeekDays(sessoes);

    const insertProgQuery = `
      INSERT INTO programacao
        (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
         segunda, terca, quarta, quinta, sexta, sabado, domingo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id_filme, id_cinema) DO UPDATE SET
         segunda = EXCLUDED.segunda,
         terca = EXCLUDED.terca,
         quarta = EXCLUDED.quarta,
         quinta = EXCLUDED.quinta,
         sexta = EXCLUDED.sexta,
         sabado = EXCLUDED.sabado,
         domingo = EXCLUDED.domingo;
    `;

    const progValues = [
      idFilme,
      6, // id_cinema fixo
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

    console.log(
      `Persistindo programação para filme ${movieIdentifier} (id_filme=${idFilme})`
    );

    await pool.query(insertProgQuery, progValues);
  }
  console.log("Sincronização Velox concluída!");
}

syncVelox();
