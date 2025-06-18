import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface IntentResponse {
  intent:
    | "movies_in_theaters"
    | "movie_showtimes_today"
    | "movie_showtimes_specific_day"
    | "movie_showtimes_all_days"
    | "upcoming_movies"
    | "movie_details";
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
Você é um assistente de cinema que classifica intenções de usuários com base em mensagens em português que descrevem explicitamente a intenção. A mensagem sempre começa com "O usuário" e pode conter o nome de um filme entre aspas (ex.: "Filme X"). Sua tarefa é identificar a intenção principal, o contexto temporal, o filme mencionado, o status dos filmes, e filtros de horário (se aplicável). Retorne a resposta no formato JSON com as chaves: intent, time, movie, status, e opcionalmente timeFilter.

Intenções possíveis:
- "movies_in_theaters": usuário quer a programação geral ou horários de um filme específico (ex.: "O usuário está perguntando até que dia o filme 'X' estará em cartaz").
- "movie_showtimes_today": usuário quer horários de hoje (ex.: "O usuário está perguntando sobre os horários de hoje").
- "movie_showtimes_specific_day": usuário quer horários de um dia específico (ex.: "O usuário está perguntando sobre a programação do cinema para quinta-feira").
- "movie_showtimes_all_days": usuário quer todos os horários de um filme (ex.: "O usuário está perguntando sobre a versão legendada do filme 'X'").
- "upcoming_movies": usuário quer filmes futuros ou pré-venda (ex.: "O usuário está perguntando sobre a data de início da pré-venda do filme 'X'").
- "movie_details": usuário quer detalhes de um filme (ex.: "O usuário quer saber qual é a classificação indicativa do filme 'X'").

Regras:
- Para contexto temporal (time), use: "hoje" (quando o usuario referenciar hoje ou hj), "amanha" (amanhã), "semana" (próxima semana ou semana que vem etc... sempre que no contexto houver semana ), ou nome do dia em portugues sem a palavra feira  ("segunda", "tercay", etc.). Se não houver contexto temporal, use null.
- Para filme (movie), extraia o texto entre aspas (ex.: "Filme X" → "Filme X"). Se não houver aspas, use null.
- Para status, use "em cartaz" para filmes exibidos, "em breve" ou "pre venda" para futuros, ou null se não especificado.
- Se a mensagem mencionar "valores dos ingressos", mantenha a intenção principal, mas note que preços não estão no banco.
- Priorize a intenção explícita na mensagem (ex.: "classificação indicativa" → "movie_details").

Exemplos:
- Mensagem: "O usuário está perguntando até que dia o filme 'Lilo e Stitch' estará em cartaz."
  Resposta: { "intent": "movie_showtimes_all_days", "time": null, "movie": "Lilo e Stitch", "status": "em cartaz" }
- Mensagem: "O usuário quer saber qual é a classificação indicativa do filme 'Elio'."
  Resposta: { "intent": "movie_details", "time": null, "movie": "Elio", "status": null }
- Mensagem: "O usuário está perguntando sobre os horários das sessões a partir de quinta-feira."
  Resposta: { "intent": "movie_showtimes_specific_day", "time": "thursday", "movie": null, "status": "em cartaz", "timeFilter": { "after": "thursday" } }
- Mensagem: "O usuário está perguntando sobre a programação de filmes da semana e os valores dos ingressos."
  Resposta: { "intent": "movies_in_theaters", "time": null, "movie": null, "status": "em cartaz" }
- Mensagem: "O usuário está perguntando sobre os horários das sessões do filme 'Como Treinar o Seu Dragão' que sejam antes das 21:30h."
  Resposta: { "intent": "movie_showtimes_all_days", "time": null, "movie": "Como Treinar o Seu Dragão", "status": "em cartaz", "timeFilter": { "before": "21:30" } }

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
        intent: result.intent || "movies_in_theaters",
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
