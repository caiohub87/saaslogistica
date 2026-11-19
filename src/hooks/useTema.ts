'use client';

import { useCallback, useEffect, useState } from 'react';

const EVENTO = 'gl:tema';

/**
 * Tema claro/escuro compartilhado entre o menu lateral e o do celular.
 *
 * Os dois ficam montados ao mesmo tempo (um some por CSS), então trocar o tema
 * num avisa o outro por um evento — senão o ícone do sol/lua ficava trocado.
 */
export function useTema() {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    let salvo = false;
    try { salvo = localStorage.getItem('gl:tema') === 'escuro'; } catch { /* sem storage */ }
    document.documentElement.classList.toggle('escuro', salvo);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o storage na montagem
    setEscuro(salvo);
    const ouvir = (e: Event) => setEscuro((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);

  const alternar = useCallback(() => {
    const novo = !document.documentElement.classList.contains('escuro');
    document.documentElement.classList.toggle('escuro', novo);
    try { localStorage.setItem('gl:tema', novo ? 'escuro' : 'claro'); } catch { /* sem storage */ }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: novo }));
  }, []);

  return { escuro, alternar };
}
