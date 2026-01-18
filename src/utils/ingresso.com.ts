import { Pool, PoolClient } from 'pg';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import fetch from 'node-fetch';

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

// ================== CONFIG DB ==================
const pool = new Pool({
  host: process.env.DB_HOST || '5.161.113.232',
  database: process.env.DB_NAME || 'cinemas',
  user: process.env.DB_USER || 'mooviai',
  password: process.env.DB_PASSWORD || 'ServerMoovia123',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 30500,
});

// ================== HELPERS ==================
function getCineSemana(dateStr: string) {
  const d = dayjs(dateStr, 'YYYY-MM-DD');
  const semanaInicio = d.day(4).isAfter(d) ? d.day(-3) : d.day(4);
  const semanaFim = semanaInicio.add(6, 'day');
  return {
    semanaInicio: semanaInicio.format('YYYY-MM-DD'),
    semanaFim: semanaFim.format('YYYY-MM-DD'),
  };
}

function groupSessionsByCineWeek(sessoes: any[]) {
  const groups: Record<string, any[]> = {};

  sessoes.forEach((sessao) => {
    const dateYYYYMMDD = dayjs(sessao.data, 'DD/MM/YYYY').format('YYYY-MM-DD');
    const { semanaInicio } = getCineSemana(dateYYYYMMDD);
    if (!groups[semanaInicio]) {
      groups[semanaInicio] = [];
    }
    groups[semanaInicio].push(sessao);
  });

  return groups;
}

function mapSessionsByWeekDays(
  sessoes: any[],
  semanaInicio: string,
  semanaFim: string,
) {
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
    const data = dayjs(s.data, 'DD/MM/YYYY');
    const horaFormatada = s.hora;
    const tipo = s.tipo;
    const diaSemana = [
      'domingo',
      'segunda',
      'terca',
      'quarta',
      'quinta',
      'sexta',
      'sabado',
    ][data.day()];

    if (!dias[diaSemana][s.data]) {
      dias[diaSemana][s.data] = [];
    }
    dias[diaSemana][s.data].push(`${horaFormatada} ${tipo}`);
  });

  const resultado: Record<string, string> = {};
  const diasSemanaOrdem = [
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
    'domingo',
  ];
  const inicioDayjs = dayjs(semanaInicio, 'YYYY-MM-DD');
  const fimDayjs = dayjs(semanaFim, 'YYYY-MM-DD');

  for (const [dia, datas] of Object.entries(dias)) {
    const partes: string[] = [];
    for (const [data, horarios] of Object.entries(datas)) {
      if (horarios.length > 0) {
        partes.push(`${data} ${horarios.join(', ')}`);
      }
    }

    // Se não tem sessões para esse dia, gera a data correspondente + (Sem Sessao)
    if (partes.length === 0) {
      // Descobrir qual data corresponde a esse dia da semana na faixa semanaInicio-semanaFim
      const diasSemanaMap = {
        domingo: 0,
        segunda: 1,
        terca: 2,
        quarta: 3,
        quinta: 4,
        sexta: 5,
        sabado: 6,
      };
      const targetDayOfWeek = diasSemanaMap[dia];

      let currentDate = inicioDayjs;
      while (
        currentDate.isBefore(fimDayjs) ||
        currentDate.isSame(fimDayjs, 'day')
      ) {
        if (currentDate.day() === targetDayOfWeek) {
          const dataFormatada = currentDate.format('DD/MM/YYYY');
          partes.push(`${dataFormatada} (Sem Sessao)`);
          break;
        }
        currentDate = currentDate.add(1, 'day');
      }
    }

    resultado[dia] = partes.length > 0 ? partes.join(', ') : '(Sem Sessao)';
  }
  return resultado;
}

// ================== API FUNCTIONS ==================
async function fetchFromAPI(url: string): Promise<any> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
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

  const [nowPlayingResp, comingSoonResp] = await Promise.all([
    fetchFromAPI(nowPlayingUrl),
    fetchFromAPI(comingSoonUrl),
  ]);

  return [...(nowPlayingResp || []), ...(comingSoonResp || [])];
}

