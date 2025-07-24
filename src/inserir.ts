import { Client } from "pg";
import * as XLSX from "xlsx";
import { exit } from "process";
import * as dotenv from "dotenv";
dotenv.config();

// Database configuration
interface DbConfig {
  host: string;
  database: string;
  user: string;
  password: string;
  port: string;
}

const DB_CONFIG: DbConfig = {
  host: process.env.DB_HOST || "5.161.113.232",
  database: process.env.DB_NAME || "cinemas",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || "5432",
};

// Interfaces for data structures
interface Filme {
  id?: number;
  nome?: string;
  sinopse?: string;
  duracao?: number | null;
  classificacao?: string;
  genero?: string;
  diretor?: string;
  elenco_principal?: string;
  data_estreia?: string | Date;
  url_poster?: string;
  url_trailer?: string;
}

interface Cinema {
  ID?: number;
  Nome?: string;
  Endereço?: string;
  url_conferir_horarios?: string;
  url_comprar_ingresso?: string;
}

interface Programacao {
  id_filme?: number;
  id_cinema?: number;
  Status?: string;
  Semana_Inicio?: string | Date;
  Semana_Fim?: string | Date;
  Segunda?: string;
  Terça?: string;
  Quarta?: string;
  Quinta?: string;
  Sexta?: string;
  Sábado?: string;
  Domingo?: string;
}

interface Sheets {
  filmes?: any[][];
  programacao?: any[][];
  cinemas?: any[][];
}

async function conectarPostgres(): Promise<Client | null> {
  try {
    const client = new Client({
      ...DB_CONFIG,
      port: parseInt(DB_CONFIG.port),
    });
    await client.connect();
    return client;
  } catch (e) {
    console.error(`Erro ao conectar ao PostgreSQL: ${e}`);
    return null;
  }
}

function lerPlanilha(excelFile: string): Sheets | null {
  try {
    const workbook = XLSX.readFile(excelFile);
    const sheetNames = workbook.SheetNames;
    console.log(`Planilhas encontradas: ${sheetNames}`);

    const sheets: Sheets = {};
    for (const name of sheetNames) {
      const lowerName = name.toLowerCase().trim();
      const sheet = workbook.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (lowerName.includes("filme")) {
        sheets.filmes = data;
      } else if (lowerName.includes("programa")) {
        sheets.programacao = data;
      } else if (lowerName.includes("cinema")) {
        sheets.cinemas = data;
      }
    }

    const required = ["filmes", "programacao", "cinemas"];
    for (const req of required) {
      if (!sheets[req]) {
        console.error(
          `Erro: Planilha '${req}' não encontrada. Nomes disponíveis: ${sheetNames}`
        );
        return null;
      }
    }

    return sheets;
  } catch (e) {
    console.error(`Erro ao ler arquivo Excel: ${e}`);
    return null;
  }
}

function converterData(valor: any): string | null {
  if (!valor || valor === "NaN" || valor === "" || valor === "-") {
    return null;
  }

  // Se já for um objeto Date válido
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().split("T")[0];
  }

  // Se for um número serial do Excel (dias desde 01/01/1900)
  if (typeof valor === "number") {
    // Excel tem um bug que considera 1900 como ano bissexto, então subtraímos 1 dia para datas após 28/02/1900
    const excelEpoch = new Date(1899, 11, 31);
    const excelSerial = valor;
    const date = new Date(excelEpoch.getTime() + excelSerial * 86400000);

    // Ajuste para o bug do Excel (29/02/1900 que não existe)
    if (excelSerial >= 60) {
      date.setTime(date.getTime() - 86400000);
    }

    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Tenta parsear como string no formato ISO (YYYY-MM-DD)
  if (typeof valor === "string") {
    // Remove qualquer parte de tempo que possa estar presente
    const datePart = valor.split(" ")[0];
    const isoDate = new Date(datePart);

    if (!isNaN(isoDate.getTime())) {
      return isoDate.toISOString().split("T")[0];
    }

    // Tenta formatos brasileiros (DD/MM/YYYY)
    const brFormat = datePart.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (brFormat) {
      const date = new Date(`${brFormat[3]}-${brFormat[2]}-${brFormat[1]}`);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }

    // Tenta formatos americanos (MM/DD/YYYY)
    const usFormat = datePart.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (usFormat) {
      const date = new Date(`${usFormat[3]}-${usFormat[1]}-${usFormat[2]}`);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }
  }

  console.error(`Não foi possível converter a data: ${valor}`);
  return null;
}

