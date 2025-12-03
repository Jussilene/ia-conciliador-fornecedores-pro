// src/config/openai.js
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[openai] ⚠️ Variável OPENAI_API_KEY não encontrada no .env. As chamadas de IA vão falhar."
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
