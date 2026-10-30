/** A storage failure or stalled native call must never strand the app on its splash. */
export async function runStartup<T>(initialize: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(initialize),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Güvenli başlangıç zaman aşımına uğradı.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