async function inserirFilmes(
  conn: Client,
  filmesData: any[][]
): Promise<{ [key: number]: number }> {
  const idMap: { [key: number]: number } = {};
  await conn.query("BEGIN");
  try {
    const headers = filmesData[0] as string[];
    const rows = filmesData.slice(1);

    for (const row of rows) {
      const filme: Partial<Filme> = {};
      headers.forEach((header: string, i: number) => {
        if (
          [
            "id",
            "nome",
            "sinopse",
            "duracao",
            "classificacao",
            "genero",
            "diretor",
            "elenco_principal",
            "data_estreia",
            "url_poster",
            "url_trailer",
          ].includes(header)
        ) {
          (filme as any)[header] = row[i] ?? undefined;
        }
      });
      if (!filme.nome || filme.nome.toString().trim() === "") {
        continue;
      }

      let duracao: number | null = null;
      try {
        if (
          filme.duracao &&
          filme.duracao.toString().trim() !== "" &&
          filme.duracao.toString() !== "-"
        ) {
          duracao = parseFloat(filme.duracao.toString());
        }
      } catch {
        duracao = null;
      }

      const dataEstreia = converterData(filme.data_estreia);

      const query = `
        INSERT INTO filmes (nome, sinopse, duracao, classificacao, genero, diretor, 
                           elenco_principal, data_estreia, url_poster, url_trailer)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
      `;

      const values = [
        filme.nome.toString(),
        filme.sinopse?.toString() ?? null,
        duracao,
        filme.classificacao?.toString() ?? null,
        filme.genero?.toString() ?? null,
        filme.diretor?.toString() ?? null,
        filme.elenco_principal?.toString() ?? null,
        dataEstreia,
        filme.url_poster?.toString() ?? null,
        filme.url_trailer?.toString() ?? null,
      ];

      const res = await conn.query(query, values);
      const novoId = res.rows[0].id;
      if (filme.id && !isNaN(Number(filme.id))) {
        idMap[Number(filme.id)] = novoId;
      }
    }

    await conn.query("COMMIT");
    console.log(`${Object.keys(idMap).length} filmes inseridos com sucesso.`);
    return idMap;
  } catch (e) {
    await conn.query("ROLLBACK");
    console.error(`Erro ao inserir filmes: ${e}`);
    return {};
  }
}

async function inserirCinemas(
  conn: Client,
  cinemasData: any[][]
): Promise<{ [key: number]: number }> {
  const idMap: { [key: number]: number } = {};
  await conn.query("BEGIN");
  try {
    const headers = cinemasData[0] as string[];
    const rows = cinemasData.slice(1);

    for (const row of rows) {
      const cinema: Partial<Cinema> = {};
      headers.forEach((header: string, i: number) => {
        if (
          [
            "ID",
            "Nome",
            "Endereço",
            "url_conferir_horarios",
            "url_comprar_ingresso",
          ].includes(header)
        ) {
          (cinema as any)[header] = row[i] ?? undefined;
        }
      });

      if (!cinema.Nome || cinema.Nome.toString().trim() === "") {
        continue;
      }

      const query = `
        INSERT INTO cinemas (nome, endereco, url_conferir_horarios, url_comprar_ingresso)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `;

      const values = [
        cinema.Nome.toString(),
        cinema.Endereço?.toString() ?? null,
        cinema.url_conferir_horarios?.toString() ?? null,
        cinema.url_comprar_ingresso?.toString() ?? null,
      ];

      const res = await conn.query(query, values);
      const novoId = res.rows[0].id;
      if (cinema.ID && !isNaN(Number(cinema.ID))) {
        idMap[Number(cinema.ID)] = novoId;
      }
    }

    await conn.query("COMMIT");
    console.log(`${Object.keys(idMap).length} cinemas inseridos com sucesso.`);
    return idMap;
  } catch (e) {
    await conn.query("ROLLBACK");
    console.error(`Erro ao inserir cinemas: ${e}`);
    return {};
  }
}

