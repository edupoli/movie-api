import axios from "axios";
import { Pool } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { findMovieIdByName } from "../fuzzyMatch";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

// ================== CONFIG DB ==================
const pool = new Pool({
  host: process.env.DB_HOST || "5.161.113.232",
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "mooviai",
  password: process.env.DB_PASSWORD || "ServerMoovia123",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 30100,
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

function mapLegendado(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("nacional")) return "(NAC)";
  if (lower.includes("dublado")) return "(DUB)";
  return "(LEG)";
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
    const tipo = mapLegendado(s.legendado);
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

  // Monta string final para cada dia da semana
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

// Normalização de nomes
function normalizeName(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD") // remove acentos
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "") // remove caracteres especiais
    .replace(/\s+/g, " ") // normaliza espaços
    .trim();
}

// ================== MAIN LOGIC ==================
async function syncFilmes(idCinema: number, url: string, payload: any) {
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: "Basic d3Ntb292aTpRSW5IMy11NUB7MGhqcFs=",
        "Content-Type": "multipart/form-data",
        Accept: "application/json",
        "User-Agent": "MyIntegration/1.0",
      },
    });

    const filmes = response.data;

    for (const filme of filmes) {
      let nomeFilme = "";
      try {
        nomeFilme = filme.filme_site || filme.nome_filme;
        const nomeFormatado = toTitleCase(nomeFilme);

        // Buscar filme similar usando findMovieIdByName
        let idFilme: number;
        let dataEstreia: Date;

        const filmesEncontrados = await findMovieIdByName(nomeFormatado);

        if (filmesEncontrados && filmesEncontrados.length > 0) {
          idFilme = filmesEncontrados[0].id;
          dataEstreia = filmesEncontrados[0].data_estreia;
        } else {
          // Filme não existe, fazer insert
          const values = [
            nomeFormatado,
            filme.sinopse || "",
            filme.duracao,
            filme.classificacao,
            filme.genero,
            filme.cartaz,
            filme.trailer,
            dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
          ];

          const insertFilmeQuery = `
            INSERT INTO filmes
              (nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING id, data_estreia;
          `;

          try {
            const { rows } = await pool.query(insertFilmeQuery, values);
            idFilme = rows[0].id;
            dataEstreia = rows[0].data_estreia;
          } catch (insertError: any) {
            // Se der erro de duplicata (unique violation), busca o filme existente
            if (insertError.code === "23505") {
              const selectQuery = `SELECT id, data_estreia FROM filmes WHERE nome = $1`;
              const { rows } = await pool.query(selectQuery, [nomeFormatado]);
              if (rows.length > 0) {
                idFilme = rows[0].id;
                dataEstreia = rows[0].data_estreia;

                // Atualiza os dados do filme existente
                const updateQuery = `
                  UPDATE filmes SET
                    sinopse = $2,
                    duracao = $3,
                    classificacao = $4,
                    genero = $5,
                    url_poster = $6,
                    url_trailer = $7,
                    data_estreia = $8
                  WHERE nome = $1
                `;
                await pool.query(updateQuery, values);
              } else {
                throw insertError;
              }
            } else {
              throw insertError;
            }
          }
        }

        // Programação
        if (!filme.sessoes || filme.sessoes.length === 0) continue;

        const qualquerData = filme.sessoes[0].data;
        const { semanaInicio, semanaFim } = getCineSemana(qualquerData);
        const sessoesSemana = mapSessionsByWeekDays(filme.sessoes);

        const insertProgQuery = `
          INSERT INTO programacao
            (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
             segunda, terca, quarta, quinta, sexta, sabado, domingo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `;

        const progValues = [
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
      } catch (err) {
        console.error(
          `Erro ao processar filme ${nomeFilme} do cinema ${idCinema}:`,
          err
        );
        continue; // continua para o próximo filme mesmo se houver erro
      }
    }
    console.log(`Sincronização concluída para cinema ${idCinema}!`);
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
        id: 18,
        url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "001" },
      },
      {
        id: 17,
        url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
        payload: { usa_pai_filho: "1", filiais: "002" },
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
    ];

    for (const cinema of cinemas) {
      await syncFilmes(cinema.id, cinema.url, cinema.payload);
    }

    console.log("Sincronização concluída para todos os cinemas!");
  } catch (error) {
    console.error("Erro durante a sincronização:", error);
    process.exit(1);
  }
}

//main();

// Export functions para uso via endpoint
export { syncFilmes, main as syncVendaBem };
