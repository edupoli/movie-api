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
Você é um assistente de cinema que classifica intenções de usuários com base em mensagens em português. Sua tarefa é identificar a intenção principal, o contexto temporal, o filme mencionado (se houver) e o status dos filmes (em cartaz, em breve, pré-venda). Retorne a resposta no formato JSON com as chaves: intent, time, movie, status.

Intenções possíveis:
- "movies_in_theaters": usuário quer a programação geral do cinema sem especificar um dia ou filme (ex.: "qual a programação?", "quais filmes estão em cartaz?").
- "movie_showtimes_today": usuário quer horários de hoje, com ou sem filme específico (ex.: "quais os horários de hoje?", "horários do filme X hoje").
- "movie_showtimes_specific_day": usuário quer horários de um dia específico (ex.: "quais os horários de amanhã?", "programação de segunda-feira", "horários do filme X na terça").
- "movie_showtimes_all_days": usuário quer todos os horários de um filme específico (ex.: "quais os horários do filme X?", "programação completa do filme X").
- "upcoming_movies": usuário quer filmes que estreiam no futuro (ex.: "quais filmes estreiam semana que vem?", "filmes em breve").
- "movie_details": usuário quer detalhes de um filme (ex.: "qual a sinopse do filme X?", "quem é o diretor do filme X?").

Regras:
- Para contexto temporal (time), use: "today" (hoje), "tomorrow" (amanhã), "next_week" (próxima semana), ou nome do dia em inglês ("monday", "tuesday", etc.). Se não houver contexto temporal, use null.
- Para filme (movie), extraia o nome do filme se mencionado, ou use null se não houver.
- Para status, use "em cartaz" para filmes atualmente exibidos, "em breve" ou "pre venda" para futuros, ou null se não especificado.
- Se a mensagem mencionar um dia específico (ex.: "amanhã", "segunda-feira") sem um filme, classifique como "movie_showtimes_specific_day".
- Se a mensagem for ambígua, escolha a intenção mais provável com base no contexto.

Exemplos:
- Mensagem: "qual a programação?"
  Resposta: { "intent": "movies_in_theaters", "time": null, "movie": null, "status": "em cartaz" }
- Mensagem: "quais os horários de amanhã?"
  Resposta: { "intent": "movie_showtimes_specific_day", "time": "tomorrow", "movie": null, "status": "em cartaz" }
- Mensagem: "horários do filme Smurfs na segunda-feira"
  Resposta: { "intent": "movie_showtimes_specific_day", "time": "monday", "movie": "Smurfs", "status": "em cartaz" }
- Mensagem: "quais filmes estreiam semana que vem?"
  Resposta: { "intent": "upcoming_movies", "time": "next_week", "movie": null, "status": "em breve" }

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
