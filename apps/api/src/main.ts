import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.ts";
import { MODEL } from "./agent/agent.service.ts";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
app.enableCors();
// Les conversations de l'agent (avec résultats d'outils) dépassent la limite par défaut de 100 ko.
app.useBodyParser("json", { limit: "4mb" });
const port = Number(process.env.PORT ?? 3000);
await app.listen(port, "0.0.0.0");
console.log(`API Keyo sur le port ${port} — agent : ${process.env.ANTHROPIC_API_KEY ? MODEL : "mode démo (pas de ANTHROPIC_API_KEY)"}`);
