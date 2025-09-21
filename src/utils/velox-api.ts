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

async function syncVelox() {
  // 1. Buscar filmes em cartaz e em breve
  const scheduledQuery = `{
    homeScheduledMovies(cityIdentifier: "GUAXUPE"){
      items {
        genre
        movieIdentifier
        name
        priority
        releaseDate
        trailerURL
        type
        url
      }
    }
  }`;
  const comingSoonQuery = `{
    homeComingSoonMovies(cityIdentifier: "GUAXUPE"){
      items {
        genre
        movieIdentifier
        name
        releaseDate
        trailerURL
        type
        url
      }
    }
  }`;
  const scheduledResp = await fetchGraphQL(scheduledQuery);
  const comingSoonResp = await fetchGraphQL(comingSoonQuery);
  const filmes = [
    ...(scheduledResp.data.homeScheduledMovies?.[0]?.items || []),
    ...(comingSoonResp.data.homeComingSoonMovies?.[0]?.items || []),
  ];

  // 2. Buscar detalhes de cada filme e inserir/atualizar todos os filmes
  const filmeIdMap = new Map(); // movieIdentifier -> { id, data_estreia }
  for (const filme of filmes) {
    const detailsQuery = `{
      movies(where: {identifier: {eq: "${filme.movieIdentifier}"}}) {
        name
        abstract
        duration
        typicalAgeRange
        genre
        director { name }
        image { contentUrl }
        trailer { contentUrl }
      }
    }`;
    const detailsResp = await fetchGraphQL(detailsQuery);
    const det = detailsResp.data.movies?.[0];
    if (!det) continue;

    const insertFilmeQuery = `
      INSERT INTO filmes
        (nome, sinopse, duracao, classificacao, genero, diretor, data_estreia, url_poster, url_trailer, movieIdentifier)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (nome) DO UPDATE SET
        sinopse = EXCLUDED.sinopse,
        duracao = EXCLUDED.duracao,
        classificacao = EXCLUDED.classificacao,
        genero = EXCLUDED.genero,
        diretor = EXCLUDED.diretor,
        data_estreia = EXCLUDED.data_estreia,
        url_poster = EXCLUDED.url_poster,
        url_trailer = EXCLUDED.url_trailer,
        movieIdentifier = EXCLUDED.movieIdentifier
      RETURNING id, data_estreia;
    `;
    const values = [
      det.name,
      det.abstract || "",
      parseDurationToMinutes(det.duration),
      det.typicalAgeRange,
      det.genre,
      det.director?.map((d: any) => d.name).join(", ") || null,
      dayjs(filme.releaseDate).format("YYYY-MM-DD"),
      filme.url || det.image?.[0]?.contentUrl,
      filme.trailerURL || det.trailer?.[0]?.contentUrl || null,
      filme.movieIdentifier,
    ];
    const { rows } = await pool.query(insertFilmeQuery, values);
    filmeIdMap.set(filme.movieIdentifier, {
      id: rows[0].id,
      data_estreia: rows[0].data_estreia,
    });
  }

  // 3. Buscar programação (eventos) UMA ÚNICA VEZ
  const eventsQuery = `{
    events(placeIdentifier: "GXP") {
      startDate
      generalFeatures
      workPresented { identifier }
    }
  }`;
  const eventsResp = await fetchGraphQL(eventsQuery);
  const eventos = eventsResp.data.events;
  console.log(filmeIdMap);
  console.log(
    `Total de eventos encontrados: ${JSON.stringify(eventos, null, 2)} `
  );
  // 4. Agrupar sessões por filme (apenas filmes que realmente têm sessões)
  const sessoesPorFilme: Record<string, any[]> = {};
  for (const ev of eventos) {
    // Garantir que o identificador é string (pode vir como número)
    const movieId = String(ev.workPresented.identifier);
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
  // Log extra para depuração dos tipos de chave
  // console.log('Chaves do filmeIdMap:', Array.from(filmeIdMap.keys()));
  console.log("Filmes com sessões:", Object.keys(sessoesPorFilme));
  // 5. Persistir programação para cada filme
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
      `Persistindo programação para filme ${movieIdentifier} (id_filme=${idFilme})`,
      progValues
    );
    await pool.query(insertProgQuery, progValues);
  }
  console.log("Sincronização Velox concluída!");
}

syncVelox();
