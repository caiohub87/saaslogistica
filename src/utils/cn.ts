import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind resolvendo conflitos (a última vence). */
export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}
