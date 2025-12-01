import axios from "axios";
import { Pool } from "pg";
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

  // Monta string final para cada dia da semana com fallback
  const resultado: Record<string, string> = {};
  for (const [dia, datas] of Object.entries(dias)) {
    const partes: string[] = [];
    for (const [data, horarios] of Object.entries(datas)) {
      if (horarios.length > 0) {
        partes.push(`${data} ${horarios.join(", ")}`);
      }
    }
    // Se não há sessões para o dia, usa "(Sem Sessao)" como fallback
    resultado[dia] = partes.length > 0 ? partes.join(", ") : "(Sem Sessao)";
  }
  return resultado;
}

// ================== MOVIE PROCESSING ==================
async function processMovieData(filme: any, idCinema: number) {
  let nomeFilme = "";
  try {
    nomeFilme = filme.filme_site || filme.nome_filme;
    const nomeFormatado = toTitleCase(nomeFilme);
    const codigoFilme = filme.codigoFilme;

    // Verifica se o filme já existe para este cinema e codigo_filme
    const checkFilmeQuery = `
      SELECT id, data_estreia FROM filmes 
      WHERE id_cinema = $1 AND codigo_filme = $2
    `;

    let filmeResult = await pool.query(checkFilmeQuery, [
      idCinema,
      codigoFilme,
    ]);
    let idFilme: number;
    let dataEstreia: Date;

    if (filmeResult.rows.length > 0) {
      // Filme já existe, atualiza os dados
      idFilme = filmeResult.rows[0].id;
      dataEstreia = filmeResult.rows[0].data_estreia;

      const updateFilmeQuery = `
        UPDATE filmes SET
          nome = $3, sinopse = $4, duracao = $5, classificacao = $6,
          genero = $7, url_poster = $8, url_trailer = $9, data_estreia = $10
        WHERE id_cinema = $1 AND codigo_filme = $2
      `;

      const updateValues = [
        idCinema,
        codigoFilme,
        nomeFormatado,
        filme.sinopse || "",
        filme.duracao,
        filme.classificacao,
        filme.genero,
        filme.cartaz,
        filme.trailer,
        dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
      ];

      await pool.query(updateFilmeQuery, updateValues);
      console.log(
        `Filme atualizado: ${nomeFormatado} (Cinema: ${idCinema}, Código: ${codigoFilme})`
      );
    } else {
      // Filme não existe, faz insert
      const insertFilmeQuery = `
        INSERT INTO filmes
          (id_cinema, nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia, codigo_filme)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, data_estreia;
      `;

      const insertValues = [
        idCinema,
        nomeFormatado,
        filme.sinopse || "",
        filme.duracao,
        filme.classificacao,
        filme.genero,
        filme.cartaz,
        filme.trailer,
        dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
        codigoFilme,
      ];

      const { rows } = await pool.query(insertFilmeQuery, insertValues);
      idFilme = rows[0].id;
      dataEstreia = rows[0].data_estreia;
      console.log(
        `Filme inserido: ${nomeFormatado} (Cinema: ${idCinema}, Código: ${codigoFilme})`
      );
    }

    return {
      idFilme,
      dataEstreia,
      codigoFilme,
      nomeFormatado,
      sessoes: filme.sessoes,
    };
  } catch (err) {
    console.error(`Erro ao processar filme ${nomeFilme}:`, err);
    throw err;
  }
}

