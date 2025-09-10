// import axios from "axios";
// import { Pool } from "pg";
// import dayjs from "dayjs";
// import isoWeek from "dayjs/plugin/isoWeek";
// import customParseFormat from "dayjs/plugin/customParseFormat";

// dayjs.extend(isoWeek);
// dayjs.extend(customParseFormat);

// // ================== CONFIG DB ==================
// const pool = new Pool({
//   user: "mooviai",
//   host: "localhost",
//   database: "cinemas",
//   password: "ServerMoovia123",
//   port: 5432,
// });

// // ================== HELPERS ==================
// function formatHora(hora: number): string {
//   const h = Math.floor(hora / 100);
//   const m = hora % 100;
//   return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
// }

// function mapLegendado(value: string): string {
//   const lower = value.toLowerCase();
//   if (lower.includes("nacional")) return "(NAC)";
//   if (lower.includes("dublado")) return "(DUB)";
//   return "(LEG)";
// }

// function getCineSemana(dateStr: string) {
//   const d = dayjs(dateStr, "DD/MM/YYYY");
//   const semanaInicio = d.day(4).isAfter(d) ? d.day(-3) : d.day(4);
//   const semanaFim = semanaInicio.add(6, "day");
//   return {
//     semanaInicio: semanaInicio.format("YYYY-MM-DD"),
//     semanaFim: semanaFim.format("YYYY-MM-DD"),
//   };
// }

// function mapSessionsByWeekDays(sessoes: any[]) {
//   const dias: Record<string, string[]> = {
//     segunda: [],
//     terca: [],
//     quarta: [],
//     quinta: [],
//     sexta: [],
//     sabado: [],
//     domingo: [],
//   };

//   sessoes.forEach((s) => {
//     const data = dayjs(s.data, "DD/MM/YYYY");
//     const horaFormatada = formatHora(s.hora);
//     const tipo = mapLegendado(s.legendado);
//     const sessaoStr = `${s.data} ${horaFormatada} ${tipo}`;

//     switch (data.day()) {
//       case 0:
//         dias.domingo.push(sessaoStr);
//         break;
//       case 1:
//         dias.segunda.push(sessaoStr);
//         break;
//       case 2:
//         dias.terca.push(sessaoStr);
//         break;
//       case 3:
//         dias.quarta.push(sessaoStr);
//         break;
//       case 4:
//         dias.quinta.push(sessaoStr);
//         break;
//       case 5:
//         dias.sexta.push(sessaoStr);
//         break;
//       case 6:
//         dias.sabado.push(sessaoStr);
//         break;
//     }
//   });

//   return Object.fromEntries(
//     Object.entries(dias).map(([k, v]) => [k, v.join(", ") || null])
//   );
// }

// // ================== MAIN LOGIC ==================
// async function syncFilmes(idCinema: number, url: string, payload: any) {
//   try {
//     // 1- Buscar dados da API
//     const response = await axios.post(url, payload, {
//       headers: {
//         Authorization: "Basic d3Ntb292aTpRSW5IMy11NUB7MGhqcFs=",
//         "Content-Type": "multipart/form-data",
//         Accept: "application/json",
//         "User-Agent": "MyIntegration/1.0",
//       },
//     });

//     const filmes = response.data;

//     for (const filme of filmes) {
//       const nome = filme.filme_site || filme.nome_filme;

//       const insertFilmeQuery = `
//         INSERT INTO filmes
//           (nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia)
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
//         ON CONFLICT (codigo_filme) DO UPDATE SET
//           nome = EXCLUDED.nome,
//           sinopse = EXCLUDED.sinopse,
//           duracao = EXCLUDED.duracao,
//           classificacao = EXCLUDED.classificacao,
//           genero = EXCLUDED.genero,
//           url_poster = EXCLUDED.url_poster,
//           url_trailer = EXCLUDED.url_trailer,
//           data_estreia = EXCLUDED.data_estreia
//         RETURNING id;
//       `;

