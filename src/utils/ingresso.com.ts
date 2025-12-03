import { Pool } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import fetch from "node-fetch";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

// ================== CONFIG DB ==================
const pool = new Pool({
  host: process.env.DB_HOST || "5.161.113.232",
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "mooviai",
  password: process.env.DB_PASSWORD || "ServerMoovia123",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 30500,
});

// ================== HELPERS ==================
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

// ================== API FUNCTIONS ==================
async function fetchFromAPI(url: string): Promise<any> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

async function fetchAllMovies(cityId: string) {
  const nowPlayingUrl = `https://api-content.ingresso.com/v0/templates/nowplaying/${cityId}?partnership=home`;
  const comingSoonUrl = `https://api-content.ingresso.com/v0/templates/soon/${cityId}?partnership=home`;

  // Fazer as duas requisições em paralelo
  const [nowPlayingResp, comingSoonResp] = await Promise.all([
    fetchFromAPI(nowPlayingUrl),
    fetchFromAPI(comingSoonUrl),
  ]);

  // Combinar os resultados das duas requisições
  return [...(nowPlayingResp || []), ...(comingSoonResp || [])];
}

async function fetchSessions(cityId: string, theaterId: string) {
  const sessionsUrl = `https://api-content.ingresso.com/v0/sessions/city/${cityId}/theater/${theaterId}?partnership=home`;
  return await fetchFromAPI(sessionsUrl);
}

// ================== MOVIE PROCESSING ==================
async function insertOrUpdateMovie(movie: any, idCinema: number) {
  const idFilmeIngressoCom = parseInt(movie.id);
  if (!idFilmeIngressoCom || isNaN(idFilmeIngressoCom)) return null;

  const dataEstreia = movie.premiereDate?.localDate?.split("T")[0] || null;
  const classificacao =
    movie.contentRating === "Verifique a Classificação"
      ? "Classificação indicativa não disponível"
      : movie.contentRating;
  const generos = Array.isArray(movie.genres) ? movie.genres.join(", ") : "";
  const duracao = movie.duration ? parseFloat(movie.duration) : null;

  // Verificar se já existe
  const checkQuery = `
    SELECT id FROM filmes 
    WHERE id_filme_ingresso_com = $1 AND id_cinema = $2
  `;
  const { rows: existingRows } = await pool.query(checkQuery, [
    idFilmeIngressoCom,
    idCinema,
  ]);

  const values = [
    movie.title,
    movie.synopsis || "",
    duracao,
    classificacao,
    generos,
    movie.director || movie.directors || "",
    movie.cast || "",
    dataEstreia,
    movie.imageFeatured || "",
    null, // url_trailer
  ];

  if (existingRows.length > 0) {
    // UPDATE
    const updateQuery = `
      UPDATE filmes SET
        nome = $1, sinopse = $2, duracao = $3, classificacao = $4,
        genero = $5, diretor = $6, elenco_principal = $7, data_estreia = $8,
        url_poster = $9, url_trailer = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id_filme_ingresso_com = $11 AND id_cinema = $12
      RETURNING id, data_estreia;
    `;

    return await pool.query(updateQuery, [
      ...values,
      idFilmeIngressoCom,
      idCinema,
    ]);
  } else {
    // INSERT
    const insertQuery = `
      INSERT INTO filmes (
        nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, 
        data_estreia, url_poster, url_trailer, movieIdentifier, codigo_filme,
        id_filme_ingresso_com, id_cinema
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, data_estreia;
    `;

    return await pool.query(insertQuery, [
      ...values,
      null, // movieIdentifier
      null, // codigo_filme
      idFilmeIngressoCom,
      idCinema,
    ]);
  }
}

async function processMovie(movie: any, idCinema: number) {
  const result = await insertOrUpdateMovie(movie, idCinema);

  if (!result) return null;

  return {
    id: result.rows[0].id,
    data_estreia: result.rows[0].data_estreia,
    idFilmeIngressoCom: movie.id,
  };
}