// ================== PROGRAMMING PROCESSING ==================
async function processProgramacao(filmeData: any, idCinema: number) {
  const { idFilme, dataEstreia, sessoes } = filmeData;

  // Agrupa sessões por cine-semana
  const sessionsByWeek = groupSessionsByCineWeek(sessoes);

  // Processa cada cine-semana
  for (const [semanaInicio, weekSessions] of Object.entries(sessionsByWeek)) {
    const semanaInicioDate = dayjs(semanaInicio, "YYYY-MM-DD");
    const semanaFim = semanaInicioDate.add(6, "day").format("YYYY-MM-DD");

    const sessoesSemana = mapSessionsByWeekDays(weekSessions);

    const checkProgQuery = `
      SELECT id FROM programacao 
      WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $3
    `;

    const progResult = await pool.query(checkProgQuery, [
      idFilme,
      idCinema,
      semanaInicio,
    ]);

    if (progResult.rows.length > 0) {
      // Programação já existe, atualiza
      const updateProgQuery = `
        UPDATE programacao SET
          status = $4, data_estreia = $5, semana_fim = $6, segunda = $7,
          terca = $8, quarta = $9, quinta = $10, sexta = $11,
          sabado = $12, domingo = $13
        WHERE id_filme = $1 AND id_cinema = $2 AND semana_inicio = $3
      `;

      const updateProgValues = [
        idFilme,
        idCinema,
        semanaInicio,
        "em cartaz",
        dataEstreia,
        semanaFim,
        sessoesSemana.segunda,
        sessoesSemana.terca,
        sessoesSemana.quarta,
        sessoesSemana.quinta,
        sessoesSemana.sexta,
        sessoesSemana.sabado,
        sessoesSemana.domingo,
      ];

      await pool.query(updateProgQuery, updateProgValues);
      console.log(
        `Programação atualizada para filme ID: ${idFilme} (Semana: ${semanaInicio})`
      );
    } else {
      // Programação não existe, insere
      const insertProgQuery = `
        INSERT INTO programacao
          (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
           segunda, terca, quarta, quinta, sexta, sabado, domingo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `;

      const insertProgValues = [
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

      await pool.query(insertProgQuery, insertProgValues);
      console.log(
        `Programação inserida para filme ID: ${idFilme} (Semana: ${semanaInicio})`
      );
    }
  }
}

// ================== MAIN LOGIC ==================
async function syncFilmes(idCinema: number, url: string, payload: any) {
  try {
    console.log(`Iniciando sincronização para cinema ${idCinema}...`);

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: "Basic d3Ntb292aTpRSW5IMy11NUB7MGhqcFs=",
        "Content-Type": "multipart/form-data",
        Accept: "application/json",
        "User-Agent": "MyIntegration/1.0",
      },
    });

    const filmes = response.data;

    // Agrupa filmes por codigo_filme das sessões para identificar filmes únicos
    const filmesAgrupados = new Map();

    for (const filme of filmes) {
      if (!filme.sessoes || filme.sessoes.length === 0) continue;

      // Pega o codigo_filme da primeira sessão (todas as sessões do mesmo filme têm o mesmo codigo_filme)
      const codigoFilme = filme.sessoes[0].codigo_filme;

      if (!filmesAgrupados.has(codigoFilme)) {
        filmesAgrupados.set(codigoFilme, {
          ...filme,
          codigoFilme,
        });
      }
    }

    // 1. Processar todos os filmes em paralelo
    const moviePromises = Array.from(filmesAgrupados.values()).map((filme) =>
      processMovieData(filme, idCinema).catch((error) => {
        console.error(`Erro ao processar filme ${filme.nome_filme}:`, error);
        return null;
      })
    );

    const processedMovies = await Promise.all(moviePromises);

    // Filtrar resultados válidos
    const validMovies = processedMovies.filter((movie) => movie !== null);

    // 2. Processar programação em paralelo
    const progPromises = validMovies.map((filmeData) =>
      processProgramacao(filmeData, idCinema).catch((error) => {
        console.error(`Erro ao processar programação:`, error);
      })
    );

    await Promise.all(progPromises);

    console.log(
      `Sincronização concluída para cinema ${idCinema}! Processados ${validMovies.length} filmes únicos.`
    );
  } catch (err) {
    console.error(`Erro na sincronização do cinema ${idCinema}:`, err);
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

    // Processar todos os cinemas em paralelo com Promise.all
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