//       const values = [
//         nome,
//         filme.sinopse || "",
//         filme.duracao,
//         filme.classificacao,
//         filme.genero,
//         filme.cartaz,
//         filme.trailer,
//         dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
//       ];

//       const { rows } = await pool.query(insertFilmeQuery, values);
//       const idFilme = rows[0].id;

//       if (!filme.sessoes || filme.sessoes.length === 0) continue;

//       const qualquerData = filme.sessoes[0].data;
//       const { semanaInicio, semanaFim } = getCineSemana(qualquerData);
//       const sessoesSemana = mapSessionsByWeekDays(filme.sessoes);

//       const insertProgQuery = `
//         INSERT INTO programacao
//           (id_filme, id_cinema, status, data_estreia, semana_inicio, semana_fim,
//            segunda, terca, quarta, quinta, sexta, sabado, domingo)
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
//         ON CONFLICT (id_filme, id_cinema) DO UPDATE SET
//            segunda = EXCLUDED.segunda,
//            terca = EXCLUDED.terca,
//            quarta = EXCLUDED.quarta,
//            quinta = EXCLUDED.quinta,
//            sexta = EXCLUDED.sexta,
//            sabado = EXCLUDED.sabado,
//            domingo = EXCLUDED.domingo;
//       `;

//       const progValues = [
//         idFilme,
//         idCinema,
//         "em cartaz",
//         dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
//         semanaInicio,
//         semanaFim,
//         sessoesSemana.segunda,
//         sessoesSemana.terca,
//         sessoesSemana.quarta,
//         sessoesSemana.quinta,
//         sessoesSemana.sexta,
//         sessoesSemana.sabado,
//         sessoesSemana.domingo,
//       ];

//       await pool.query(insertProgQuery, progValues);
//     }

//     console.log(`Sincronização concluída para cinema ${idCinema}!`);
//   } catch (err) {
//     console.error(`Erro na sincronização do cinema ${idCinema}:`, err);
//   }
// }

// // ================== EXECUÇÃO ==================
// async function main() {
//   const cinemas = [
//     {
//       id: 18,
//       url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "001" },
//     },
//     {
//       id: 17,
//       url: "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "002" },
//     },
//     {
//       id: 2,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "002" },
//     },
//     {
//       id: 3,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "003" },
//     },
//     {
//       id: 4,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "004" },
//     },
//     {
//       id: 5,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "005" },
//     },
//     {
//       id: 6,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "006" },
//     },
//     {
//       id: 8,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "008" },
//     },
//     {
//       id: 9,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "009" },
//     },
//     {
//       id: 12,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "012" },
//     },
//     {
//       id: 13,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "013" },
//     },
//     {
//       id: 14,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "014" },
//     },
//     {
//       id: 16,
//       url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       payload: { usa_pai_filho: "1", filiais: "016" },
//     },
//     // {
//     //   id: 2,
//     //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//     //   payload: { usa_pai_filho: "1", filiais: "002" },
//     // },
//     // {
//     //   id: 2,
//     //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//     //   payload: { usa_pai_filho: "1", filiais: "002" },
//     // },
//     // {
//     //   id: 2,
//     //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//     //   payload: { usa_pai_filho: "1", filiais: "002" },
//     // },
//     // {
//     //   id: 2,
//     //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//     //   payload: { usa_pai_filho: "1", filiais: "002" },
//     // },
//     // {
//     //   id: 2,
//     //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//     //   payload: { usa_pai_filho: "1", filiais: "002" },
//     // },
//     // pode adicionar quantos quiser...
//   ];

//   for (const cinema of cinemas) {
//     await syncFilmes(cinema.id, cinema.url, cinema.payload);
//   }
// }

// main();
import axios from "axios";
import { Pool } from "pg";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

// ================== CONFIG DB ==================
const pool = new Pool({
  user: "mooviai",
  host: "localhost",
  database: "cinemas",
  password: "ServerMoovia123",
  port: 5432,
});

