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
  host: process.env.DB_HOST || "5.161.113.232",
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "mooviai",
  password: process.env.DB_PASSWORD || "ServerMoovia123",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 30100,
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

  const insertFilmeQuery = `
    INSERT INTO filmes
      (nome, sinopse, duracao, classificacao, genero, diretor, data_estreia, url_poster, url_trailer)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, data_estreia;
  `;

  try {
    return await pool.query(insertFilmeQuery, values);
  } catch (insertError: any) {
    // Se der erro de duplicata (unique violation), busca e atualiza
    if (insertError.code === "23505") {
      const selectQuery = `SELECT id, data_estreia FROM filmes WHERE nome = $1`;
      const { rows } = await pool.query(selectQuery, [details.name]);
      if (rows.length > 0) {
        // Atualiza os dados do filme existente
        const updateQuery = `
          UPDATE filmes SET
            sinopse = $2,
            duracao = $3,
            classificacao = $4,
            genero = $5,
            diretor = $6,
            data_estreia = $7,
            url_poster = $8,
            url_trailer = $9
          WHERE nome = $1
          RETURNING id, data_estreia;
        `;
        return await pool.query(updateQuery, values);
      } else {
        throw insertError;
      }
    } else {
      throw insertError;
    }
  }
}

function detailsImageOrNull(det: any) {
  return det.image?.[0]?.contentUrl || null;
}

function detailsTrailerOrNull(det: any) {
  return det.trailer?.[0]?.contentUrl || null;
}

async function syncVelox() {
  // 1. Buscar e atualizar filmes em cartaz e em breve
  const filmes = await fetchAllMovies();

  for (const filme of filmes) {
    const det = await fetchMovieDetails(filme.movieIdentifier);
    if (!det) continue;

    // Evita consumir valores da sequence quando o filme já existe.
    // Primeiro tenta encontrar via fuzzy match; se encontrado, faz UPDATE;
    // se não, faz INSERT.
    try {
      const encontrados = await findMovieIdByName(det.name);
      const valuesCommon = [
        det.abstract || "",
        parseDurationToMinutes(det.duration),
        det.typicalAgeRange,
        det.genre,
        det.director?.map((d: any) => d.name).join(", ") || null,
        dayjs(filme.releaseDate).format("YYYY-MM-DD"),
        filme.url || detailsImageOrNull(det),
        filme.trailerURL || detailsTrailerOrNull(det),
      ];

      if (encontrados && encontrados.length > 0) {
        // Atualiza registro existente (não consome sequence)
        const updateQuery = `
          UPDATE filmes SET
            sinopse = $1,
            duracao = $2,
            classificacao = $3,
            genero = $4,
            diretor = $5,
            data_estreia = $6,
            url_poster = $7,
            url_trailer = $8
          WHERE id = $9
          RETURNING id, data_estreia;
        `;
        const updateValues = [...valuesCommon, encontrados[0].id];
        await pool.query(updateQuery, updateValues);
      } else {
        // Não existe: insere normalmente
        await insertOrUpdateMovie(filme, det);
      }
    } catch (err) {
      console.error("Erro ao atualizar/inserir filme (evitar sequência):", err);
      // fallback: tenta inserir para não perder o filme
      await insertOrUpdateMovie(filme, det);
    }
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

    try {
      await pool.query(insertProgQuery, progValues);
    } catch (progError: any) {
      // Se der erro de duplicata (unique violation), atualiza
      if (progError.code === "23505") {
        const updateProgQuery = `
          UPDATE programacao SET
            status = $3,
            data_estreia = $4,
            semana_inicio = $5,
            semana_fim = $6,
            segunda = $7,
            terca = $8,
            quarta = $9,
            quinta = $10,
            sexta = $11,
            sabado = $12,
            domingo = $13
          WHERE id_filme = $1 AND id_cinema = $2
        `;
        await pool.query(updateProgQuery, progValues);
      } else {
        throw progError;
      }
    }
  }
  console.log("Sincronização Velox concluída!");
}

//syncVelox();

// Export para uso via endpoint
export { syncVelox };
