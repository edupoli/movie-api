import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface IntentResponse {
  intent: "movie_showtimes" | "movie_details";
  time: string | null;
  movie: string | null;
  status: string | null;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function classifyIntent(
  message: string,
  retries: number = 3
): Promise<IntentResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const prompt = `
Você é um assistente de cinema que classifica intenções de usuários com base em mensagens em português que descrevem explicitamente a intenção, começando com "O usuário". A mensagem pode conter o nome de um filme entre aspas (ex.: "Filme X"). Sua tarefa é identificar a intenção principal e extrair os parâmetros temporal, filme e status. Existem apenas duas intenções: "movie_details" (detalhes específicos de um filme) e "movie_showtimes" (programação ou horários). Retorne a resposta em JSON com as chaves: intent, time, movie, status.

Intenções possíveis:
- "movie_details": Usuário quer detalhes específicos de um filme, como classificação indicativa, sinopse, gênero, data de estreia, diretor, etc. (ex.: "O usuário quer saber qual é a classificação indicativa do filme 'Elio'").
- "movie_showtimes": Usuário quer informações sobre programação, horários ou status de exibição, incluindo filmes em cartaz, em breve ou em pré-venda (ex.: "O usuário está perguntando sobre a exibição do filme 'Stich' hoje").

Parâmetros:
- time: Indica o contexto temporal. Use "hoje" para menções a hoje ou "hj", "amanha" para amanhã, "semana" para próxima semana ou "semana que vem", ou o nome do dia em português sem "feira" (ex.: "quinta" para "quinta-feira" ou "a partir de quinta-feira"). O usuario tambem pode menciar o dia de forma numerica como por exemplo dia 25 ou  dia 02/07 nesses casos voce deve extrair para o parametro time apenas a data em formato numerico  etc.. Se não houver menção temporal, use null.
- movie: Extraia o texto entre aspas (ex.: "Stich" → "Stich"). Se não houver aspas ou menção a um filme específico, use null.
- status: Identifique menções a "em cartaz", "em breve" ou "pre venda" (aceite "pré-venda" ou "pre-venda"). Se não houver menção explícita a um desses status, use null.

Regras:
- Priorize a intenção explícita:
  - Se a mensagem menciona "classificação", "sinopse", "gênero", "data de estreia", "diretor", "elenco" ou similar, use "movie_details".
  - Para "horários", "programação", "exibição", "sessões", "em cartaz", "em breve", "pré-venda" ou similar, use "movie_showtimes".
- Para menções a "valores dos ingressos", use "movie_showtimes", mas note que preços não estão no banco de dados.
- Extraia apenas o primeiro filme mencionado entre aspas, se houver múltiplos.
- Para "a partir de [dia]", use o dia como time (ex.: "a partir de quinta-feira" → time: "quinta").
- Se a mensagem não mencionar time, movie ou status, preencha como null.
- Ignore menções a horários específicos (ex.: "às 21:00") para o parâmetro time, mas note que podem indicar "movie_showtimes".

Exemplos:
- Mensagem: "O usuário quer saber qual é a classificação indicativa do filme 'Elio'."
  Resposta: { "intent": "movie_details", "time": null, "movie": "Elio", "status": null }
- Mensagem: "O usuário quer saber qual é a data de estreia do filme 'Stich'."
  Resposta: { "intent": "movie_details", "time": null, "movie": "Stich", "status": null }
- Mensagem: "O usuário está perguntando sobre o gênero do filme 'Missão Impossível'."
  Resposta: { "intent": "movie_details", "time": null, "movie": "Missão Impossível", "status": null }
- Mensagem: "O usuário está perguntando sobre a exibição do filme 'Stich' hoje."
  Resposta: { "intent": "movie_showtimes", "time": "hoje", "movie": "Stich", "status": "null" }
- Mensagem: "O usuário está perguntando sobre a programação de amanhã."
  Resposta: { "intent": "movie_showtimes", "time": "amanha", "movie": null, "status": "null" }
- Mensagem: "O usuário está perguntando sobre os filmes que vão estrear na próxima semana."
  Resposta: { "intent": "movie_showtimes", "time": "semana", "movie": null, "status": "null" }
- Mensagem: "O usuário está perguntando sobre os horários das sessões a partir de quinta-feira."
  Resposta: { "intent": "movie_showtimes", "time": "quinta", "movie": null, "status": "" }
- Mensagem: "O usuário quer saber se o filme 'Missão Impossível' já saiu de cartaz."
  Resposta: { "intent": "movie_showtimes", "time": null, "movie": "Missão Impossível", "status": "em cartaz" }
- Mensagem: "O usuário está perguntando sobre quais filmes estão em cartaz."
  Resposta: { "intent": "movie_showtimes", "time": null, "movie": null, "status": "em cartaz" }
- Mensagem: "O usuário está perguntando até que dia o filme 'Lilo e Stitch' estará em cartaz."
  Resposta: { "intent": "movie_showtimes", "time": null, "movie": "Lilo e Stitch", "status": "em cartaz" }
- Mensagem: "O usuário está perguntando sobre a data de início da pré-venda do filme 'Bailarina'."
  Resposta: { "intent": "movie_showtimes", "time": null, "movie": "Bailarina", "status": "pre venda" }
- Mensagem: "O usuário está perguntando sobre a disponibilidade do filme 'Como Treinar o Seu Dragão' dublado às 21:00."
  Resposta: { "intent": "movie_showtimes", "time": null, "movie": "Como Treinar o Seu Dragão", "status": "null" }

Mensagem do usuário: "${message}"
Resposta (em JSON):
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      return {
        intent: result.intent || "movie_showtimes",
        time: result.time || null,
        movie: result.movie || null,
        status: result.status || null,
      };
    } catch (error) {
      console.error(`OpenAI attempt ${attempt} failed:`, error);
      if (attempt < retries) {
        await delay(1000 * attempt); // Exponential backoff
        continue;
      }
      throw new Error("Failed to classify intent after retries");
    }
  }
}