// ================== HELPERS ==================
function formatHora(hora: number): string {
  const h = Math.floor(hora / 100);
  const m = hora % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const dias: Record<string, string[]> = {
    segunda: [],
    terca: [],
    quarta: [],
    quinta: [],
    sexta: [],
    sabado: [],
    domingo: [],
  };

  sessoes.forEach((s) => {
    const data = dayjs(s.data, "DD/MM/YYYY");
    const horaFormatada = formatHora(s.hora);
    const tipo = mapLegendado(s.legendado);
    const sessaoStr = `${s.data} ${horaFormatada} ${tipo}`;

    switch (data.day()) {
      case 0:
        dias.domingo.push(sessaoStr);
        break;
      case 1:
        dias.segunda.push(sessaoStr);
        break;
      case 2:
        dias.terca.push(sessaoStr);
        break;
      case 3:
        dias.quarta.push(sessaoStr);
        break;
      case 4:
        dias.quinta.push(sessaoStr);
        break;
      case 5:
        dias.sexta.push(sessaoStr);
        break;
      case 6:
        dias.sabado.push(sessaoStr);
        break;
    }
  });

  return Object.fromEntries(
    Object.entries(dias).map(([k, v]) => [k, v.join(", ") || null])
  );
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
async function syncFilmes(
  idCinema: number,
  url: string,
  payload: any,
  filmesCache: Map<string, number>
) {
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
      const nome = filme.filme_site || filme.nome_filme;
      const nomeNorm = normalizeName(nome);

      let idFilme: number;

      if (filmesCache.has(nomeNorm)) {
        // Já existe no cache → usar o ID existente
        idFilme = filmesCache.get(nomeNorm)!;
      } else {
        // Não existe → inserir e atualizar cache
        const insertFilmeQuery = `
          INSERT INTO filmes
            (nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (nome) DO UPDATE SET
            sinopse = EXCLUDED.sinopse,
            duracao = EXCLUDED.duracao,
            classificacao = EXCLUDED.classificacao,
            genero = EXCLUDED.genero,
            url_poster = EXCLUDED.url_poster,
            url_trailer = EXCLUDED.url_trailer,
            data_estreia = EXCLUDED.data_estreia
          RETURNING id;
        `;

        const values = [
          nome,
          filme.sinopse || "",
          filme.duracao,
          filme.classificacao,
          filme.genero,
          filme.cartaz,
          filme.trailer,
          dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
        ];

        const { rows } = await pool.query(insertFilmeQuery, values);
        idFilme = rows[0].id;

        // Atualiza cache
        filmesCache.set(nomeNorm, idFilme);
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
        idCinema,
        "em cartaz",
        dayjs(filme.data_estreia, "DD/MM/YYYY").format("YYYY-MM-DD"),
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

      await pool.query(insertProgQuery, progValues);
    }

    console.log(`Sincronização concluída para cinema ${idCinema}!`);
  } catch (err) {
    console.error(`Erro na sincronização do cinema ${idCinema}:`, err);
  }
}

// ================== EXECUÇÃO ==================
async function main() {
  // 1- Carregar todos os filmes existentes no banco em cache
  const filmesCache = new Map<string, number>();
  const { rows } = await pool.query("SELECT id, nome FROM filmes");
  for (const row of rows) {
    filmesCache.set(normalizeName(row.nome), row.id);
  }
  console.log(`Cache inicial de filmes carregado: ${filmesCache.size} filmes`);

  // 2- Rodar sincronização
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
    {
      id: 2,
      url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
      payload: { usa_pai_filho: "1", filiais: "002" },
    },
    {
      id: 2,
      url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
      payload: { usa_pai_filho: "1", filiais: "002" },
    },
    {
      id: 2,
      url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
      payload: { usa_pai_filho: "1", filiais: "002" },
    },
    {
      id: 2,
      url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
      payload: { usa_pai_filho: "1", filiais: "002" },
    },
    {
      id: 2,
      url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
      payload: { usa_pai_filho: "1", filiais: "002" },
    },
    //pode adicionar quantos quiser...
  ];

  for (const cinema of cinemas) {
    await syncFilmes(cinema.id, cinema.url, cinema.payload, filmesCache);
  }
}

main();