// ================== PROGRAMMING PROCESSING ==================
async function processProgramacao(
  movieId: string,
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

    const checkProgQuery = `
      SELECT id FROM programacao 
      WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $3
    `;
    const { rows: progRows } = await pool.query(checkProgQuery, [
      idFilme,
      idCinema,
      semanaInicio,
    ]);

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

    if (progRows.length > 0) {
      const updateProgQuery = `
        UPDATE programacao SET
          status = $3, data_estreia = $4, semana_inicio = $5, semana_fim = $6,
          segunda = $7, terca = $8, quarta = $9, quinta = $10,
          sexta = $11, sabado = $12, domingo = $13, updated_at = CURRENT_TIMESTAMP
        WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $5
      `;
      await pool.query(updateProgQuery, progValues);
    } else {
      const insertProgQuery = `
        INSERT INTO programacao
          (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
           segunda, terca, quarta, quinta, sexta, sabado, domingo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `;
      await pool.query(insertProgQuery, progValues);
    }
  }
}

// ================== MAIN LOGIC ==================
async function syncIngressoCom(
  idCinema: number,
  cityId: string,
  theaterId: string
) {
  try {
    console.log(`🎬 Iniciando sincronização Cinema ${idCinema}...`);

    // 1. Buscar filmes e sessões em paralelo
    console.log(`📡 Buscando dados da API para Cinema ${idCinema}...`);
    const [filmes, sessionsData] = await Promise.all([
      fetchAllMovies(cityId),
      fetchSessions(cityId, theaterId),
    ]);
    console.log(
      `✅ API Data: ${filmes.length} filmes, ${sessionsData.length} dias de sessões`
    );

    // 2. Remover duplicados da API (manter apenas filmes únicos)
    console.log(`🔄 Removendo duplicatas da API...`);
    const filmesUnicos = new Map();
    filmes.forEach((filme) => {
      const id = parseInt(filme.id);
      if (!filmesUnicos.has(id)) {
        filmesUnicos.set(id, filme);
      }
    });
    console.log(
      `✅ Deduplicação: ${filmesUnicos.size} filmes únicos de ${filmes.length} total`
    );

    // 3. Processar filmes únicos em paralelo
    const filmesArray = Array.from(filmesUnicos.values());
    console.log(
      `💾 Processando ${filmesArray.length} filmes no banco de dados...`
    );
    const filmesProcessados = await Promise.all(
      filmesArray.map((filme) => processMovie(filme, idCinema))
    );
    const filmesValidosCount = filmesProcessados.filter(Boolean).length;
    console.log(
      `✅ Filmes salvos: ${filmesValidosCount}/${filmesArray.length} (${
        filmesArray.length - filmesValidosCount
      } ignorados)`
    );

    // 4. Criar mapa de filmes válidos
    const filmeIdMap = new Map<string, { id: number; data_estreia: string }>();
    filmesProcessados.forEach((filmeProc, index) => {
      if (filmeProc) {
        const filmeOriginal = filmesArray[index];
        filmeIdMap.set(filmeOriginal.id, {
          id: filmeProc.id,
          data_estreia: filmeProc.data_estreia
            ? filmeProc.data_estreia.toISOString().split("T")[0]
            : dayjs().format("YYYY-MM-DD"),
        });
      }
    });

    // 5. Agrupar sessões por filme
    console.log(`📅 Processando sessões de programação...`);
    const sessoesPorFilme: Record<string, any[]> = {};

    for (const day of sessionsData) {
      const dataFormatada = dayjs(day.date).format("DD/MM/YYYY");

      for (const movie of day.movies) {
        if (!filmeIdMap.has(movie.id)) continue;

        if (!sessoesPorFilme[movie.id]) {
          sessoesPorFilme[movie.id] = [];
        }

        for (const room of movie.rooms) {
          for (const session of room.sessions) {
            const tipos =
              session.types
                ?.map((t: any) => t.alias)
                .filter((alias: string) => alias && alias !== "2D")
                .join("/") || "";

            sessoesPorFilme[movie.id].push({
              data: dataFormatada,
              hora: session.time,
              tipo: tipos ? `(${tipos})` : "",
            });
          }
        }
      }
    }

    const totalSessoes = Object.values(sessoesPorFilme).reduce(
      (acc, sessoes) => acc + sessoes.length,
      0
    );
    console.log(
      `✅ Sessões agrupadas: ${totalSessoes} sessões para ${
        Object.keys(sessoesPorFilme).length
      } filmes`
    );

    // 6. Processar programação em paralelo
    console.log(`🗓️ Salvando programação no banco...`);
    await Promise.all(
      Object.entries(sessoesPorFilme)
        .filter(([_, sessoes]) => sessoes.length > 0)
        .map(([movieId, sessoes]) => {
          const filmeInfo = filmeIdMap.get(movieId);
          return filmeInfo
            ? processProgramacao(movieId, sessoes, filmeInfo, idCinema)
            : null;
        })
        .filter(Boolean)
    );

    console.log(`✅ Programação salva com sucesso!`);
    console.log(
      `🎉 CONCLUÍDO - Cinema ${idCinema}: ${filmeIdMap.size} filmes sincronizados`
    );
  } catch (error) {
    console.error(`❌ ERRO - Cinema ${idCinema}:`, error);
  }
}

