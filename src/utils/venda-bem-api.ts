import axios from "axios";
import { Pool, PoolClient } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";

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
function formatHora(hora: number): string {
  const h = Math.floor(hora / 100);
  const m = hora % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mapLegendado(value: string, is3D: boolean): string {
  const lower = value.toLowerCase();
  let type = "LEG";
  if (lower.includes("nacional")) type = "NAC";
  else if (lower.includes("dublado")) type = "DUB";

  return is3D ? `(3D ${type})` : `(${type})`;
}

function getCineSemana(dateStr: string) {
  const d = dayjs(dateStr, "DD/MM/YYYY");
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
    const { semanaInicio } = getCineSemana(sessao.data);
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
    const horaFormatada = formatHora(s.hora);
    const is3D = s.filme_3d === "S";
    const tipo = mapLegendado(s.legendado, is3D);
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

// ================== MOVIE PROCESSING ==================
async function upsertMovies(
  movies: any[],
  idCinema: number,
  client: PoolClient
) {
  if (movies.length === 0) return new Map();

  const values: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const resultMap = new Map();

  movies.forEach((filme) => {
    const codigoFilme = filme.codigoFilme;
    if (!codigoFilme) return;

    const nomeFormatado = toTitleCase(filme.filme_site || filme.nome_filme);
    const dataEstreia = dayjs(filme.data_estreia, "DD/MM/YYYY").format(
      "YYYY-MM-DD"
    );

    const movieData = [
      idCinema,
      nomeFormatado,
      filme.sinopse || "",
      filme.duracao,
      filme.classificacao,
      filme.genero,
      filme.cartaz,
      filme.trailer,
      dataEstreia,
      codigoFilme,
    ];

    const placeholders = movieData.map(() => `$${paramIndex++}`).join(", ");
    values.push(`(${placeholders})`);
    params.push(...movieData);
  });

  if (values.length === 0) return resultMap;

  const upsertQuery = `
    INSERT INTO filmes (
      id_cinema, nome, sinopse, duracao, classificacao, genero, 
      url_poster, url_trailer, data_estreia, codigo_filme
    )
    VALUES ${values.join(", ")}
    ON CONFLICT (id_cinema, codigo_filme) DO UPDATE SET
      nome = EXCLUDED.nome,
      sinopse = EXCLUDED.sinopse,
      duracao = EXCLUDED.duracao,
      classificacao = EXCLUDED.classificacao,
      genero = EXCLUDED.genero,
      url_poster = EXCLUDED.url_poster,
      url_trailer = EXCLUDED.url_trailer,
      data_estreia = EXCLUDED.data_estreia,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, data_estreia, codigo_filme;
  `;

  const { rows } = await client.query(upsertQuery, params);

  rows.forEach((row) => {
    resultMap.set(row.codigo_filme, {
      id: row.id,
      data_estreia: row.data_estreia,
    });
  });

  return resultMap;
}

// ================== PROGRAMMING PROCESSING ==================
async function upsertProgramacao(
  filmesAgrupados: Map<any, any>,
  filmeIdMap: Map<any, any>,
  idCinema: number,
  client: PoolClient
) {
  const values: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  filmesAgrupados.forEach((filme) => {
    const codigoFilme = filme.codigoFilme;
    const filmeInfo = filmeIdMap.get(codigoFilme);
    if (!filmeInfo) return;

    const { id: idFilme, data_estreia: dataEstreia } = filmeInfo;
    const sessionsByWeek = groupSessionsByCineWeek(filme.sessoes);

    Object.entries(sessionsByWeek).forEach(([semanaInicio, weekSessions]) => {
      const semanaInicioDate = dayjs(semanaInicio, "YYYY-MM-DD");
      const semanaFim = semanaInicioDate.add(6, "day").format("YYYY-MM-DD");
      const sessoesSemana = mapSessionsByWeekDays(weekSessions);

      const progData = [
        idFilme,
        idCinema,
        "em cartaz",
        dataEstreia,
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

// ================== MAIN LOGIC ==================
async function syncFilmes(idCinema: number, url: string, payload: any) {
  let client: PoolClient | null = null;
  try {
    console.log(`Iniciando sincronização para cinema ${idCinema}...`);

    client = await pool.connect();
    await client.query("BEGIN");

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: "Basic d3Ntb292aTpRSW5IMy11NUB7MGhqcFs=",
        "Content-Type": "multipart/form-data",
        Accept: "application/json",
        "User-Agent": "MyIntegration/1.0",
      },
    });

    const filmes = response.data;

    const filmesAgrupados = new Map();

    for (const filme of filmes) {
      if (!filme.sessoes || filme.sessoes.length === 0) continue;

      const codigoFilme = filme.sessoes[0].codigo_filme;

      if (!filmesAgrupados.has(codigoFilme)) {
        filmesAgrupados.set(codigoFilme, {
          ...filme,
          codigoFilme,
        });
      }
    }

    const filmesArray = Array.from(filmesAgrupados.values());

    const filmeIdMap = await upsertMovies(filmesArray, idCinema, client);

    await upsertProgramacao(filmesAgrupados, filmeIdMap, idCinema, client);

    await client.query("COMMIT");

    console.log(
      `Sincronização concluída para cinema ${idCinema}! Processados ${filmeIdMap.size} filmes únicos.`
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error(`Erro na sincronização do cinema ${idCinema}:`, err);
  } finally {
    if (client) client.release();
  }
}

// ================== EXECUÇÃO ==================
async function main() {
  try {
    console.log("Iniciando sincronização de filmes...");

    const cinemas = [
      {
        id: 1,
        url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "001" },
      },
      {
        id: 2,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "002" },
      },
      {
        id: 3,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "003" },
      },
      {
        id: 4,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "004" },
      },
      {
        id: 5,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "005" },
      },
      {
        id: 6,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "006" },
      },
      {
        id: 7,
        url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "002" },
      },
      {
        id: 8,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "008" },
      },
      {
        id: 9,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "009" },
      },
      {
        id: 12,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "012" },
      },
      {
        id: 13,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "013" },
      },
      {
        id: 14,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "014" },
      },
      {
        id: 16,
        url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "016" },
      },
      {
        id: 35,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "005" },
      },
      {
        id: 37,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "013" },
      },
      {
        id: 36,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "036" },
      },
      {
        id: 38,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "032" },
      },
      {
        id: 47,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "047" },
      },
      {
        id: 46,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "046" },
      },
      {
        id: 51,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "051" },
      },
      {
        id: 54,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "054" },
      },
      {
        id: 55,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "055" },
      },
      {
        id: 59,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "059" },
      },
      {
        id: 60,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "060" },
      },
      {
        id: 61,
        url: "https://arcoplex.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "061" },
      },
    ];

    const cinemaPromises = cinemas.map((cinema) => {
      console.log(`Processando cinema ${cinema.id}...`);
      return syncFilmes(cinema.id, cinema.url, cinema.payload)
        .then(() => {
          console.log(`✓ Cinema ${cinema.id} concluído`);
        })
        .catch((error) => {
          console.error(`✗ Erro no cinema ${cinema.id}:`, error.message);
        });
    });

    await Promise.all(cinemaPromises);

    console.log("\n=== SINCRONIZAÇÃO CONCLUÍDA ===");
    console.log(`Total de cinemas processados: ${cinemas.length}`);
    console.log("Todos os cinemas foram processados em paralelo!");
  } catch (error) {
    console.error("Erro durante a sincronização:", error);
    process.exit(1);
  }
}

//main();

// Export functions para uso via endpoint
export { syncFilmes, main as syncVendaBem };
