/** Ao iniciar o servidor (só em produção): liga o laço dos lembretes por notificação. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReminderLoop } = await import("./server/push");
  startReminderLoop();
}