// ================== EXECUÇÃO ==================
async function main() {
  try {
    console.log("🚀 INICIANDO SINCRONIZAÇÃO INGRESSO.COM");
    console.log("==================================================");

    const cinemas = [
      { id: 17, nome: "Cine Cambuí", cityId: "460", theaterId: "1467" },
      {
        id: 18,
        nome: "GNC Balneário Shopping",
        cityId: "290",
        theaterId: "1266",
      },
      { id: 19, nome: "GNC Caxias do Sul", cityId: "7", theaterId: "150" },
      {
        id: 20,
        nome: "GNC Cinemas Moinhos Porto Alegre",
        cityId: "5",
        theaterId: "103",
      },
      {
        id: 21,
        nome: "GNC Iguatemi Porto Alegre",
        cityId: "5",
        theaterId: "743",
      },
      {
        id: 22,
        nome: "GNC Praia de Belas Porto Alegre",
        cityId: "5",
        theaterId: "97",
      },
      {
        id: 23,
        nome: "GNC Garten Shopping Joinville",
        cityId: "16",
        theaterId: "851",
      },
      { id: 24, nome: "GNC Joinville Mueller", cityId: "16", theaterId: "146" },
      { id: 25, nome: "GNC Nações Criciúma", cityId: "308", theaterId: "1388" },
      {
        id: 26,
        nome: "GNC Neumarkt Shopping Blumenau",
        cityId: "17",
        theaterId: "149",
      },
      {
        id: 27,
        nome: "PlayArte Multiplex Praça da Moça",
        cityId: "82",
        theaterId: "862",
      },
      {
        id: 28,
        nome: "PlayArte Multiplex ABC",
        cityId: "45",
        theaterId: "599",
      },
      {
        id: 29,
        nome: "PlayArte Multiplex - Ibirapuera",
        cityId: "1",
        theaterId: "1623",
      },
      {
        id: 30,
        nome: "PlayArte Multiplex Marabá",
        cityId: "1",
        theaterId: "1624",
      },
    ];

    console.log(`📊 Total de cinemas: ${cinemas.length}`);
    console.log("🔄 Processando todos os cinemas em paralelo...\n");

    const startTime = Date.now();

    await Promise.all(
      cinemas.map((cinema) =>
        syncIngressoCom(cinema.id, cinema.cityId, cinema.theaterId)
      )
    );

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n==================================================");
    console.log("🎉 SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!");
    console.log(`⏱️ Tempo total: ${duration}s`);
    console.log(`🏪 Cinemas processados: ${cinemas.length}`);
  } catch (error) {
    console.error("❌ ERRO GERAL durante a sincronização:", error);
    process.exit(1);
  }
}

// Descomente para testar
//main();

// Export para uso via endpoint
export { syncIngressoCom, main as syncIngressoComAll };
