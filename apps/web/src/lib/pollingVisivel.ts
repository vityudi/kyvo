/**
 * Cria um polling (setInterval) que só dispara `callback` enquanto a aba
 * está visível, e refaz a chamada imediatamente quando ela volta a ficar
 * visível depois de escondida - evita consumir CPU/rede (e créditos de CPU
 * de instâncias burstable tipo t2/t3.micro) com a aba em segundo plano, que
 * antes continuava fazendo polling a cada 10s sem ningúem olhando.
 * Retorna uma função de cleanup (remove o interval e o listener).
 */
export function pollingVisivel(callback: () => void, intervaloMs: number): () => void {
  const intervalo = setInterval(() => {
    if (!document.hidden) callback();
  }, intervaloMs);

  function handleVisibilidade() {
    if (!document.hidden) callback();
  }
  document.addEventListener("visibilitychange", handleVisibilidade);

  return () => {
    clearInterval(intervalo);
    document.removeEventListener("visibilitychange", handleVisibilidade);
  };
}