async function inserirProgramacao(
  conn: Client,
  programacaoData: any[][],
  filmesIdMap: { [key: number]: number },
  cinemasIdMap: { [key: number]: number }
): Promise<void> {
  await conn.query("BEGIN");
  try {
    const headers = programacaoData[0] as string[];
    const rows = programacaoData.slice(1);
    let count = 0;
    let skipped = 0;

    for (const row of rows) {
      const programacao: Partial<Programacao> = {};
      headers.forEach((header: string, i: number) => {
        if (
          [
            "id_filme",
            "id_cinema",
            "Status",
            "Semana_Inicio",
            "Semana_Fim",
            "Segunda",
            "Terça",
            "Quarta",
            "Quinta",
            "Sexta",
            "Sábado",
            "Domingo",
          ].includes(header)
        ) {
          (programacao as any)[header] = row[i] ?? undefined;
        }
      });

      let idFilme: number | null = null;
      let idCinema: number | null = null;
      try {
        idFilme =
          programacao.id_filme && !isNaN(Number(programacao.id_filme))
            ? filmesIdMap[Number(programacao.id_filme)]
            : null;
        idCinema =
          programacao.id_cinema && !isNaN(Number(programacao.id_cinema))
            ? cinemasIdMap[Number(programacao.id_cinema)]
            : null;
      } catch {
        idFilme = null;
        idCinema = null;
      }

      if (!idFilme || !idCinema) {
        skipped++;
        continue;
      }

      const query = `
        INSERT INTO programacao (id_filme, id_cinema, status, semana_inicio, semana_fim,
                                segunda, terca, quarta, quinta, sexta, sabado, domingo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
      `;

      const semanaInicio = converterData(programacao.Semana_Inicio);
      const semanaFim = converterData(programacao.Semana_Fim);

      const values = [
        idFilme,
        idCinema,
        programacao.Status?.toString() ?? null,
        semanaInicio,
        semanaFim,
        programacao.Segunda?.toString() ?? null,
        programacao.Terça?.toString() ?? null,
        programacao.Quarta?.toString() ?? null,
        programacao.Quinta?.toString() ?? null,
        programacao.Sexta?.toString() ?? null,
        programacao.Sábado?.toString() ?? null,
        programacao.Domingo?.toString() ?? null,
      ];

      await conn.query(query, values);
      count++;
    }

    await conn.query("COMMIT");
    console.log(
      `${count} programações inseridas com sucesso. ${skipped} ignoradas devido a relacionamentos inválidos.`
    );
  } catch (e) {
    await conn.query("ROLLBACK");
    console.error(`Erro ao inserir programação: ${e}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Uso: node inserir.js <caminho_do_arquivo_excel>");
    return;
  }

  const excelFile = args[0];
  const sheets = lerPlanilha(excelFile);
  if (!sheets) {
    return;
  }

  const conn = await conectarPostgres();
  if (!conn) {
    return;
  }

  try {
    const filmesIdMap = await inserirFilmes(conn, sheets.filmes!);
    const cinemasIdMap = await inserirCinemas(conn, sheets.cinemas!);

    if (Object.keys(filmesIdMap).length && Object.keys(cinemasIdMap).length) {
      await inserirProgramacao(
        conn,
        sheets.programacao!,
        filmesIdMap,
        cinemasIdMap
      );
    }
  } catch (e) {
    console.error(`Erro geral: ${e}`);
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

main().catch((e) => {
  console.error(`Erro na execução do programa: ${e}`);
  exit(1);
});
