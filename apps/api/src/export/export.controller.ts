import { Body, Controller, Headers, HttpException, HttpStatus, Post, StreamableFile } from "@nestjs/common";
import { z } from "zod";
import { owner } from "../owner.ts";
import { previews } from "./previews.ts";
import { TableExport, tablePdf } from "./table-pdf.ts";

const PreviewBody = z.object({ urls: z.array(z.url({ protocol: /^https?$/ }).max(2000)).min(1).max(12) });

/** Éléments affichés dans le chat : aperçu des sources web, export des tableaux. */
@Controller("agent")
export class ExportController {
  @Post("previews")
  async previews(@Body() body: unknown, @Headers("x-keyo-owner") id?: string, @Headers("authorization") auth?: string) {
    owner(id, auth);
    const r = PreviewBody.safeParse(body);
    if (!r.success) throw new HttpException({ error: "Requête invalide" }, HttpStatus.BAD_REQUEST);
    return previews(r.data.urls);
  }

  @Post("export/table.pdf")
  table(@Body() body: unknown, @Headers("x-keyo-owner") id?: string, @Headers("authorization") auth?: string) {
    owner(id, auth);
    const r = TableExport.safeParse(body);
    if (!r.success) throw new HttpException({ error: "Tableau invalide" }, HttpStatus.BAD_REQUEST);
    return new StreamableFile(tablePdf(r.data), { type: "application/pdf", disposition: 'attachment; filename="keyo-tableau.pdf"' });
  }
}
