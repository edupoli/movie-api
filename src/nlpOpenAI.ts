import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function classifyIntent(message: string) {
  try {
    const prompt = `
      You are an assistant for a cinema database API with the following schema:
      - filmes (id, nome, sinopse, duracao, classificacao, genero, diretor, elenco_principal, data_estreia, etc.)
      - cinemas (id, nome, endereco, url_conferir_horarios, etc.)
      - programacao (id, id_filme, id_cinema, status ['em cartaz', 'pre venda', 'em breve', 'inativo'], semana_inicio, semana_fim, segunda, terca, quarta, quinta, sexta, sabado, domingo, etc.)

      User query: "${message}"

      Tasks:
      1. Classify the intent of the query. Possible intents:
         - movies_in_theaters: List movies currently in theaters (e.g., "quais são os filmes em cartaz?").
         - movie_showtimes_today: Showtimes for today (e.g., "quais os horários de Branca de Neve hoje?", "quais são os horários do filme Elio?").
         - movie_showtimes_specific_day: Showtimes for a specific day (e.g., "horários de Branca de Neve amanhã", "sessões de Elio no domingo").
         - upcoming_movies: Movies coming soon (e.g., "quais filmes estreiam na semana que vem?").
         - movie_details: Details about a specific movie without showtimes (e.g., "qual a sinopse de Branca de Neve?", "quem é o diretor de Elio?").
         - unknown: Unrecognized or ambiguous query.
      2. Extract entities:
         - Time reference (e.g., "hoje" → today, "amanhã" → tomorrow, "semana que vem" → next_week, "domingo" → sunday, etc.). If no time is specified but the query asks for "horários" or "sessões", default to "today".
         - Movie name (only if explicitly mentioned in the query, otherwise null).
         - Status filter (em cartaz, pre venda, em breve, or null for default em cartaz).

      Rules:
      - Queries containing "horários", "sessões", or similar terms (e.g., "quais são os horários do filme Elio?") should be classified as movie_showtimes_today unless a specific day (e.g., "amanhã", "domingo") is mentioned, then use movie_showtimes_specific_day.
      - Queries asking for movie information (e.g., sinopse, diretor, elenco) without mentioning schedules should be movie_details.
      - If no movie is mentioned, set movie to null.
      - Default status to "em cartaz" unless the query implies future movies (e.g., "em breve", "pré-venda").

      Return a JSON object:
      {
        "intent": "intent_name",
        "time": "time_reference_or_null",
        "movie": "movie_name_or_null",
        "status": "status_or_null"
      }

      Examples:
      Query: "Quais os horários de Branca de Neve hoje?"
      Response: { "intent": "movie_showtimes_today", "time": "today", "movie": "Branca de Neve", "status": "em cartaz" }
      Query: "Quais são os horários do filme Elio?"
      Response: { "intent": "movie_showtimes_today", "time": "today", "movie": "Elio", "status": "em cartaz" }
      Query: "Horários de Elio no domingo"
      Response: { "intent": "movie_showtimes_specific_day", "time": "sunday", "movie": "Elio", "status": "em cartaz" }
      Query: "Quais são os filmes em cartaz?"
      Response: { "intent": "movies_in_theaters", "time": null, "movie": null, "status": "em cartaz" }
      Query: "Qual a sinopse de Elio?"
      Response: { "intent": "movie_details", "time": null, "movie": "Elio", "status": null }
      Query: "Filmes para a semana que vem"
      Response: { "intent": "upcoming_movies", "time": "next_week", "movie": null, "status": "pre venda" }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    console.log("OpenAI response:", content);
    if (!content) throw new Error("No response content from OpenAI");
    return JSON.parse(content);
  } catch (error) {
    console.error("Error in OpenAI intent classification:", error);
    throw new Error("Failed to classify intent");
  }
}
