"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const XLSX = require("xlsx");
const openai_1 = require("openai");
const process_1 = require("process");
const pg_2 = require("pgvector/pg");
const DB_CONFIG = {
    host: "localhost",
    database: "cinemas",
    user: "postgres",
    password: "postgres",
    port: "5432",
};
const openaiApiKey = process.env.OPENAI_API_KEY ||
    "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";
const client = new openai_1.OpenAI({ apiKey: openaiApiKey });
async function conectarPostgres() {
    try {
        const client = new pg_1.Client({
            ...DB_CONFIG,
            port: parseInt(DB_CONFIG.port),
        });
        await client.connect();
        return client;
    }
    catch (e) {
        console.error(`Erro ao conectar ao PostgreSQL: ${e}`);
        return null;
    }
}
function lerPlanilha(excelFile) {
    try {
        const workbook = XLSX.readFile(excelFile);
        const sheetNames = workbook.SheetNames;
        console.log(`Planilhas encontradas: ${sheetNames}`);
        const sheets = {};
        for (const name of sheetNames) {
            const lowerName = name.toLowerCase().trim();
            const sheet = workbook.Sheets[name];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (lowerName.includes("filme")) {
                sheets.filmes = data;
            }
            else if (lowerName.includes("programa")) {
                sheets.programacao = data;
            }
            else if (lowerName.includes("cinema")) {
                sheets.cinemas = data;
            }
        }
        const required = ["filmes", "programacao", "cinemas"];
        for (const req of required) {
            if (!sheets[req]) {
                console.error(`Erro: Planilha '${req}' não encontrada. Nomes disponíveis: ${sheetNames}`);
                return null;
            }
        }
        return sheets;
    }
    catch (e) {
        console.error(`Erro ao ler arquivo Excel: ${e}`);
        return null;
    }
}
function converterData(valor) {
    if (!valor || valor === "NaN" || valor === "") {
        return null;
    }
    if (valor instanceof Date) {
        return valor;
    }
    try {
        let date = new Date(valor);
        if (!isNaN(date.getTime()))
            return date;
        date = new Date(`${valor}T00:00:00`);
        if (!isNaN(date.getTime()))
            return date;
        return null;
    }
    catch {
        return null;
    }
}
async function generateEmbedding(text) {
    if (!text || text.trim() === "") {
        return null;
    }
    try {
        const response = await client.embeddings.create({
            input: text,
            model: "text-embedding-ada-002",
        });
        return response.data[0].embedding;
    }
    catch (e) {
        console.error(`Erro ao gerar embedding com OpenAI: ${e}`);
        return null;
    }
}
async function inserirFilmes(conn, filmesData) {
    const idMap = {};
    await conn.query("BEGIN");
    try {
        const headers = filmesData[0];
        const rows = filmesData.slice(1);
        for (const row of rows) {
            const filme = {};
            headers.forEach((header, i) => {
                if ([
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
                ].includes(header)) {
                    filme[header] = row[i] ?? undefined;
                }
            });
            if (!filme.nome || filme.nome.toString().trim() === "") {
                console.warn(`Ignorando filme com nome ausente ou vazio: ${JSON.stringify(filme)}`);
                continue;
            }
            let duracao = null;
            try {
                if (filme.duracao &&
                    filme.duracao.toString().trim() !== "" &&
                    filme.duracao.toString() !== "-") {
                    duracao = parseFloat(filme.duracao.toString());
                }
            }
            catch {
                duracao = null;
            }
            const dataEstreia = converterData(filme.data_estreia);
            const textToEmbed = `${filme.sinopse || ""} ${filme.genero || ""} ${filme.nome || ""}`.trim();
            const embedding = await generateEmbedding(textToEmbed);
            const query = `
        INSERT INTO filmes (nome, sinopse, duracao, classificacao, genero, diretor, 
                           elenco_principal, data_estreia, url_poster, url_trailer, embedding)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
                embedding ? (0, pg_2.toSql)(embedding) : null,
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
    }
    catch (e) {
        await conn.query("ROLLBACK");
        console.error(`Erro ao inserir filmes: ${e}`);
        return {};
    }
}
async function inserirCinemas(conn, cinemasData) {
    const idMap = {};
    await conn.query("BEGIN");
    try {
        const headers = cinemasData[0];
        const rows = cinemasData.slice(1);
        for (const row of rows) {
            const cinema = {};
            headers.forEach((header, i) => {
                if ([
                    "ID",
                    "Nome",
                    "Endereço",
                    "url_conferir_horarios",
                    "url_comprar_ingresso",
                ].includes(header)) {
                    cinema[header] = row[i] ?? undefined;
                }
            });
            if (!cinema.Nome || cinema.Nome.toString().trim() === "") {
                console.warn(`Ignorando cinema com Nome ausente ou vazio: ${JSON.stringify(cinema)}`);
                continue;
            }
            const textToEmbed = `${cinema.Nome || ""} ${cinema.Endereço || ""}`.trim();
            const embedding = await generateEmbedding(textToEmbed);
            const query = `
        INSERT INTO cinemas (nome, endereco, url_conferir_horarios, url_comprar_ingresso, embedding)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;
            const values = [
                cinema.Nome.toString(),
                cinema.Endereço?.toString() ?? null,
                cinema.url_conferir_horarios?.toString() ?? null,
                cinema.url_comprar_ingresso?.toString() ?? null,
                embedding ? (0, pg_2.toSql)(embedding) : null,
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
    }
    catch (e) {
        await conn.query("ROLLBACK");
        console.error(`Erro ao inserir cinemas: ${e}`);
        return {};
    }
}
async function inserirProgramacao(conn, programacaoData, filmesIdMap, cinemasIdMap) {
    await conn.query("BEGIN");
    try {
        const headers = programacaoData[0];
        const rows = programacaoData.slice(1);
        let count = 0;
        let skipped = 0;
        for (const row of rows) {
            const programacao = {};
            headers.forEach((header, i) => {
                if ([
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
                ].includes(header)) {
                    programacao[header] = row[i] ?? undefined;
                }
            });
            let idFilme = null;
            let idCinema = null;
            try {
                idFilme =
                    programacao.id_filme && !isNaN(Number(programacao.id_filme))
                        ? filmesIdMap[Number(programacao.id_filme)]
                        : null;
                idCinema =
                    programacao.id_cinema && !isNaN(Number(programacao.id_cinema))
                        ? cinemasIdMap[Number(programacao.id_cinema)]
                        : null;
            }
            catch {
                idFilme = null;
                idCinema = null;
            }
            if (!idFilme || !idCinema) {
                skipped++;
                continue;
            }
            const textToEmbed = `${programacao.Status || ""} ${programacao.Segunda || ""} ${programacao.Terça || ""} ${programacao.Quarta || ""} ${programacao.Quinta || ""} ${programacao.Sexta || ""} ${programacao.Sábado || ""} ${programacao.Domingo || ""}`.trim();
            const embedding = await generateEmbedding(textToEmbed);
            const query = `
        INSERT INTO programacao (id_filme, id_cinema, status, semana_inicio, semana_fim,
                                segunda, terca, quarta, quinta, sexta, sabado, domingo, embedding)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
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
                embedding ? (0, pg_2.toSql)(embedding) : null,
            ];
            await conn.query(query, values);
            count++;
        }
        await conn.query("COMMIT");
        console.log(`${count} programações inseridas com sucesso. ${skipped} ignoradas devido a relacionamentos inválidos.`);
    }
    catch (e) {
        await conn.query("ROLLBACK");
        console.error(`Erro ao inserir programação: ${e}`);
    }
}
async function main() {
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
        const filmesIdMap = await inserirFilmes(conn, sheets.filmes);
        const cinemasIdMap = await inserirCinemas(conn, sheets.cinemas);
        if (Object.keys(filmesIdMap).length && Object.keys(cinemasIdMap).length) {
            await inserirProgramacao(conn, sheets.programacao, filmesIdMap, cinemasIdMap);
        }
    }
    catch (e) {
        console.error(`Erro geral: ${e}`);
    }
    finally {
        if (conn) {
            await conn.end();
        }
    }
}
main().catch((e) => {
    console.error(`Erro na execução do programa: ${e}`);
    (0, process_1.exit)(1);
});
//# sourceMappingURL=inserir.js.map