import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Propriétaire courant. Provisoire, en attendant la connexion téléphone + code SMS : identifiant
 * passé en en-tête, et jeton partagé KEYO_API_TOKEN exigé s'il est défini (à définir hors du poste de dev).
 */
export function owner(id: string | undefined, auth: string | undefined) {
  const token = process.env.KEYO_API_TOKEN;
  if (token && auth !== `Bearer ${token}`) throw new HttpException({ error: "Non autorisé" }, HttpStatus.UNAUTHORIZED);
  if (!id || !/^[\w-]{1,64}$/.test(id)) throw new HttpException({ error: "En-tête x-keyo-owner manquant" }, HttpStatus.BAD_REQUEST);
  return id;
}
