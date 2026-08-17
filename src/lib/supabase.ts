'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente do Supabase para o navegador.
 *
 * Aponta para o MESMO projeto que o sistema atual usa — as tabelas de escala,
 * agendamentos e inventario sao as mesmas, com os mesmos dados. Nada e migrado.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_KEY);

let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!supabaseConfigurado) return null;
  if (!cliente) cliente = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cliente;
}
