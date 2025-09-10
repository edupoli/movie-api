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

// // Converte hora em número (ex: 1450 -> "14:50")
// function formatHora(hora: number): string {
//   const h = Math.floor(hora / 100);
//   const m = hora % 100;
//   return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
// }

// // Retorna (NAC), (DUB) ou (LEG)
// function mapLegendado(value: string): string {
//   const lower = value.toLowerCase();

//   if (lower.includes("nacional")) {
//     return "(NAC)";
//   } else if (lower.includes("dublado")) {
//     return "(DUB)";
//   } else {
//     return "(LEG)";
//   }
// }

// // Descobre cine semana a partir de uma data
// function getCineSemana(dateStr: string) {
//   const d = dayjs(dateStr, "DD/MM/YYYY");
//   // Descobre o dia da semana (0 = domingo, 4 = quinta, 3 = quarta, etc)
//   const dayOfWeek = d.day();

//   // Ajusta para quinta-feira anterior
//   const semanaInicio = d.day(4).isAfter(d) ? d.day(-3) : d.day(4);
//   // Ajusta para quarta-feira da mesma semana
//   const semanaFim = semanaInicio.add(6, "day");

//   return {
//     semanaInicio: semanaInicio.format("YYYY-MM-DD"),
//     semanaFim: semanaFim.format("YYYY-MM-DD"),
//   };
// }

// // Agrupa sessões por dia da semana
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

//   // Se não houver sessão para o dia → “DD/MM/AAAA (Sem sessão)”
//   Object.keys(dias).forEach((k) => {
//     if (dias[k].length === 0) {
//       dias[k] = []; // deixamos vazio, banco pode tratar como null ou string padrão
//     }
//   });

//   return Object.fromEntries(
//     Object.entries(dias).map(([k, v]) => [k, v.join(", ")])
//   );
// }

// // ================== MAIN LOGIC ==================
// async function syncFilmes(idCinema: number) {
//   try {
//     // 1- Buscar dados da API
//     const response = await axios.post(
//       "https://cinemarquise.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
//       {
//         usa_pai_filho: "1",
//         filiais: "001",
//       },
//       {
//         headers: {
//           Authorization: "Basic d3Ntb292aTpRSW5IMy11NUB7MGhqcFs=",
//           "Content-Type": "multipart/form-data",
//           Accept: "application/json",
//           "User-Agent": "MyIntegration/1.0",
//         },
//       }
//     );

//     const filmes = response.data;

//     for (const filme of filmes) {
//       // 2- Normalizar filme
//       const nome = filme.filme_site || filme.nome_filme;

//       const insertFilmeQuery = `
//         INSERT INTO filmes
//           (codigo_filme, nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia)
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
//         filme.sessoes[0]?.codigo_filme,
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

//       // 3- Programação
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
//         sessoesSemana.segunda || null,
//         sessoesSemana.terca || null,
//         sessoesSemana.quarta || null,
//         sessoesSemana.quinta || null,
//         sessoesSemana.sexta || null,
//         sessoesSemana.sabado || null,
//         sessoesSemana.domingo || null,
//       ];

//       await pool.query(insertProgQuery, progValues);
//     }

//     console.log("Sincronização concluída!");
//   } catch (err) {
//     console.error("Erro na sincronização:", err);
//   }
// }

// // Executa para cinema 1
// syncFilmes(1);
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

// ================== MAIN LOGIC ==================
async function syncFilmes(idCinema: number, url: string, payload: any) {
  try {
    // 1- Buscar dados da API
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

      const insertFilmeQuery = `
        INSERT INTO filmes
          (codigo_filme, nome, sinopse, duracao, classificacao, genero, url_poster, url_trailer, data_estreia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (codigo_filme) DO UPDATE SET
          nome = EXCLUDED.nome,
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
        filme.sessoes[0]?.codigo_filme,
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
      const idFilme = rows[0].id;

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
    // {
    //   id: 2,
    //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
    //   payload: { usa_pai_filho: "1", filiais: "002" },
    // },
    // {
    //   id: 2,
    //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
    //   payload: { usa_pai_filho: "1", filiais: "002" },
    // },
    // {
    //   id: 2,
    //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
    //   payload: { usa_pai_filho: "1", filiais: "002" },
    // },
    // {
    //   id: 2,
    //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
    //   payload: { usa_pai_filho: "1", filiais: "002" },
    // },
    // {
    //   id: 2,
    //   url: "https://multicine.vendabem.com/vendabemweb/ws/integracao_site_filmes/",
    //   payload: { usa_pai_filho: "1", filiais: "002" },
    // },
    // pode adicionar quantos quiser...
  ];

  for (const cinema of cinemas) {
    await syncFilmes(cinema.id, cinema.url, cinema.payload);
  }
}

main();