async function fetchSessions(cityId: string, theaterId: string) {
  const sessionsUrl = `https://api-content.ingresso.com/v0/sessions/city/${cityId}/theater/${theaterId}?partnership=home`;
  return await fetchFromAPI(sessionsUrl);
}

// ================== MOVIE PROCESSING ==================
async function upsertMovies(
  movies: any[],
  idCinema: number,
  client: PoolClient,
) {
  if (movies.length === 0) return new Map();

  const values: any[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const resultMap = new Map();

  movies.forEach((movie) => {
    const id = parseInt(movie.id);
    if (isNaN(id)) return;

    const movieData = [
      movie.title,
      movie.synopsis || '',
      movie.duration ? parseFloat(movie.duration) : null,
      movie.contentRating === 'Verifique a Classificação'
        ? 'Classificação indicativa não disponível'
        : movie.contentRating,
      Array.isArray(movie.genres) ? movie.genres.join(', ') : '',
      movie.director || movie.directors || '',
      movie.cast || '',
      movie.premiereDate?.localDate?.split('T')[0] || null,
      movie.imageFeatured || '',
      null, // url_trailer
      null, // movieIdentifier
      null, // codigo_filme
      id,
      idCinema,
    ];

    const placeholders = movieData.map(() => `$${paramIndex++}`).join(', ');
    values.push(`(${placeholders})`);
    params.push(...movieData);
  });

  if (values.length === 0) return resultMap;

  const upsertQuery = `
    INSERT INTO filmes (
      nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal,
      data_estreia, url_poster, url_trailer, movieIdentifier, codigo_filme,
      id_filme_ingresso_com, id_cinema
    )
    VALUES ${values.join(', ')}
    ON CONFLICT (id_filme_ingresso_com, id_cinema) DO UPDATE SET
      nome = EXCLUDED.nome,
      sinopse = EXCLUDED.sinopse,
      duracao = EXCLUDED.duracao,
      classificacao = EXCLUDED.classificacao,
      genero = EXCLUDED.genero,
      diretor = EXCLUDED.diretor,
      elenco_principal = EXCLUDED.elenco_principal,
      data_estreia = EXCLUDED.data_estreia,
      url_poster = EXCLUDED.url_poster,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, data_estreia, id_filme_ingresso_com;
  `;

  const { rows } = await client.query(upsertQuery, params);

  rows.forEach((row) => {
    resultMap.set(row.id_filme_ingresso_com.toString(), {
      id: row.id,
      data_estreia: row.data_estreia,
    });
  });

  return resultMap;
}

// ================== PROGRAMMING PROCESSING ==================
async function upsertProgramacao(
  sessoesPorFilme: Record<string, any[]>,
  filmeIdMap: Map<string, any>,
  idCinema: number,
  client: PoolClient,
) {
  const programacaoEntries = Object.entries(sessoesPorFilme).filter(
    ([_, sessoes]) => sessoes.length > 0,
  );

  if (programacaoEntries.length === 0) return;

  const values: any[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  programacaoEntries.forEach(([movieId, sessoes]) => {
    const filmeInfo = filmeIdMap.get(movieId);
    if (!filmeInfo) return;

    const { id: idFilme, data_estreia } = filmeInfo;
    const sessionsByWeek = groupSessionsByCineWeek(sessoes);

    Object.entries(sessionsByWeek).forEach(([semanaInicio, weekSessions]) => {
      const semanaInicioDate = dayjs(semanaInicio, 'YYYY-MM-DD');
      const semanaFim = semanaInicioDate.add(6, 'day').format('YYYY-MM-DD');
      const sessoesSemana = mapSessionsByWeekDays(
        weekSessions,
        semanaInicio,
        semanaFim,
      );

      const progData = [
        idFilme,
        idCinema,
        'em cartaz',
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

      const placeholders = progData.map(() => `$${paramIndex++}`).join(', ');
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
    VALUES ${values.join(', ')}
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
async function syncIngressoCom(
  idCinema: number,
  cityId: string,
  theaterId: string,
) {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const [filmes, sessionsData] = await Promise.all([
      fetchAllMovies(cityId),
      fetchSessions(cityId, theaterId),
    ]);

    const filmesUnicos = new Map<number, any>();
    filmes.forEach((filme) => {
      const id = parseInt(filme.id);
      if (!isNaN(id) && !filmesUnicos.has(id)) {
        filmesUnicos.set(id, filme);
      }
    });

    const filmesArray = Array.from(filmesUnicos.values());
    const filmeIdMap = await upsertMovies(filmesArray, idCinema, client);

    const sessoesPorFilme: Record<string, any[]> = {};
    for (const day of sessionsData) {
      const dataFormatada = dayjs(day.date).format('DD/MM/YYYY');
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
                .filter((alias: string) => alias && alias !== '2D')
                .join(' ') || '';
            sessoesPorFilme[movie.id].push({
              data: dataFormatada,
              hora: session.time,
              tipo: tipos ? `(${tipos})` : '',
            });
          }
        }
      }
    }

    await upsertProgramacao(sessoesPorFilme, filmeIdMap, idCinema, client);

    await client.query('COMMIT');

    console.log(
      `Sincronização concluída - Cinema ${idCinema}: ${filmeIdMap.size} filmes`,
    );
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error(`Erro na sincronização do cinema ${idCinema}:`, error);
  } finally {
    if (client) client.release();
  }
}

// ================== EXECUÇÃO ==================
async function main() {
  try {
    const cinemas = [
      { id: 17, nome: 'Cine Cambuí', cityId: '460', theaterId: '1467' },
      {
        id: 18,
        nome: 'GNC Balneário Shopping',
        cityId: '290',
        theaterId: '1266',
      },
      { id: 19, nome: 'GNC Caxias do Sul', cityId: '7', theaterId: '150' },
      {
        id: 20,
        nome: 'GNC Cinemas Moinhos Porto Alegre',
        cityId: '5',
        theaterId: '103',
      },
      {
        id: 21,
        nome: 'GNC Iguatemi Porto Alegre',
        cityId: '5',
        theaterId: '743',
      },
      {
        id: 22,
        nome: 'GNC Praia de Belas Porto Alegre',
        cityId: '5',
        theaterId: '97',
      },
      {
        id: 23,
        nome: 'GNC Garten Shopping Joinville',
        cityId: '16',
        theaterId: '851',
      },
      { id: 24, nome: 'GNC Joinville Mueller', cityId: '16', theaterId: '146' },
      { id: 25, nome: 'GNC Nações Criciúma', cityId: '308', theaterId: '1388' },
      {
        id: 26,
        nome: 'GNC Neumarkt Shopping Blumenau',
        cityId: '17',
        theaterId: '149',
      },
      {
        id: 27,
        nome: 'PlayArte Multiplex Praça da Moça',
        cityId: '82',
        theaterId: '862',
      },
      {
        id: 28,
        nome: 'PlayArte Multiplex ABC',
        cityId: '45',
        theaterId: '599',
      },
      {
        id: 29,
        nome: 'PlayArte Multiplex - Ibirapuera',
        cityId: '1',
        theaterId: '1623',
      },
      {
        id: 30,
        nome: 'PlayArte Multiplex Marabá',
        cityId: '1',
        theaterId: '1624',
      },
    ];

    await Promise.all(
      cinemas.map((cinema) =>
        syncIngressoCom(cinema.id, cinema.cityId, cinema.theaterId),
      ),
    );

    console.log('Sincronização ingresso.com concluída!');
  } catch (error) {
    console.error('Erro durante a sincronização:', error);
    process.exit(1);
  }
}

// Descomente para testar
//main();

// Export para uso via endpoint
export { syncIngressoCom, main as syncIngressoComAll };
