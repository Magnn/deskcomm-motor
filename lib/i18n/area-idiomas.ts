/**
 * A lista dos idiomas da área do cliente, sem os dicionários — para o componente de cliente (a troca no rodapé)
 * não levar os textos todos para o navegador. A tradução está em `area.ts`.
 */
export const IDIOMAS_DA_AREA = ["pt-BR", "es", "en", "fr", "it", "de"] as const;
export type IdiomaDaArea = (typeof IDIOMAS_DA_AREA)[number];
